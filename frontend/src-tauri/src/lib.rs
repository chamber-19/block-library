extern crate alloc;
#[macro_use]
extern crate litcrypt2;
use_litcrypt!("ch19-block-library");

pub mod commands;

include!(concat!(env!("OUT_DIR"), "/block_library_secrets.rs"));

pub(crate) fn root_folder_id() -> String {
    _deobfuscate(DRIVE_ROOT_FOLDER_ID_ENC)
}

pub(crate) fn drive_api_key() -> String {
    _deobfuscate(DRIVE_API_KEY_ENC)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::catalog::list_categories,
            commands::catalog::list_blocks,
            commands::catalog::get_block_dxf,
            commands::catalog::sync_catalog,
            commands::catalog::search_blocks,
            commands::catalog::open_block_in_autocad,
            commands::catalog::seed_test_data,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = commands::cache::init_db(&handle) {
                eprintln!("DB init error: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
