import type { PagePanel, PagePanelId, PagePanelKind, StudentPageLayout } from "../types";
import { uid } from "./worksheet";

export const BOARD_WIDTH = 2400;
export const BOARD_HEIGHT = 1800;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.75;
export const NEW_PANEL_W = 520;
export const NEW_PANEL_H = 400;

export const PAGE_PANEL_IDS: PagePanelId[] = [
  "workspace",
  "sessions",
  "activeTopics",
  "profile",
  "resources",
  "assignments",
];

export const PAGE_PANEL_LABELS: Record<PagePanelId, string> = {
  workspace: "Workspace",
  sessions: "Sessions",
  activeTopics: "Active topics",
  profile: "Profile",
  resources: "Pinned resources",
  assignments: "Assignments",
};

const DEFAULT_PANELS: PagePanel[] = [
  { id: "workspace", kind: "workspace", x: 16, y: 16, w: 900, h: 560, z: 1 },
  { id: "sessions", kind: "sessions", x: 16, y: 592, w: 900, h: 240, z: 1 },
  { id: "activeTopics", kind: "activeTopics", x: 16, y: 848, w: 900, h: 280, z: 1 },
  { id: "profile", kind: "profile", x: 932, y: 16, w: 340, h: 400, z: 1 },
  { id: "resources", kind: "resources", x: 932, y: 432, w: 340, h: 240, z: 1 },
  { id: "assignments", kind: "assignments", x: 932, y: 688, w: 340, h: 320, z: 1 },
];

export function isBuiltinPanelId(id: string): id is PagePanelId {
  return (PAGE_PANEL_IDS as string[]).includes(id);
}

export function defaultPageLayout(): StudentPageLayout {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    panels: DEFAULT_PANELS.map((p) => ({ ...p })),
  };
}

function parseCoord(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseKind(raw: Partial<PagePanel> & { id?: unknown }): PagePanelKind | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  if (raw.kind === "media" || id.startsWith("media_")) return "media";
  if (isBuiltinPanelId(id)) return id;
  if (raw.kind === "workspace" || id.startsWith("ws_")) return "workspace";
  return null;
}

function parsePanel(raw: unknown): PagePanel | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PagePanel>;
  const kind = parseKind(p);
  if (!kind) return null;
  const id = typeof p.id === "string" && p.id ? p.id : null;
  if (!id) return null;
  if (kind === "media") {
    const resourceId = Number(p.resourceId);
    if (!Number.isFinite(resourceId) || resourceId <= 0) return null;
    return {
      id,
      kind,
      resourceId,
      x: parseCoord(p.x, 0),
      y: parseCoord(p.y, 0),
      w: Math.min(4000, Math.max(240, Number(p.w) || NEW_PANEL_W)),
      h: Math.min(4000, Math.max(140, Number(p.h) || NEW_PANEL_H)),
      hidden: p.hidden === true ? true : undefined,
      z: Math.max(1, Number(p.z) || 1),
    };
  }
  if (isBuiltinPanelId(id) && kind !== id) return null;
  return {
    id,
    kind,
    x: parseCoord(p.x, 0),
    y: parseCoord(p.y, 0),
    w: Math.min(4000, Math.max(240, Number(p.w) || 320)),
    h: Math.min(4000, Math.max(140, Number(p.h) || 200)),
    hidden: p.hidden === true ? true : undefined,
    z: Math.max(1, Number(p.z) || 1),
  };
}

export function parsePageLayout(raw: string | null | undefined): StudentPageLayout {
  const fallback = defaultPageLayout();
  if (!raw?.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StudentPageLayout>;
    const found = new Map<string, PagePanel>();
    const extras: PagePanel[] = [];
    if (Array.isArray(parsed.panels)) {
      for (const item of parsed.panels) {
        const panel = parsePanel(item);
        if (!panel) continue;
        if (isBuiltinPanelId(panel.id)) found.set(panel.id, panel);
        else extras.push(panel);
      }
    }
    const panels = [
      ...DEFAULT_PANELS.map((def) => found.get(def.id) ?? { ...def }),
      ...extras,
    ];
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(parsed.zoom) || 1));
    return {
      zoom,
      panX: Number(parsed.panX) || 0,
      panY: Number(parsed.panY) || 0,
      panels,
    };
  } catch {
    return fallback;
  }
}

