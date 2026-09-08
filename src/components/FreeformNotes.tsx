import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { NoteBox } from "../types";
import { EMPTY_DOC } from "../types";
import { docToText, formatDate, isEmptyDoc } from "../lib/format";
import { uid } from "../lib/worksheet";
import { RichEditor } from "./RichEditor";

const MIN_WIDTH = 160;
const MAX_WIDTH = 720;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 900;
const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 180;

export function FreeformNotes({
  boxes,
  onChange,
}: {
  boxes: NoteBox[];
  onChange: (boxes: NoteBox[]) => void;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const emit = (next: NoteBox[]) => {
    boxesRef.current = next;
    onChange(next);
  };

  const patchBox = (id: string, patch: Partial<NoteBox>) => {
    emit(boxesRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBox = (id: string) => {
    emit(boxesRef.current.filter((b) => b.id !== id));
    if (focusedId === id) setFocusedId(null);
  };

  const pagePoint = (e: { clientX: number; clientY: number }) => {
    const page = pageRef.current;
    if (!page) return { x: 8, y: 8 };
    const rect = page.getBoundingClientRect();
    return {
      x: Math.max(8, e.clientX - rect.left + page.scrollLeft),
      y: Math.max(8, e.clientY - rect.top + page.scrollTop),
    };
  };

  const stampNow = () => new Date().toISOString();

  const onPageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target !== pageRef.current) return;
    const { x, y } = pagePoint(e);
    const now = stampNow();
    const box: NoteBox = {
      id: uid(),
      x,
      y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      body: EMPTY_DOC,
      createdAt: now,
      updatedAt: now,
    };
    emit([...boxesRef.current, box]);
    setFocusedId(box.id);
  };

  const startDrag = (e: React.PointerEvent, box: NoteBox) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: box.id, startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y };
  };

  const onDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    patchBox(drag.id, {
      x: Math.max(0, drag.origX + e.clientX - drag.startX),
      y: Math.max(0, drag.origY + e.clientY - drag.startY),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const startResize = (e: React.PointerEvent, box: NoteBox) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      origW: box.width,
      origH: box.height,
    };
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    patchBox(resize.id, {
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resize.origW + e.clientX - resize.startX)),
      height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resize.origH + e.clientY - resize.startY)),
    });
  };

  const endResize = () => {
    resizeRef.current = null;
  };

  const pageHeight = Math.max(480, ...boxes.map((b) => b.y + b.height + 24), 0);

  return (
    <div
      ref={pageRef}
      className="notes-page"
      style={{ minHeight: pageHeight }}
      onDoubleClick={onPageDoubleClick}
      onContextMenu={(e) => {
        if (e.target === pageRef.current) e.preventDefault();
      }}
    >
      {boxes.length === 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--ink-muted)]">
          Double-click anywhere to start a note
        </p>
      ) : null}
      {boxes.map((box) => {
        const focused = focusedId === box.id;
        return (
          <div
            key={box.id}
            className={`note-box ${focused ? "note-box-focus" : ""}`}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onFocus={() => setFocusedId(box.id)}
          >
            <div className="note-box-handle-row">
              <button
                type="button"
                className="note-box-handle"
                title="Drag"
                onPointerDown={(e) => startDrag(e, box)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GripVertical size={14} />
                {box.createdAt || box.updatedAt ? (
                  <span className="note-box-date">{formatDate(box.createdAt || box.updatedAt)}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-small note-box-delete"
                title="Remove note"
                onClick={() => removeBox(box.id)}
              >
                ×
              </button>
            </div>
            <div className="note-box-body">
              {focused ? (
                <RichEditor
                  key={box.id}
                  initialJson={box.body}
                  placeholder="Write here…"
                  collapsibleToolbar
                  onChange={(body) => {
                    const now = stampNow();
                    patchBox(box.id, {
                      body,
                      updatedAt: now,
                      createdAt: box.createdAt ?? now,
                    });
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="note-box-idle"
                  onClick={() => setFocusedId(box.id)}
                >
                  {isEmptyDoc(box.body) ? (
                    <span className="text-[var(--ink-muted)]">Click to write</span>
                  ) : (
                    docToText(box.body)
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              className="note-box-resize"
              title="Resize"
              aria-label="Resize note"
              onPointerDown={(e) => startResize(e, box)}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
          </div>
        );
      })}
    </div>
  );
}
