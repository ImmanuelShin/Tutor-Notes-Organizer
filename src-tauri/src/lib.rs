use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("media")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("pdfs")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || relative.split(['/', '\\']).any(|p| p == "..") {
        return Err("invalid path".into());
    }
    Ok(root.join(rel))
}

fn unique_dest(dir: &Path, original: &str) -> PathBuf {
    let file_name = Path::new(original)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    for i in 1..10_000 {
        let name = if ext.is_empty() {
            format!("{stem}-{i}")
        } else {
            format!("{stem}-{i}.{ext}")
        };
        let path = dir.join(name);
        if !path.exists() {
            return path;
        }
    }
    dir.join(format!("{stem}-{}", uuid::Uuid::new_v4()))
}

#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_root(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn save_pasted_image(app: AppHandle, data_base64: String, mime: String) -> Result<String, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, rest)| rest)
        .unwrap_or(&data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| e.to_string())?;

    let ext = match mime.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    };

    let root = app_root(&app)?;
    let media = root.join("media");
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = media.join(&name);
    fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    Ok(format!("media/{name}"))
}

fn import_named_file(
    app: AppHandle,
    source: String,
    folder: &str,
    fallback: &str,
) -> Result<String, String> {
    let root = app_root(&app)?;
    let dir = root.join(folder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err("file not found".into());
    }
    let original = src
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(fallback);
    let dest = unique_dest(&dir, original);
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    let file_name = dest
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid file name".to_string())?;
    Ok(format!("{folder}/{file_name}"))
}

#[tauri::command]
fn import_pdf(app: AppHandle, source: String) -> Result<String, String> {
    import_named_file(app, source, "pdfs", "notes.pdf")
}

#[tauri::command]
fn import_image(app: AppHandle, source: String) -> Result<String, String> {
    let lower = source.to_lowercase();
    if ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        return Err("not an image file".into());
    }
    import_named_file(app, source, "media", "image.png")
}

#[tauri::command]
fn delete_app_file(app: AppHandle, relative: String) -> Result<(), String> {
    let root = app_root(&app)?;
    let path = safe_join(&root, &relative)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    fs::read(&path).map_err(|e| e.to_string())
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
            resolve_app_file,
            open_app_file,
            open_url,
            read_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
