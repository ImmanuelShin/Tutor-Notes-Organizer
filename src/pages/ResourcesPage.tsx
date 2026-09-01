import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FilePlus, Image as ImageIcon, LayoutGrid, Link2, List, Plus, Trash2 } from "lucide-react";
import {
  createResource,
  deleteResource,
  getResource,
  listResources,
  listStudentsWithOwnedResources,
  updateResource,
} from "../db/resources";
import {
  clipboardImageFiles,
  importClipboardImages,
  importPaths,
  pickImagePaths,
  pickPdfPaths,
} from "../lib/importFiles";
import type { Resource, ResourceType } from "../types";
import { parseTags, serializeTags } from "../lib/format";
import { EmptyState, Modal, PageHeader, TagInput } from "../components/ui";
import { ResourceRow } from "../components/ResourceRow";
import { ResourcePreviewCard } from "../components/ResourcePreviewCard";
import { RichEditor } from "../components/RichEditor";

const FILTERS: Array<{ id: ResourceType | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "pdf", label: "PDFs" },
  { id: "image", label: "Images" },
  { id: "link", label: "Links" },
  { id: "lecture_note", label: "Lecture notes" },
];

export function ResourcesPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResourceType | "all">("all");
  const [studentsMode, setStudentsMode] = useState(false);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [owners, setOwners] = useState<{ id: number; name: string; subject: string }[]>([]);
  const [rows, setRows] = useState<Resource[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [view, setView] = useState<"list" | "preview">("list");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Resource[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    if (!studentsMode) {
      setRows(await listResources({ type: filter, query }));
      return;
    }
    const students = await listStudentsWithOwnedResources();
    setOwners(students);
    const selected =
      ownerId && students.some((s) => s.id === ownerId) ? ownerId : (students[0]?.id ?? null);
    if (selected !== ownerId) setOwnerId(selected);
    if (!selected) {
      setRows([]);
      return;
    }
    setRows(await listResources({ type: filter, query, ownerStudentId: selected }));
  };

  useEffect(() => {
    void reload();
  }, [filter, query, studentsMode, ownerId]);

  useEffect(() => {
    const openId = params.get("open");
    if (!openId) return;
    nav(`/resources/${openId}`, { replace: true });
  }, [params, nav]);

  useEffect(() => {
    if (studentsMode) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") setDropActive(true);
        if (event.payload.type === "leave") setDropActive(false);
        if (event.payload.type === "drop") {
          setDropActive(false);
          void importPaths(event.payload.paths).then(() => reload());
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [filter, query, studentsMode]);

  const pickPdf = async () => {
    await importPaths(await pickPdfPaths());
    await reload();
  };

  const pickImages = async () => {
    const paths = await pickImagePaths();
    const ids = await importPaths(paths);
    if (paths.length === 1 && ids[0]) nav(`/resources/${ids[0]}`);
    else await reload();
  };

  useEffect(() => {
    if (studentsMode) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = clipboardImageFiles(e);
      if (!files.length) return;
      e.preventDefault();
      void (async () => {
        const ids = await importClipboardImages(files);
        if (files.length === 1 && ids[0]) nav(`/resources/${ids[0]}`);
        else await reload();
      })();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [filter, query, nav, studentsMode]);

  const closeEditor = () => {
    setEditing(null);
    if (params.get("open")) {
      params.delete("open");
      setParams(params, { replace: true });
    }
    void reload();
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (select: boolean) => {
    setSelected(select ? new Set(rows.map((r) => r.id)) : new Set());
  };

  const enterSelect = (resource: Resource) => {
    setSelectMode(true);
    setSelected((prev) => new Set(prev).add(resource.id));
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const editResource = (resource: Resource) => {
    if (resource.type === "link") setEditing(resource);
    else nav(`/resources/${resource.id}`);
  };

  const confirmDelete = (resources: Resource[]) => {
    if (!resources.length) return;
    setPendingDelete(resources);
  };

  const runDelete = async () => {
    if (!pendingDelete?.length) return;
    setDeleting(true);
    try {
      for (const resource of pendingDelete) {
        await deleteResource(resource.id);
      }
      setPendingDelete(null);
      exitSelect();
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const alive = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingDelete || editing || linkOpen || noteOpen) return;
      if (selectMode) {
        e.preventDefault();
        exitSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, pendingDelete, editing, linkOpen, noteOpen]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const resourceActions = (resource: Resource) => ({
    selectMode,
    selected: selected.has(resource.id),
    onToggleSelect: () => toggle(resource.id),
    onSelect: () => enterSelect(resource),
    onEdit: () => editResource(resource),
    onDelete: () => confirmDelete([resource]),
  });

  const emptyTitle = studentsMode
    ? owners.length === 0
      ? "No student files"
      : "Nothing matches"
    : "The shelf is empty";
  const emptyBody = studentsMode
    ? owners.length === 0
      ? "Drop PDFs or images on a student page. They show up here once you pick that student."
      : "Try another student or type filter."
    : "Import a PDF or image, paste a screenshot, save a weblink, or start a lecture note.";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Resources"
        subtitle="PDFs and images stay in the app library. Paste a screenshot with Ctrl+V, or drop files on this page."
        actions={
          <>
            <input
              className="field w-48"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="btn" onClick={() => void pickPdf()}>
              <FilePlus size={16} /> PDF
            </button>
            <button type="button" className="btn" onClick={() => void pickImages()}>
              <ImageIcon size={16} /> Image
            </button>
            <button type="button" className="btn" onClick={() => setLinkOpen(true)}>
              <Link2 size={16} /> Link
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setNoteOpen(true)}>
              <Plus size={16} /> Lecture note
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn-small ${filter === f.id ? "btn-primary" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          className={`btn btn-small ${studentsMode ? "btn-primary" : ""}`}
          onClick={() => {
            setStudentsMode((on) => !on);
            setOwnerId(null);
          }}
        >
          Students
        </button>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            className={`btn btn-small ${view === "list" ? "btn-primary" : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >
            <List size={14} />
            List
          </button>
          <button
            type="button"
            className={`btn btn-small ${view === "preview" ? "btn-primary" : ""}`}
            onClick={() => setView("preview")}
            title="Preview view"
          >
            <LayoutGrid size={14} />
            Preview
          </button>
        </span>
      </div>

      {studentsMode ? (
        owners.length === 0 ? null : (
          <div className="mb-4 flex flex-wrap gap-2">
            {owners.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`btn btn-small ${ownerId === s.id ? "btn-primary" : ""}`}
                onClick={() => setOwnerId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )
      ) : null}

      {dropActive ? (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-8 text-center">
          Drop PDFs or images to add them to the library
        </div>
      ) : null}

      {selectMode && rows.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => toggleAll(!allSelected)}
            />
            Select all
          </label>
          {selected.size > 0 ? (
            <>
              <span className="text-sm text-[var(--ink-muted)]">{selected.size} selected</span>
              <button type="button" className="btn btn-small" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => confirmDelete(selectedRows)}
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

      {rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          body={emptyBody}
          action={
            studentsMode ? undefined : (
              <button type="button" className="btn btn-primary" onClick={() => void pickPdf()}>
                Add a PDF
              </button>
            )
          }
        />
      ) : view === "preview" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {rows.map((r) => (
            <ResourcePreviewCard key={r.id} resource={r} {...resourceActions(r)} />
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <ResourceRow key={r.id} resource={r} {...resourceActions(r)} />
          ))}
        </div>
      )}

      {linkOpen ? (
        <LinkModal
          onClose={() => {
            setLinkOpen(false);
            void reload();
          }}
        />
      ) : null}
      {noteOpen ? (
        <NoteCreateModal
          onClose={() => {
            setNoteOpen(false);
            void reload();
          }}
          onCreated={(row) => {
            setNoteOpen(false);
            nav(`/resources/${row.id}`);
          }}
        />
      ) : null}
      {editing ? <ResourceEditor resource={editing} onClose={closeEditor} /> : null}
      {pendingDelete ? (
        <Modal title="Delete resources" onClose={() => !deleting && setPendingDelete(null)}>
          <p className="text-sm text-[var(--ink-muted)]">
            This permanently removes{" "}
            {pendingDelete.length === 1
              ? `“${pendingDelete[0].title}”`
              : `${pendingDelete.length} resources`}
            {pendingDelete.some((r) => r.file_path) ? ", including stored files" : ""}. This cannot be
            undone.
          </p>
          {pendingDelete.length > 1 ? (
            <ul className="mt-3 max-h-40 overflow-auto text-sm">
              {pendingDelete.map((r) => (
                <li key={r.id}>{r.title}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
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

function LinkModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("https://");
  const [tags, setTags] = useState<string[]>([]);

  const save = async () => {
    if (!title.trim() || !url.trim()) return;
    await createResource({ type: "link", title, url, tags: serializeTags(tags) });
    onClose();
  };

  return (
    <Modal title="New weblink" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm">
          Title
          <input className="field mt-1" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          URL
          <input className="field mt-1" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="text-sm">
          Tags
          <div className="mt-1">
            <TagInput value={tags} onChange={setTags} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NoteCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: Resource) => void;
}) {
  const [title, setTitle] = useState("");

  const save = async () => {
    if (!title.trim()) return;
    const id = await createResource({ type: "lecture_note", title });
    const row = await getResource(id);
    if (row) onCreated(row);
    else onClose();
  };

  return (
    <Modal title="New lecture note" onClose={onClose}>
      <label className="block text-sm">
        Title
        <input
          className="field mt-1"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          Create
        </button>
      </div>
    </Modal>
  );
}

function ResourceEditor({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [title, setTitle] = useState(resource.title);
  const [url, setUrl] = useState(resource.url ?? "");
  const [tags, setTags] = useState(parseTags(resource.tags));

  const save = async () => {
    await updateResource(resource.id, {
      title,
      url: resource.type === "link" ? url : resource.url,
      tags: serializeTags(tags),
    });
    onClose();
  };

  return (
    <Modal
      title={resource.type === "lecture_note" ? "Lecture note" : "Edit resource"}
      onClose={onClose}
      wide={resource.type === "lecture_note"}
    >
      <div className="space-y-3">
        <label className="block text-sm">
          Title
          <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {resource.type === "link" ? (
          <label className="block text-sm">
            URL
            <input className="field mt-1" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        ) : null}
        <div className="text-sm">
          Tags
          <div className="mt-1">
            <TagInput value={tags} onChange={setTags} />
          </div>
        </div>
        {resource.type === "lecture_note" ? (
          <RichEditor
            key={resource.id}
            initialJson={resource.body}
            placeholder="Lecture notes — paste figures, write the outline…"
            onChange={(body) => void updateResource(resource.id, { body })}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
