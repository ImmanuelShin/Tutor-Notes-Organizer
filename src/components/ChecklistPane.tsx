import { Plus } from "lucide-react";
import type { ChecklistItem } from "../types";
import { uid } from "../lib/worksheet";

export function ChecklistPane({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const patch = (id: string, next: Partial<ChecklistItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...next } : item)));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">A short list for this sitting — materials, homework, next time.</p>
      ) : null}
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.done}
            onChange={(e) => patch(item.id, { done: e.target.checked })}
          />
          <input
            className="field"
            value={item.text}
            placeholder="Item"
            onChange={(e) => patch(item.id, { text: e.target.value })}
            onBlur={() => {
              if (!item.text.trim()) onChange(items.filter((i) => i.id !== item.id));
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-small"
        onClick={() => onChange([...items, { id: uid(), text: "", done: false }])}
      >
        <Plus size={14} /> Add item
      </button>
    </div>
  );
}
