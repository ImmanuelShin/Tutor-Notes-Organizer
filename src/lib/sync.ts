import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { closeDb, checkpointDb, initDb } from "../db/client";

export type SyncStatus = {
  folder: string | null;
  machine: string;
  holdsLock: boolean;
  lockHolder: string | null;
  lockStale: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastAction: string | null;
  remoteHasDb: boolean;
  needsFirstChoice: boolean;
  conflictPath: string | null;
  message: string;
};

export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_status");
}

export async function setSyncFolder(folder: string): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_set_folder", { folder });
}

export async function pickSyncFolder(): Promise<SyncStatus | null> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return null;
  return setSyncFolder(selected);
}

export async function acquireSyncLock(steal = false): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_acquire_lock", { steal });
}

export async function heartbeatSyncLock(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_heartbeat");
}

export async function releaseSyncLock(): Promise<void> {
  await invoke("sync_release_lock");
}

export async function pushLibrary(): Promise<SyncStatus> {
  await checkpointDb();
  return invoke<SyncStatus>("sync_push");
}

/** Checkpoint and push if a sync folder is configured. */
export async function syncNow(): Promise<SyncStatus> {
  let status = await getSyncStatus();
  if (!status.folder) return status;
  if (!status.holdsLock) {
    status = await acquireSyncLock(false);
  }
  return pushLibrary();
}

export async function pullLibrary(force = false): Promise<SyncStatus> {
  await closeDb();
  try {
    return await invoke<SyncStatus>("sync_pull", { force });
  } finally {
    await initDb();
  }
}

export async function startupPull(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_startup_pull");
}

export function formatSyncTime(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
