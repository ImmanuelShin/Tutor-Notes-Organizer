mod files;
mod optimize;
mod paths;
mod sync;

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::paths::{app_root, safe_join};

#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_root(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn save_pasted_image(app: AppHandle, data_base64: String, mime: String) -> Result<String, String> {
    files::save_pasted_image(app, data_base64, mime)
}

#[tauri::command]
fn import_pdf(app: AppHandle, source: String) -> Result<String, String> {
    files::import_pdf(app, source)
}

#[tauri::command]
fn import_image(app: AppHandle, source: String) -> Result<String, String> {
    files::import_image(app, source)
}

#[tauri::command]
fn delete_app_file(app: AppHandle, relative: String) -> Result<(), String> {
    files::delete_app_file(app, relative)
}

#[tauri::command]
fn optimize_library(app: AppHandle) -> Result<Vec<files::PathRewrite>, String> {
    files::optimize_library(app)
}

#[tauri::command]
fn sweep_orphaned_files(app: AppHandle, keep: Vec<String>) -> Result<u32, String> {
    files::sweep_orphaned_files(app, keep)
}

#[tauri::command]
fn resolve_app_file(app: AppHandle, relative: String) -> Result<String, String> {
    let root = app_root(&app)?;
    let path = safe_join(&root, &relative)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_app_file(app: AppHandle, relative: String) -> Result<(), String> {
    let root = app_root(&app)?;
    let path = safe_join(&root, &relative)?;
    if !path.exists() {
        return Err("file not found".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http(s) URLs can be opened".into());
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn sync_status(app: AppHandle) -> Result<sync::SyncStatus, String> {
    sync::get_status(app)
}

#[tauri::command]
fn sync_set_folder(app: AppHandle, folder: String) -> Result<sync::SyncStatus, String> {
    sync::set_folder(app, folder)
}

#[tauri::command]
fn sync_acquire_lock(app: AppHandle, steal: bool) -> Result<sync::SyncStatus, String> {
    sync::acquire_lock(app, steal)
}

#[tauri::command]
fn sync_heartbeat(app: AppHandle) -> Result<sync::SyncStatus, String> {
    sync::heartbeat_lock(app)
}

#[tauri::command]
fn sync_release_lock(app: AppHandle) -> Result<(), String> {
    sync::release_lock(app)
}

#[tauri::command]
fn sync_push(app: AppHandle) -> Result<sync::SyncStatus, String> {
    sync::push(app)
}

#[tauri::command]
fn sync_pull(app: AppHandle, force: bool) -> Result<sync::SyncStatus, String> {
    sync::pull(app, force)
}

#[tauri::command]
fn sync_startup_pull(app: AppHandle) -> Result<sync::SyncStatus, String> {
    sync::startup_pull(app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let _ = app_root(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            save_pasted_image,
            import_pdf,
            import_image,
            delete_app_file,
            optimize_library,
            sweep_orphaned_files,
            resolve_app_file,
            open_app_file,
            open_url,
            read_file_bytes,
            sync_status,
            sync_set_folder,
            sync_acquire_lock,
            sync_heartbeat,
            sync_release_lock,
            sync_push,
            sync_pull,
            sync_startup_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
