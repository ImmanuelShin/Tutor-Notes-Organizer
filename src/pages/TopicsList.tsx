import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardPaste, ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { createTopic, deleteTopics, listSubjects, listTopics, reorderTopics } from "../db/topics";
import type { Topic } from "../types";
import { parseTags } from "../lib/format";
import { groupTopicsBySubject, subjectGroupLabel } from "../lib/importTables";
import { EmptyState, Modal, PageHeader, SubjectCombobox } from "../components/ui";
import { WindowMenuItems } from "../components/PopupMenu";
import { PasteTable } from "../components/PasteTable";

export function TopicsList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [rows, setRows] = useState<Topic[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [pasting, setPasting] = useState(params.get("paste") === "1");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; topic: Topic } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Topic[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    group: string;
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [over, setOver] = useState<{ group: string; beforeId: number | null } | null>(null);
  const draggingRef = useRef(dragging);
  const overRef = useRef(over);
  const groupsRef = useRef<{ label: string; items: Topic[] }[]>([]);
  const ghostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  draggingRef.current = dragging;
  overRef.current = over;

  const reload = async () => {
    const next = await listTopics({ archived, query });
    setRows(next);
    setSubjects(await listSubjects());
    const alive = new Set(next.map((t) => t.id));
    setSelected((prev) => new Set([...prev].filter((id) => alive.has(id))));
  };

  useEffect(() => {
    void reload();
  }, [archived, query]);

  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
    if (params.get("paste") === "1") setPasting(true);
  }, [params]);

  const closePaste = () => {
    setPasting(false);
    if (params.get("paste")) {
      params.delete("paste");
      setParams(params, { replace: true });
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setTitle("");
    setSubject("");
    if (params.get("new")) {
      params.delete("new");
      setParams(params, { replace: true });
    }
  };

  const submit = async () => {
    if (!title.trim()) return;
    const id = await createTopic({ title, subject });
    closeCreate();
    nav(`/topics/${id}`);
  };

  const visible = useMemo(() => {
    if (subjectFilter === "all") return rows;
    if (subjectFilter === "Unsorted") return rows.filter((t) => !t.subject.trim());
    return rows.filter((t) => t.subject === subjectFilter);
  }, [rows, subjectFilter]);

  const groups = groupTopicsBySubject(visible);
  groupsRef.current = groups;
  const chipSubjects = [
    "all",
    ...subjects,
    ...(rows.some((t) => !t.subject.trim()) ? ["Unsorted"] : []),
  ];
  const visibleIds = visible.map((t) => t.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleIds = (ids: number[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const confirmDelete = (topics: Topic[]) => {
    if (!topics.length) return;
    setMenu(null);
    setPendingDelete(topics);
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    setMenu(null);
  };

  const selectTopic = (topic: Topic) => {
    setSelectMode(true);
    setSelected((prev) => new Set(prev).add(topic.id));
    setMenu(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (pendingDelete || creating || pasting) return;
      if (selectMode) {
        e.preventDefault();
        exitSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, selectMode, pendingDelete, creating, pasting]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menu]);

  const runDelete = async () => {
    if (!pendingDelete?.length) return;
    setDeleting(true);
    try {
      await deleteTopics(pendingDelete.map((t) => t.id));
      setPendingDelete(null);
      setSelected(new Set());
      setSelectMode(false);
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  const selectedTopics = rows.filter((t) => selected.has(t.id));
  const canDrag = !query.trim();
  const draggedTopic = dragging ? rows.find((t) => t.id === dragging.id) : null;

  const startDrag = (
    e: ReactPointerEvent,
    groupLabel: string,
    topicId: number,
    card: HTMLElement,
  ) => {
    if (!canDrag || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = card.getBoundingClientRect();
    setOver(null);
    setDragging({
      group: groupLabel,
      id: topicId,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    });
  };

  const dropOn = async (groupLabel: string, items: Topic[], beforeId: number | null) => {
    const current = draggingRef.current;
    if (!current || current.group !== groupLabel) return;
    const ids = items.map((t) => t.id);
    const nextIds = moveIdBefore(ids, current.id, beforeId);
    setDragging(null);
    setOver(null);
    if (nextIds.every((id, i) => id === ids[i])) return;
    setRows((prev) => applyGroupOrder(prev, groupLabel, nextIds));
    await reorderTopics(nextIds);
  };

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const hitBeforeId = (x: number, y: number, group: string): number | null | undefined => {
      const node = document.elementFromPoint(x, y)?.closest("[data-drop-topic]") as HTMLElement | null;
      if (!node || node.dataset.dropGroup !== group) return undefined;
      if (node.dataset.dropTopic === "end") return null;
      const id = Number(node.dataset.dropTopic);
      return Number.isFinite(id) ? id : undefined;
    };

    const onMove = (e: PointerEvent) => {
      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.left = `${e.clientX - dragging.offsetX}px`;
        ghost.style.top = `${e.clientY - dragging.offsetY}px`;
      }
      const beforeId = hitBeforeId(e.clientX, e.clientY, dragging.group);
      if (beforeId === undefined) return;
      const next = { group: dragging.group, beforeId };
      const prev = overRef.current;
      if (prev?.group === next.group && prev.beforeId === next.beforeId) return;
      setOver(next);
    };

    const onUp = (e: PointerEvent) => {
      const current = draggingRef.current;
      if (!current) return;
      const group = groupsRef.current.find((g) => g.label === current.group);
      const beforeId = hitBeforeId(e.clientX, e.clientY, current.group);
      const target = beforeId === undefined ? overRef.current?.beforeId : beforeId;
      if (group && target !== undefined) {
        void dropOn(current.group, group.items, target);
      } else {
        setDragging(null);
        setOver(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Topic templates"
        subtitle="Grouped by subject. Drag the grip to reorder. Right-click a topic to select or delete."
        actions={
          <>
            <input
              className="field w-56"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Archived
            </label>
            <button type="button" className="btn" onClick={() => setPasting(true)}>
              <ClipboardPaste size={16} /> Paste table
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New topic
            </button>
          </>
        }
      />

      {rows.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {chipSubjects.map((name) => (
            <button
              key={name}
              type="button"
              className={`btn btn-small ${subjectFilter === name ? "btn-primary" : ""}`}
              onClick={() => setSubjectFilter(name)}
            >
              {name === "all" ? "All subjects" : name}
            </button>
          ))}
        </div>
      ) : null}

      {selectMode && visible.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() => toggleIds(visibleIds, !allVisibleSelected)}
            />
            Select all{subjectFilter !== "all" ? ` in ${subjectFilter}` : ""}
          </label>
          {selected.size > 0 ? (
            <>
              <span className="text-sm text-[var(--ink-muted)]">
                {selected.size} selected
              </span>
              <button type="button" className="btn btn-small" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => confirmDelete(selectedTopics)}
              >
                <Trash2 size={14} /> Delete selected
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-small ml-auto" onClick={exitSelect}>
            Done
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? archived
                ? "No archived topics"
                : "No templates yet"
              : "Nothing in this subject"
          }
          body={
            rows.length === 0
              ? "Build a topic once, then apply it to any student. Goal checkoffs stay per person; the template stays shared."
              : "Try All subjects, or create a template in this group."
          }
          action={
            !archived ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => setPasting(true)}>
                  Paste table
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  Create a template
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupIds = group.items.map((t) => t.id);
            const groupAll = groupIds.every((id) => selected.has(id));
            const isCollapsed = !expanded.has(group.label);
            return (
              <section key={group.label}>
                <div className="mb-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="-mx-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-[var(--bg-hover)]"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.label)) next.delete(group.label);
                        else next.add(group.label);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <h2 className="text-lg">{group.label}</h2>
                    <span className="text-sm text-[var(--ink-muted)]">
                      {group.items.length}
                    </span>
                  </button>
                  {selectMode ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() => toggleIds(groupIds, !groupAll)}
                    >
                      {groupAll ? "Deselect" : "Select"} group
                    </button>
                  ) : null}
                </div>
                {isCollapsed ? null : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((t) => (
                    <div
                      key={t.id}
                      data-drop-topic={t.id}
                      data-drop-group={group.label}
                      className={`topic-card card flex items-start gap-3 px-4 py-3 ${
                        selectMode && selected.has(t.id) ? "ring-1 ring-[var(--accent)]" : ""
                      } ${dragging?.id === t.id ? "topic-dragging" : ""} ${
                        over?.group === group.label && over.beforeId === t.id && dragging?.id !== t.id
                          ? "topic-drop-before"
                          : ""
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const pad = 8;
                        const w = 168;
                        const h = 220;
                        setMenu({
                          x: Math.min(e.clientX, window.innerWidth - w - pad),
                          y: Math.min(e.clientY, window.innerHeight - h - pad),
                          topic: t,
                        });
                      }}
                    >
                      {canDrag ? (
                        <span
                          className="topic-drag-handle mt-0.5"
                          title="Drag to reorder"
                          aria-label={`Reorder ${t.title}`}
                          onPointerDown={(e) => {
                            const card = e.currentTarget.closest(".topic-card");
                            if (card instanceof HTMLElement) startDrag(e, group.label, t.id, card);
                          }}
                        >
                          <GripVertical size={16} />
                        </span>
                      ) : null}
                      {selectMode ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                          aria-label={`Select ${t.title}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => nav(`/topics/${t.id}`)}
                      >
                        <TopicPreview topic={t} />
                      </button>
                    </div>
                  ))}
                  {canDrag && dragging?.group === group.label ? (
                    <div
                      data-drop-topic="end"
                      data-drop-group={group.label}
                      className={`topic-drop-end sm:col-span-2 ${
                        over?.group === group.label && over.beforeId === null ? "topic-drop-end-active" : ""
                      }`}
                    >
                      Drop at end
                    </div>
                  ) : null}
                </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {dragging && draggedTopic ? (
        <div
          ref={ghostRef}
          className="topic-drag-ghost card flex items-start gap-3 px-4 py-3"
          style={{
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            width: dragging.width,
            minHeight: dragging.height,
          }}
        >
          <span className="topic-drag-handle mt-0.5">
            <GripVertical size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <TopicPreview topic={draggedTopic} />
          </div>
        </div>
      ) : null}

      {menu ? (
        <div
          ref={menuRef}
          className="topic-menu card py-1"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => {
              setMenu(null);
              nav(`/topics/${menu.topic.id}`);
            }}
          >
            Open
          </button>
          <WindowMenuItems
            route={`/topics/${menu.topic.id}`}
            title={menu.topic.title}
            kind="topic"
            id={menu.topic.id}
            onDone={() => setMenu(null)}
          />
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => selectTopic(menu.topic)}
          >
            Select
          </button>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item topic-menu-danger"
            onClick={() => confirmDelete([menu.topic])}
          >
            Delete
          </button>
        </div>
      ) : null}

      {pasting ? (
        <Modal title="Paste table from Sheets" onClose={closePaste} wide>
          <PasteTable
            lockedEntity="topics"
            onImported={() => {
              void reload();
            }}
          />
        </Modal>
      ) : null}

      {creating ? (
        <Modal title="New topic template" onClose={closeCreate}>
          <div className="space-y-3">
            <label className="block text-sm">
              Title
              <input
                className="field mt-1"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </label>
            <label className="block text-sm">
              Subject
              <SubjectCombobox value={subject} onChange={setSubject} subjects={subjects} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn" onClick={closeCreate}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()}>
                Create
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal title="Delete topics" onClose={() => setPendingDelete(null)}>
          <p className="text-sm text-[var(--ink-muted)]">
            This permanently removes{" "}
            {pendingDelete.length === 1
              ? `“${pendingDelete[0].title}”`
              : `${pendingDelete.length} topics`}
            , including units, goals, and examples, and unapplies them from students. This cannot be
            undone.
          </p>
          {pendingDelete.length > 1 ? (
            <ul className="mt-3 max-h-40 overflow-auto text-sm">
              {pendingDelete.map((t) => (
                <li key={t.id}>
                  {t.title}
                  {t.subject ? ` · ${t.subject}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleting}
              onClick={() => void runDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TopicPreview({ topic }: { topic: Topic }) {
  return (
    <>
      <div className="font-medium">{topic.title}</div>
      <div className="mt-1 text-sm text-[var(--ink-muted)]">
        {typeof topic.sub_unit_count === "number"
          ? `${topic.sub_unit_count} sub-unit${topic.sub_unit_count === 1 ? "" : "s"}`
          : topic.subject || "Topic"}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {parseTags(topic.tags).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
    </>
  );
}

function moveIdBefore(ids: number[], fromId: number, beforeId: number | null): number[] {
  if (beforeId === fromId) return ids;
  const from = ids.indexOf(fromId);
  if (from < 0) return ids;
  const next = ids.filter((id) => id !== fromId);
  if (beforeId == null) return [...next, fromId];
  const to = next.indexOf(beforeId);
  if (to < 0) return [...next, fromId];
  next.splice(to, 0, fromId);
  return next;
}

function applyGroupOrder(all: Topic[], groupLabel: string, orderedIds: number[]): Topic[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const start = all.findIndex((t) => subjectGroupLabel(t.subject) === groupLabel);
  if (start < 0) return all;
  let count = 0;
  for (let i = start; i < all.length && subjectGroupLabel(all[i].subject) === groupLabel; i++) {
    count += 1;
  }
  const reordered = orderedIds.map((id) => byId.get(id)).filter((t): t is Topic => Boolean(t));
  return [...all.slice(0, start), ...reordered, ...all.slice(start + count)];
}
