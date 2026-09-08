import type { Worksheet, WorksheetColumn, WorksheetRow } from "../types";
import {
  appendTemplateRows,
  ensureTemplateColumns,
  findColumn,
  parseCell,
  serializeDays,
  setCell,
  toDayLog,
  todayIsoDate,
  uid,
  TEMPLATE_COLUMN_SPECS,
} from "./worksheet";

export type WorksheetPasteField = (typeof TEMPLATE_COLUMN_SPECS)[number]["key"];

export const WORKSHEET_PASTE_FIELDS: { key: WorksheetPasteField; label: string; required?: boolean }[] = [
  { key: "topic", label: "Topic", required: true },
  { key: "unit", label: "Unit" },
  { key: "goal", label: "Learning goals" },
  { key: "example", label: "Examples" },
  { key: "assessment", label: "Assessment" },
];

export type PastedWorksheetRow = {
  topic: string;
  unit: string;
  goal: string;
  example: string;
  assessment: string;
};

export type WorksheetPasteResult = {
  table: Worksheet;
  matched: number;
  appended: number;
};

const FIELD_NEEDLES: Record<WorksheetPasteField, string[]> = {
  topic: ["topic", "title", "topics"],
  unit: ["unit", "sub-unit", "subunit", "sub unit", "section"],
  goal: ["goal", "learning goal", "objective"],
  example: ["example", "problem", "exercise"],
  assessment: ["assessment", "assessments", "assess", "notes", "note", "comments", "comment"],
};

export function guessWorksheetField(header: string): WorksheetPasteField | "" {
  const h = header.toLowerCase().trim();
  for (const field of WORKSHEET_PASTE_FIELDS) {
    const needles = FIELD_NEEDLES[field.key];
    if (needles.some((n) => h === n)) return field.key;
  }
  for (const field of WORKSHEET_PASTE_FIELDS) {
    const needles = FIELD_NEEDLES[field.key];
    if (needles.some((n) => h.includes(n))) return field.key;
  }
  return "";
}

export function guessWorksheetMapping(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const guessed = guessWorksheetField(header);
    if (!guessed || used.has(guessed)) return "";
    used.add(guessed);
    return guessed;
  });
}

function mappedCell(row: string[], mapping: string[], key: string): string {
  const idx = mapping.indexOf(key);
  if (idx < 0) return "";
  return (row[idx] ?? "").trim();
}

export function gridToPastedRows(dataRows: string[][], mapping: string[]): PastedWorksheetRow[] {
  const rows: PastedWorksheetRow[] = [];
  let lastTopic = "";
  let lastUnit = "";
  for (const row of dataRows) {
    const topicRaw = mappedCell(row, mapping, "topic");
    const unitRaw = mappedCell(row, mapping, "unit");
    if (topicRaw) lastTopic = topicRaw;
    if (unitRaw) lastUnit = unitRaw;
    const topic = topicRaw || lastTopic;
    if (!topic) continue;
    rows.push({
      topic,
      unit: unitRaw || lastUnit,
      goal: mappedCell(row, mapping, "goal"),
      example: mappedCell(row, mapping, "example"),
      assessment: mappedCell(row, mapping, "assessment"),
    });
  }
  return rows;
}

function norm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function joinParts(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join("\n\n");
}

function groupKey(row: PastedWorksheetRow): string {
  return `${norm(row.topic)}\0${norm(row.unit)}`;
}

export function groupPastedRows(rows: PastedWorksheetRow[]): PastedWorksheetRow[] {
  const order: string[] = [];
  const grouped = new Map<string, PastedWorksheetRow>();
  for (const row of rows) {
    const key = groupKey(row);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row });
      order.push(key);
      continue;
    }
    existing.goal = joinParts(existing.goal, row.goal);
    existing.example = joinParts(existing.example, row.example);
    existing.assessment = joinParts(existing.assessment, row.assessment);
  }
  return order.map((key) => grouped.get(key)!);
}

function cellText(row: WorksheetRow, col: WorksheetColumn | undefined): string {
  if (!col) return "";
  const parsed = parseCell(row.cells[col.id] ?? "");
  if (parsed.kind === "text") return parsed.text.trim();
  return "";
}

