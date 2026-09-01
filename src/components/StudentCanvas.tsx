import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, GripVertical, Minus, Plus, SquarePlus, X } from "lucide-react";
import type { PagePanel, StudentPageLayout } from "../types";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MIN_ZOOM,
  clampZoom,
  isBuiltinPanelId,
  panelLabel,
  patchPanel,
  raisePanel,
  removePanel,
  resetLayout,
  setPanelHidden,
  visibleCenterWorld,
  viewportPointToWorld,
} from "../lib/pageLayout";
import { PopupMenu } from "./PopupMenu";

const MIN_W = 240;
const MIN_H = 140;

export function StudentCanvas({
  layout,
  onChange,
  renderPanel,
  panelTitle,
  onAddWorkspace,
  onAddMedia,
  onRemovePanel,
}: {
  layout: StudentPageLayout;
  onChange: (next: StudentPageLayout) => void;
  renderPanel: (panel: PagePanel) => ReactNode;
  panelTitle?: (panel: PagePanel) => string;
  onAddWorkspace: (at: { x: number; y: number }) => void;
  onAddMedia: (at: { x: number; y: number }) => void;
  onRemovePanel: (id: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const emit = (next: StudentPageLayout) => {
    layoutRef.current = next;
    onChange(next);
  };
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    world: { x: number; y: number };
  } | null>(null);
  const [worldSize, setWorldSize] = useState({ w: BOARD_WIDTH, h: BOARD_HEIGHT });
  const worldRef = useRef(worldSize);
  worldRef.current = worldSize;
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
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

  const titleOf = (panel: PagePanel) => panelTitle?.(panel) ?? panelLabel(panel);

  const centerWorld = () => {
    const el = viewportRef.current;
    if (!el) return { x: 40, y: 40 };
    return visibleCenterWorld(layoutRef.current, el.getBoundingClientRect());
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setWorldSize({
        w: Math.max(BOARD_WIDTH, Math.ceil(r.width / MIN_ZOOM)),
        h: Math.max(BOARD_HEIGHT, Math.ceil(r.height / MIN_ZOOM)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!layoutOpen && !addOpen) return;
    const onDown = (e: PointerEvent) => {
      if (layoutMenuRef.current?.contains(e.target as Node)) return;
      if (addMenuRef.current?.contains(e.target as Node)) return;
      setLayoutOpen(false);
      setAddOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [layoutOpen, addOpen]);

  const zoomBy = (delta: number, origin?: { x: number; y: number }) => {
    const current = layoutRef.current;
    const nextZoom = clampZoom(Math.round((current.zoom + delta) * 100) / 100);
    if (nextZoom === current.zoom) return;
    if (!origin) {
      emit({ ...current, zoom: nextZoom });
      return;
    }
    const worldX = (origin.x - current.panX) / current.zoom;
    const worldY = (origin.y - current.panY) / current.zoom;
    emit({
      ...current,
      zoom: nextZoom,
      panX: origin.x - worldX * nextZoom,
      panY: origin.y - worldY * nextZoom,
    });
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? -0.08 : 0.08, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    const onMiddleDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add("student-canvas-panning");
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: layoutRef.current.panX,
        origY: layoutRef.current.panY,
      };
    };
    const preventMiddleDefault = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    el.addEventListener("pointerdown", onMiddleDown, true);
    el.addEventListener("mousedown", preventMiddleDefault, true);
    el.addEventListener("auxclick", preventMiddleDefault, true);
    return () => {
      el.removeEventListener("wheel", onNativeWheel);
      el.removeEventListener("pointerdown", onMiddleDown, true);
      el.removeEventListener("mousedown", preventMiddleDefault, true);
      el.removeEventListener("auxclick", preventMiddleDefault, true);
    };
  }, []);

  const onViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset?.canvasBg) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("student-canvas-panning");
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: layoutRef.current.panX,
      origY: layoutRef.current.panY,
    };
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    emit({
      ...layoutRef.current,
      panX: pan.origX + e.clientX - pan.startX,
      panY: pan.origY + e.clientY - pan.startY,
    });
  };

  const endPan = () => {
    panRef.current = null;
    viewportRef.current?.classList.remove("student-canvas-panning");
  };

  const startMove = (e: React.PointerEvent, panel: PagePanel) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    emit(raisePanel(layoutRef.current, panel.id));
    dragRef.current = {
      id: panel.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: panel.x,
      origY: panel.y,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const zoom = layoutRef.current.zoom;
    const panel = layoutRef.current.panels.find((p) => p.id === drag.id);
    const pw = panel?.w ?? MIN_W;
    const ph = panel?.h ?? MIN_H;
    const world = worldRef.current;
    const x = Math.max(0, Math.min(world.w - pw, drag.origX + (e.clientX - drag.startX) / zoom));
    const y = Math.max(0, Math.min(world.h - ph, drag.origY + (e.clientY - drag.startY) / zoom));
    emit(patchPanel(layoutRef.current, drag.id, { x, y }));
  };

  const endMove = () => {
    dragRef.current = null;
  };

  const startResize = (e: React.PointerEvent, panel: PagePanel) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      id: panel.id,
      startX: e.clientX,
      startY: e.clientY,
      origW: panel.w,
      origH: panel.h,
    };
  };

  const onResize = (e: React.PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    const zoom = layoutRef.current.zoom;
    const panel = layoutRef.current.panels.find((p) => p.id === resize.id);
    const world = worldRef.current;
    const w = Math.min(world.w - (panel?.x ?? 0), Math.max(MIN_W, resize.origW + (e.clientX - resize.startX) / zoom));
    const h = Math.min(world.h - (panel?.y ?? 0), Math.max(MIN_H, resize.origH + (e.clientY - resize.startY) / zoom));
    emit(patchPanel(layoutRef.current, resize.id, { w, h }));
  };

  const endResize = () => {
    resizeRef.current = null;
  };

  const onCanvasContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (e.target !== e.currentTarget && !target.dataset?.canvasBg) return;
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    setAddOpen(false);
    setLayoutOpen(false);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      world: viewportPointToWorld(layoutRef.current, el.getBoundingClientRect(), e.clientX, e.clientY),
    });
  };

  const addItems = (world: { x: number; y: number }) => (
    <>
      <button
        type="button"
        role="menuitem"
        className="topic-menu-item w-full"
        onClick={() => {
          onAddWorkspace(world);
          setAddOpen(false);
          setContextMenu(null);
        }}
      >
        Add workspace
      </button>
      <button
        type="button"
        role="menuitem"
        className="topic-menu-item w-full"
        onClick={() => {
          onAddMedia(world);
          setAddOpen(false);
          setContextMenu(null);
        }}
      >
        Open PDF or image…
      </button>
    </>
  );

  const hiddenCount = layout.panels.filter((p) => p.hidden).length;

  return (
    <div className="student-canvas-wrap">
      <div
        ref={viewportRef}
        className="student-canvas-viewport"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        onContextMenu={onCanvasContextMenu}
      >
        <div
          className="student-canvas-world"
          data-canvas-bg="1"
          style={{
            width: worldSize.w,
            height: worldSize.h,
            transform: `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`,
          }}
          onContextMenu={onCanvasContextMenu}
        >
          {layout.panels
            .filter((p) => !p.hidden)
            .map((panel) => (
              <div
                key={panel.id}
                className="canvas-panel card"
                style={{
                  left: panel.x,
                  top: panel.y,
                  width: panel.w,
                  height: panel.h,
                  zIndex: panel.z,
                }}
                onPointerDown={() => {
                  const next = raisePanel(layoutRef.current, panel.id);
                  if (next !== layoutRef.current) emit(next);
                }}
                onContextMenu={(e) => e.stopPropagation()}
              >
                <div
                  className="canvas-panel-bar"
                  onPointerDown={(e) => startMove(e, panel)}
                  onPointerMove={onMove}
                  onPointerUp={endMove}
                  onPointerCancel={endMove}
                >
                  <GripVertical size={14} />
                  <span className="min-w-0 flex-1 truncate">{titleOf(panel)}</span>
                  {isBuiltinPanelId(panel.id) ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      title="Hide"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => emit(setPanelHidden(layoutRef.current, panel.id, true))}
                    >
                      <EyeOff size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      title="Close"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        onRemovePanel(panel.id);
                        emit(removePanel(layoutRef.current, panel.id));
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className={`canvas-panel-body${panel.kind === "media" ? " canvas-panel-body-media" : ""}`}>
                  {renderPanel(panel)}
                </div>
                <button
                  type="button"
                  className="canvas-panel-resize"
                  title="Resize"
                  aria-label={`Resize ${titleOf(panel)}`}
                  onPointerDown={(e) => startResize(e, panel)}
                  onPointerMove={onResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                />
              </div>
            ))}
        </div>
      </div>

      <div className="canvas-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-small"
          title="Zoom out"
          onClick={() => zoomBy(-0.1)}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="btn btn-small min-w-14"
          title="Reset zoom"
          onClick={() => emit({ ...layoutRef.current, zoom: 1 })}
        >
          {Math.round(layout.zoom * 100)}%
        </button>
        <button
          type="button"
          className="btn btn-small"
          title="Zoom in"
          onClick={() => zoomBy(0.1)}
        >
          <Plus size={14} />
        </button>
        <div className="relative" ref={addMenuRef}>
          <button
            type="button"
            className="btn btn-small"
            title="Add"
            onClick={() => {
              setAddOpen((o) => !o);
              setLayoutOpen(false);
            }}
          >
            <SquarePlus size={14} /> Add
          </button>
          {addOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 min-w-52 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] py-1 shadow">
              {addItems(centerWorld())}
            </div>
          ) : null}
        </div>
        <div className="relative" ref={layoutMenuRef}>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setLayoutOpen((o) => !o);
              setAddOpen(false);
            }}
          >
            <Eye size={14} /> Layout
            {hiddenCount ? ` (${hiddenCount})` : ""}
          </button>
          {layoutOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 min-w-52 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] py-1 shadow">
              {layout.panels.map((panel) => {
                const hidden = panel.hidden === true;
                const builtin = isBuiltinPanelId(panel.id);
                return (
                  <div key={panel.id} className="flex items-center">
                    <button
                      type="button"
                      className="topic-menu-item min-w-0 flex-1"
                      onClick={() => {
                        emit(setPanelHidden(layoutRef.current, panel.id, !hidden));
                        setLayoutOpen(false);
                      }}
                    >
                      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span className="min-w-0 truncate">{titleOf(panel)}</span>
                    </button>
                    {builtin ? null : (
                      <button
                        type="button"
                        className="btn btn-quiet btn-small mr-1"
                        title="Remove"
                        onClick={() => {
                          onRemovePanel(panel.id);
                          emit(removePanel(layoutRef.current, panel.id));
                          setLayoutOpen(false);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="topic-menu-item w-full border-t border-[var(--line)]"
                onClick={() => {
                  emit(resetLayout(layoutRef.current));
                  setLayoutOpen(false);
                }}
              >
                Reset layout
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {contextMenu ? (
        <PopupMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          width={200}
          height={88}
        >
          {addItems(contextMenu.world)}
        </PopupMenu>
      ) : null}
    </div>
  );
}
