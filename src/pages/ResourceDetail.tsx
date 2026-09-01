import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { getResource, updateResource } from "../db/resources";
import type { Resource, ResourceType } from "../types";
import { parseTags, serializeTags } from "../lib/format";
import { copyStoredImage, openAppFile, openExternalUrl } from "../lib/media";
import { setAppWindowTitle } from "../lib/windows";
import { PageHeader, TagInput } from "../components/ui";
import { RichEditor } from "../components/RichEditor";
import { ResourceFileView } from "../components/ResourceFileView";

function kindLabel(type: ResourceType): string {
  if (type === "lecture_note") return "Lecture note";
  if (type === "pdf") return "PDF";
  if (type === "image") return "Image";
  return "Link";
}

export function ResourceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const resourceId = Number(id);
  const [resource, setResource] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const reload = async () => {
    const row = await getResource(resourceId);
    setResource(row);
    if (!row) return;
    setTitle(row.title);
    setUrl(row.url ?? "");
    setTags(parseTags(row.tags));
    void setAppWindowTitle(row.title);
  };

  useEffect(() => {
    void reload();
  }, [resourceId]);

  const saveMeta = async () => {
    if (!resource) return;
    await updateResource(resource.id, {
      title,
      url: resource.type === "link" ? url : resource.url,
      tags: serializeTags(tags),
    });
    await reload();
  };

  if (!resource) {
    return <p className="text-[var(--ink-muted)]">Resource not found.</p>;
  }

  return (
    <div className={resource.type === "pdf" ? "flex min-h-0 flex-col" : undefined}>
      <PageHeader
        title={kindLabel(resource.type)}
        subtitle={resource.title}
        actions={
          <>
            <button type="button" className="btn" onClick={() => nav("/resources")}>
              <ArrowLeft size={16} /> Library
            </button>
            {resource.type === "pdf" && resource.file_path ? (
              <button
                type="button"
                className="btn"
                onClick={() => void openAppFile(resource.file_path!)}
              >
                <ExternalLink size={16} /> Open in system viewer
              </button>
            ) : null}
            {resource.type === "image" && resource.file_path ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void copyStoredImage(resource.file_path!)
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                    .catch((err) => console.error("Could not copy image", err));
                }}
              >
                <Copy size={16} /> {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            {resource.type === "link" && (url || resource.url) ? (
              <button
                type="button"
                className="btn"
                onClick={() => void openExternalUrl(url || resource.url || "")}
              >
                <ExternalLink size={16} /> Open URL
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => void saveMeta()}>
              Save
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
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
        <div className="text-sm sm:col-span-2">
          Tags
          <div className="mt-1">
            <TagInput value={tags} onChange={setTags} />
          </div>
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

      {resource.type === "pdf" || resource.type === "image" ? (
        <ResourceFileView resource={resource} />
      ) : null}
    </div>
  );
}