function unitMatches(tableUnit: string, pasteUnit: string): boolean {
  const needle = norm(pasteUnit);
  if (!needle) return false;
  if (norm(tableUnit) === needle) return true;
  return tableUnit.split(/\r?\n/).some((line) => norm(line) === needle);
}

type PastePlan = {
  matched: { rowId: string; rec: PastedWorksheetRow }[];
  appended: PastedWorksheetRow[];
};

function planPaste(ws: Worksheet, grouped: PastedWorksheetRow[]): PastePlan {
  const topicCol = findColumn(ws, "topic");
  const unitCol = findColumn(ws, "unit");
  const matchable = ws.rows.filter((row) => cellText(row, topicCol));
  const used = new Set<string>();
  const matched: { rowId: string; rec: PastedWorksheetRow }[] = [];
  const appended: PastedWorksheetRow[] = [];

  for (const rec of grouped) {
    const hits = matchable.filter(
      (row) => !used.has(row.id) && norm(cellText(row, topicCol)) === norm(rec.topic),
    );
    let pick = hits[0];
    if (hits.length > 1 && rec.unit.trim()) {
      pick = hits.find((row) => unitMatches(cellText(row, unitCol), rec.unit)) ?? hits[0];
    }
    if (pick) {
      used.add(pick.id);
      matched.push({ rowId: pick.id, rec });
    } else {
      appended.push(rec);
    }
  }

  return { matched, appended };
}

export function previewWorksheetPaste(
  ws: Worksheet,
  rows: PastedWorksheetRow[],
): { matched: number; appended: number } {
  const plan = planPaste(ws, groupPastedRows(rows));
  return { matched: plan.matched.length, appended: plan.appended.length };
}

function mergeAssessment(existing: string, incoming: string): string {
  const parsed = parseCell(existing);
  const today = todayIsoDate();
  if (parsed.kind === "days") {
    const idx = parsed.entries.findIndex((e) => e.date === today);
    if (idx >= 0) {
      const entries = [...parsed.entries];
      entries[idx] = {
        ...entries[idx],
        text: [entries[idx].text.trim(), incoming].filter(Boolean).join("\n\n"),
      };
      return serializeDays(entries);
    }
    return serializeDays([...parsed.entries, { id: uid(), date: today, text: incoming }]);
  }
  return toDayLog(incoming);
}

function writeMappedCells(
  ws: Worksheet,
  rowId: string,
  rec: PastedWorksheetRow,
  keyToId: Record<string, string>,
): Worksheet {
  let next = ws;
  const fields: WorksheetPasteField[] = ["unit", "goal", "example", "assessment"];
  for (const key of fields) {
    const value = rec[key].trim();
    if (!value) continue;
    const colId = keyToId[key];
    if (!colId) continue;
    const row = next.rows.find((r) => r.id === rowId);
    const existing = row?.cells[colId] ?? "";
    const written = key === "assessment" ? mergeAssessment(existing, value) : value;
    next = setCell(next, rowId, colId, written);
  }
  return next;
}

function pastedToRecord(rec: PastedWorksheetRow): Record<string, string> {
  return {
    topic: rec.topic,
    unit: rec.unit,
    goal: rec.goal,
    example: rec.example,
    assessment: rec.assessment.trim() ? toDayLog(rec.assessment) : "",
  };
}

export function mergePastedIntoWorksheet(ws: Worksheet, rows: PastedWorksheetRow[]): WorksheetPasteResult {
  const grouped = groupPastedRows(rows);
  if (!grouped.length) return { table: ws, matched: 0, appended: 0 };
  const { table, keyToId } = ensureTemplateColumns(ws);
  const plan = planPaste(table, grouped);
  let next = table;
  for (const { rowId, rec } of plan.matched) {
    next = writeMappedCells(next, rowId, rec, keyToId);
  }
  if (plan.appended.length) {
    next = appendTemplateRows(next, plan.appended.map(pastedToRecord));
  }
  return { table: next, matched: plan.matched.length, appended: plan.appended.length };
}
