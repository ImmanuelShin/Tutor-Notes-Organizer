import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Workspace, WorkspaceTabKind } from "../types";
import { emptyWorksheet } from "../lib/worksheet";
import {
  activeTab,
  addWorkspaceTab,
  clearWorkspaceTab,
  deleteWorkspaceTab,
  renameWorkspaceTab,
  setActiveTab,
  updateWorkspaceTab,
} from "../lib/workspace";
import { ConfirmButton } from "./ui";
import { DataGrid } from "./DataGrid";
import { FreeformNotes } from "./FreeformNotes";
import { ChecklistPane } from "./ChecklistPane";

const ADD_KINDS: { kind: WorkspaceTabKind; label: string }[] = [
  { kind: "table", label: "Table" },
  { kind: "notes", label: "Notes page" },
  { kind: "checklist", label: "Checklist" },
];

export function StudentWorkspace({
  workspace,
  onChange,
  onImport,
}: {
  workspace: Workspace;
  onChange: (next: Workspace) => void;
  onImport: () => void;
}) {
  const tab = activeTab(workspace);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  const commit = (next: Workspace) => onChange(next);

  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addRef.current?.contains(e.target as Node)) return;
      setAddOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [addOpen]);

  const startRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameDraft(title);
  };

  const commitRename = () => {
    if (!renamingId) return;
    commit(renameWorkspaceTab(workspaceRef.current, renamingId, renameDraft));
    setRenamingId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {workspace.tabs.map((t) =>
            renamingId === t.id ? (
              <input
                key={t.id}
                className="field w-32 py-1 text-sm"
                value={renameDraft}
                autoFocus
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <button
                key={t.id}
                type="button"
                className={`btn btn-small ${t.id === tab.id ? "btn-primary" : ""}`}
                onClick={() => commit(setActiveTab(workspaceRef.current, t.id))}
                onDoubleClick={() => startRename(t.id, t.title)}
              >
                {t.title}
              </button>
            ),
          )}
          <div className="relative" ref={addRef}>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setAddOpen((o) => !o)}>
              <Plus size={14} />
            </button>
            {addOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-36 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] py-1 shadow">
                {ADD_KINDS.map((opt) => (
                  <button
                    key={opt.kind}
                    type="button"
                    className="topic-menu-item w-full"
                    onClick={() => {
                      commit(addWorkspaceTab(workspaceRef.current, opt.kind));
                      setAddOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            danger
            label="Clear"
            confirm="Click again to clear"
            onConfirm={() => commit(clearWorkspaceTab(workspaceRef.current, tab.id))}
          />
          {workspace.tabs.length > 1 ? (
            <ConfirmButton
              danger
              label="Delete tab"
              confirm="Click again to delete"
              onConfirm={() => commit(deleteWorkspaceTab(workspaceRef.current, tab.id))}
            />
          ) : null}
          {tab.kind === "table" || tab.kind === "checklist" ? (
            <button type="button" className="btn btn-small" onClick={onImport}>
              Import template
            </button>
          ) : null}
        </div>
      </div>

      {tab.kind === "table" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-3 shrink-0 text-sm text-[var(--ink-muted)]">
            Import a subject group — each topic becomes one row. Right-click a cell to split notes
            by day so the grid stays compact. Double-click a header to rename it. Double-click a tab
            to rename it.
          </p>
          <DataGrid
            key={tab.id}
            value={tab.table ?? emptyWorksheet()}
            onChange={(table) => commit(updateWorkspaceTab(workspaceRef.current, tab.id, { table }))}
          />
        </div>
      ) : null}

      {tab.kind === "notes" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <FreeformNotes
            key={tab.id}
            boxes={tab.notes ?? []}
            onChange={(notes) => commit(updateWorkspaceTab(workspaceRef.current, tab.id, { notes }))}
          />
        </div>
      ) : null}

      {tab.kind === "checklist" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <ChecklistPane
            key={tab.id}
            items={tab.checklist ?? []}
            onChange={(checklist) => commit(updateWorkspaceTab(workspaceRef.current, tab.id, { checklist }))}
          />
        </div>
      ) : null}
    </div>
  );
}
