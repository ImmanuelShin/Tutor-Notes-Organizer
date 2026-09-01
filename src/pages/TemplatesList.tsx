import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { createTemplate, listTemplateSubjects, listTemplates } from "../db/templates";
import type { Template } from "../types";
import { groupTopicsBySubject } from "../lib/importTables";
import { parseChecklistBody, templateKindLabel } from "../lib/templates";
import { EmptyState, Modal, PageHeader, SubjectCombobox } from "../components/ui";

export function TemplatesList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [rows, setRows] = useState<Template[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reload = async () => {
    setRows(await listTemplates({ archived, query }));
    setSubjects(await listTemplateSubjects());
  };

  useEffect(() => {
    void reload();
  }, [archived, query]);

  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
  }, [params]);

  const closeCreate = () => {
    setCreating(false);
    setTitle("");
    setSubject("");
    if (params.get("new")) {
      params.delete("new");
      setParams(params, { replace: true });
    }
  };

  const submit = async () => {
    if (!title.trim()) return;
    const id = await createTemplate({ title, subject, kind: "checklist" });
    closeCreate();
    nav(`/templates/${id}`);
  };

  const visible = useMemo(() => {
    if (subjectFilter === "all") return rows;
    if (subjectFilter === "Unsorted") return rows.filter((t) => !t.subject.trim());
    return rows.filter((t) => t.subject === subjectFilter);
  }, [rows, subjectFilter]);

  const groups = groupTopicsBySubject(visible);
  const chipSubjects = [
    "all",
    ...subjects,
    ...(rows.some((t) => !t.subject.trim()) ? ["Unsorted"] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Templates"
        subtitle="Reusable checklists you can drop onto a student’s workspace."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Archived
            </label>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New checklist
            </button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs"
          placeholder="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {chipSubjects.map((name) => (
            <button
              key={name}
              type="button"
              className={`btn btn-small ${subjectFilter === name ? "btn-primary" : ""}`}
              onClick={() => setSubjectFilter(name)}
            >
              {name === "all" ? "All subjects" : name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? archived
                ? "No archived templates"
                : "No templates yet"
              : "Nothing in this subject"
          }
          body={
            rows.length === 0
              ? "Save a sitting checklist once — materials, homework, next time — then apply it to any student."
              : "Try All subjects, or create a template in this group."
          }
          action={
            !archived ? (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                New checklist
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = !expanded.has(group.label);
            return (
              <section key={group.label}>
                <button
                  type="button"
                  className="mb-2 inline-flex min-w-0 cursor-pointer items-center gap-1 text-left"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.label)) next.delete(group.label);
                      else next.add(group.label);
                      return next;
                    })
                  }
                >
                  {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  <h2 className="text-lg">{group.label}</h2>
                  <span className="text-sm text-[var(--ink-muted)]">{group.items.length}</span>
                </button>
                {isCollapsed ? null : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((t) => {
                      const count = parseChecklistBody(t.body).items.length;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="card flex w-full flex-col items-start p-4 text-left hover:bg-[var(--bg-hover)]"
                          onClick={() => nav(`/templates/${t.id}`)}
                        >
                          <span className="font-medium">{t.title}</span>
                          <span className="mt-1 text-sm text-[var(--ink-muted)]">
                            {templateKindLabel(t.kind)}
                            {count ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {creating ? (
        <Modal title="New checklist template" onClose={closeCreate}>
          <label className="block text-sm">
            Title
            <input
              className="field mt-1"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </label>
          <label className="mt-3 block text-sm">
            Subject
            <SubjectCombobox value={subject} onChange={setSubject} subjects={subjects} />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={closeCreate}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()}>
              Create
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
