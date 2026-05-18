use tauri::{AppHandle, Emitter};

use super::cache;
use super::drive;
use super::dwg;
use crate::{drive_api_key, root_folder_id};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub drive_id: String,
    pub block_count: i64,
    pub last_synced: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct BlockMeta {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub drive_file_id: String,
    pub file_name: String,
    pub last_modified: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SyncResult {
    pub categories_synced: usize,
    pub blocks_synced: usize,
    pub errors: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SyncProgress {
    pub done: usize,
    pub total: usize,
    pub current_category: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Returns all categories from the local SQLite cache.
#[tauri::command]
pub async fn list_categories(app: AppHandle) -> Result<Vec<Category>, String> {
    cache::get_all_categories(app).await
}

/// Returns all blocks for a category from the local SQLite cache.
#[tauri::command]
pub async fn list_blocks(app: AppHandle, category_id: String) -> Result<Vec<BlockMeta>, String> {
    cache::get_blocks_for_category(app, category_id).await
}

/// Returns the DXF content for a block.
///
/// - DXF files: served from cache or fetched from Drive and cached.
/// - DWG files: downloaded as bytes, written to a temp file, and converted to
///   DXF via the bundled `DwgConverter` sidecar (ODA Teigha). The converted
///   DXF is cached just like a native DXF. If the sidecar is unavailable, the
///   call returns a descriptive error so the UI can show a fallback message.
/// - Evicts the lowest-access-count entry when the cache exceeds 100 entries.
#[tauri::command]
pub async fn get_block_dxf(app: AppHandle, drive_file_id: String) -> Result<String, String> {
    // Look up file_name from the blocks table.
    let file_name = cache::get_block_file_name(app.clone(), drive_file_id.clone())
        .await?
        .ok_or_else(|| format!("Block not found in catalog: {drive_file_id}"))?;

    // Check the cache first regardless of source format.
    if let Some(content) = cache::get_dxf_cached(app.clone(), drive_file_id.clone()).await? {
        return Ok(content);
    }

    let api_key = drive_api_key();
    let is_dwg = file_name.to_lowercase().ends_with(".dwg");

    let dxf_content = if is_dwg {
        if !dwg::sidecar_available(&app) {
            return Err(
                "DWG format requires the DwgConverter sidecar, which is not installed. \
                 Convert to DXF via AutoCAD's DXFOUT command for now."
                    .to_string(),
            );
        }
        let bytes = drive::download_file_bytes(&drive_file_id, &api_key).await?;
        let tmp = std::env::temp_dir().join(format!(
            "block-library-{}-{}",
            std::process::id(),
            sanitize_file_name(&file_name)
        ));
        std::fs::write(&tmp, &bytes).map_err(|e| format!("Writing temp DWG failed: {e}"))?;
        let result = dwg::convert_dwg_to_dxf(&app, &tmp).await;
        // Clean up the temp DWG regardless of conversion outcome.
        let _ = std::fs::remove_file(&tmp);
        result?
    } else {
        drive::download_file(&drive_file_id, &api_key).await?
    };

    // Store in cache (eviction handled inside store_dxf_cache).
    cache::store_dxf_cache(app.clone(), drive_file_id.clone(), dxf_content.clone()).await?;

    Ok(dxf_content)
}

/// Whether the bundled DWG→DXF sidecar is available at runtime.
///
/// The frontend uses this to decide whether to offer a "convert and preview"
/// affordance for DWG files. In dev builds the sidecar may not yet be
/// published; in that case the frontend falls back to the static
/// "preview unavailable" message.
#[tauri::command]
pub fn dwg_converter_available(app: AppHandle) -> bool {
    dwg::sidecar_available(&app)
}

/// Syncs the catalog from Google Drive.
///
/// 1. Lists subfolders of the root Drive folder → categories.
/// 2. For each folder, lists files → blocks.
/// 3. Upserts categories and blocks into SQLite.
/// 4. Rebuilds the FTS5 index for each block.
/// 5. Emits `sync-progress` events.
#[tauri::command]
pub async fn sync_catalog(app: AppHandle) -> Result<SyncResult, String> {
    let api_key = drive_api_key();
    let root_id = root_folder_id();

    let folders = drive::list_folders(&root_id, &api_key).await?;
    let total = folders.len();
    let mut categories_synced: usize = 0;
    let mut blocks_synced: usize = 0;
    let mut errors: Vec<String> = Vec::new();

    for (idx, folder) in folders.iter().enumerate() {
        // Emit progress before processing this category.
        let _ = app.emit(
            "sync-progress",
            SyncProgress {
                done: idx,
                total,
                current_category: folder.name.clone(),
            },
        );

        // Upsert the category — use drive folder id as both `id` and `drive_id`.
        let cat = Category {
            id: folder.id.clone(),
            name: folder.name.clone(),
            drive_id: folder.id.clone(),
            block_count: 0,
            last_synced: None,
        };
        if let Err(e) = cache::upsert_category(app.clone(), cat).await {
            errors.push(format!("Category '{}': {e}", folder.name));
            continue;
        }
        categories_synced += 1;

        // List files inside this folder.
        let files = match drive::list_files(&folder.id, &api_key).await {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("Listing files in '{}': {e}", folder.name));
                continue;
            }
        };

        let file_count = files.len() as i64;

        for file in &files {
            // Derive a display name by stripping the file extension.
            let display_name = strip_extension(&file.name);

            let block = BlockMeta {
                id: file.id.clone(),
                name: display_name.clone(),
                category_id: folder.id.clone(),
                drive_file_id: file.id.clone(),
                file_name: file.name.clone(),
                last_modified: file.modified_time.clone(),
            };

            if let Err(e) = cache::upsert_block(app.clone(), block).await {
                errors.push(format!("Block '{}': {e}", file.name));
                continue;
            }

            // Rebuild FTS entry.
            if let Err(e) = cache::upsert_fts(
                app.clone(),
                file.id.clone(),
                display_name.clone(),
                folder.name.clone(),
            )
            .await
            {
                errors.push(format!("FTS for '{}': {e}", file.name));
            }

            blocks_synced += 1;
        }

        // Update block count and last_synced timestamp.
        let now = chrono::Utc::now().to_rfc3339();
        if let Err(e) =
            cache::update_category_block_count(app.clone(), folder.id.clone(), file_count, now)
                .await
        {
            errors.push(format!("Updating count for '{}': {e}", folder.name));
        }
    }

    // Emit final progress.
    let _ = app.emit(
        "sync-progress",
        SyncProgress {
            done: total,
            total,
            current_category: String::new(),
        },
    );

    Ok(SyncResult {
        categories_synced,
        blocks_synced,
        errors,
    })
}

/// Full-text search against blocks_fts. No Drive call.
#[tauri::command]
pub async fn search_blocks(app: AppHandle, query: String) -> Result<Vec<BlockMeta>, String> {
    cache::search_blocks_fts(app, query).await
}

/// Downloads the block file to the OS temp directory and opens it with the system default app.
///
/// Always uses the raw byte download path so DWG (and other binary formats)
/// round-trip without UTF-8 corruption.
#[tauri::command]
pub async fn open_block_in_autocad(
    app: AppHandle,
    drive_file_id: String,
    file_name: String,
) -> Result<(), String> {
    let api_key = drive_api_key();
    let bytes = drive::download_file_bytes(&drive_file_id, &api_key).await?;

    let dest = std::env::temp_dir().join(sanitize_file_name(&file_name));
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    let dest_str = dest
        .to_str()
        .ok_or_else(|| "temp path is not valid UTF-8".to_string())?
        .to_string();

    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(dest_str, None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn strip_extension(file_name: &str) -> String {
    match file_name.rfind('.') {
        Some(pos) => file_name[..pos].to_string(),
        None => file_name.to_string(),
    }
}

/// Strips path separators and other characters that would let a maliciously-
/// named Drive file escape the OS temp directory.
fn sanitize_file_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}
