import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, GripVertical, Plus, Trash2 } from "lucide-react";
import type { Worksheet } from "../types";
import {
  addWorksheetColumn,
  addWorksheetRow,
  deleteWorksheetColumn,
  deleteWorksheetRow,
  ensureTodayEntry,
  formatShortDay,
  isAssessmentColumn,
  parseCell,
  renameColumn,
  resizeColumn,
  serializeDays,
  setCell,
  sortDayEntries,
  stampAssessmentDraft,
  toDayLog,
  todayIsoDate,
  uid,
  type DayEntry,
} from "../lib/worksheet";
import { cn } from "../lib/format";

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

const DAY_NOTES_WIDTH = 520;
const DAY_NOTES_EST_HEIGHT = 420;
const POPUP_PAD = 8;
const POPUP_GAP = 8;

function clampPopupPos(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(POPUP_PAD, window.innerWidth - width - POPUP_PAD);
  const maxY = Math.max(POPUP_PAD, window.innerHeight - height - POPUP_PAD);
  return {
    x: Math.min(Math.max(POPUP_PAD, x), maxX),
    y: Math.min(Math.max(POPUP_PAD, y), maxY),
  };
}

function anchorOnScreen(anchor: DOMRect) {
  return (
    anchor.bottom > POPUP_PAD &&
    anchor.top < window.innerHeight - POPUP_PAD &&
    anchor.right > POPUP_PAD &&
    anchor.left < window.innerWidth - POPUP_PAD
  );
}

function placeDayNotes(anchor: DOMRect | null, width: number, height: number) {
  const centered = clampPopupPos(
    (window.innerWidth - width) / 2,
    (window.innerHeight - height) / 2,
    width,
    height,
  );
  if (!anchor || !anchorOnScreen(anchor)) return centered;

  const x = anchor.left + anchor.width / 2 - width / 2;
  const spaceAbove = anchor.top - POPUP_PAD;
  const spaceBelow = window.innerHeight - anchor.bottom - POPUP_PAD;
  let y: number;
  if (spaceAbove >= height + POPUP_GAP) {
    y = anchor.top - height - POPUP_GAP;
  } else if (spaceBelow >= Math.min(height, 240) + POPUP_GAP) {
    y = anchor.bottom + POPUP_GAP;
  } else {
    return centered;
  }
  return clampPopupPos(x, y, width, height);
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
  const [daysAnchor, setDaysAnchor] = useState<DOMRect | null>(null);
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
    setDaysAnchor(null);
  };

  const openDays = (pos: CellPos, seed?: string) => {
    if (!daysSnapshotRef.current) {
      daysSnapshotRef.current = cloneWorksheet(valueRef.current);
    }
    suppressHistoryRef.current = true;
    const col = value.columns[pos.c];
    const assessment = isAssessmentColumn(col);
    const raw = cellRaw(pos);
    const parsed = parseCell(raw);
    if (parsed.kind !== "days") {
      if (seed) writeCell(pos, toDayLog(seed));
      else if (!assessment) writeCell(pos, toDayLog(raw));
    } else if (assessment && seed) {
      const next = ensureTodayEntry(raw, seed);
      if (next !== serializeDays(parsed.entries)) writeCell(pos, next);
    }
    setEditPos(null);
    setMenu(null);
    setSelected(pos);
    const cell = sheetRef.current?.querySelector(`[data-cell="${pos.r}:${pos.c}"]`);
    setDaysAnchor(cell instanceof HTMLElement ? cell.getBoundingClientRect() : null);
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
    const col = value.columns[editPos.c];
    writeCell(editPos, isAssessmentColumn(col) ? stampAssessmentDraft(cellRaw(editPos), draft) : draft);
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
    const col = value.columns[pos.c];
    if (parseCell(raw).kind === "days" || isAssessmentColumn(col)) {
      openDays(pos, seed);
      return;
    }
    const row = value.rows[pos.r];
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
      startEdit(selected);
    } else if (e.key === "Tab") {
      e.preventDefault();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      writeCell(selected, "");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEdit(selected, e.key);
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
                      data-cell={`${r}:${c}`}
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
                          <DayCellPreview entries={parsed.entries} />
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
          key={`${daysPos.r}-${daysPos.c}`}
          title={daysTitle}
          entries={daysParsed?.kind === "days" ? daysParsed.entries : []}
          initialText={daysParsed?.kind === "text" ? daysParsed.text : ""}
          autoToday={isAssessmentColumn(daysTarget.col)}
          anchorRect={daysAnchor}
          onChange={(entries) => writeCell(daysPos, entries.length ? serializeDays(entries) : "")}
          onClose={closeDays}
        />
      ) : null}
    </div>
  );
}

