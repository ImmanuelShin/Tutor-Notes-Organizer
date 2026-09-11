import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, Link2, Paperclip } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import type { Resource } from "../types";
import { openExternalUrl, toDisplaySrc } from "../lib/media";
import { pdfFirstPageThumb } from "../lib/pdfThumb";
import { openResourceWindow } from "../lib/windows";
import { parseTags, cn } from "../lib/format";
import { PopupMenu, WindowMenuItems } from "./PopupMenu";
import { ResourceActionsMenu } from "./ResourceActionsMenu";

export function ResourcePreviewCard({
  resource,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
  onSelect,
  onEdit,
  onDelete,
}: {
  resource: Resource;
  onOpen?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const nav = useNavigate();
  const { resourceFileOpen } = useSettings();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const showActions = Boolean(onSelect && onEdit && onDelete) && !selectMode;

  const open = async () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect();
      return;
    }
    if (onOpen) {
      onOpen();
      return;
    }
    if (resource.type === "link" && resource.url) {
      await openExternalUrl(resource.url);
      return;
    }
    if (resourceFileOpen === "window") {
      await openResourceWindow({ id: resource.id, title: resource.title });
      return;
    }
    nav(`/resources/${resource.id}`);
  };

  return (
    <div
      className={cn("resource-preview-card", selectMode && selected && "ring-1 ring-[var(--accent)]")}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {selectMode ? (
        <input
          type="checkbox"
          className="absolute left-2 top-2 z-10 rounded bg-[var(--bg-raised)]/90 p-0.5"
          checked={Boolean(selected)}
          onChange={() => onToggleSelect?.()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${resource.title}`}
        />
      ) : null}
      {showActions && onSelect && onEdit && onDelete ? (
        <div className="absolute right-1.5 top-1.5 z-10 rounded-lg bg-[var(--bg-raised)]/90 shadow-sm">
          <ResourceActionsMenu onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ) : null}
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => void open()}>
        <PreviewMedia resource={resource} />
        <span className="min-w-0 px-3 py-2">
          <span className="block truncate text-sm font-medium">{resource.title}</span>
          <span className="block truncate text-xs text-[var(--ink-muted)]">
            {resource.type.replace("_", " ")}
            {parseTags(resource.tags).length ? ` · ${parseTags(resource.tags).join(", ")}` : ""}
          </span>
        </span>
      </button>
      {menu ? (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} height={88}>
          <WindowMenuItems
            route={`/resources/${resource.id}`}
            title={resource.title}
            kind="resource"
            id={resource.id}
            onDone={() => setMenu(null)}
          />
        </PopupMenu>
      ) : null}
    </div>
  );
}

function PreviewMedia({ resource }: { resource: Resource }) {
  if (resource.type === "image" && resource.file_path) {
    return <ImageThumb path={resource.file_path} title={resource.title} />;
  }
  if (resource.type === "pdf" && resource.file_path) {
    return <PdfThumb path={resource.file_path} title={resource.title} />;
  }
  return (
    <span className="resource-preview-fallback">
      {resource.type === "pdf" ? (
        <Paperclip size={28} />
      ) : resource.type === "link" ? (
        <Link2 size={28} />
      ) : resource.type === "image" ? (
        <ImageIcon size={28} />
      ) : (
        <FileText size={28} />
      )}
    </span>
  );
}

function ImageThumb({ path, title }: { path: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void toDisplaySrc(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) return <span className="resource-preview-fallback"><ImageIcon size={28} /></span>;
  return <img className="resource-preview-media" src={src} alt={title} draggable={false} />;
}

function PdfThumb({ path, title }: { path: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void pdfFirstPageThumb(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <span className="resource-preview-fallback">
        <Paperclip size={28} />
      </span>
    );
  }
  if (!src) {
    return <span className="resource-preview-fallback text-sm text-[var(--ink-muted)]">Loading…</span>;
  }
  return (
    <img
      className="resource-preview-media resource-preview-media-pdf"
      src={src}
      alt={title}
      draggable={false}
    />
  );
}
