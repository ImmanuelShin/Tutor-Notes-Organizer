import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { listSubjects } from "../db/topics";
import { columnLabel, parseClipboardTable } from "../lib/parseClipboard";
import {
  detectTopicImportConflicts,
  guessMapping,
  gridToTopicEntries,
  PASTE_FIELDS,
  writeResourceRows,
  writeStudentRows,
  writeTopicEntries,
  type PasteEntity,
  type TopicImportConflict,
  type TopicImportMode,
  type TopicImportResult,
} from "../lib/writeImport";
import { SubjectCombobox } from "./ui";

const IMPORT_MODES: { value: TopicImportMode; label: string; hint: (conflicts: TopicImportConflict[]) => string }[] = [
  {
    value: "replace-group",
    label: "Replace group",
    hint: (conflicts) =>
      `Deletes every topic in ${conflictLabels(conflicts)} (including ones not in this table) and recreates them from the paste. Students using those topics lose the assignment and any goal checkoffs.`,
  },
  {
    value: "merge",
    label: "Merge",
    hint: () =>
      "Keeps existing topics. Matching sub-units, goals, examples, and assessments are reused; new ones from the table are added. Nothing is deleted.",
  },
  {
    value: "add-only",
    label: "Add only",
    hint: () =>
      "Creates topics that are not already in the group. Existing topics are left unchanged.",
  },
];

function conflictLabels(conflicts: TopicImportConflict[]): string {
  if (conflicts.length === 1) return conflicts[0].label;
  if (conflicts.length === 2) return `${conflicts[0].label} and ${conflicts[1].label}`;
  return conflicts.map((c) => c.label).join(", ");
}

function formatTopicImportLog(result: TopicImportResult, subject: string): string {
  const bits: string[] = [];
  if (result.deleted) {
    bits.push(`deleted ${result.deleted} existing topic${result.deleted === 1 ? "" : "s"}`);
  }
  if (result.created) bits.push(`created ${result.created}`);
  if (result.updated) bits.push(`updated ${result.updated}`);
  if (result.skipped) bits.push(`skipped ${result.skipped} existing`);
  if (!bits.length) return "Nothing to import.";
  const into = subject.trim() ? ` into ${subject.trim()}` : "";
  return `Imported: ${bits.join(", ")}${into}.`;
}

