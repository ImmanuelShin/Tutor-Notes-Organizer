import { getTopic, listAssessments, listExamples, listGoals, listSubUnits } from "../db/topics";
import { docToText, formatDate, textToDoc } from "./format";
import type { NoteBox, Worksheet, WorksheetColumn, WorksheetRow } from "../types";

export const TEMPLATE_COLUMN_SPECS = [
  { key: "topic", title: "Topic", width: 160 },
  { key: "unit", title: "Unit", width: 140 },
  { key: "goal", title: "Learning goals", width: 240 },
  { key: "example", title: "Examples", width: 240 },
  { key: "assessment", title: "Assessment", width: 200 },
] as const;

export function uid(): string {
  return crypto.randomUUID();
}

function emptyRow(columns: WorksheetColumn[]): WorksheetRow {
  return {
    id: uid(),
    cells: Object.fromEntries(columns.map((c) => [c.id, ""])),
  };
}

export function emptyWorksheet(blankRows = 6): Worksheet {
  const columns: WorksheetColumn[] = TEMPLATE_COLUMN_SPECS.map((spec) => ({
    id: spec.key,
    title: spec.title,
    width: spec.width,
  }));
  return {
    columns,
    rows: Array.from({ length: blankRows }, () => emptyRow(columns)),
  };
}

export function parseWorksheet(raw: string | null | undefined): Worksheet {
  if (!raw?.trim()) return emptyWorksheet();
  try {
    const parsed = JSON.parse(raw) as Worksheet;
    if (!Array.isArray(parsed?.columns) || parsed.columns.length === 0 || !Array.isArray(parsed.rows)) {
      return emptyWorksheet();
    }
    const columns = parsed.columns.map((c) => ({
      id: String(c.id),
      title: String(c.title ?? ""),
      width: Math.min(640, Math.max(80, Number(c.width) || 140)),
    }));
    return {
      columns,
      rows: parsed.rows.map((r) => ({
        id: String(r.id || uid()),
        cells: r.cells && typeof r.cells === "object" ? { ...r.cells } : {},
        lastEditedAt: typeof r.lastEditedAt === "string" && r.lastEditedAt ? r.lastEditedAt : undefined,
        done: r.done === true ? true : undefined,
      })),
    };
  } catch {
    return emptyWorksheet();
  }
}

export function serializeWorksheet(ws: Worksheet): string {
  return JSON.stringify(ws);
}

export type DayEntry = {
  id: string;
  date: string;
  text: string;
};

export type ParsedCell =
  | { kind: "text"; text: string }
  | { kind: "days"; entries: DayEntry[] };

export function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseCell(raw: string | null | undefined): ParsedCell {
  const text = raw ?? "";
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return { kind: "text", text };
  try {
    const parsed = JSON.parse(trimmed) as { kind?: unknown; entries?: unknown };
    if (parsed?.kind !== "days" || !Array.isArray(parsed.entries)) {
      return { kind: "text", text };
    }
    const entries: DayEntry[] = parsed.entries.map((e) => {
      const row = e as { id?: unknown; date?: unknown; text?: unknown };
      return {
        id: String(row.id || uid()),
        date: String(row.date || todayIsoDate()),
        text: String(row.text ?? ""),
      };
    });
    return { kind: "days", entries };
  } catch {
    return { kind: "text", text };
  }
}

export function serializeDays(entries: DayEntry[]): string {
  return JSON.stringify({ kind: "days", entries });
}

export function sortDayEntries(entries: DayEntry[]): DayEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date === b.date) return b.id.localeCompare(a.id);
    return a.date < b.date ? 1 : -1;
  });
}

export function toDayLog(existingText: string): string {
  const parsed = parseCell(existingText);
  if (parsed.kind === "days") return serializeDays(parsed.entries);
  return serializeDays([
    { id: uid(), date: todayIsoDate(), text: parsed.text },
  ]);
}

export function isAssessmentColumn(col: WorksheetColumn | undefined): boolean {
  if (!col) return false;
  return col.id === "assessment" || col.title.toLowerCase().trim() === "assessment";
}

export function stampAssessmentDraft(prev: string, draft: string): string {
  if (!draft.trim()) return "";
  const parsed = parseCell(prev);
  if (parsed.kind === "days") return serializeDays(parsed.entries);
  if (draft === parsed.text) return prev;
  return toDayLog(draft);
}

