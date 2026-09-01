import { EMPTY_DOC, type ChecklistItem, type NoteBox, type Workspace, type WorkspaceTab, type WorkspaceTabKind, type Worksheet } from "../types";
import { isEmptyDoc } from "./format";
import { isBuiltinPanelId } from "./pageLayout";
import {
  appendTemplateRows,
  emptyWorksheet,
  parseWorksheet,
  recordsFromTopicGroup,
  setRowDone,
  uid,
} from "./worksheet";
import { getStudent, updateStudent } from "../db/students";

export function emptyTableTab(title = "Worksheet"): WorkspaceTab {
  return { id: uid(), title, kind: "table", table: emptyWorksheet() };
}

export function emptyNotesTab(title = "Notes"): WorkspaceTab {
  return { id: uid(), title, kind: "notes", notes: [] };
}

export function emptyChecklistTab(title = "Checklist"): WorkspaceTab {
  return { id: uid(), title, kind: "checklist", checklist: [] };
}

export function emptyWorkspace(): Workspace {
  const tab = emptyTableTab();
  return { tabs: [tab], activeTabId: tab.id };
}

function isLegacyWorksheet(parsed: unknown): parsed is Worksheet {
  if (!parsed || typeof parsed !== "object") return false;
  const row = parsed as { columns?: unknown; rows?: unknown; tabs?: unknown };
  return Array.isArray(row.columns) && Array.isArray(row.rows) && !Array.isArray(row.tabs);
}

function parseTab(raw: unknown): WorkspaceTab | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<WorkspaceTab>;
  const kind: WorkspaceTabKind =
    t.kind === "notes" || t.kind === "checklist" || t.kind === "table" ? t.kind : "table";
  const id = typeof t.id === "string" && t.id ? t.id : uid();
  const title = typeof t.title === "string" && t.title.trim() ? t.title.trim() : kind === "table" ? "Worksheet" : kind === "notes" ? "Notes" : "Checklist";
  if (kind === "notes") {
    const notes = Array.isArray(t.notes)
      ? t.notes
          .map((box) => parseNoteBox(box))
          .filter((box): box is NoteBox => Boolean(box))
      : [];
    return { id, title, kind, notes };
  }
  if (kind === "checklist") {
    const checklist = Array.isArray(t.checklist)
      ? t.checklist
          .map((item) => parseChecklistItem(item))
          .filter((item): item is ChecklistItem => Boolean(item))
      : [];
    return { id, title, kind, checklist };
  }
  const table = t.table ? parseWorksheet(JSON.stringify(t.table)) : emptyWorksheet();
  return { id, title, kind: "table", table };
}

function parseNoteBox(raw: unknown): NoteBox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<NoteBox>;
  return {
    id: typeof b.id === "string" && b.id ? b.id : uid(),
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    width: Math.min(720, Math.max(160, Number(b.width) || 280)),
    height: Math.min(900, Math.max(120, Number(b.height) || 180)),
    body: typeof b.body === "string" && b.body ? b.body : EMPTY_DOC,
  };
}

function parseChecklistItem(raw: unknown): ChecklistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Partial<ChecklistItem>;
  return {
    id: typeof i.id === "string" && i.id ? i.id : uid(),
    text: typeof i.text === "string" ? i.text : "",
    done: i.done === true,
  };
}

function parseWorkspaceBody(raw: unknown): Workspace | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<Workspace>;
  const tabs = Array.isArray(obj.tabs)
    ? obj.tabs.map(parseTab).filter((t): t is WorkspaceTab => Boolean(t))
    : [];
  if (!tabs.length) return null;
  const activeTabId =
    typeof obj.activeTabId === "string" && tabs.some((t) => t.id === obj.activeTabId)
      ? obj.activeTabId
      : tabs[0].id;
  return { tabs, activeTabId };
}

function parseExtras(raw: unknown): Record<string, Workspace> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const extras: Record<string, Workspace> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || isBuiltinPanelId(id)) continue;
    extras[id] = parseWorkspaceBody(value) ?? emptyWorkspace();
  }
  return Object.keys(extras).length ? extras : undefined;
}

export function parseWorkspace(raw: string | null | undefined): Workspace {
  if (!raw?.trim()) return emptyWorkspace();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isLegacyWorksheet(parsed)) {
      const tab: WorkspaceTab = {
        id: uid(),
        title: "Worksheet",
        kind: "table",
        table: parseWorksheet(raw),
      };
      return { tabs: [tab], activeTabId: tab.id };
    }
    const body = parseWorkspaceBody(parsed);
    if (!body) return emptyWorkspace();
    const extras = parseExtras((parsed as Partial<Workspace>).extras);
    return extras ? { ...body, extras } : body;
  } catch {
    return emptyWorkspace();
  }
}

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify(ws);
}

export function extraWorkspace(ws: Workspace, id: string): Workspace {
  return ws.extras?.[id] ?? emptyWorkspace();
}

