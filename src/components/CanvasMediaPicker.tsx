import { useMemo, useState } from "react";
import type { Resource } from "../types";
import { Modal } from "./ui";
import { ResourceRow } from "./ResourceRow";

function isMedia(resource: Resource) {
  return resource.type === "pdf" || resource.type === "image";
}

export function CanvasMediaPicker({
  resources,
  assignments,
  onPick,
  onClose,
}: {
  resources: Resource[];
  assignments: Resource[];
  onPick: (resource: Resource) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const pinned = useMemo(
    () => resources.filter((r) => isMedia(r) && (!q || r.title.toLowerCase().includes(q))),
    [resources, q],
  );
  const owned = useMemo(() => {
    const pinnedIds = new Set(resources.map((r) => r.id));
    return assignments.filter(
      (r) => isMedia(r) && !pinnedIds.has(r.id) && (!q || r.title.toLowerCase().includes(q)),
    );
  }, [assignments, resources, q]);

  const empty = pinned.length === 0 && owned.length === 0;

  return (
    <Modal title="Open PDF or image" onClose={onClose}>
      <input
        className="field mb-3"
        placeholder="Search this student’s files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-80 space-y-4 overflow-auto">
        {pinned.length > 0 ? (
          <section>
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Pinned resources</div>
            <div className="space-y-2">
              {pinned.map((r) => (
                <ResourceRow key={r.id} resource={r} onOpen={() => onPick(r)} />
              ))}
            </div>
          </section>
        ) : null}
        {owned.length > 0 ? (
          <section>
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Assignments</div>
            <div className="space-y-2">
              {owned.map((r) => (
                <ResourceRow key={r.id} resource={r} onOpen={() => onPick(r)} />
              ))}
            </div>
          </section>
        ) : null}
        {empty ? (
          <p className="text-sm text-[var(--ink-muted)]">
            {q
              ? "No matching PDFs or images."
              : "Pin a resource or add an assignment PDF/image first."}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