export function ensureTodayEntry(existing: string, seed = ""): string {
  const today = todayIsoDate();
  const parsed = parseCell(existing);
  const entries: DayEntry[] =
    parsed.kind === "days" ? [...parsed.entries] : [{ id: uid(), date: today, text: parsed.text }];
  const idx = entries.findIndex((e) => e.date === today);
  if (idx < 0) {
    entries.push({ id: uid(), date: today, text: seed });
    return serializeDays(entries);
  }
  if (seed && !entries[idx].text) {
    entries[idx] = { ...entries[idx], text: seed };
  }
  return serializeDays(entries);
}

export function cellIsBlank(raw: string | null | undefined): boolean {
  const parsed = parseCell(raw);
  if (parsed.kind === "text") return !parsed.text.trim();
  return parsed.entries.every((e) => !e.text.trim());
}

export function cellPreview(raw: string | null | undefined): string {
  const parsed = parseCell(raw);
  if (parsed.kind === "text") {
    return parsed.text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  }
  const latest = sortDayEntries(parsed.entries)[0];
  if (!latest) return "";
  const line = latest.text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const date = formatShortDay(latest.date);
  return line ? `${date} · ${line}` : date;
}

function formatShortDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isWorksheetBlank(ws: Worksheet): boolean {
  return ws.rows.every((row) => ws.columns.every((col) => cellIsBlank(row.cells[col.id])));
}

export function addWorksheetRow(ws: Worksheet, at?: number): Worksheet {
  const row = emptyRow(ws.columns);
  const rows = [...ws.rows];
  rows.splice(at ?? rows.length, 0, row);
  return { ...ws, rows };
}

export function deleteWorksheetRow(ws: Worksheet, rowId: string): Worksheet {
  const rows = ws.rows.filter((r) => r.id !== rowId);
  return { ...ws, rows: rows.length ? rows : [emptyRow(ws.columns)] };
}

export function addWorksheetColumn(ws: Worksheet, at?: number): Worksheet {
  const col: WorksheetColumn = {
    id: uid(),
    title: `Column ${ws.columns.length + 1}`,
    width: 140,
  };
  const columns = [...ws.columns];
  columns.splice(at ?? columns.length, 0, col);
  return {
    columns,
    rows: ws.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } })),
  };
}

export function deleteWorksheetColumn(ws: Worksheet, colId: string): Worksheet {
  if (ws.columns.length <= 1) return ws;
  const columns = ws.columns.filter((c) => c.id !== colId);
  return {
    columns,
    rows: ws.rows.map((r) => {
      const cells = { ...r.cells };
      delete cells[colId];
      return { ...r, cells };
    }),
  };
}

export function findColumn(
  ws: Worksheet,
  key: (typeof TEMPLATE_COLUMN_SPECS)[number]["key"],
): WorksheetColumn | undefined {
  const spec = TEMPLATE_COLUMN_SPECS.find((s) => s.key === key);
  return ws.columns.find(
    (c) =>
      c.id === key ||
      c.id === spec?.key ||
      c.title.toLowerCase() === (spec?.title ?? key).toLowerCase() ||
      c.title.toLowerCase() === key,
  );
}

function isProgressColumn(col: WorksheetColumn | undefined): boolean {
  if (!col) return false;
  const title = col.title.toLowerCase().trim();
  return col.id === "topic" || title === "topic" || isAssessmentColumn(col);
}

export function setCell(ws: Worksheet, rowId: string, colId: string, value: string): Worksheet {
  const col = ws.columns.find((c) => c.id === colId);
  return {
    ...ws,
    rows: ws.rows.map((r) => {
      if (r.id !== rowId) return r;
      const prev = r.cells[colId] ?? "";
      const next: WorksheetRow = { ...r, cells: { ...r.cells, [colId]: value } };
      if (prev !== value && isProgressColumn(col)) {
        next.lastEditedAt = new Date().toISOString();
        next.done = false;
      }
      return next;
    }),
  };
}

export function setRowDone(ws: Worksheet, rowId: string, done: boolean): Worksheet {
  return {
    ...ws,
    rows: ws.rows.map((r) => (r.id === rowId ? { ...r, done } : r)),
  };
}

export function renameColumn(ws: Worksheet, colId: string, title: string): Worksheet {
  return {
    ...ws,
    columns: ws.columns.map((c) => (c.id === colId ? { ...c, title } : c)),
  };
}

export function resizeColumn(ws: Worksheet, colId: string, width: number): Worksheet {
  return {
    ...ws,
    columns: ws.columns.map((c) =>
      c.id === colId ? { ...c, width: Math.min(640, Math.max(80, width)) } : c,
    ),
  };
}

function joinNonempty(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n");
}

