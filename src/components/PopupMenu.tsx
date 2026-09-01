import { useEffect, useRef, type ReactNode } from "react";
import { openAppWindow } from "../lib/windows";

export function PopupMenu({
  x,
  y,
  onClose,
  children,
  width = 200,
  height = 160,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pad = 8;
  const left = Math.min(x, window.innerWidth - width - pad);
  const top = Math.min(y, window.innerHeight - height - pad);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div ref={ref} className="topic-menu card py-1" style={{ left, top }} role="menu">
      {children}
    </div>
  );
}

export function WindowMenuItems({
  route,
  title,
  kind,
  id,
  onDone,
}: {
  route: string;
  title: string;
  kind: string;
  id: string | number;
  onDone: () => void;
}) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="topic-menu-item"
        onClick={() => {
          void openAppWindow({ route, title, kind, id, chrome: "full" });
          onDone();
        }}
      >
        Open in new window
      </button>
      <button
        type="button"
        role="menuitem"
        className="topic-menu-item"
        onClick={() => {
          void openAppWindow({ route, title, kind, id, chrome: "focus" });
          onDone();
        }}
      >
        Open focused window
      </button>
    </>
  );
}
