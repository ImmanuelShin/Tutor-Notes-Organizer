use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

pub fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("media")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("pdfs")).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || relative.split(['/', '\\']).any(|p| p == "..") {
        return Err("invalid path".into());
    }
    Ok(root.join(rel))
}

pub fn relative_slash(folder: &str, name: &str) -> String {
    format!("{folder}/{name}")
}

pub fn machine_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".into())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn is_hashed_filename(name: &str) -> bool {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    stem.len() == 64 && stem.bytes().all(|b| b.is_ascii_hexdigit())
}
