use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::optimize::sha256_hex;
use crate::paths::{app_root, machine_name, now_iso, relative_slash};

const LOCK_STALE: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub folder: Option<String>,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    pub last_local_db_hash: Option<String>,
    pub last_remote_db_hash: Option<String>,
    pub last_action: Option<String>,
    pub conflict_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockFile {
    machine: String,
    pid: u32,
    heartbeat_at: String,
    heartbeat_unix: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    updated_at: String,
    machine: String,
    files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    path: String,
    size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub folder: Option<String>,
    pub machine: String,
    pub holds_lock: bool,
    pub lock_holder: Option<String>,
    pub lock_stale: bool,
    pub last_push_at: Option<String>,
    pub last_pull_at: Option<String>,
    pub last_action: Option<String>,
    pub remote_has_db: bool,
    pub needs_first_choice: bool,
    pub conflict_path: Option<String>,
    pub message: String,
}

fn config_path(root: &Path) -> PathBuf {
    root.join("sync.json")
}

fn load_config(root: &Path) -> SyncConfig {
    let path = config_path(root);
    let Ok(bytes) = fs::read(&path) else {
        return SyncConfig::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn save_config(root: &Path, cfg: &SyncConfig) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(config_path(root), json).map_err(|e| e.to_string())
}

fn replica_dir(cfg: &SyncConfig) -> Result<PathBuf, String> {
    let folder = cfg
        .folder
        .as_ref()
        .ok_or_else(|| "no sync folder selected".to_string())?;
    let path = PathBuf::from(folder);
    if !path.exists() {
        return Err("sync folder is missing".into());
    }
    Ok(path)
}

fn lock_path(replica: &Path) -> PathBuf {
    replica.join("tutor.lock")
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_lock(replica: &Path) -> Option<LockFile> {
    let bytes = fs::read(lock_path(replica)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_lock(replica: &Path, machine: &str) -> Result<(), String> {
    let lock = LockFile {
        machine: machine.to_string(),
        pid: std::process::id(),
        heartbeat_at: now_iso(),
        heartbeat_unix: unix_now(),
    };
    let json = serde_json::to_vec_pretty(&lock).map_err(|e| e.to_string())?;
    fs::write(lock_path(replica), json).map_err(|e| e.to_string())
}

fn lock_is_ours(lock: &LockFile, machine: &str) -> bool {
    lock.machine == machine
}

fn lock_is_stale(lock: &LockFile) -> bool {
    let now = unix_now();
    now.saturating_sub(lock.heartbeat_unix) > LOCK_STALE.as_secs()
}

fn hash_file(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(sha256_hex(&bytes))
}

fn list_library_files(root: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let mut out = Vec::new();
    for folder in ["media", "pdfs"] {
        let dir = root.join(folder);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let name = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file");
                out.push((relative_slash(folder, name), path));
            }
        }
    }
    Ok(out)
}

fn copy_file(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if to.exists() {
        if let (Ok(a), Ok(b)) = (from.metadata(), to.metadata()) {
            if a.len() == b.len() {
                return Ok(());
            }
        }
    }
    fs::copy(from, to).map_err(|e| e.to_string())?;
    Ok(())
}

fn mirror_library(from_root: &Path, to_root: &Path) -> Result<(), String> {
    fs::create_dir_all(to_root.join("media")).map_err(|e| e.to_string())?;
    fs::create_dir_all(to_root.join("pdfs")).map_err(|e| e.to_string())?;
    let files = list_library_files(from_root)?;
    let mut keep = std::collections::HashSet::new();
    for (rel, src) in &files {
        keep.insert(rel.clone());
        copy_file(src, &to_root.join(rel))?;
    }
    for folder in ["media", "pdfs"] {
        let dir = to_root.join(folder);
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
            let rel = relative_slash(folder, name);
            if !keep.contains(&rel) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

fn write_manifest(replica: &Path, local: &Path) -> Result<(), String> {
    let files = list_library_files(local)?
        .into_iter()
        .filter_map(|(path, abs)| {
            abs.metadata().ok().map(|m| ManifestFile {
                path,
                size: m.len(),
            })
        })
        .collect();
    let manifest = Manifest {
        updated_at: now_iso(),
        machine: machine_name(),
        files,
    };
    let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(replica.join("sync-manifest.json"), json).map_err(|e| e.to_string())
}

fn status_from(
    cfg: &SyncConfig,
    replica: Option<&Path>,
    holds_lock: bool,
    lock_holder: Option<String>,
    lock_stale: bool,
    message: String,
) -> SyncStatus {
    let remote_has_db = replica
        .map(|p| p.join("tutor.db").exists())
        .unwrap_or(false);
    let needs_first_choice = cfg.folder.is_some()
        && remote_has_db
        && cfg.last_local_db_hash.is_none()
        && cfg.last_remote_db_hash.is_none();
    SyncStatus {
        folder: cfg.folder.clone(),
        machine: machine_name(),
        holds_lock,
        lock_holder,
        lock_stale,
        last_push_at: cfg.last_push_at.clone(),
        last_pull_at: cfg.last_pull_at.clone(),
        last_action: cfg.last_action.clone(),
        remote_has_db,
        needs_first_choice,
        conflict_path: cfg.conflict_path.clone(),
        message,
    }
}

pub fn get_status(app: AppHandle) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let cfg = load_config(&root);
    let Some(folder) = cfg.folder.as_ref() else {
        return Ok(status_from(
            &cfg,
            None,
            false,
            None,
            false,
            "Choose a folder inside OneDrive, Dropbox, or another synced drive.".into(),
        ));
    };
    let replica = PathBuf::from(folder);
    if !replica.exists() {
        return Ok(status_from(
            &cfg,
            None,
            false,
            None,
            false,
            "The sync folder is missing.".into(),
        ));
    }
    let machine = machine_name();
    let lock = read_lock(&replica);
    let lock_holder = lock.as_ref().map(|l| l.machine.clone());
    let lock_stale = lock.as_ref().map(lock_is_stale).unwrap_or(false);
    let holds_lock = lock
        .as_ref()
        .map(|l| lock_is_ours(l, &machine) && !lock_is_stale(l))
        .unwrap_or(false);
    let message = if holds_lock {
        "This computer can write to the shared library.".into()
    } else if let Some(other) = &lock_holder {
        if lock_stale {
            format!("{other} left a stale lock. You can take over.")
        } else {
            format!("{other} is using the library. This copy will not push.")
        }
    } else {
        "Ready to sync.".into()
    };
    Ok(status_from(
        &cfg,
        Some(&replica),
        holds_lock,
        lock_holder,
        lock_stale,
        message,
    ))
}

pub fn set_folder(app: AppHandle, folder: String) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err("that path is not a folder".into());
    }
    let mut cfg = load_config(&root);
    cfg.folder = Some(folder);
    cfg.last_local_db_hash = None;
    cfg.last_remote_db_hash = None;
    cfg.last_action = None;
    cfg.conflict_path = None;
    save_config(&root, &cfg)?;
    get_status(app)
}

pub fn acquire_lock(app: AppHandle, steal: bool) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let cfg = load_config(&root);
    if cfg.folder.is_none() {
        return get_status(app);
    }
    let replica = replica_dir(&cfg)?;
    let machine = machine_name();
    match read_lock(&replica) {
        None => write_lock(&replica, &machine)?,
        Some(lock) if lock_is_ours(&lock, &machine) || lock_is_stale(&lock) || steal => {
            write_lock(&replica, &machine)?;
        }
        Some(lock) => {
            return Ok(status_from(
                &cfg,
                Some(&replica),
                false,
                Some(lock.machine.clone()),
                false,
                format!("{} is using the library. This copy will not push.", lock.machine),
            ));
        }
    }
    get_status(app)
}