const QUIET_MS = 14 * 24 * 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export type ActiveTopicItem = {
  rowId: string;
  topic: string;
  unit: string;
  assessmentPreview: string;
  lastEditedAt: string;
  quiet: boolean;
};

export type ActiveTopicGroup = {
  topic: string;
  lastEditedAt: string;
  rows: ActiveTopicItem[];
};

function cellPlain(row: WorksheetRow, col: WorksheetColumn | undefined): string {
  if (!col) return "";
  const parsed = parseCell(row.cells[col.id] ?? "");
  if (parsed.kind === "text") return parsed.text.trim();
  return "";
}

function cellSessionText(raw: string): string {
  const parsed = parseCell(raw);
  if (parsed.kind === "text") return parsed.text.trim();
  const today = todayIsoDate();
  const sorted = sortDayEntries(parsed.entries);
  const todays = sorted.find((e) => e.date === today && e.text.trim());
  if (todays) return todays.text.trim();
  return sorted.find((e) => e.text.trim())?.text.trim() ?? "";
}

function groupActiveItems(items: ActiveTopicItem[]): ActiveTopicGroup[] {
  const byTopic = new Map<string, ActiveTopicItem[]>();
  for (const item of items) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }
  return [...byTopic.entries()]
    .map(([topic, rows]) => {
      const sorted = [...rows].sort((a, b) => (a.lastEditedAt < b.lastEditedAt ? 1 : -1));
      return { topic, lastEditedAt: sorted[0]?.lastEditedAt ?? "", rows: sorted };
    })
    .sort((a, b) => (a.lastEditedAt < b.lastEditedAt ? 1 : -1));
}

export function listActiveTopics(
  ws: Worksheet | Worksheet[],
  now = Date.now(),
): { active: ActiveTopicGroup[]; quiet: ActiveTopicGroup[] } {
  const tables = Array.isArray(ws) ? ws : [ws];
  const items: ActiveTopicItem[] = [];
  for (const table of tables) {
    const topicCol = findColumn(table, "topic");
    const unitCol = findColumn(table, "unit");
    const assessmentCol = findColumn(table, "assessment");
    for (const row of table.rows) {
      if (row.done || !row.lastEditedAt) continue;
      const topic = cellPlain(row, topicCol) || "Untitled";
      items.push({
        rowId: row.id,
        topic,
        unit: cellPlain(row, unitCol),
        assessmentPreview: assessmentCol ? cellPreview(row.cells[assessmentCol.id] ?? "") : "",
        lastEditedAt: row.lastEditedAt,
        quiet: now - new Date(row.lastEditedAt).getTime() > QUIET_MS,
      });
    }
  }
  return {
    active: groupActiveItems(items.filter((i) => !i.quiet)),
    quiet: groupActiveItems(items.filter((i) => i.quiet)),
  };
}

export function sessionNoteRange(opts: {
  startedAt?: string | null;
  now?: Date;
  ws: Worksheet | Worksheet[];
  notes?: NoteBox[];
}): { from: Date; to: Date } {
  const now = opts.now ?? new Date();
  const tables = Array.isArray(opts.ws) ? opts.ws : [opts.ws];
  if (opts.startedAt) {
    const from = new Date(opts.startedAt);
    if (!Number.isNaN(from.getTime())) return { from, to: now };
  }
  const recentFrom = new Date(now.getTime() - THREE_HOURS_MS);
  if (
    tables.some((table) => rowsInRange(table, recentFrom, now).length) ||
    notesInRange(opts.notes ?? [], recentFrom, now).length
  ) {
    return { from: recentFrom, to: now };
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: todayStart, to: now };
}

function inTimeRange(iso: string | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= from.getTime() && t <= to.getTime();
}

function rowsInRange(ws: Worksheet, from: Date, to: Date): WorksheetRow[] {
  return ws.rows.filter((r) => inTimeRange(r.lastEditedAt, from, to));
}

function notesInRange(notes: NoteBox[], from: Date, to: Date): NoteBox[] {
  return notes.filter((box) => {
    if (!docToText(box.body)) return false;
    return inTimeRange(box.updatedAt || box.createdAt, from, to);
  });
}

