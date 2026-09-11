import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { StudentFileOpen } from "../types";

export type WindowChrome = "full" | "focus";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isFocusedChrome(): boolean {
  if (!isTauri()) return false;
  try {
    return WebviewWindow.getCurrent().label.startsWith("aux-focus-");
  } catch {
    return false;
  }
}

export async function setAppWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const next = title.trim() ? `${title.trim()} · Tutor Notes` : "Tutor Notes";
    await WebviewWindow.getCurrent().setTitle(next);
  } catch {
    // Browser preview or missing permission — ignore.
  }
}

function windowLabel(chrome: WindowChrome, kind: string, id: string | number): string {
  const safeKind = kind.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "page";
  return `aux-${chrome}-${safeKind}-${id}`;
}

function hashUrl(route: string): string {
  const hash = route.startsWith("/") ? route : `/${route}`;
  return `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
}

export async function openResourceWindow(opts: {
  id: number;
  title: string;
  chrome?: WindowChrome;
}): Promise<void> {
  await openAppWindow({
    route: `/resources/${opts.id}`,
    title: opts.title,
    kind: "resource",
    id: opts.id,
    chrome: opts.chrome ?? "full",
  });
}

export function canOpenOnCanvas(type: string): boolean {
  return type === "pdf" || type === "image";
}

export function openStudentFile(
  resource: { id: number; title: string; type: string },
  opts: { mode: StudentFileOpen; onCanvas?: () => void },
): void {
  if (canOpenOnCanvas(resource.type) && opts.mode === "canvas" && opts.onCanvas) {
    opts.onCanvas();
    return;
  }
  void openResourceWindow({ id: resource.id, title: resource.title });
}

export async function openAppWindow(opts: {
  route: string;
  title: string;
  kind: string;
  id: string | number;
  chrome: WindowChrome;
}): Promise<void> {
  if (!isTauri()) return;
  const label = windowLabel(opts.chrome, opts.kind, opts.id);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const focused = opts.chrome === "focus";
  const created = new WebviewWindow(label, {
    url: hashUrl(opts.route),
    title: opts.title.trim() ? `${opts.title.trim()} · Tutor Notes` : "Tutor Notes",
    width: focused ? 900 : 1200,
    height: focused ? 800 : 800,
    minWidth: focused ? 480 : 960,
    minHeight: focused ? 400 : 640,
    focus: true,
    dragDropEnabled: true,
  });
  created.once("tauri://error", (event) => {
    console.error("Failed to open window", event.payload);
  });
}
