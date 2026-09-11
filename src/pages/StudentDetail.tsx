import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Play, Square } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { getStudent, updateStudent } from "../db/students";
import { createSession, deleteSession, listSessions, updateSession } from "../db/sessions";
import { listTopics } from "../db/topics";
import {
  linkResource,
  listLinkedResources,
  listResources,
  unlinkResource,
} from "../db/resources";
import { EMPTY_DOC, type PagePanel, type Resource, type Session, type Student, type Template, type Topic, type Worksheet, type Workspace } from "../types";
import { formatDateTime, formatRelativeTime, isEmptyDoc, nowLocalInput, parseTags, serializeTags, toLocalInput } from "../lib/format";
import { groupTopicsBySubject } from "../lib/importTables";
import {
  listActiveTopics,
  recordsFromTopicGroup,
  appendTemplateRows,
  emptyWorksheet,
  sessionDurationMinutes,
  sessionNoteRange,
  suggestedSessionNotes,
} from "../lib/worksheet";
import {
  activeTab,
  addWorkspaceTab,
  deleteExtraWorkspace,
  emptyWorkspace,
  extraWorkspace,
  parseWorkspace,
  serializeWorkspace,
  setExtraWorkspace,
  setRowDoneInWorkspace,
  updateWorkspaceTab,
  workspaceNoteBoxes,
  workspaceTables,
} from "../lib/workspace";
import { applyChecklistToWorkspace } from "../lib/templates";
import {
  addPanel,
  defaultPageLayout,
  NEW_PANEL_H,
  NEW_PANEL_W,
  newMediaPanelId,
  newWorkspacePanelId,
  panelLabel,
  parsePageLayout,
  placeInView,
  serializePageLayout,
} from "../lib/pageLayout";
import { listTemplates } from "../db/templates";
import { ConfirmButton, Modal, PageHeader, TagInput } from "../components/ui";
import { RichEditor } from "../components/RichEditor";
import { ResourceRow } from "../components/ResourceRow";
import { AttachResourceModal } from "../components/AttachResourceModal";
import { CanvasMediaPicker } from "../components/CanvasMediaPicker";
import { ResourceFileView } from "../components/ResourceFileView";
import { StudentAssignments } from "../components/StudentAssignments";
import { StudentWorkspace } from "../components/StudentWorkspace";
import { StudentCanvas } from "../components/StudentCanvas";
import { StudentInfoModal } from "../components/StudentInfoModal";
import { setAppWindowTitle, canOpenOnCanvas, openStudentFile } from "../lib/windows";