export function serializePageLayout(layout: StudentPageLayout): string {
  return JSON.stringify(layout);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function patchPanel(
  layout: StudentPageLayout,
  id: string,
  patch: Partial<PagePanel>,
): StudentPageLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, kind: p.kind } : p)),
  };
}

export function raisePanel(layout: StudentPageLayout, id: string): StudentPageLayout {
  const maxZ = Math.max(1, ...layout.panels.map((p) => p.z));
  const current = layout.panels.find((p) => p.id === id);
  if (!current || current.z >= maxZ) return layout;
  return patchPanel(layout, id, { z: maxZ + 1 });
}

export function setPanelHidden(
  layout: StudentPageLayout,
  id: string,
  hidden: boolean,
): StudentPageLayout {
  return patchPanel(layout, id, { hidden: hidden ? true : undefined });
}

export function addPanel(layout: StudentPageLayout, panel: PagePanel): StudentPageLayout {
  const maxZ = Math.max(1, ...layout.panels.map((p) => p.z));
  return {
    ...layout,
    panels: [...layout.panels, { ...panel, z: Math.max(panel.z, maxZ + 1) }],
  };
}

export function removePanel(layout: StudentPageLayout, id: string): StudentPageLayout {
  if (isBuiltinPanelId(id)) return setPanelHidden(layout, id, true);
  return { ...layout, panels: layout.panels.filter((p) => p.id !== id) };
}

export function resetLayout(layout: StudentPageLayout): StudentPageLayout {
  const extras = layout.panels.filter((p) => !isBuiltinPanelId(p.id));
  return {
    ...defaultPageLayout(),
    panels: [...defaultPageLayout().panels, ...extras],
  };
}

export function newWorkspacePanelId(): string {
  return `ws_${uid()}`;
}

export function newMediaPanelId(): string {
  return `media_${uid()}`;
}

export function panelLabel(panel: PagePanel, resourceTitle?: string): string {
  if (panel.kind === "media") return resourceTitle?.trim() || "File";
  if (isBuiltinPanelId(panel.id)) return PAGE_PANEL_LABELS[panel.id];
  return "Workspace";
}

export function viewportPointToWorld(
  layout: StudentPageLayout,
  viewport: DOMRect,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: (clientX - viewport.left - layout.panX) / layout.zoom,
    y: (clientY - viewport.top - layout.panY) / layout.zoom,
  };
}

export function visibleCenterWorld(
  layout: StudentPageLayout,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (viewport.width / 2 - layout.panX) / layout.zoom,
    y: (viewport.height / 2 - layout.panY) / layout.zoom,
  };
}

export function canvasViewportSize(): { width: number; height: number } {
  const el = document.querySelector(".student-canvas-viewport");
  if (!(el instanceof HTMLElement)) return { width: 960, height: 720 };
  const r = el.getBoundingClientRect();
  return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
}

export function canvasWorldSize(
  layout: StudentPageLayout,
  viewport: { width: number; height: number },
): { w: number; h: number } {
  let w = Math.max(BOARD_WIDTH, Math.ceil(viewport.width / MIN_ZOOM));
  let h = Math.max(BOARD_HEIGHT, Math.ceil(viewport.height / MIN_ZOOM));
  for (const panel of layout.panels) {
    if (panel.hidden) continue;
    w = Math.max(w, Math.ceil(panel.x + panel.w + 160));
    h = Math.max(h, Math.ceil(panel.y + panel.h + 160));
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

export function placeNewPanel(
  layout: StudentPageLayout,
  world: { x: number; y: number },
  board: { w: number; h: number },
  size = { w: NEW_PANEL_W, h: NEW_PANEL_H },
): { x: number; y: number } {
  const extraCount = layout.panels.filter((p) => !isBuiltinPanelId(p.id)).length;
  const offset = (extraCount % 6) * 24;
  return {
    x: Math.max(0, Math.min(board.w - size.w, world.x - size.w / 2 + offset)),
    y: Math.max(0, Math.min(board.h - size.h, world.y - size.h / 2 + offset)),
  };
}

export function placeInView(layout: StudentPageLayout): { x: number; y: number } {
  const size = { w: NEW_PANEL_W, h: NEW_PANEL_H };
  const extraCount = layout.panels.filter((p) => !isBuiltinPanelId(p.id)).length;
  const offset = (extraCount % 6) * 24;
  const center = visibleCenterWorld(layout, canvasViewportSize());
  return {
    x: center.x - size.w / 2 + offset,
    y: center.y - size.h / 2 + offset,
  };
}
