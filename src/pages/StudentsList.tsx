import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import { createStudent, listStudents, updateStudent } from "../db/students";
import type { Student } from "../types";
import { formatDate, initials, parseTags } from "../lib/format";
import { EmptyState, Modal, PageHeader } from "../components/ui";
import { PopupMenu, WindowMenuItems } from "../components/PopupMenu";
import { StudentInfoModal } from "../components/StudentInfoModal";

export function StudentsList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<Student[]>([]);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);

  const reload = async () => {
    setRows(await listStudents({ archived, query }));
  };

  useEffect(() => {
    void reload();
  }, [archived, query]);

  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
  }, [params]);

  const closeCreate = () => {
    setCreating(false);
    setName("");
    setSubject("");
    if (params.get("new")) {
      params.delete("new");
      setParams(params, { replace: true });
    }
  };

  const submit = async () => {
    if (!name.trim()) return;
    const id = await createStudent({ name, subject });
    closeCreate();
    nav(`/students/${id}`);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Students"
        subtitle="One page per person — notes, sessions, and a workspace."
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
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New student
            </button>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={archived ? "No archived students" : "No students yet"}
          body="Add someone you tutor, or import names from a Google Sheets export."
          action={
            !archived ? (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                Add a student
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2">
          {rows.map((s) => (
            <div
              key={s.id}
              className="card flex items-center gap-4 px-4 py-3 hover:bg-[var(--bg-hover)]"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, student: s });
              }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
                onClick={() => nav(`/students/${s.id}`)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm text-[var(--accent)]">
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-sm text-[var(--ink-muted)]">
                    {[s.subject, s.level].filter(Boolean).join(" · ") || "No subject yet"}
                    {s.last_session ? ` · last session ${formatDate(s.last_session)}` : ""}
                  </span>
                </span>
                <span className="hidden flex-wrap gap-1 sm:flex">
                  {parseTags(s.tags).slice(0, 3).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-small shrink-0"
                title="Edit student"
                onClick={() => setEditing(s)}
              >
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {menu ? (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} height={128}>
          <button
            type="button"
            role="menuitem"
            className="topic-menu-item"
            onClick={() => {
              setEditing(menu.student);
              setMenu(null);
            }}
          >
            Edit
          </button>
          <WindowMenuItems
            route={`/students/${menu.student.id}`}
            title={menu.student.name}
            kind="student"
            id={menu.student.id}
            onDone={() => setMenu(null)}
          />
        </PopupMenu>
      ) : null}

      {editing ? (
        <StudentInfoModal
          student={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateStudent(editing.id, patch);
            await reload();
          }}
        />
      ) : null}

      {creating ? (
        <Modal title="New student" onClose={closeCreate}>
          <div className="space-y-3">
            <label className="block text-sm">
              Name
              <input
                className="field mt-1"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </label>
            <label className="block text-sm">
              Subject / course
              <input
                className="field mt-1"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
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
    </div>
  );
}