export function suggestedSessionNotes(
  ws: Worksheet | Worksheet[],
  range: { from: Date; to: Date },
  notes: NoteBox[] = [],
): string {
  const tables = Array.isArray(ws) ? ws : [ws];
  const byTopic = new Map<string, string[]>();
  const order: string[] = [];
  const rows = tables
    .flatMap((table) => rowsInRange(table, range.from, range.to).map((row) => ({ table, row })))
    .sort((a, b) => (a.row.lastEditedAt ?? "") < (b.row.lastEditedAt ?? "") ? 1 : -1);
  for (const { table, row } of rows) {
    const topicCol = findColumn(table, "topic");
    const assessmentCol = findColumn(table, "assessment");
    const topic = cellPlain(row, topicCol) || "Untitled";
    const assessment = assessmentCol ? cellSessionText(row.cells[assessmentCol.id] ?? "") : "";
    if (topic === "Untitled" && !assessment) continue;
    if (!byTopic.has(topic)) {
      byTopic.set(topic, []);
      order.push(topic);
    }
    if (assessment) byTopic.get(topic)!.push(assessment);
  }
  const blocks = order.map((topic) => [topic, ...(byTopic.get(topic) ?? [])].join("\n"));
  const noteBlocks = notesInRange(notes, range.from, range.to)
    .sort((a, b) => (a.updatedAt ?? a.createdAt ?? "").localeCompare(b.updatedAt ?? b.createdAt ?? ""))
    .map((box) => {
      const text = docToText(box.body);
      const stamp = box.createdAt || box.updatedAt;
      const date = stamp ? formatDate(stamp) : "";
      return date ? `${date}\n${text}` : text;
    });
  if (noteBlocks.length) blocks.push(["Notes", ...noteBlocks].join("\n\n"));
  if (!blocks.length) return textToDoc("");
  return textToDoc(blocks.join("\n\n"));
}

export function sessionDurationMinutes(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
}

export async function recordFromTopic(topicId: number): Promise<Record<string, string> | null> {
  const topic = await getTopic(topicId);
  if (!topic) return null;
  const units = await listSubUnits(topicId);
  const unitTitles: string[] = [];
  const goalTexts: string[] = [];
  const exampleTexts: string[] = [];
  const assessmentTexts: string[] = [];
  for (const unit of units) {
    unitTitles.push(unit.title);
    const [goals, examples, assessments] = await Promise.all([
      listGoals(unit.id),
      listExamples(unit.id),
      listAssessments(unit.id),
    ]);
    goalTexts.push(...goals.map((g) => g.text));
    exampleTexts.push(
      ...examples.map((ex) => docToText(ex.body).trim() || ex.title.trim()),
    );
    assessmentTexts.push(...assessments.map((a) => a.text));
  }
  return {
    topic: topic.title,
    unit: joinNonempty(unitTitles),
    goal: joinNonempty(goalTexts),
    example: joinNonempty(exampleTexts),
    assessment: joinNonempty(assessmentTexts),
  };
}

export async function recordsFromTopicGroup(topicIds: number[]): Promise<Record<string, string>[]> {
  const records: Record<string, string>[] = [];
  for (const id of topicIds) {
    const rec = await recordFromTopic(id);
    if (rec) records.push(rec);
  }
  return records;
}

export function ensureTemplateColumns(ws: Worksheet): {
  table: Worksheet;
  keyToId: Record<string, string>;
} {
  const columns = [...ws.columns];
  const keyToId: Record<string, string> = {};
  let added = false;
  for (const spec of TEMPLATE_COLUMN_SPECS) {
    const existing = columns.find(
      (c) => c.id === spec.key || c.title.toLowerCase() === spec.title.toLowerCase(),
    );
    if (existing) {
      keyToId[spec.key] = existing.id;
    } else {
      columns.push({ id: spec.key, title: spec.title, width: spec.width });
      keyToId[spec.key] = spec.key;
      added = true;
    }
  }
  if (!added) return { table: ws, keyToId };
  return {
    table: {
      ...ws,
      columns,
      rows: ws.rows.map((r) => {
        const cells = { ...r.cells };
        for (const col of columns) {
          if (cells[col.id] === undefined) cells[col.id] = "";
        }
        return { ...r, cells };
      }),
    },
    keyToId,
  };
}

export function appendTemplateRows(ws: Worksheet, records: Record<string, string>[]): Worksheet {
  if (!records.length) return ws;
  const { table, keyToId } = ensureTemplateColumns(ws);
  const columns = table.columns;
  const newRows: WorksheetRow[] = records.map((rec) => ({
    id: uid(),
    cells: Object.fromEntries(
      columns.map((col) => {
        const specKey = Object.entries(keyToId).find(([, id]) => id === col.id)?.[0];
        return [col.id, specKey ? (rec[specKey] ?? "") : ""];
      }),
    ),
  }));
  const rows = isWorksheetBlank(ws) ? newRows : [...table.rows, ...newRows];
  return { columns, rows: rows.length ? rows : [emptyRow(columns)] };
}
