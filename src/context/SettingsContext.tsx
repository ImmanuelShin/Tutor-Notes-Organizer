import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initDb } from "../db/client";
import { loadUiSettings, setSetting } from "../db/search";
import {
  acquireSyncLock,
  heartbeatSyncLock,
  pushLibrary,
  releaseSyncLock,
  startupPull,
  syncNow as runSyncNow,
  type SyncStatus,
} from "../lib/sync";
import type { Density, ResourceFileOpen, StudentFileOpen, Theme } from "../types";

type Settings = {
  ready: boolean;
  error: string | null;
  theme: Theme;
  density: Density;
  studentFileOpen: StudentFileOpen;
  resourceFileOpen: ResourceFileOpen;
  syncing: boolean;
  syncNow: () => Promise<SyncStatus>;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setStudentFileOpen: (value: StudentFileOpen) => void;
  setResourceFileOpen: (value: ResourceFileOpen) => void;
};

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>("light");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [studentFileOpen, setStudentFileOpenState] = useState<StudentFileOpen>("canvas");
  const [resourceFileOpen, setResourceFileOpenState] = useState<ResourceFileOpen>("same");
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let timer: number | undefined;
    (async () => {
      try {
        let isMain = true;
        try {
          isMain = getCurrentWindow().label === "main";
        } catch {
          isMain = true;
        }
        if (isMain) {
          await startupPull();
        }
        await initDb();
        if (isMain) {
          await acquireSyncLock(false);
          const status = await heartbeatSyncLock();
          if (status.folder && !status.remoteHasDb && status.holdsLock) {
            await pushLibrary();
          }
        }
        const ui = await loadUiSettings();
        if (cancelled) return;
        setThemeState(ui.theme);
        setDensityState(ui.density);
        setStudentFileOpenState(ui.studentFileOpen);
        setResourceFileOpenState(ui.resourceFileOpen);
        setReady(true);

        if (!isMain || cancelled) return;

        timer = window.setInterval(() => {
          void (async () => {
            try {
              const next = await heartbeatSyncLock();
              if (next.folder && next.holdsLock) await pushLibrary();
            } catch {
              // Sync is best-effort while the app is open.
            }
          })();
        }, 60_000);

        try {
          const win = getCurrentWindow();
          if (win.label === "main") {
            unlisten = await win.onCloseRequested(async (event) => {
              event.preventDefault();
              try {
                await pushLibrary();
                await releaseSyncLock();
              } catch {
                // Still close so the app cannot get stuck.
              }
              await win.destroy();
            });
            if (cancelled) {
              unlisten();
              unlisten = undefined;
            }
          }
        } catch {
          // Browser preview or missing window permission.
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
  }, [theme, density]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return runSyncNow();
    syncingRef.current = true;
    setSyncing(true);
    try {
      return await runSyncNow();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    void setSetting("theme", next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    void setSetting("density", next);
  }, []);

  const setStudentFileOpen = useCallback((next: StudentFileOpen) => {
    setStudentFileOpenState(next);
    void setSetting("student_file_open", next);
  }, []);

  const setResourceFileOpen = useCallback((next: ResourceFileOpen) => {
    setResourceFileOpenState(next);
    void setSetting("resource_file_open", next);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      error,
      theme,
      density,
      studentFileOpen,
      resourceFileOpen,
      syncing,
      syncNow,
      setTheme,
      setDensity,
      setStudentFileOpen,
      setResourceFileOpen,
    }),
    [
      ready,
      error,
      theme,
      density,
      studentFileOpen,
      resourceFileOpen,
      syncing,
      syncNow,
      setTheme,
      setDensity,
      setStudentFileOpen,
      setResourceFileOpen,
    ],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="card max-w-lg p-6">
          <h1 className="text-2xl">Could not open the notebook</h1>
          <p className="mt-2 text-[var(--ink-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--ink-muted)]">
        Opening notebook…
      </div>
    );
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
