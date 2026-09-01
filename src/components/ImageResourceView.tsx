import { useCallback, useEffect, useState } from "react";
import { copyStoredImage } from "../lib/media";
import { PopupMenu } from "./PopupMenu";

export function ImageResourceView({
  src,
  relative,
  title,
}: {
  src: string;
  relative: string;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const copy = useCallback(async () => {
    try {
      await copyStoredImage(relative);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Could not copy image", err);
    }
  }, [relative]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "c") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      void copy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copy]);

  const image = (
    <img
      className={expanded ? "resource-image resource-image-expanded" : "resource-image"}
      src={src}
      alt={title}
      draggable={false}
      onClick={() => {
        if (!expanded) setExpanded(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    />
  );

  return (
    <div>
      <p className="mb-2 text-sm text-[var(--ink-muted)]">
        Click to expand. Ctrl+C or right-click to copy.
        {copied ? <span className="ml-2 text-[var(--accent-2)]">Copied</span> : null}
      </p>
      {expanded ? (
        <div
          className="image-lightbox"
          onClick={() => setExpanded(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>{image}</div>
        </div>
      ) : (
        image
      )}
      {menu ? (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} height={48}>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => {
              void copy();
              setMenu(null);
            }}
          >
            Copy image
          </button>
        </PopupMenu>
      ) : null}
    </div>
  );
}