export function PasteTable({
  lockedEntity,
  defaultSubject,
  onImported,
}: {
  lockedEntity?: PasteEntity;
  defaultSubject?: string;
  onImported?: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [entity, setEntity] = useState<PasteEntity>(lockedEntity ?? "topics");
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [mapping, setMapping] = useState<string[]>([]);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<TopicImportMode | null>(null);
  const [conflicts, setConflicts] = useState<TopicImportConflict[]>([]);

  const grid = useMemo(() => parseClipboardTable(raw), [raw]);
  const headers = useMemo(() => {
    if (!grid.length) return [];
    if (firstRowHeaders) {
      return grid[0].map((cell, i) => columnLabel(i, cell, true));
    }
    return grid[0].map((_, i) => columnLabel(i, "", false));
  }, [grid, firstRowHeaders]);
  const dataRows = useMemo(() => {
    if (!grid.length) return [];
    return firstRowHeaders ? grid.slice(1) : grid;
  }, [grid, firstRowHeaders]);

  const topicEntries = useMemo(() => {
    if (entity !== "topics" || !dataRows.length) return [];
    return gridToTopicEntries(dataRows, mapping, subject);
  }, [entity, dataRows, mapping, subject]);

  useEffect(() => {
    void listSubjects().then(setSubjects);
  }, []);

  useEffect(() => {
    setImportMode(null);
    if (!topicEntries.length) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    void detectTopicImportConflicts(topicEntries).then((next) => {
      if (!cancelled) setConflicts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [topicEntries]);

  useEffect(() => {
    if (lockedEntity) setEntity(lockedEntity);
  }, [lockedEntity]);

  useEffect(() => {
    setMapping(guessMapping(headers, entity));
    setLog(null);
  }, [headers.join("\0"), entity]);

  const applyText = (text: string) => {
    setRaw(text);
    setLog(null);
  };

  const readClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      applyText(text);
    } catch {
      setLog("Could not read the clipboard. Paste into the box with Ctrl+V.");
    }
  };

  const run = async () => {
    if (!dataRows.length) {
      setLog("Paste a table first.");
      return;
    }
    const required = PASTE_FIELDS[entity].filter((f) => f.required).map((f) => f.key);
    const missing = required.filter((key) => !mapping.includes(key));
    if (missing.length) {
      setLog(`Map a column for: ${missing.map((k) => PASTE_FIELDS[entity].find((f) => f.key === k)?.label ?? k).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      let count = 0;
      if (entity === "topics") {
        const entries = topicEntries.length
          ? topicEntries
          : gridToTopicEntries(dataRows, mapping, subject);
        if (!entries.length) {
          setLog("No topic rows found. Map Topic title and check that the first data row has a topic.");
          setBusy(false);
          return;
        }
        const nextConflicts = await detectTopicImportConflicts(entries);
        if (nextConflicts.length && !importMode) {
          setConflicts(nextConflicts);
          setLog("This subject already has topics. Choose how to import, then click Import again.");
          setBusy(false);
          return;
        }
        const result = await writeTopicEntries(entries, importMode ?? "add-only");
        setLog(formatTopicImportLog(result, subject));
        setImportMode(null);
        setConflicts(await detectTopicImportConflicts(entries));
        void listSubjects().then(setSubjects);
      } else if (entity === "students") {
        count = await writeStudentRows(dataRows, mapping);
        setLog(`Imported ${count} student${count === 1 ? "" : "s"}.`);
      } else {
        count = await writeResourceRows(dataRows, mapping);
        setLog(`Imported ${count} resource${count === 1 ? "" : "s"}.`);
      }
      onImported?.();
    } catch (e) {
      setLog(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = dataRows.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => void readClipboard()}>
          <ClipboardPaste size={16} /> Paste from clipboard
        </button>
        {!lockedEntity ? (
          <label className="flex items-center gap-2 text-sm">
            Insert as
            <select
              className="field w-auto"
              value={entity}
              onChange={(e) => setEntity(e.target.value as PasteEntity)}
            >
              <option value="topics">Topic templates</option>
              <option value="students">Students</option>
              <option value="resources">Resources</option>
            </select>
          </label>
        ) : null}
      </div>

      <label className="block text-sm">
        Copied table
        <textarea
          className="field mt-1 min-h-32 font-mono text-xs"
          placeholder="Copy a range in Google Sheets, then Ctrl+V here."
          value={raw}
          onChange={(e) => applyText(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            if (text) {
              e.preventDefault();
              applyText(text);
            }
          }}
        />
      </label>

      {grid.length > 0 ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={firstRowHeaders}
              onChange={(e) => setFirstRowHeaders(e.target.checked)}
            />
            First row is headers
          </label>

          {entity === "topics" ? (
            <label className="block max-w-sm text-sm">
              Subject for this table
              <SubjectCombobox
                value={subject}
                onChange={setSubject}
                subjects={subjects}
                placeholder="e.g. Algebra 1 — used if there is no Subject column"
              />
            </label>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm uppercase tracking-wide text-[var(--ink-muted)]">
              Column mapping
            </h3>
            <div className="grid gap-2">
              {headers.map((header, i) => (
                <div key={`${header}-${i}`} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                  <div className="truncate text-sm">{header || `Column ${i + 1}`}</div>
                  <select
                    className="field"
                    value={mapping[i] ?? ""}
                    onChange={(e) => {
                      const next = mapping.slice();
                      next[i] = e.target.value;
                      setMapping(next);
                    }}
                  >
                    <option value="">Ignore</option>
                    {PASTE_FIELDS[entity].map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm uppercase tracking-wide text-[var(--ink-muted)]">Preview</h3>
            <div className="overflow-auto rounded-xl border border-[var(--line)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--bg-sidebar)]">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={`${h}-${i}`} className="px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} className="border-t border-[var(--line)]">
                      {headers.map((_, ci) => (
                        <td key={ci} className="max-w-48 truncate px-2 py-1">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              {dataRows.length} data row{dataRows.length === 1 ? "" : "s"}. Empty topic cells fill
              down from the row above. Line breaks in a Units cell each become a sub-unit.
            </p>
          </div>

          {entity === "topics" && conflicts.length > 0 ? (
            <fieldset className="space-y-2 rounded-xl border border-[var(--line)] p-3">
              <legend className="text-sm font-medium">
                {conflicts.length === 1
                  ? `${conflicts[0].label} already has ${conflicts[0].existingCount} topic${
                      conflicts[0].existingCount === 1 ? "" : "s"
                    }`
                  : "These subjects already have topics"}
              </legend>
              {conflicts.length > 1 ? (
                <ul className="text-sm text-[var(--ink-muted)]">
                  {conflicts.map((c) => (
                    <li key={c.label}>
                      {c.label}: {c.existingCount} existing, {c.matchingTitles} title
                      {c.matchingTitles === 1 ? "" : "s"} match
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--ink-muted)]">
                  {conflicts[0].matchingTitles} title
                  {conflicts[0].matchingTitles === 1 ? "" : "s"} in this table already exist.
                </p>
              )}
              {IMPORT_MODES.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    name="topic-import-mode"
                    checked={importMode === opt.value}
                    onChange={() => setImportMode(opt.value)}
                  />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-[var(--ink-muted)]">
                      {opt.hint(conflicts)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (entity === "topics" && conflicts.length > 0 && !importMode)}
              onClick={() => void run()}
            >
              {busy ? "Importing…" : `Import ${dataRows.length} rows`}
            </button>
            {log ? <span className="text-sm">{log}</span> : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          In Sheets, select the table (including the header row), copy, then paste here. One table at a
          time — set the subject to Algebra 1, Pre-calculus, and so on.
        </p>
      )}
    </div>
  );
}
