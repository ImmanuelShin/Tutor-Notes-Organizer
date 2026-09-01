import { useEffect, useState } from "react";
import { listResources } from "../db/resources";
import type { Resource } from "../types";
import { Modal } from "./ui";
import { ResourceRow } from "./ResourceRow";

export function AttachResourceModal({
  onPick,
  onClose,
}: {
  onPick: (resourceId: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Resource[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    void listResources({ query }).then(setRows);
  }, [query]);

  return (
    <Modal title="Attach a resource" onClose={onClose}>
      <input
        className="field mb-3"
        placeholder="Search library…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-80 space-y-2 overflow-auto">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            className="w-full text-left"
            onClick={() => void onPick(r.id)}
          >
            <ResourceRow resource={r} onOpen={() => void onPick(r.id)} />
          </button>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No resources match.</p>
        ) : null}
      </div>
    </Modal>
  );
}
