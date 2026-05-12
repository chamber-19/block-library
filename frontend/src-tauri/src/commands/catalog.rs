use tauri::{AppHandle, Emitter};

use super::cache;
use super::drive;
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
/// - DWG files cannot be previewed — returns a specific error string.
/// - Checks the dxf_cache table first; downloads from Drive on a miss.
/// - Evicts the lowest-access-count entry when the cache exceeds 100 entries.
#[tauri::command]
pub async fn get_block_dxf(app: AppHandle, drive_file_id: String) -> Result<String, String> {
    // Look up file_name from the blocks table.
    let file_name = cache::get_block_file_name(app.clone(), drive_file_id.clone())
        .await?
        .ok_or_else(|| format!("Block not found in catalog: {drive_file_id}"))?;

    // DWG cannot be previewed.
    if file_name.to_lowercase().ends_with(".dwg") {
        return Err(
            "DWG format cannot be previewed directly. Convert to DXF for preview.".to_string(),
        );
    }

    // Check the cache first.
    if let Some(content) = cache::get_dxf_cached(app.clone(), drive_file_id.clone()).await? {
        return Ok(content);
    }

    // Cache miss — download from Drive.
    let api_key = drive_api_key();
    let content = drive::download_file(&drive_file_id, &api_key).await?;

    // Store in cache (eviction handled inside store_dxf_cache).
    cache::store_dxf_cache(app.clone(), drive_file_id.clone(), content.clone()).await?;

    Ok(content)
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
#[tauri::command]
pub async fn open_block_in_autocad(
    app: AppHandle,
    drive_file_id: String,
    file_name: String,
) -> Result<(), String> {
    let api_key = drive_api_key();
    let content = drive::download_file(&drive_file_id, &api_key).await?;

    let dest = std::env::temp_dir().join(&file_name);
    std::fs::write(&dest, content.as_bytes()).map_err(|e| e.to_string())?;

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

/// DEV ONLY: Seeds the database with test categories and blocks for quick testing.
#[tauri::command]
pub async fn seed_test_data(app: AppHandle) -> Result<String, String> {
    // Create sample categories
    let categories = vec![
        Category {
            id: "cat-1".to_string(),
            name: "Architectural".to_string(),
            drive_id: "drive-arch".to_string(),
            block_count: 3,
            last_synced: Some("2026-05-11T10:00:00Z".to_string()),
        },
        Category {
            id: "cat-2".to_string(),
            name: "Electrical".to_string(),
            drive_id: "drive-elec".to_string(),
            block_count: 2,
            last_synced: Some("2026-05-11T10:00:00Z".to_string()),
        },
        Category {
            id: "cat-3".to_string(),
            name: "Mechanical".to_string(),
            drive_id: "drive-mech".to_string(),
            block_count: 4,
            last_synced: Some("2026-05-11T10:00:00Z".to_string()),
        },
    ];

    // Insert categories
    for cat in &categories {
        cache::upsert_category(app.clone(), cat.clone()).await?;
    }

    // Create sample blocks
    let blocks = vec![
        BlockMeta {
            id: "blk-1".to_string(),
            name: "Door Single".to_string(),
            category_id: "cat-1".to_string(),
            drive_file_id: "drive-file-1".to_string(),
            file_name: "door_single.dxf".to_string(),
            last_modified: Some("2026-05-10T14:30:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-2".to_string(),
            name: "Window Double".to_string(),
            category_id: "cat-1".to_string(),
            drive_file_id: "drive-file-2".to_string(),
            file_name: "window_double.dxf".to_string(),
            last_modified: Some("2026-05-10T14:30:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-3".to_string(),
            name: "Wall Section".to_string(),
            category_id: "cat-1".to_string(),
            drive_file_id: "drive-file-3".to_string(),
            file_name: "wall_section.dxf".to_string(),
            last_modified: Some("2026-05-10T14:30:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-4".to_string(),
            name: "Light Fixture".to_string(),
            category_id: "cat-2".to_string(),
            drive_file_id: "drive-file-4".to_string(),
            file_name: "light_fixture.dxf".to_string(),
            last_modified: Some("2026-05-10T15:00:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-5".to_string(),
            name: "Switch Plate".to_string(),
            category_id: "cat-2".to_string(),
            drive_file_id: "drive-file-5".to_string(),
            file_name: "switch_plate.dxf".to_string(),
            last_modified: Some("2026-05-10T15:00:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-6".to_string(),
            name: "Gear Assembly".to_string(),
            category_id: "cat-3".to_string(),
            drive_file_id: "drive-file-6".to_string(),
            file_name: "gear_assembly.dxf".to_string(),
            last_modified: Some("2026-05-10T15:30:00Z".to_string()),
        },
        BlockMeta {
            id: "blk-7".to_string(),
            name: "Pump Symbol".to_string(),
            category_id: "cat-3".to_string(),
            drive_file_id: "drive-file-7".to_string(),
            file_name: "pump_symbol.dxf".to_string(),
            last_modified: Some("2026-05-10T15:30:00Z".to_string()),
        },
    ];

    // Insert blocks
    for block in &blocks {
        cache::upsert_block(app.clone(), block.clone()).await?;
    }

    Ok(format!(
        "Seeded {} categories and {} blocks",
        categories.len(),
        blocks.len()
    ))
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
