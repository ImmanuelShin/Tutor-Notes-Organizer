import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import type { Worksheet } from "../types";
import {
  addWorksheetColumn,
  addWorksheetRow,
  cellPreview,
  deleteWorksheetColumn,
  deleteWorksheetRow,
  parseCell,
  renameColumn,
  resizeColumn,
  serializeDays,
  setCell,
  sortDayEntries,
  toDayLog,
  todayIsoDate,
  uid,
  type DayEntry,
} from "../lib/worksheet";
import { cn } from "../lib/format";
import { Modal } from "./ui";

type CellPos = { r: number; c: number };

const HISTORY_LIMIT = 20;

function cloneWorksheet(ws: Worksheet): Worksheet {
  return structuredClone(ws);
}

function sameWorksheet(a: Worksheet, b: Worksheet): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function floatingEditorStyle(rect: DOMRect): CSSProperties {
  const width = Math.min(Math.max(rect.width + 32, 288), window.innerWidth - 16);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8);
  }
  if (left < 8) left = 8;
  const maxHeight = Math.min(window.innerHeight - 24, 360);
  let top = rect.top;
  if (top + 140 > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - Math.min(maxHeight, 220) - 8);
  }
  return { top, left, width, maxHeight };
}

export function DataGrid({
  value,
  onChange,
}: {
  value: Worksheet;
  onChange: (next: Worksheet) => void;
}) {
  const [selected, setSelected] = useState<CellPos | null>({ r: 0, c: 0 });
  const [editPos, setEditPos] = useState<CellPos | null>(null);
  const [draft, setDraft] = useState("");
  const [headerEdit, setHeaderEdit] = useState<string | null>(null);
  const [headerDraft, setHeaderDraft] = useState("");
  const [dragWidth, setDragWidth] = useState<{ id: string; width: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; r: number; c: number } | null>(null);
  const [daysPos, setDaysPos] = useState<CellPos | null>(null);
  const [editorBox, setEditorBox] = useState<CSSProperties | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editAnchorRef = useRef<HTMLTableCellElement | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const pastRef = useRef<Worksheet[]>([]);
  const futureRef = useRef<Worksheet[]>([]);
  const suppressHistoryRef = useRef(false);
  const daysSnapshotRef = useRef<Worksheet | null>(null);
  const skipCommitRef = useRef(false);

  const editing = editPos !== null;

  const applyChange = (next: Worksheet) => {
    if (sameWorksheet(next, valueRef.current)) return;
    if (!suppressHistoryRef.current) {
      pastRef.current = [...pastRef.current, cloneWorksheet(valueRef.current)].slice(-HISTORY_LIMIT);
      futureRef.current = [];
    }
    onChange(next);
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current = [...futureRef.current, cloneWorksheet(valueRef.current)].slice(-HISTORY_LIMIT);
    onChange(prev);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current = [...pastRef.current, cloneWorksheet(valueRef.current)].slice(-HISTORY_LIMIT);
    onChange(next);
  };

  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing, editPos?.r, editPos?.c]);

  useEffect(() => {
    if (!editing) {
      setEditorBox(null);
      return;
    }
    const measure = () => {
      const el = editAnchorRef.current;
      if (!el) return;
      setEditorBox(floatingEditorStyle(el.getBoundingClientRect()));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [editing, editPos?.r, editPos?.c, draft]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menu]);

  const colId = (c: number) => value.columns[c]?.id;
  const rowId = (r: number) => value.rows[r]?.id;

  const cellRaw = (pos: CellPos) => {
    const row = value.rows[pos.r];
    const col = value.columns[pos.c];
    if (!row || !col) return "";
    return row.cells[col.id] ?? "";
  };

  const writeCell = (pos: CellPos, raw: string) => {
    const idR = rowId(pos.r);
    const idC = colId(pos.c);
    if (!idR || !idC) return;
    applyChange(setCell(valueRef.current, idR, idC, raw));
  };

  const closeDays = () => {
    suppressHistoryRef.current = false;
    const before = daysSnapshotRef.current;
    daysSnapshotRef.current = null;
    if (before && !sameWorksheet(before, valueRef.current)) {
      pastRef.current = [...pastRef.current, before].slice(-HISTORY_LIMIT);
      futureRef.current = [];
    }
    setDaysPos(null);
  };

  const openDays = (pos: CellPos) => {
    if (!daysSnapshotRef.current) {
      daysSnapshotRef.current = cloneWorksheet(valueRef.current);
    }
    suppressHistoryRef.current = true;
    const raw = cellRaw(pos);
    if (parseCell(raw).kind !== "days") writeCell(pos, toDayLog(raw));
    setEditPos(null);
    setMenu(null);
    setSelected(pos);
    setDaysPos(pos);
  };

  const splitIntoDays = (pos: CellPos) => {
    const raw = cellRaw(pos);
    if (parseCell(raw).kind === "days") return;
    writeCell(pos, toDayLog(raw));
    setMenu(null);
  };

  const commitEdit = () => {
    if (!editPos) return;
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditPos(null);
      return;
    }
    writeCell(editPos, draft);
    setEditPos(null);
    sheetRef.current?.focus();
  };

  const cancelEdit = () => {
    skipCommitRef.current = true;
    setEditPos(null);
    sheetRef.current?.focus();
  };

  const startEdit = (pos: CellPos, seed?: string) => {
    const raw = cellRaw(pos);
    if (parseCell(raw).kind === "days") {
      openDays(pos);
      return;
    }
    const row = value.rows[pos.r];
    const col = value.columns[pos.c];
    if (!row || !col) return;
    setSelected(pos);
    setDraft(seed !== undefined ? seed : raw);
    setEditPos(pos);
  };

  const move = (dr: number, dc: number) => {
    if (!selected) return;
    const r = Math.max(0, Math.min(value.rows.length - 1, selected.r + dr));
    const c = Math.max(0, Math.min(value.columns.length - 1, selected.c + dc));
    setSelected({ r, c });
  };

  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (headerEdit || daysPos || menu) return;
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
        move(1, 0);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        move(0, e.shiftKey ? -1 : 1);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (!selected) return;
    const raw = cellRaw(selected);
    const isDays = parseCell(raw).kind === "days";
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1, 0);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(0, -1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      move(0, 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isDays) openDays(selected);
      else startEdit(selected);
    } else if (e.key === "Tab") {
      e.preventDefault();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      writeCell(selected, "");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (isDays) openDays(selected);
      else startEdit(selected, e.key);
    }
  };

  const onEditorKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
      move(1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      move(0, e.shiftKey ? -1 : 1);
    }
  };

  const startResize = (colIdValue: string, startX: number, startW: number) => {
    const onMove = (e: MouseEvent) => {
      setDragWidth({ id: colIdValue, width: Math.min(640, Math.max(80, startW + e.clientX - startX)) });
    };
    const onUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const width = Math.min(640, Math.max(80, startW + e.clientX - startX));
      setDragWidth(null);
      applyChange(resizeColumn(valueRef.current, colIdValue, width));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const colWidth = (col: { id: string; width: number }) =>
    dragWidth?.id === col.id ? dragWidth.width : col.width;

  const openCellMenu = (e: ReactMouseEvent, r: number, c: number) => {
    e.preventDefault();
    const pad = 8;
    const w = 168;
    const h = 100;
    setSelected({ r, c });
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - w - pad),
      y: Math.min(e.clientY, window.innerHeight - h - pad),
      r,
      c,
    });
  };

  const daysTarget =
    daysPos && value.rows[daysPos.r] && value.columns[daysPos.c]
      ? { row: value.rows[daysPos.r], col: value.columns[daysPos.c] }
      : null;
  const daysParsed = daysTarget ? parseCell(daysTarget.row.cells[daysTarget.col.id] ?? "") : null;
  const topicCol = value.columns.find(
    (c) => c.id === "topic" || c.title.toLowerCase() === "topic",
  );
  const topicLabel = (() => {
    if (!daysTarget || !topicCol) return "";
    const parsed = parseCell(daysTarget.row.cells[topicCol.id] ?? "");
    return parsed.kind === "text" ? parsed.text.trim() : "";
  })();
  const daysTitle = [daysTarget?.col.title || "Notes", topicLabel].filter(Boolean).join(" · ");

  return (
    <div className="datagrid">
      <div className="sheet" ref={sheetRef} tabIndex={0} onKeyDown={onGridKeyDown}>
        <table className="sheet-table">
          <colgroup>
            <col style={{ width: "2.4rem" }} />
            {value.columns.map((col) => (
              <col key={col.id} style={{ width: colWidth(col) }} />
            ))}
            <col style={{ width: "2.4rem" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sheet-gutter" />
              {value.columns.map((col) => (
                <th key={col.id} className="relative px-2 py-1.5 text-left text-sm font-medium">
                  {headerEdit === col.id ? (
                    <input
                      className="field py-0.5 text-sm"
                      value={headerDraft}
                      autoFocus
                      onChange={(e) => setHeaderDraft(e.target.value)}
                      onBlur={() => {
                        applyChange(renameColumn(value, col.id, headerDraft.trim() || col.title));
                        setHeaderEdit(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setHeaderEdit(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="block w-full truncate text-left"
                      onDoubleClick={() => {
                        setHeaderEdit(col.id);
                        setHeaderDraft(col.title);
                      }}
                    >
                      {col.title || "Untitled"}
                    </button>
                  )}
                  {value.columns.length > 1 ? (
                    <button
                      type="button"
                      className="sheet-col-delete"
                      title="Delete column"
                      onClick={() => applyChange(deleteWorksheetColumn(value, col.id))}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                  <span
                    className="sheet-resize"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startResize(col.id, e.clientX, colWidth(col));
                    }}
                  />
                </th>
              ))}
              <th className="sheet-add">
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  title="Add column"
                  onClick={() => applyChange(addWorksheetColumn(value))}
                >
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, r) => (
              <tr key={row.id}>
                <td className="sheet-gutter">
                  <span className="sheet-row-num">{r + 1}</span>
                  <button
                    type="button"
                    className="sheet-row-delete"
                    title="Delete row"
                    onClick={() => applyChange(deleteWorksheetRow(value, row.id))}
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
                {value.columns.map((col, c) => {
                  const isSel = selected?.r === r && selected?.c === c;
                  const isEd = editPos?.r === r && editPos?.c === c;
                  const raw = row.cells[col.id] ?? "";
                  const parsed = parseCell(raw);
                  return (
                    <td
                      key={col.id}
                      ref={isEd ? editAnchorRef : undefined}
                      className={cn("sheet-cell", isSel && "selected")}
                      style={{ width: colWidth(col), minWidth: colWidth(col) }}
                      onMouseDown={() => {
                        if (editPos && (editPos.r !== r || editPos.c !== c)) commitEdit();
                        setSelected({ r, c });
                        if (!(editPos?.r === r && editPos?.c === c)) {
                          sheetRef.current?.focus();
                        }
                      }}
                      onDoubleClick={() => startEdit({ r, c })}
                      onContextMenu={(e) => openCellMenu(e, r, c)}
                    >
                      <div className="sheet-cell-body">
                        {parsed.kind === "days" ? (
                          <DayCellPreview raw={raw} count={parsed.entries.length} />
                        ) : (
                          <div className={cn("sheet-display", isEd && "opacity-40")}>{parsed.text}</div>
                        )}
                        {isSel && !isEd ? (
                          <button
                            type="button"
                            className="sheet-day-btn"
                            title="Day notes"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDays({ r, c });
                            }}
                          >
                            <CalendarDays size={13} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="sheet-add" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 shrink-0">
        <button type="button" className="btn btn-small" onClick={() => applyChange(addWorksheetRow(value))}>
          <Plus size={14} /> Add row
        </button>
      </div>

      {editing && editorBox
        ? createPortal(
            <textarea
              ref={editorRef}
              className="sheet-editor-float"
              style={editorBox}
              value={draft}
              rows={Math.max(6, draft.split("\n").length)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitEdit()}
              onKeyDown={onEditorKeyDown}
            />,
            document.body,
          )
        : null}

      {menu ? (
        <div
          ref={menuRef}
          className="topic-menu card py-1"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {parseCell(cellRaw({ r: menu.r, c: menu.c })).kind !== "days" ? (
            <button
              type="button"
              role="menuitem"
              className="topic-menu-item"
              onClick={() => splitIntoDays({ r: menu.r, c: menu.c })}
            >
              Split into days
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => openDays({ r: menu.r, c: menu.c })}
          >
            Day notes…
          </button>
        </div>
      ) : null}

      {daysPos && daysTarget ? (
        <DayNotesModal
          title={daysTitle}
          entries={daysParsed?.kind === "days" ? daysParsed.entries : []}
          onChange={(entries) => writeCell(daysPos, entries.length ? serializeDays(entries) : "")}
          onClose={closeDays}
        />
      ) : null}
    </div>
  );
}

function DayCellPreview({ raw, count }: { raw: string; count: number }) {
  return (
    <div className="sheet-display sheet-day-preview">
      <span className="chip shrink-0">
        {count} day{count === 1 ? "" : "s"}
      </span>
      <span className="min-w-0 truncate">{cellPreview(raw)}</span>
    </div>
  );
}

function DayNotesModal({
  title,
  entries,
  onChange,
  onClose,
}: {
  title: string;
  entries: DayEntry[];
  onChange: (entries: DayEntry[]) => void;
  onClose: () => void;
}) {
  const sorted = sortDayEntries(entries);

  const patch = (id: string, next: Partial<DayEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...next } : e)));
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        One entry per session. The grid only shows the latest day so the cell stays small.
      </p>
      <div className="space-y-3">
        {sorted.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-[var(--line)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <input
                className="field w-auto"
                type="date"
                value={entry.date}
                onChange={(e) => patch(entry.id, { date: e.target.value || todayIsoDate() })}
              />
              <button
                type="button"
                className="btn btn-quiet btn-small btn-danger ml-auto"
                title="Delete day"
                onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              className="field min-h-24"
              value={entry.text}
              placeholder="Notes for this day…"
              onChange={(e) => patch(entry.id, { text: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            onChange([...entries, { id: uid(), date: todayIsoDate(), text: "" }])
          }
        >
          <Plus size={14} /> Add day
        </button>
      </div>
    </Modal>
  );
}
