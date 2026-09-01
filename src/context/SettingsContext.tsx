import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initDb } from "../db/client";
import { loadUiSettings, setSetting } from "../db/search";
import type { Density, Theme } from "../types";

type Settings = {
  ready: boolean;
  error: string | null;
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
};

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>("light");
  const [density, setDensityState] = useState<Density>("comfortable");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDb();
        const ui = await loadUiSettings();
        if (cancelled) return;
        setThemeState(ui.theme);
        setDensityState(ui.density);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
  }, [theme, density]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    void setSetting("theme", next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    void setSetting("density", next);
  }, []);

  const value = useMemo(
    () => ({ ready, error, theme, density, setTheme, setDensity }),
    [ready, error, theme, density, setTheme, setDensity],
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
