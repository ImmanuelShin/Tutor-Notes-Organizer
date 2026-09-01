import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { listSubjects } from "../db/topics";
import { columnLabel, parseClipboardTable } from "../lib/parseClipboard";
import {
  guessMapping,
  gridToTopicEntries,
  PASTE_FIELDS,
  writeResourceRows,
  writeStudentRows,
  writeTopicEntries,
  type PasteEntity,
} from "../lib/writeImport";
import { SubjectCombobox } from "./ui";

export function PasteTable({
  lockedEntity,
  onImported,
}: {
  lockedEntity?: PasteEntity;
  onImported?: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [entity, setEntity] = useState<PasteEntity>(lockedEntity ?? "topics");
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [mapping, setMapping] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    void listSubjects().then(setSubjects);
  }, []);

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
        const entries = gridToTopicEntries(dataRows, mapping, subject);
        if (!entries.length) {
          setLog("No topic rows found. Map Topic title and check that the first data row has a topic.");
          setBusy(false);
          return;
        }
        count = await writeTopicEntries(entries);
        setLog(`Imported ${count} topic template${count === 1 ? "" : "s"}${subject ? ` into ${subject}` : ""}.`);
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

          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>
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
