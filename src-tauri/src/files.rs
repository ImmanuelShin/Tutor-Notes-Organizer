use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use tauri::AppHandle;

use crate::optimize::{optimize_image_bytes, optimize_pdf_bytes, sha256_hex};
use crate::paths::{app_root, is_hashed_filename, relative_slash, safe_join};

fn ext_from_path(path: &str, fallback: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn image_ext(path_or_mime: &str) -> String {
    let lower = path_or_mime.to_lowercase();
    if lower.contains("jpeg") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "jpg".into()
    } else if lower.contains("gif") || lower.ends_with(".gif") {
        "gif".into()
    } else if lower.contains("webp") || lower.ends_with(".webp") {
        "webp".into()
    } else if lower.contains("bmp") || lower.ends_with(".bmp") {
        "bmp".into()
    } else if lower.contains("tif") || lower.ends_with(".tif") || lower.ends_with(".tiff") {
        "tiff".into()
    } else {
        "png".into()
    }
}

pub fn store_hashed(root: &Path, folder: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
    let dir = root.join(folder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!("{}.{ext}", sha256_hex(bytes));
    let dest = dir.join(&name);
    if !dest.exists() {
        fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    }
    Ok(relative_slash(folder, &name))
}

pub fn save_pasted_image(app: AppHandle, data_base64: String, mime: String) -> Result<String, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, rest)| rest)
        .unwrap_or(&data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| e.to_string())?;
    let hinted = image_ext(&mime);
    let (optimized, ext) = optimize_image_bytes(&bytes, &hinted)?;
    let root = app_root(&app)?;
    store_hashed(&root, "media", &ext, &optimized)
}

pub fn import_pdf(app: AppHandle, source: String) -> Result<String, String> {
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err("file not found".into());
    }
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    let optimized = optimize_pdf_bytes(&bytes);
    let root = app_root(&app)?;
    store_hashed(&root, "pdfs", "pdf", &optimized)
}

pub fn import_image(app: AppHandle, source: String) -> Result<String, String> {
    let lower = source.to_lowercase();
    if ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        return Err("not an image file".into());
    }
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err("file not found".into());
    }
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    let hinted = ext_from_path(&source, "png");
    let hinted = if hinted == "jpeg" { "jpg".into() } else { hinted };
    let (optimized, ext) = optimize_image_bytes(&bytes, &hinted)?;
    let root = app_root(&app)?;
    store_hashed(&root, "media", &ext, &optimized)
}

pub fn delete_app_file(app: AppHandle, relative: String) -> Result<(), String> {
    let root = app_root(&app)?;
    let path = safe_join(&root, &relative)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct PathRewrite {
    pub from: String,
    pub to: String,
}

fn optimize_existing_file(root: &Path, folder: &str, path: &Path) -> Result<Option<PathRewrite>, String> {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid file name".to_string())?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let from = relative_slash(folder, name);

    let (out, ext) = if folder == "pdfs" {
        (optimize_pdf_bytes(&bytes), "pdf".to_string())
    } else {
        let hinted = ext_from_path(name, "png");
        let hinted = if hinted == "jpeg" { "jpg".into() } else { hinted };
        optimize_image_bytes(&bytes, &hinted)?
    };

    let to = store_hashed(root, folder, &ext, &out)?;
    if to == from {
        return Ok(None);
    }
    Ok(Some(PathRewrite { from, to }))
}

pub fn optimize_library(app: AppHandle) -> Result<Vec<PathRewrite>, String> {
    let root = app_root(&app)?;
    let mut rewrites = Vec::new();
    let mut original_hash_to: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for folder in ["media", "pdfs"] {
        let dir = root.join(folder);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if is_hashed_filename(name) {
                continue;
            }
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            let from = relative_slash(folder, name);
            let original = sha256_hex(&bytes);
            if let Some(to) = original_hash_to.get(&original) {
                if to != &from {
                    rewrites.push(PathRewrite {
                        from,
                        to: to.clone(),
                    });
                }
                continue;
            }
            let rewrite = optimize_existing_file(&root, folder, &path)?;
            let to = rewrite
                .as_ref()
                .map(|r| r.to.clone())
                .unwrap_or_else(|| from.clone());
            original_hash_to.insert(original, to);
            if let Some(rewrite) = rewrite {
                rewrites.push(rewrite);
            }
        }
    }
    Ok(rewrites)
}

pub fn sweep_orphaned_files(app: AppHandle, keep: Vec<String>) -> Result<u32, String> {
    let root = app_root(&app)?;
    let keep: std::collections::HashSet<String> = keep
        .into_iter()
        .map(|p| p.replace('\\', "/"))
        .collect();
    let mut removed = 0u32;
    for folder in ["media", "pdfs"] {
        let dir = root.join(folder);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let rel = relative_slash(folder, name);
            if !keep.contains(&rel) {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
    }
    Ok(removed)
}