export function setExtraWorkspace(ws: Workspace, id: string, extra: Workspace): Workspace {
  const extras = { ...ws.extras, [id]: { tabs: extra.tabs, activeTabId: extra.activeTabId } };
  return { ...ws, extras };
}

export function deleteExtraWorkspace(ws: Workspace, id: string): Workspace {
  if (!ws.extras || !(id in ws.extras)) return ws;
  const extras = { ...ws.extras };
  delete extras[id];
  return { ...ws, extras: Object.keys(extras).length ? extras : undefined };
}

export function workspaceTables(ws: Workspace): Worksheet[] {
  return ws.tabs.filter((t) => t.kind === "table" && t.table).map((t) => t.table as Worksheet);
}

export function activeTab(ws: Workspace): WorkspaceTab {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? ws.tabs[0];
}

export function setActiveTab(ws: Workspace, tabId: string): Workspace {
  if (!ws.tabs.some((t) => t.id === tabId)) return ws;
  return { ...ws, activeTabId: tabId };
}

export function addWorkspaceTab(ws: Workspace, kind: WorkspaceTabKind): Workspace {
  const tab =
    kind === "notes" ? emptyNotesTab() : kind === "checklist" ? emptyChecklistTab() : emptyTableTab();
  return { ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id };
}

export function renameWorkspaceTab(ws: Workspace, tabId: string, title: string): Workspace {
  const next = title.trim() || "Untitled";
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === tabId ? { ...t, title: next } : t)),
  };
}

export function deleteWorkspaceTab(ws: Workspace, tabId: string): Workspace {
  if (ws.tabs.length <= 1) {
    const tab = emptyTableTab();
    return { ...ws, tabs: [tab], activeTabId: tab.id };
  }
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  const activeTabId = ws.activeTabId === tabId ? tabs[0].id : ws.activeTabId;
  return { ...ws, tabs, activeTabId };
}

export function clearWorkspaceTab(ws: Workspace, tabId: string): Workspace {
  return {
    ...ws,
    tabs: ws.tabs.map((t) => {
      if (t.id !== tabId) return t;
      if (t.kind === "notes") return { ...t, notes: [] };
      if (t.kind === "checklist") return { ...t, checklist: [] };
      return { ...t, table: emptyWorksheet() };
    }),
  };
}

export function updateWorkspaceTab(ws: Workspace, tabId: string, patch: Partial<WorkspaceTab>): Workspace {
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
  };
}

export function setRowDoneInWorkspace(ws: Workspace, rowId: string, done: boolean): Workspace {
  return {
    ...ws,
    tabs: ws.tabs.map((t) => {
      if (t.kind !== "table" || !t.table) return t;
      if (!t.table.rows.some((r) => r.id === rowId)) return t;
      return { ...t, table: setRowDone(t.table, rowId, done) };
    }),
  };
}

export async function importGroupIntoWorksheet(
  studentId: number,
  topicIds: number[],
): Promise<Worksheet> {
  const student = await getStudent(studentId);
  const space = parseWorkspace(student?.worksheet);
  const records = await recordsFromTopicGroup(topicIds);
  const current = activeTab(space);
  const target =
    current.kind === "table"
      ? current
      : space.tabs.find((t) => t.kind === "table") ?? emptyTableTab();
  const table = appendTemplateRows(target.table ?? emptyWorksheet(), records);
  let next = space;
  if (!space.tabs.some((t) => t.id === target.id)) {
    next = { ...space, tabs: [...space.tabs, { ...target, table }], activeTabId: target.id };
  } else {
    next = updateWorkspaceTab(space, target.id, { table });
    if (current.kind !== "table") next = setActiveTab(next, target.id);
  }
  await updateStudent(studentId, { worksheet: serializeWorkspace(next) });
  return table;
}

export function applyChecklistItems(
  ws: Workspace,
  title: string,
  items: ChecklistItem[],
): Workspace {
  const current = activeTab(ws);
  const existing =
    current.kind === "checklist" ? current : ws.tabs.find((t) => t.kind === "checklist");
  if (existing) {
    const next = updateWorkspaceTab(ws, existing.id, {
      checklist: [...(existing.checklist ?? []), ...items],
    });
    return current.kind === "checklist" ? next : setActiveTab(next, existing.id);
  }
  const tab = emptyChecklistTab(title.trim() || "Checklist");
  tab.checklist = items;
  return { ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id };
}

export async function importChecklistIntoWorkspace(
  studentId: number,
  items: ChecklistItem[],
  title: string,
): Promise<Workspace> {
  const student = await getStudent(studentId);
  const next = applyChecklistItems(parseWorkspace(student?.worksheet), title, items);
  await updateStudent(studentId, { worksheet: serializeWorkspace(next) });
  return next;
}

export function isNoteBoxEmpty(box: NoteBox): boolean {
  return isEmptyDoc(box.body);
}
