import { useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { PopupMenu } from "./PopupMenu";

export function ResourceActionsMenu({
  onSelect,
  onEdit,
  onDelete,
}: {
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-quiet btn-small px-1.5"
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        aria-label="Resource actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.right - 168, y: rect.bottom + 4 });
        }}
      >
        <EllipsisVertical size={16} />
      </button>
      {menu ? (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} width={168} height={128}>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => {
              onSelect();
              setMenu(null);
            }}
          >
            Select
          </button>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => {
              onEdit();
              setMenu(null);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item topic-menu-danger"
            onClick={() => {
              onDelete();
              setMenu(null);
            }}
          >
            Delete
          </button>
        </PopupMenu>
      ) : null}
    </>
  );
}
