import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { columnLabel, parseClipboardTable } from "../lib/parseClipboard";
import {
  gridToPastedRows,
  guessWorksheetMapping,
  mergePastedIntoWorksheet,
  previewWorksheetPaste,
  WORKSHEET_PASTE_FIELDS,
} from "../lib/pasteWorksheet";
import type { Worksheet } from "../types";

export function PasteWorksheet({
  table,
  onApply,
}: {
  table: Worksheet;
  onApply: (next: Worksheet) => void;
}) {
  const [raw, setRaw] = useState("");
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [mapping, setMapping] = useState<string[]>([]);
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

  const pastedRows = useMemo(
    () => (dataRows.length ? gridToPastedRows(dataRows, mapping) : []),
    [dataRows, mapping],
  );
  const previewCounts = useMemo(
    () => previewWorksheetPaste(table, pastedRows),
    [table, pastedRows],
  );

  useEffect(() => {
    setMapping(guessWorksheetMapping(headers));
    setLog(null);
  }, [headers.join("\0")]);

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

  const run = () => {
    if (!dataRows.length) {
      setLog("Paste a table first.");
      return;
    }
    if (!mapping.includes("topic")) {
      setLog("Map a column for: Topic");
      return;
    }
    if (!pastedRows.length) {
      setLog("No topic rows found. Map Topic and check that the first data row has a topic.");
      return;
    }
    setBusy(true);
    try {
      const result = mergePastedIntoWorksheet(table, pastedRows);
      onApply(result.table);
      const bits: string[] = [];
      if (result.matched) {
        bits.push(
          `updated ${result.matched} existing row${result.matched === 1 ? "" : "s"}`,
        );
      }
      if (result.appended) {
        bits.push(`added ${result.appended} new row${result.appended === 1 ? "" : "s"}`);
      }
      setLog(bits.length ? `Imported: ${bits.join(", ")}.` : "Nothing to import.");
    } catch (e) {
      setLog(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = dataRows.slice(0, 8);
  const matchLine =
    pastedRows.length > 0
      ? `${previewCounts.matched} match existing topic${previewCounts.matched === 1 ? "" : "s"}, ${previewCounts.appended} new row${previewCounts.appended === 1 ? "" : "s"}.`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => void readClipboard()}>
          <ClipboardPaste size={16} /> Paste from clipboard
        </button>
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
                    {WORKSHEET_PASTE_FIELDS.map((f) => (
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
              down from the row above.
              {matchLine ? ` ${matchLine}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={run}
            >
              {busy ? "Importing…" : `Import ${dataRows.length} rows`}
            </button>
            {log ? <span className="text-sm">{log}</span> : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          In Sheets, select the table (including the header row), copy, then paste here. Rows match
          existing topics and write into Assessment; unmatched topics become new rows.
        </p>
      )}
    </div>
  );
}