pub fn heartbeat_lock(app: AppHandle) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let cfg = load_config(&root);
    let Ok(replica) = replica_dir(&cfg) else {
        return get_status(app);
    };
    let machine = machine_name();
    if let Some(lock) = read_lock(&replica) {
        if lock_is_ours(&lock, &machine) {
            write_lock(&replica, &machine)?;
        }
    }
    get_status(app)
}

pub fn release_lock(app: AppHandle) -> Result<(), String> {
    let root = app_root(&app)?;
    let cfg = load_config(&root);
    let Ok(replica) = replica_dir(&cfg) else {
        return Ok(());
    };
    let machine = machine_name();
    if let Some(lock) = read_lock(&replica) {
        if lock_is_ours(&lock, &machine) {
            let _ = fs::remove_file(lock_path(&replica));
        }
    }
    Ok(())
}

fn copy_db(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(from, to).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn push(app: AppHandle) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let mut cfg = load_config(&root);
    let replica = replica_dir(&cfg)?;
    let machine = machine_name();
    match read_lock(&replica) {
        Some(lock) if lock_is_ours(&lock, &machine) => write_lock(&replica, &machine)?,
        Some(lock) if lock_is_stale(&lock) => write_lock(&replica, &machine)?,
        Some(lock) => {
            return Ok(status_from(
                &cfg,
                Some(&replica),
                false,
                Some(lock.machine.clone()),
                false,
                format!("{} is using the library. Push skipped.", lock.machine),
            ));
        }
        None => write_lock(&replica, &machine)?,
    }

    let local_db = root.join("tutor.db");
    if !local_db.exists() {
        return Err("local database is missing".into());
    }
    copy_db(&local_db, &replica.join("tutor.db"))?;
    mirror_library(&root, &replica)?;
    write_manifest(&replica, &root)?;

    let hash = hash_file(&local_db).unwrap_or_default();
    cfg.last_push_at = Some(now_iso());
    cfg.last_local_db_hash = Some(hash.clone());
    cfg.last_remote_db_hash = Some(hash);
    cfg.last_action = Some("push".into());
    cfg.conflict_path = None;
    save_config(&root, &cfg)?;
    get_status(app)
}

