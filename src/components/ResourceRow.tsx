import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, Link2, Paperclip } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import type { Resource } from "../types";
import { openExternalUrl } from "../lib/media";
import { openResourceWindow } from "../lib/windows";
import { cn, parseTags } from "../lib/format";
import { PopupMenu, WindowMenuItems } from "./PopupMenu";
import { ResourceActionsMenu } from "./ResourceActionsMenu";

export function ResourceRow({
  resource,
  onOpen,
  onOpenOnCanvas,
  trailing,
  selectMode,
  selected,
  onToggleSelect,
  onSelect,
  onEdit,
  onDelete,
}: {
  resource: Resource;
  onOpen?: () => void;
  onOpenOnCanvas?: () => void;
  trailing?: ReactNode;
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
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2",
        selectMode && selected && "ring-1 ring-[var(--accent)]",
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={() => onToggleSelect?.()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${resource.title}`}
        />
      ) : null}
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => void open()}>
        <span className="text-[var(--accent-2)]">
          {resource.type === "pdf" ? (
            <Paperclip size={16} />
          ) : resource.type === "link" ? (
            <Link2 size={16} />
          ) : resource.type === "image" ? (
            <ImageIcon size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{resource.title}</span>
          <span className="block truncate text-xs text-[var(--ink-muted)]">
            {resource.type.replace("_", " ")}
            {parseTags(resource.tags).length
              ? ` · ${parseTags(resource.tags).join(", ")}`
              : ""}
          </span>
        </span>
      </button>
      {showActions && onSelect && onEdit && onDelete ? (
        <ResourceActionsMenu onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        trailing
      )}
      {menu ? (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} height={onOpenOnCanvas ? 128 : 88}>
          {onOpenOnCanvas && (resource.type === "pdf" || resource.type === "image") ? (
            <button
              type="button"
              role="menuitem"
              className="topic-menu-item"
              onClick={() => {
                onOpenOnCanvas();
                setMenu(null);
              }}
            >
              Open on canvas
            </button>
          ) : null}
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