function DayCellPreview({ entries }: { entries: DayEntry[] }) {
  const latest = sortDayEntries(entries)[0];
  const count = entries.length;
  return (
    <div className="sheet-display sheet-day-preview">
      <div className="sheet-day-preview-meta">
        <span className="chip shrink-0">
          {count} day{count === 1 ? "" : "s"}
        </span>
        {latest ? <span className="sheet-day-preview-date">{formatShortDay(latest.date)}</span> : null}
      </div>
      {latest?.text ? <div className="sheet-day-preview-text">{latest.text}</div> : null}
    </div>
  );
}

function DayNotesModal({
  title,
  entries,
  initialText = "",
  autoToday = false,
  anchorRect,
  onChange,
  onClose,
}: {
  title: string;
  entries: DayEntry[];
  initialText?: string;
  autoToday?: boolean;
  anchorRect: DOMRect | null;
  onChange: (entries: DayEntry[]) => void;
  onClose: () => void;
}) {
  const today = todayIsoDate();
  const [ghost, setGhost] = useState<DayEntry | null>(() =>
    autoToday ? { id: uid(), date: today, text: initialText } : null,
  );
  const [pos, setPos] = useState(() =>
    placeDayNotes(anchorRect, DAY_NOTES_WIDTH, DAY_NOTES_EST_HEIGHT),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const anchorRef = useRef(anchorRect);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const hasToday = entries.some((e) => e.date === today);
  const shownGhost = autoToday && !hasToday ? ghost : null;
  const displayed = shownGhost ? [...entries, shownGhost] : entries;
  const sorted = sortDayEntries(displayed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(placeDayNotes(anchorRef.current, width, height));
  }, []);

  const persist = (next: DayEntry[]) => {
    onChange(next);
  };

  const patch = (id: string, next: Partial<DayEntry>) => {
    if (shownGhost && id === shownGhost.id) {
      const updated = { ...shownGhost, ...next };
      setGhost(updated);
      if (updated.text.trim() || updated.date !== today) {
        persist([...entries, updated]);
      }
      return;
    }
    persist(entries.map((e) => (e.id === id ? { ...e, ...next } : e)));
  };

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
  };

  const onDragMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = panelRef.current;
    const width = el?.offsetWidth ?? DAY_NOTES_WIDTH;
    const height = el?.offsetHeight ?? DAY_NOTES_EST_HEIGHT;
    setPos(
      clampPopupPos(
        drag.origX + e.clientX - drag.startX,
        drag.origY + e.clientY - drag.startY,
        width,
        height,
      ),
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return createPortal(
    <div className="day-notes-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="day-notes-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-notes-title"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="day-notes-header">
          <div
            className="day-notes-handle"
            title="Drag"
            onPointerDown={startDrag}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical size={14} />
            <h2 id="day-notes-title" className="m-0 min-w-0 truncate text-lg">
              {title}
            </h2>
          </div>
          <button className="btn btn-quiet btn-small shrink-0" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="day-notes-body">
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            {autoToday
              ? "New notes start as today. Older days keep the date they were written. The grid shows the latest day."
              : "One entry per session. The grid shows the latest day."}
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
                    onClick={() => {
                      if (shownGhost && entry.id === shownGhost.id) {
                        setGhost(null);
                        if (entries.length === 0 && initialText.trim()) persist([]);
                        return;
                      }
                      persist(entries.filter((e) => e.id !== entry.id));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  className="field min-h-24"
                  value={entry.text}
                  placeholder="Notes for this day…"
                  autoFocus={entry.date === today && sorted.find((e) => e.date === today)?.id === entry.id}
                  onChange={(e) => patch(entry.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                const base =
                  shownGhost && (shownGhost.text.trim() || shownGhost.date !== today)
                    ? [...entries, shownGhost]
                    : entries;
                persist([...base, { id: uid(), date: todayIsoDate(), text: "" }]);
              }}
            >
              <Plus size={14} /> Add day
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
