import { useEffect, useState } from "react";
import { cn } from "../lib/format";
import { optimizeLibrary } from "../lib/libraryFiles";
import {
  acquireSyncLock,
  formatSyncTime,
  getSyncStatus,
  pickSyncFolder,
  pullLibrary,
  pushLibrary,
  type SyncStatus,
} from "../lib/sync";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "sync", label: "Sync" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsWindow({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("general");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-window-backdrop" onMouseDown={onClose}>
      <div
        className="settings-window-panel card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-window-title"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3">
          <h2 id="settings-window-title" className="text-xl">
            Settings
          </h2>
          <button className="btn btn-quiet btn-small" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-[var(--line)] bg-[var(--bg-sidebar)] p-2">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-xl px-3 py-2 text-left text-sm",
                  section === item.id
                    ? "bg-[var(--bg-raised)] shadow-sm"
                    : "hover:bg-[var(--bg-hover)]",
                )}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-auto p-6">
            {section === "general" ? <GeneralSection /> : null}
            {section === "sync" ? <SyncSection /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralSection() {
  return (
    <div>
      <h3 className="text-lg">General</h3>
      <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)]">
        Theme and density live in the sidebar. Library files stay on this PC and can be mirrored to
        a cloud folder from the Sync section.
      </p>
    </div>
  );
}

function SyncSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setStatus(await getSyncStatus());
  };

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const run = async (label: string, action: () => Promise<SyncStatus | void>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      const next = await action();
      if (next) setStatus(next);
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h3 className="text-lg">Sync</h3>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Pick a folder inside OneDrive, Dropbox, or another already-synced drive. This computer
          keeps the live notebook and copies it there. Imported scans and large photos are compressed
          so the folder stays small.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Folder</div>
        <p className="mt-1 break-all">{status?.folder ?? "Not set"}</p>
        <p className="mt-3 text-[var(--ink-muted)]">{status?.message ?? "Loading…"}</p>
        {status?.conflictPath ? (
          <p className="mt-2 text-[var(--danger)]">
            Conflict copy: {status.conflictPath}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--ink-muted)]">
          <div>Last push: {formatSyncTime(status?.lastPushAt ?? null)}</div>
          <div>Last pull: {formatSyncTime(status?.lastPullAt ?? null)}</div>
          <div>This PC: {status?.machine ?? "—"}</div>
          <div>
            Lock:{" "}
            {status?.holdsLock
              ? "this computer"
              : status?.lockHolder
                ? status.lockHolder
                : "none"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-small"
          disabled={!!busy}
          onClick={() =>
            void run("folder", async () => {
              const next = await pickSyncFolder();
              if (!next) return;
              setNote("Folder saved. Push this computer or pull the existing library.");
              return next;
            })
          }
        >
          Choose folder
        </button>
        <button
          type="button"
          className="btn btn-small btn-primary"
          disabled={!!busy || !status?.folder}
          onClick={() =>
            void run("push", async () => {
              const next = await pushLibrary();
              setNote("Pushed this computer to the folder.");
              return next;
            })
          }
        >
          {busy === "push" ? "Pushing…" : "Push this computer"}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!!busy || !status?.folder || !status.remoteHasDb}
          onClick={() => {
            if (
              !window.confirm(
                "Replace this computer’s notebook with the copy in the sync folder? Local-only changes will be lost.",
              )
            ) {
              return;
            }
            void run("pull", async () => {
              const next = await pullLibrary(true);
              window.location.reload();
              return next;
            });
          }}
        >
          {busy === "pull" ? "Pulling…" : "Pull (replace this PC)"}
        </button>
        {status && !status.holdsLock && status.lockHolder ? (
          <button
            type="button"
            className="btn btn-small"
            disabled={!!busy}
            onClick={() =>
              void run("lock", async () => {
                const next = await acquireSyncLock(true);
                setNote("This computer now holds the library lock.");
                return next;
              })
            }
          >
            Take over lock
          </button>
        ) : null}
      </div>

      {status?.needsFirstChoice ? (
        <p className="text-sm text-[var(--ink-muted)]">
          That folder already has a library. Pull it onto this PC, or push this PC to replace the
          folder.
        </p>
      ) : null}

      <div className="border-t border-[var(--line)] pt-4">
        <h4 className="text-sm font-medium">Storage</h4>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          New PDFs and photos are hashed and compressed on import. Run this once to shrink files
          already in the library (duplicate scans are stored once).
        </p>
        <button
          type="button"
          className="btn btn-small mt-3"
          disabled={!!busy}
          onClick={() =>
            void run("optimize", async () => {
              const result = await optimizeLibrary();
              setNote(
                `Optimized ${result.rewrites} file${result.rewrites === 1 ? "" : "s"}; removed ${result.removed} leftover${result.removed === 1 ? "" : "s"}.`,
              );
            })
          }
        >
          {busy === "optimize" ? "Optimizing…" : "Optimize library"}
        </button>
      </div>

      {note ? <p className="text-sm">{note}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {busy && busy !== "optimize" && busy !== "push" && busy !== "pull" ? (
        <p className="text-sm text-[var(--ink-muted)]">Working…</p>
      ) : null}
    </div>
  );
}
