use rusqlite::{Connection, OptionalExtension};
use tauri::AppHandle;
use tauri::Manager;

use super::catalog::{BlockMeta, Category};

pub fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(data_dir.join("block-library.db"))
}

/// Initialises the SQLite database and creates schema tables if they do not yet exist.
/// Called once synchronously at app startup from `lib.rs::setup`.
pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let path = db_path(app)?;

    // Ensure the parent directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            drive_id TEXT NOT NULL UNIQUE,
            block_count INTEGER DEFAULT 0,
            last_synced TEXT
        );

        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            category_id TEXT REFERENCES categories(id),
            name TEXT NOT NULL,
            drive_file_id TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            last_modified TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
            block_id UNINDEXED,
            name,
            category_name
        );

        CREATE TABLE IF NOT EXISTS dxf_cache (
            drive_file_id TEXT PRIMARY KEY,
            dxf_content TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 0
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

pub async fn get_all_categories(app: AppHandle) -> Result<Vec<Category>, String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, drive_id, block_count, last_synced FROM categories ORDER BY name",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Category {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    drive_id: row.get(2)?,
                    block_count: row.get(3)?,
                    last_synced: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut categories = Vec::new();
        for row in rows {
            categories.push(row.map_err(|e| e.to_string())?);
        }
        Ok(categories)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn upsert_category(app: AppHandle, cat: Category) -> Result<(), String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO categories (id, name, drive_id, block_count, last_synced)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                drive_id = excluded.drive_id,
                block_count = excluded.block_count,
                last_synced = excluded.last_synced",
            rusqlite::params![
                cat.id,
                cat.name,
                cat.drive_id,
                cat.block_count,
                cat.last_synced,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

pub async fn get_blocks_for_category(
    app: AppHandle,
    category_id: String,
) -> Result<Vec<BlockMeta>, String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, category_id, drive_file_id, file_name, last_modified
                 FROM blocks
                 WHERE category_id = ?1
                 ORDER BY name",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![category_id], |row| {
                Ok(BlockMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    drive_file_id: row.get(3)?,
                    file_name: row.get(4)?,
                    last_modified: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut blocks = Vec::new();
        for row in rows {
            blocks.push(row.map_err(|e| e.to_string())?);
        }
        Ok(blocks)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn upsert_block(app: AppHandle, block: BlockMeta) -> Result<(), String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO blocks (id, category_id, name, drive_file_id, file_name, last_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                category_id = excluded.category_id,
                name = excluded.name,
                drive_file_id = excluded.drive_file_id,
                file_name = excluded.file_name,
                last_modified = excluded.last_modified",
            rusqlite::params![
                block.id,
                block.category_id,
                block.name,
                block.drive_file_id,
                block.file_name,
                block.last_modified,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rebuilds the FTS5 index entry for a single block.
pub async fn upsert_fts(
    app: AppHandle,
    block_id: String,
    name: String,
    category_name: String,
) -> Result<(), String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        // FTS5 external content — delete then insert to keep it consistent.
        conn.execute(
            "DELETE FROM blocks_fts WHERE block_id = ?1",
            rusqlite::params![block_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO blocks_fts (block_id, name, category_name) VALUES (?1, ?2, ?3)",
            rusqlite::params![block_id, name, category_name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn update_category_block_count(
    app: AppHandle,
    category_id: String,
    count: i64,
    last_synced: String,
) -> Result<(), String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE categories SET block_count = ?1, last_synced = ?2 WHERE id = ?3",
            rusqlite::params![count, last_synced, category_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// DXF cache
// ---------------------------------------------------------------------------

/// Returns the file_name for a block given its drive_file_id.
pub async fn get_block_file_name(
    app: AppHandle,
    drive_file_id: String,
) -> Result<Option<String>, String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT file_name FROM blocks WHERE drive_file_id = ?1")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_row(rusqlite::params![drive_file_id], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Returns cached DXF content and increments the access counter.
pub async fn get_dxf_cached(
    app: AppHandle,
    drive_file_id: String,
) -> Result<Option<String>, String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        let result: Option<String> = conn
            .query_row(
                "SELECT dxf_content FROM dxf_cache WHERE drive_file_id = ?1",
                rusqlite::params![drive_file_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if result.is_some() {
            conn.execute(
                "UPDATE dxf_cache SET access_count = access_count + 1 WHERE drive_file_id = ?1",
                rusqlite::params![drive_file_id],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stores DXF content in the cache. Evicts the entry with the lowest access_count
/// when the cache already holds 100 entries.
pub async fn store_dxf_cache(
    app: AppHandle,
    drive_file_id: String,
    dxf_content: String,
) -> Result<(), String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM dxf_cache", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if count >= 100 {
            // Evict the entry with the lowest access_count.
            conn.execute(
                "DELETE FROM dxf_cache WHERE drive_file_id = (
                     SELECT drive_file_id FROM dxf_cache ORDER BY access_count ASC LIMIT 1
                 )",
                [],
            )
            .map_err(|e| e.to_string())?;
        }

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO dxf_cache (drive_file_id, dxf_content, cached_at, access_count)
             VALUES (?1, ?2, ?3, 0)
             ON CONFLICT(drive_file_id) DO UPDATE SET
                dxf_content = excluded.dxf_content,
                cached_at = excluded.cached_at,
                access_count = 0",
            rusqlite::params![drive_file_id, dxf_content, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

pub async fn search_blocks_fts(
    app: AppHandle,
    query: String,
) -> Result<Vec<BlockMeta>, String> {
    let path = db_path(&app)?;
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT b.id, b.name, b.category_id, b.drive_file_id, b.file_name, b.last_modified
                 FROM blocks b
                 JOIN blocks_fts f ON b.id = f.block_id
                 WHERE blocks_fts MATCH ?1
                 ORDER BY b.name",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![query], |row| {
                Ok(BlockMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    drive_file_id: row.get(3)?,
                    file_name: row.get(4)?,
                    last_modified: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut blocks = Vec::new();
        for row in rows {
            blocks.push(row.map_err(|e| e.to_string())?);
        }
        Ok(blocks)
    })
    .await
    .map_err(|e| e.to_string())?
}