fn save_conflict(replica: &Path, remote_db: &Path) -> Option<String> {
    let name = format!(
        "tutor.db.conflict-{}-{}",
        machine_name().replace(['\\', '/', ':', ' '], "_"),
        unix_now()
    );
    let dest = replica.join(&name);
    fs::copy(remote_db, &dest).ok()?;
    Some(dest.to_string_lossy().to_string())
}

fn pull_into(root: &Path, replica: &Path) -> Result<(), String> {
    let remote_db = replica.join("tutor.db");
    if remote_db.exists() {
        copy_db(&remote_db, &root.join("tutor.db"))?;
    }
    mirror_library(replica, root)?;
    Ok(())
}

pub fn pull(app: AppHandle, force: bool) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let mut cfg = load_config(&root);
    let replica = replica_dir(&cfg)?;
    let remote_db = replica.join("tutor.db");
    if !remote_db.exists() {
        return Ok(status_from(
            &cfg,
            Some(&replica),
            false,
            None,
            false,
            "The sync folder has no library yet. Push from this computer to seed it.".into(),
        ));
    }

    let local_db = root.join("tutor.db");
    let local_hash = hash_file(&local_db);
    let remote_hash = hash_file(&remote_db);

    if !force {
        if let (Some(lh), Some(rh)) = (&local_hash, &remote_hash) {
            if lh != rh {
                let local_changed = cfg.last_local_db_hash.as_ref() != Some(lh);
                let remote_changed = cfg.last_remote_db_hash.as_ref() != Some(rh);
                if local_changed && remote_changed && cfg.last_local_db_hash.is_some() {
                    let conflict = save_conflict(&replica, &remote_db);
                    cfg.last_action = Some("conflict".into());
                    cfg.conflict_path = conflict.clone();
                    save_config(&root, &cfg)?;
                    return Ok(status_from(
                        &cfg,
                        Some(&replica),
                        false,
                        None,
                        false,
                        "Both computers changed the library. This PC kept its copy; the other is saved beside the sync folder.".into(),
                    ));
                }
            }
        }
    }

    pull_into(&root, &replica)?;
    let hash = hash_file(&root.join("tutor.db")).unwrap_or_default();
    cfg.last_pull_at = Some(now_iso());
    cfg.last_local_db_hash = Some(hash.clone());
    cfg.last_remote_db_hash = Some(hash);
    cfg.last_action = Some("pull".into());
    cfg.conflict_path = None;
    save_config(&root, &cfg)?;
    get_status(app)
}

/// Called before the SQLite plugin opens the database.
pub fn startup_pull(app: AppHandle) -> Result<SyncStatus, String> {
    let root = app_root(&app)?;
    let cfg = load_config(&root);
    if cfg.folder.is_none() {
        return get_status(app);
    }
    let replica = match replica_dir(&cfg) {
        Ok(p) => p,
        Err(_) => return get_status(app),
    };
    let machine = machine_name();
    if let Some(lock) = read_lock(&replica) {
        if !lock_is_ours(&lock, &machine) && !lock_is_stale(&lock) {
            return Ok(status_from(
                &cfg,
                Some(&replica),
                false,
                Some(lock.machine.clone()),
                false,
                format!("{} is using the library. Pull skipped.", lock.machine),
            ));
        }
    }

    if cfg.last_local_db_hash.is_none() && replica.join("tutor.db").exists() {
        return Ok(status_from(
            &cfg,
            Some(&replica),
            false,
            read_lock(&replica).map(|l| l.machine),
            false,
            "This folder already has a library. Pull it or push this computer from Settings.".into(),
        ));
    }

    let local_hash = hash_file(&root.join("tutor.db"));
    let remote_hash = hash_file(&replica.join("tutor.db"));
    let should_pull = match (&local_hash, &remote_hash, &cfg.last_local_db_hash, &cfg.last_remote_db_hash)
    {
        (Some(lh), Some(rh), last_l, last_r) if lh != rh => {
            let local_clean = last_l.as_ref() == Some(lh);
            let remote_newer = last_r.as_ref() != Some(rh);
            local_clean && remote_newer
        }
        (None, Some(_), _, _) => true,
        _ => false,
    };

    if should_pull {
        return pull(app, false);
    }
    get_status(app)
}
