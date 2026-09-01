import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { deleteResource, getResource } from "../db/resources";
import type { Resource } from "../types";
import {
  clipboardImageFiles,
  importClipboardImages,
  importPaths,
  pickAssignmentPaths,
} from "../lib/importFiles";
import { formatMdY, localDayKey, parseDateTime } from "../lib/format";
import { openAppWindow } from "../lib/windows";
import { ConfirmButton } from "./ui";
import { ResourceRow } from "./ResourceRow";

function groupByDay(items: Resource[]) {
  const map = new Map<string, { key: string; label: string; items: Resource[] }>();
  for (const item of items) {
    const d = parseDateTime(item.created_at) ?? new Date();
    const key = localDayKey(d);
    const group = map.get(key) ?? { key, label: formatMdY(d), items: [] };
    group.items.push(item);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

async function openAssignment(resource: Resource) {
  if (resource.type !== "pdf" && resource.type !== "image") return;
  await openAppWindow({
    route: `/resources/${resource.id}`,
    title: resource.title,
    kind: "resource",
    id: resource.id,
    chrome: "focus",
  });
}

export function StudentAssignments({
  studentId,
  items,
  onChange,
  onOpenOnCanvas,
}: {
  studentId: number;
  items: Resource[];
  onChange: () => void;
  onOpenOnCanvas?: (resource: Resource) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const todayKey = localDayKey(new Date());
  const [open, setOpen] = useState<Set<string>>(() => new Set([todayKey]));

  const finishImport = async (ids: number[]) => {
    setOpen((prev) => new Set(prev).add(localDayKey(new Date())));
    onChange();
    if (ids.length !== 1) return;
    const row = await getResource(ids[0]);
    if (row) await openAssignment(row);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") setDropActive(true);
        if (event.payload.type === "leave") setDropActive(false);
        if (event.payload.type === "drop") {
          setDropActive(false);
          void importPaths(event.payload.paths, { ownerStudentId: studentId }).then(finishImport);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [studentId, onChange]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = clipboardImageFiles(e);
      if (!files.length) return;
      e.preventDefault();
      void importClipboardImages(files, { ownerStudentId: studentId }).then(finishImport);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [studentId, onChange]);

  const addFiles = async () => {
    const paths = await pickAssignmentPaths();
    if (!paths.length) return;
    await finishImport(await importPaths(paths, { ownerStudentId: studentId }));
  };

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = groupByDay(items);

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg">Assignments</h2>
        <button type="button" className="btn btn-small" onClick={() => void addFiles()}>
          <Plus size={14} /> Add
        </button>
      </div>
      {dropActive ? (
        <div className="mb-3 rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-6 text-center text-sm">
          Drop PDFs or images for this student
        </div>
      ) : null}
      {items.length === 0 && !dropActive ? (
        <p className="text-sm text-[var(--ink-muted)]">
          Drop a PDF or image, or paste a screenshot. These stay with this student.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const expanded = open.has(group.key);
            return (
              <div key={group.key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-left"
                  aria-expanded={expanded}
                  onClick={() => toggle(group.key)}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.label}</span>
                  <span className="text-xs text-[var(--ink-muted)]">{group.items.length}</span>
                </button>
                {expanded ? (
                  <div className="mt-2 space-y-2">
                    {group.items.map((r) => (
                      <ResourceRow
                        key={r.id}
                        resource={r}
                        onOpen={() => void openAssignment(r)}
                        onOpenOnCanvas={onOpenOnCanvas ? () => onOpenOnCanvas(r) : undefined}
                        trailing={
                          <ConfirmButton
                            danger
                            label="×"
                            confirm="Delete?"
                            onConfirm={() => void deleteResource(r.id).then(onChange)}
                          />
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