export function StudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { syncNow, studentFileOpen } = useSettings();
  const studentId = Number(id);
  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [assignments, setAssignments] = useState<Resource[]>([]);
  const [sessionOpen, setSessionOpen] = useState<Session | "new" | null>(null);
  const [sessionDraft, setSessionDraft] = useState<{
    notes: string;
    occurred: string;
    duration: string;
    clearStartOnSave: boolean;
  } | null>(null);
  const [importOpen, setImportOpen] = useState<"table" | "checklist" | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [mediaPickOpen, setMediaPickOpen] = useState(false);
  const [quietOpen, setQuietOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [layout, setLayout] = useState(defaultPageLayout);
  const saveTimer = useRef<number | null>(null);
  const layoutTimer = useRef<number | null>(null);
  const workspaceRef = useRef(workspace);
  const layoutRef = useRef(layout);
  const dirtyRef = useRef(false);
  const layoutDirtyRef = useRef(false);
  const loadedRef = useRef(false);
  const importTargetRef = useRef("workspace");
  workspaceRef.current = workspace;
  layoutRef.current = layout;

  const refreshAssignments = useCallback(() => {
    void listResources({ ownerStudentId: studentId }).then(setAssignments);
  }, [studentId]);

  const reload = async (opts?: { includeWorksheet?: boolean }) => {
    const row = await getStudent(studentId);
    setStudent(row);
    if (!row) return;
    void setAppWindowTitle(row.name);
    if (opts?.includeWorksheet) {
      setWorkspace(parseWorkspace(row.worksheet));
      setLayout(parsePageLayout(row.page_layout));
      dirtyRef.current = false;
      layoutDirtyRef.current = false;
      loadedRef.current = true;
    }
    setSessions(await listSessions(studentId));
    setResources(await listLinkedResources({ studentId }));
    setAssignments(await listResources({ ownerStudentId: studentId }));
  };

  useEffect(() => {
    loadedRef.current = false;
    dirtyRef.current = false;
    void reload({ includeWorksheet: true });
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (layoutTimer.current) window.clearTimeout(layoutTimer.current);
      if (loadedRef.current && (dirtyRef.current || layoutDirtyRef.current)) {
        void updateStudent(studentId, {
          ...(dirtyRef.current ? { worksheet: serializeWorkspace(workspaceRef.current) } : {}),
          ...(layoutDirtyRef.current ? { page_layout: serializePageLayout(layoutRef.current) } : {}),
        });
      }
    };
  }, [studentId]);

  const persistLayout = (next: typeof layout) => {
    layoutDirtyRef.current = true;
    layoutRef.current = next;
    setLayout(next);
    schedulePersist();
  };

  const persistWorkspace = (next: Workspace) => {
    dirtyRef.current = true;
    workspaceRef.current = next;
    setWorkspace(next);
    schedulePersist();
  };

  const persistPanelWorkspace = (panelId: string, next: Workspace) => {
    if (panelId === "workspace") {
      persistWorkspace({ ...next, extras: workspaceRef.current.extras });
      return;
    }
    persistWorkspace(setExtraWorkspace(workspaceRef.current, panelId, next));
  };

  const addWorkspaceAt = () => {
    const id = newWorkspacePanelId();
    const pos = placeInView(layoutRef.current);
    persistWorkspace(setExtraWorkspace(workspaceRef.current, id, emptyWorkspace()));
    persistLayout(
      addPanel(layoutRef.current, {
        id,
        kind: "workspace",
        x: pos.x,
        y: pos.y,
        w: NEW_PANEL_W,
        h: NEW_PANEL_H,
        z: 1,
      }),
    );
  };

  const openMediaOnCanvas = (resource: Resource) => {
    if (resource.type !== "pdf" && resource.type !== "image") return;
    const pos = placeInView(layoutRef.current);
    persistLayout(
      addPanel(layoutRef.current, {
        id: newMediaPanelId(),
        kind: "media",
        resourceId: resource.id,
        x: pos.x,
        y: pos.y,
        w: NEW_PANEL_W,
        h: NEW_PANEL_H,
        z: 1,
      }),
    );
  };

  const openStudentResource = (resource: Resource) => {
    openStudentFile(resource, {
      mode: studentFileOpen,
      onCanvas: () => openMediaOnCanvas(resource),
    });
  };

  const lookupResource = (resourceId?: number) =>
    resources.find((r) => r.id === resourceId) ?? assignments.find((r) => r.id === resourceId) ?? null;

  const schedulePersist = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (layoutTimer.current) window.clearTimeout(layoutTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const patch: Parameters<typeof updateStudent>[1] = {};
      if (dirtyRef.current) patch.worksheet = serializeWorkspace(workspaceRef.current);
      if (layoutDirtyRef.current) patch.page_layout = serializePageLayout(layoutRef.current);
      dirtyRef.current = false;
      layoutDirtyRef.current = false;
      if (patch.worksheet !== undefined || patch.page_layout !== undefined) {
        void updateStudent(studentId, patch);
      }
    }, 350);
  };

  const importGroup = async (topics: Topic[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const records = await recordsFromTopicGroup(topics.map((t) => t.id));
    const panelId = importTargetRef.current;
    let space = panelId === "workspace" ? workspaceRef.current : extraWorkspace(workspaceRef.current, panelId);
    let target = activeTab(space);
    if (target.kind !== "table") {
      const existing = space.tabs.find((t) => t.kind === "table");
      if (existing) {
        space = { ...space, activeTabId: existing.id };
        target = existing;
      } else {
        space = addWorkspaceTab(space, "table");
        target = activeTab(space);
      }
    }
    const next = updateWorkspaceTab(space, target.id, {
      table: appendTemplateRows(target.table ?? emptyWorksheet(), records),
    });
    persistPanelWorkspace(panelId, next);
    dirtyRef.current = false;
    await updateStudent(studentId, { worksheet: serializeWorkspace(workspaceRef.current) });
  };

  const importChecklist = async (template: Template) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const panelId = importTargetRef.current;
    const current = panelId === "workspace" ? workspaceRef.current : extraWorkspace(workspaceRef.current, panelId);
    persistPanelWorkspace(panelId, applyChecklistToWorkspace(current, template));
    dirtyRef.current = false;
    await updateStudent(studentId, { worksheet: serializeWorkspace(workspaceRef.current) });
  };

  if (!student) {
    return <p className="text-[var(--ink-muted)]">Student not found.</p>;
  }

  const persistStudent = async (patch: Parameters<typeof updateStudent>[1]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (layoutTimer.current) window.clearTimeout(layoutTimer.current);
    const next = {
      ...patch,
      ...(dirtyRef.current ? { worksheet: serializeWorkspace(workspaceRef.current) } : {}),
      ...(layoutDirtyRef.current ? { page_layout: serializePageLayout(layoutRef.current) } : {}),
    };
    dirtyRef.current = false;
    layoutDirtyRef.current = false;
    await updateStudent(student.id, next);
  };

  const saveField = async (patch: Parameters<typeof updateStudent>[1]) => {
    await persistStudent(patch);
    await reload();
  };

  const tables = workspaceTables(workspace);
  const noteBoxes = workspaceNoteBoxes(workspace);
  const sessionStartedAt = student.session_started_at || null;
  const sessionLive = Boolean(sessionStartedAt);

  const openSessionDraft = (clearStartOnSave: boolean) => {
    const now = new Date();
    const range = sessionNoteRange({
      startedAt: clearStartOnSave ? sessionStartedAt : null,
      now,
      ws: tables,
      notes: noteBoxes,
    });
    const duration = sessionStartedAt && clearStartOnSave
      ? sessionDurationMinutes(range.from, range.to)
      : 60;
    const occurred = sessionStartedAt && clearStartOnSave
      ? toLocalInput(range.from)
      : nowLocalInput();
    setSessionDraft({
      notes: suggestedSessionNotes(tables, range, noteBoxes),
      occurred,
      duration: String(duration),
      clearStartOnSave,
    });
    setSessionOpen("new");
  };

  return (
    <div className="student-page">
      <div className="student-page-chrome">
        <button type="button" className="btn btn-quiet btn-small mb-2" onClick={() => nav("/students")}>
          <ArrowLeft size={14} /> All students
        </button>
        <PageHeader
          title={student.name}
          subtitle={[student.subject, student.level].filter(Boolean).join(" · ") || "Add a subject"}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setInfoOpen(true)}>
                <Pencil size={16} /> Edit
              </button>
              <ConfirmButton
                label={student.archived ? "Unarchive" : "Archive"}
                confirm="Click again to confirm"
                onConfirm={() => void saveField({ archived: student.archived ? 0 : 1 })}
              />
              {sessionLive ? (
                <>
                  <span className="text-sm text-[var(--ink-muted)]">
                    Session started {formatDateTime(sessionStartedAt)}
                  </span>
                  <ConfirmButton
                    danger
                    label="Cancel session"
                    confirm="Click again to cancel"
                    onConfirm={() => void saveField({ session_started_at: null })}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => openSessionDraft(true)}>
                    <Square size={16} /> End session
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => openSessionDraft(false)}>
                    Log session
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveField({ session_started_at: new Date().toISOString() })}
                  >
                    <Play size={16} /> Start session
                  </button>
                </>
              )}
            </>
          }
        />
      </div>

      <StudentCanvas
        layout={layout}
        onChange={persistLayout}
        panelTitle={(panel) => panelLabel(panel, lookupResource(panel.resourceId)?.title)}
        onAddWorkspace={addWorkspaceAt}
        onAddMedia={() => setMediaPickOpen(true)}
        onRemovePanel={(id) => persistWorkspace(deleteExtraWorkspace(workspaceRef.current, id))}
        renderPanel={(panel: PagePanel) => {
          if (panel.kind === "media") {
            const file = lookupResource(panel.resourceId);
            if (!file) {
              return <p className="p-3 text-sm text-[var(--ink-muted)]">This file is no longer available.</p>;
            }
            return <ResourceFileView resource={file} fill />;
          }
          if (panel.kind === "workspace") {
            const space = panel.id === "workspace" ? workspace : extraWorkspace(workspace, panel.id);
            return (
              <StudentWorkspace
                workspace={space}
                onChange={(next) => persistPanelWorkspace(panel.id, next)}
                onImport={() => {
                  importTargetRef.current = panel.id;
                  setImportOpen(activeTab(space).kind === "checklist" ? "checklist" : "table");
                }}
              />
            );
          }
          if (panel.id === "sessions") {
            return (
              <div className="p-3">
                {sessions.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No sessions yet. Log one after you meet.</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="flex w-full items-start justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                        onClick={() => {
                          setSessionDraft(null);
                          setSessionOpen(s);
                        }}
                      >
                        <span>
                          <span className="block font-medium">{formatDateTime(s.occurred_at)}</span>
                          <span className="block text-sm text-[var(--ink-muted)]">
                            {s.duration_minutes ? `${s.duration_minutes} min` : "No duration"}
                            {s.homework ? ` · HW: ${s.homework}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (panel.id === "activeTopics") {
            return (
              <div className="p-3">
                <ActiveTopicsList
                  tables={tables}
                  quietOpen={quietOpen}
                  onToggleQuiet={() => setQuietOpen((open) => !open)}
                  onDone={(rowId) => persistWorkspace(setRowDoneInWorkspace(workspace, rowId, true))}
                />
              </div>
            );
          }
          if (panel.id === "profile") {
            return (
              <div key={student.updated_at} className="space-y-3 p-3">
                <label className="block text-sm">
                  Name
                  <input
                    className="field mt-1"
                    defaultValue={student.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== student.name) {
                        void saveField({ name: e.target.value });
                      }
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Subject
                  <input
                    className="field mt-1"
                    defaultValue={student.subject}
                    onBlur={(e) => {
                      if (e.target.value !== student.subject) void saveField({ subject: e.target.value });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Level
                  <input
                    className="field mt-1"
                    defaultValue={student.level}
                    onBlur={(e) => {
                      if (e.target.value !== student.level) void saveField({ level: e.target.value });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Contact
                  <input
                    className="field mt-1"
                    defaultValue={student.contact}
                    onBlur={(e) => {
                      if (e.target.value !== student.contact) void saveField({ contact: e.target.value });
                    }}
                  />
                </label>
                <div className="text-sm">
                  Tags
                  <div className="mt-1">
                    <TagInput
                      value={parseTags(student.tags)}
                      onChange={(tags) => void saveField({ tags: serializeTags(tags) })}
                    />
                  </div>
                </div>
              </div>
            );
          }
          if (panel.id === "resources") {
            return (
              <div className="p-3">
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn btn-small" onClick={() => setAttachOpen(true)}>
                    Attach
                  </button>
                </div>
                <div className="space-y-2">
                  {resources.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">PDFs, images, links, and lecture notes live here.</p>
                  ) : (
                    resources.map((r) => (
                      <ResourceRow
                        key={r.id}
                        resource={r}
                        onOpen={
                          canOpenOnCanvas(r.type) ? () => openStudentResource(r) : undefined
                        }
                        onOpenOnCanvas={
                          canOpenOnCanvas(r.type) ? () => openMediaOnCanvas(r) : undefined
                        }
                        trailing={
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            onClick={() =>
                              void unlinkResource({ resourceId: r.id, studentId: student.id }).then(() => reload())
                            }
                          >
                            ×
                          </button>
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          }
          return (
            <StudentAssignments
              studentId={student.id}
              items={assignments}
              onChange={refreshAssignments}
              onOpenOnCanvas={openMediaOnCanvas}
            />
          );
        }}
      />

      {infoOpen ? (
        <StudentInfoModal
          student={student}
          onClose={() => setInfoOpen(false)}
          onSave={(patch) => saveField(patch)}
        />
      ) : null}

      {sessionOpen ? (
        <SessionModal
          studentId={student.id}
          session={sessionOpen === "new" ? null : sessionOpen}
          draft={sessionOpen === "new" ? sessionDraft : null}
          onClose={() => {
            setSessionOpen(null);
            setSessionDraft(null);
            void reload();
          }}
          onSaved={async () => {
            const ended = Boolean(sessionDraft?.clearStartOnSave);
            if (ended || dirtyRef.current) {
              await persistStudent(ended ? { session_started_at: null } : {});
            }
            if (ended) await syncNow();
          }}
        />
      ) : null}

      {importOpen === "table" ? (
        <GroupPickModal
          title="Import a template group"
          hint="Create topics grouped by subject first."
          actionLabel="Import"
          onPick={importGroup}
          onClose={() => setImportOpen(null)}
        />
      ) : null}

      {importOpen === "checklist" ? (
        <ChecklistPickModal
          onPick={importChecklist}
          onClose={() => setImportOpen(null)}
        />
      ) : null}

      {attachOpen ? (
        <AttachResourceModal
          onPick={(resourceId) =>
            linkResource({ resourceId, studentId: student.id, pinned: true }).then(() => {
              setAttachOpen(false);
              return reload();
            })
          }
          onClose={() => setAttachOpen(false)}
        />
      ) : null}

      {mediaPickOpen ? (
        <CanvasMediaPicker
          resources={resources}
          assignments={assignments}
          onPick={(resource) => {
            openMediaOnCanvas(resource);
            setMediaPickOpen(false);
          }}
          onClose={() => setMediaPickOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ActiveTopicsList({
  tables,
  quietOpen,
  onToggleQuiet,
  onDone,
}: {
  tables: Worksheet[];
  quietOpen: boolean;
  onToggleQuiet: () => void;
  onDone: (rowId: string) => void;
}) {
  const { active, quiet } = listActiveTopics(tables);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderGroup = (
    group: ReturnType<typeof listActiveTopics>["active"][number],
    section: string,
  ) => {
    const key = `${section}:${group.topic}`;
    const expanded = open.has(key);
    return (
      <div key={key} className="rounded-xl border border-[var(--line)] p-3">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-left"
          aria-expanded={expanded}
          onClick={() => toggle(key)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="min-w-0 flex-1 truncate font-medium">{group.topic}</span>
          <span className="text-sm text-[var(--ink-muted)]">{group.rows.length}</span>
        </button>
        {expanded ? (
          <div className="mt-2 space-y-2">
            {group.rows.map((row) => (
              <div key={row.rowId} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  {row.unit ? (
                    <div className="text-[var(--ink-muted)]">{row.unit}</div>
                  ) : null}
                  {row.assessmentPreview ? (
                    <div className="truncate">{row.assessmentPreview}</div>
                  ) : (
                    <div className="text-[var(--ink-muted)]">No assessment notes yet</div>
                  )}
                  <div className="text-xs text-[var(--ink-muted)]">
                    {formatRelativeTime(row.lastEditedAt)}
                  </div>
                </div>
                <button type="button" className="btn btn-small shrink-0" onClick={() => onDone(row.rowId)}>
                  Done
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  if (!active.length && !quiet.length) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">
        Edit a topic or assessment cell and it shows up here until you mark it done.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {active.map((group) => renderGroup(group, "active"))}
      {quiet.length ? (
        <div>
          <button type="button" className="btn btn-quiet btn-small" onClick={onToggleQuiet}>
            {quietOpen ? "Hide quiet" : `Quiet (${quiet.reduce((n, g) => n + g.rows.length, 0)})`}
          </button>
          {quietOpen ? (
            <div className="mt-2 space-y-3">
              {quiet.map((group) => renderGroup(group, "quiet"))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SessionModal({
  studentId,
  session,
  draft,
  onClose,
  onSaved,
}: {
  studentId: number;
  session: Session | null;
  draft: {
    notes: string;
    occurred: string;
    duration: string;
    clearStartOnSave: boolean;
  } | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [occurred, setOccurred] = useState(
    session?.occurred_at?.slice(0, 16) || draft?.occurred || nowLocalInput(),
  );
  const [duration, setDuration] = useState(
    session?.duration_minutes?.toString() ?? draft?.duration ?? "60",
  );
  const [homework, setHomework] = useState(session?.homework ?? "");
  const [notes, setNotes] = useState(session?.notes ?? draft?.notes ?? EMPTY_DOC);

  const save = async () => {
    const payload = {
      occurred_at: occurred,
      duration_minutes: duration ? Number(duration) : null,
      homework,
      notes,
    };
    if (session) {
      await updateSession(session.id, payload);
    } else {
      await createSession({
        student_id: studentId,
        ...payload,
      });
      await onSaved?.();
    }
    onClose();
  };

  const editorKey = session?.id ?? (draft ? `draft-${draft.occurred}-${draft.duration}` : "new-session");

  return (
    <Modal
      title={session ? "Session" : draft?.clearStartOnSave ? "End session" : "Log session"}
      onClose={onClose}
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          When
          <input
            className="field mt-1"
            type="datetime-local"
            value={occurred}
            onChange={(e) => setOccurred(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Duration (minutes)
          <input
            className="field mt-1"
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Homework
        <input
          className="field mt-1"
          value={homework}
          onChange={(e) => setHomework(e.target.value)}
        />
      </label>
      <div className="mt-3">
        <div className="mb-1 text-sm">Session notes</div>
        {!session && draft && !isEmptyDoc(draft.notes) ? (
          <p className="mb-2 text-xs text-[var(--ink-muted)]">
            Suggested from worksheet edits and notes in this sitting. Edit freely before saving.
          </p>
        ) : null}
        <RichEditor
          key={editorKey}
          initialJson={session?.notes ?? draft?.notes ?? EMPTY_DOC}
          placeholder="What you covered, what was sticky, next time…"
          onChange={setNotes}
        />
      </div>
      <div className="mt-4 flex justify-between">
        {session ? (
          <ConfirmButton
            danger
            label="Delete session"
            confirm="Click again to delete"
            onConfirm={() => void deleteSession(session.id).then(onClose)}
          />
        ) : (
          <span />
        )}
        <div className="flex gap-2">
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

function GroupPickModal({
  title,
  hint,
  appliedIds = [],
  disableFullyApplied = false,
  actionLabel,
  onPick,
  onClose,
}: {
  title: string;
  hint: string;
  appliedIds?: number[];
  disableFullyApplied?: boolean;
  actionLabel: string;
  onPick: (topics: Topic[]) => Promise<void>;
  onClose: () => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  useEffect(() => {
    void listTopics().then(setTopics);
  }, []);

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        Each topic in the group becomes one row on the worksheet.
      </p>
      <div className="max-h-80 space-y-2 overflow-auto">
        {groupTopicsBySubject(topics).map((group) => {
          const allApplied = group.items.every((t) => appliedIds.includes(t.id));
          const disabled = disableFullyApplied && allApplied;
          return (
            <button
              key={group.label}
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left disabled:opacity-50"
              onClick={() => void onPick(group.items).then(onClose)}
            >
              <span>
                {group.label}
                <span className="block text-xs text-[var(--ink-muted)]">
                  {group.items.length} topic{group.items.length === 1 ? "" : "s"}
                </span>
              </span>
              {disabled ? (
                <span className="text-xs">Applied</span>
              ) : (
                <span className="text-xs">{actionLabel}</span>
              )}
            </button>
          );
        })}
        {topics.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">{hint}</p>
        ) : null}
      </div>
    </Modal>
  );
}

function ChecklistPickModal({
  onPick,
  onClose,
}: {
  onPick: (template: Template) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Template[]>([]);
  useEffect(() => {
    void listTemplates({ kind: "checklist" }).then(setRows);
  }, []);

  return (
    <Modal title="Import a checklist template" onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        Items are appended to this checklist tab. Create templates under Templates.
      </p>
      <div className="max-h-80 space-y-2 overflow-auto">
        {groupTopicsBySubject(rows).map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-1 text-xs text-[var(--ink-muted)]">{group.label}</div>
            {group.items.map((t) => (
              <button
                key={t.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left"
                onClick={() => void onPick(t).then(onClose)}
              >
                <span>{t.title}</span>
                <span className="text-xs">Import</span>
              </button>
            ))}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Create a checklist template first.</p>
        ) : null}
      </div>
    </Modal>
  );
}
