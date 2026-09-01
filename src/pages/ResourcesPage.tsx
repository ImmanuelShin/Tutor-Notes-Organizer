import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FilePlus, Image as ImageIcon, Link2, Plus } from "lucide-react";
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
import { ConfirmButton, EmptyState, Modal, PageHeader, TagInput } from "../components/ui";
import { ResourceRow } from "../components/ResourceRow";
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
    <div>
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

      <div className="mb-4 flex flex-wrap gap-2">
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
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              trailing={
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      if (r.type === "link") setEditing(r);
                      else nav(`/resources/${r.id}`);
                    }}
                  >
                    Edit
                  </button>
                  <ConfirmButton
                    danger
                    label="Delete"
                    confirm="Confirm"
                    onConfirm={() => void deleteResource(r.id).then(reload)}
                  />
                </div>
              }
            />
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
