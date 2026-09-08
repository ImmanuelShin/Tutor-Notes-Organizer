import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  FileStack,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { CommandPalette } from "./CommandPalette";
import { SettingsWindow } from "./SettingsWindow";
import { cn } from "../lib/format";
import { isFocusedChrome, setAppWindowTitle } from "../lib/windows";

const NAV = [
  { to: "/students", label: "Students", icon: UserRound },
  { to: "/topics", label: "Topics", icon: BookOpen },
  { to: "/templates", label: "Templates", icon: ClipboardList },
  { to: "/resources", label: "Resources", icon: FileStack },
];

function isStudentsPath(pathname: string): boolean {
  return pathname === "/students" || /^\/students\/\d+$/.test(pathname);
}

function navTarget(itemTo: string, studentsReturnTo: string): string {
  return itemTo === "/students" ? studentsReturnTo : itemTo;
}

function sectionActive(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

function defaultTitle(pathname: string): string | null {
  if (/^\/students\/\d+/.test(pathname)) return null;
  if (/^\/topics\/\d+/.test(pathname)) return null;
  if (/^\/templates\/\d+/.test(pathname)) return null;
  if (/^\/resources\/\d+/.test(pathname)) return null;
  if (pathname.startsWith("/students")) return "Students";
  if (pathname.startsWith("/topics")) return "Topics";
  if (pathname.startsWith("/templates")) return "Templates";
  if (pathname.startsWith("/resources")) return "Resources";
  return "Tutor Notes";
}

export function Shell() {
  const nav = useNavigate();
  const location = useLocation();
  const { theme, setTheme, syncing, syncNow } = useSettings();
  const [palette, setPalette] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studentsReturnTo, setStudentsReturnTo] = useState("/students");
  const focused = isFocusedChrome();

  useEffect(() => {
    const title = defaultTitle(location.pathname);
    if (title) void setAppWindowTitle(title);
  }, [location.pathname]);

  useEffect(() => {
    if (isStudentsPath(location.pathname)) setStudentsReturnTo(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (!mod) return;
      if (e.key === "1") {
        e.preventDefault();
        nav(studentsReturnTo);
      } else if (e.key === "2") {
        e.preventDefault();
        nav("/topics");
      } else if (e.key === "3") {
        e.preventDefault();
        nav("/templates");
      } else if (e.key === "4") {
        e.preventDefault();
        nav("/resources");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, studentsReturnTo]);

  return (
    <div className="flex h-full">
      {focused ? null : (
        <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-sidebar)]">
          <div className="px-4 pb-2 pt-5">
            <div className="display text-xl leading-tight">Tutor Notes</div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Personal notebook</p>
          </div>
          <button
            type="button"
            className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-left text-sm text-[var(--ink-muted)]"
            onClick={() => setPalette(true)}
          >
            <Search size={14} />
            <span className="flex-1">Search</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={navTarget(item.to, studentsReturnTo)}
                className={() =>
                  cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    sectionActive(location.pathname, item.to)
                      ? "bg-[var(--bg-raised)] shadow-sm"
                      : "hover:bg-[var(--bg-hover)]",
                  )
                }
              >
                <item.icon size={16} />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="space-y-2 border-t border-[var(--line)] p-3">
            <button
              type="button"
              className="btn btn-small w-full"
              disabled={syncing}
              title="Push this computer to the sync folder"
              onClick={() => {
                void (async () => {
                  const status = await syncNow();
                  if (!status.folder) setSettingsOpen(true);
                })();
              }}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
              {syncing ? "Syncing…" : "Sync"}
            </button>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn btn-small flex-1"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                type="button"
                className="btn btn-small flex-1"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                <Settings size={14} />
                Settings
              </button>
            </div>
            <p className="px-1 text-[10px] leading-4 text-[var(--ink-muted)]">
              Archive instead of delete. Sync a folder from Settings.
            </p>
          </div>
        </aside>
      )}
      <main
        className={cn(
          "min-w-0 flex-1",
          /^\/students\/\d+/.test(location.pathname)
            ? "flex min-h-0 flex-col overflow-hidden p-[var(--pad)]"
            : "overflow-auto p-[var(--pad)]",
        )}
      >
        <Outlet />
      </main>
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        studentsPath={studentsReturnTo}
      />
      {settingsOpen ? <SettingsWindow onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
