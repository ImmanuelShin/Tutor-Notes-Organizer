import { useEffect, useState } from "react";
import type { Resource } from "../types";
import { openAppFile, toDisplaySrc } from "../lib/media";
import { ImageResourceView } from "./ImageResourceView";

export function ResourceFileView({
  resource,
  fill = false,
}: {
  resource: Resource;
  fill?: boolean;
}) {
  const [fileSrc, setFileSrc] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  useEffect(() => {
    const needsFile = resource.type === "pdf" || resource.type === "image";
    if (!needsFile || !resource.file_path) {
      setFileSrc(null);
      setFileError(false);
      return;
    }
    let cancelled = false;
    setFileSrc(null);
    setFileError(false);
    void toDisplaySrc(resource.file_path)
      .then((src) => {
        if (!cancelled) setFileSrc(src);
      })
      .catch(() => {
        if (!cancelled) setFileError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resource.id, resource.type, resource.file_path]);

  if (resource.type !== "pdf" && resource.type !== "image") {
    return <p className="p-3 text-sm text-[var(--ink-muted)]">This file can’t be shown here.</p>;
  }

  if (fileError || !resource.file_path) {
    return (
      <div className={fill ? "p-3 text-sm text-[var(--ink-muted)]" : "card p-6 text-sm text-[var(--ink-muted)]"}>
        Could not display this {resource.type === "pdf" ? "PDF" : "image"} here.
        {resource.file_path ? (
          <div className="mt-3">
            <button type="button" className="btn btn-small" onClick={() => void openAppFile(resource.file_path!)}>
              Open in system viewer
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!fileSrc) {
    return <p className="p-3 text-sm text-[var(--ink-muted)]">Loading…</p>;
  }

  if (resource.type === "pdf") {
    return (
      <iframe
        className={fill ? "canvas-media-frame" : "pdf-frame"}
        title={resource.title}
        src={fileSrc}
        onError={() => setFileError(true)}
      />
    );
  }

  if (fill) {
    return (
      <div className="canvas-media-fill">
        <img src={fileSrc} alt={resource.title} draggable={false} />
      </div>
    );
  }

  return <ImageResourceView src={fileSrc} relative={resource.file_path} title={resource.title} />;
}
