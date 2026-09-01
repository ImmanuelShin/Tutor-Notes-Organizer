import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ClipboardList, FileStack, Plus, Upload, User } from "lucide-react";
import { searchAll } from "../db/search";
import type { SearchHit } from "../types";
import { cn } from "../lib/format";

type Action = {
  id: string;
  title: string;
  hint: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);

  const actions: Action[] = useMemo(
    () => [
      {
        id: "students",
        title: "Go to students",
        hint: "Ctrl+1",
        run: () => nav("/students"),
      },
      {
        id: "topics",
        title: "Go to topic templates",
        hint: "Ctrl+2",
        run: () => nav("/topics"),
      },
      {
        id: "templates",
        title: "Go to templates",
        hint: "Ctrl+3",
        run: () => nav("/templates"),
      },
      {
        id: "resources",
        title: "Go to resources",
        hint: "Ctrl+4",
        run: () => nav("/resources"),
      },
      {
        id: "new-student",
        title: "New student",
        hint: "",
        run: () => nav("/students?new=1"),
      },
      {
        id: "paste-topics",
        title: "Paste a topic table",
        hint: "",
        run: () => nav("/topics?paste=1"),
      },
      {
        id: "new-topic",
        title: "New topic template",
        hint: "",
        run: () => nav("/topics?new=1"),
      },
      {
        id: "new-template",
        title: "New checklist template",
        hint: "",
        run: () => nav("/templates?new=1"),
      },
    ],
    [nav],
  );

  const filteredActions = actions.filter((a) =>
    a.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const items: Array<{ key: string; title: string; subtitle: string; run: () => void }> = [
    ...hits.map((h) => ({
      key: `${h.kind}-${h.id}`,
      title: h.title,
      subtitle: h.kind === "student" ? h.subtitle : h.kind === "topic" ? h.subtitle : h.subtitle,
      run: () => {
        if (h.kind === "student") nav(`/students/${h.id}`);
        else if (h.kind === "topic") nav(`/topics/${h.id}`);
        else if (h.kind === "template") nav(`/templates/${h.id}`);
        else nav(`/resources/${h.id}`);
      },
    })),
    ...filteredActions.map((a) => ({
      key: a.id,
      title: a.title,
      subtitle: a.hint || "Command",
      run: a.run,
    })),
  ];

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setIndex(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchAll(q).then((rows) => {
        if (!cancelled) setHits(rows);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, open]);

  useEffect(() => {
    setIndex(0);
  }, [query, hits.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[index];
        if (item) {
          item.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, index, onClose]);

  if (!open) return null;

  const iconFor = (key: string) => {
    if (key.startsWith("student")) return <User size={16} />;
    if (key.startsWith("topic")) return <BookOpen size={16} />;
    if (key.startsWith("template")) return <ClipboardList size={16} />;
    if (key.startsWith("resource")) return <FileStack size={16} />;
    if (key.includes("new")) return <Plus size={16} />;
    if (key === "paste-topics") return <Upload size={16} />;
    return <BookOpen size={16} />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        className="card w-full max-w-xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full border-0 border-b border-[var(--line)] bg-transparent px-4 py-3 text-base outline-none"
          placeholder="Search students, topics, templates, resources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No matches.</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left",
                  i === index && "bg-[var(--bg-hover)]",
                )}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span className="text-[var(--ink-muted)]">{iconFor(item.key)}</span>
                <span className="flex-1">{item.title}</span>
                <span className="text-xs text-[var(--ink-muted)]">{item.subtitle}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-3 border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--ink-muted)]">
          <span>
            <span className="kbd">↑↓</span> move
          </span>
          <span>
            <span className="kbd">Enter</span> open
          </span>
          <span>
            <span className="kbd">Esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
