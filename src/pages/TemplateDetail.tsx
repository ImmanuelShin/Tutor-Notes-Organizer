import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Plus } from "lucide-react";
import { deleteTemplate, getTemplate, listTemplateSubjects, updateTemplate } from "../db/templates";
import { getStudent, listStudents, updateStudent } from "../db/students";
import type { ChecklistTemplateItem, Student, Template } from "../types";
import {
  applyChecklistToWorkspace,
  parseChecklistBody,
  serializeChecklistBody,
  templateKindLabel,
} from "../lib/templates";
import { parseWorkspace, serializeWorkspace } from "../lib/workspace";
import { ConfirmButton, Modal, PageHeader, SubjectCombobox } from "../components/ui";
import { setAppWindowTitle } from "../lib/windows";

export function TemplateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const templateId = Number(id);
  const [template, setTemplate] = useState<Template | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);

  const reload = async () => {
    const row = await getTemplate(templateId);
    setTemplate(row);
    if (!row) return;
    void setAppWindowTitle(row.title);
    setSubjectDraft(row.subject);
    setItems(parseChecklistBody(row.body).items);
    setSubjects(await listTemplateSubjects());
  };

  useEffect(() => {
    void reload();
  }, [templateId]);

  if (!template) return <p className="text-[var(--ink-muted)]">Template not found.</p>;

  const saveBody = async (nextItems: ChecklistTemplateItem[]) => {
    setItems(nextItems);
    await updateTemplate(template.id, { body: serializeChecklistBody({ items: nextItems }) });
  };

  const saveField = async (patch: Parameters<typeof updateTemplate>[1]) => {
    await updateTemplate(template.id, patch);
    await reload();
  };

  const addItem = async () => {
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    await saveBody([...items, { text }]);
  };

  const moveItem = async (index: number, dir: -1 | 1) => {
    const next = [...items];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    await saveBody(next);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button type="button" className="btn btn-quiet btn-small mb-2" onClick={() => nav("/templates")}>
        <ArrowLeft size={14} /> All templates
      </button>
      <PageHeader
        title={template.title}
        subtitle={`${templateKindLabel(template.kind)}${template.subject ? ` · ${template.subject}` : ""}`}
        actions={
          <>
            <ConfirmButton
              danger
              label="Delete"
              confirm="Click again to delete"
              onConfirm={() => void deleteTemplate(template.id).then(() => nav("/templates"))}
            />
            <ConfirmButton
              label={template.archived ? "Unarchive" : "Archive"}
              confirm="Click again to confirm"
              onConfirm={() => void saveField({ archived: template.archived ? 0 : 1 })}
            />
            <button type="button" className="btn btn-primary" onClick={() => setApplyOpen(true)}>
              Apply to a student
            </button>
          </>
        }
      />

      <section className="card space-y-3 p-4">
        <label className="block text-sm">
          Title
          <input
            className="field mt-1"
            defaultValue={template.title}
            key={template.title}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== template.title) {
                void saveField({ title: e.target.value.trim() });
              }
            }}
          />
        </label>
        <label className="block text-sm">
          Subject
          <SubjectCombobox
            value={subjectDraft}
            onChange={setSubjectDraft}
            subjects={subjects}
            onBlur={() => {
              if (subjectDraft !== template.subject) void saveField({ subject: subjectDraft });
            }}
          />
        </label>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="mb-3 text-lg">Items</h2>
        {items.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--ink-muted)]">
            Add lines for materials, homework, or what to cover next sitting.
          </p>
        ) : (
          <div className="mb-3 space-y-2">
            {items.map((item, index) => (
              <div key={`${index}-${item.text}`} className="flex items-center gap-2">
                <input
                  className="field"
                  defaultValue={item.text}
                  onBlur={(e) => {
                    const text = e.target.value.trim();
                    const next = [...items];
                    if (!text) next.splice(index, 1);
                    else next[index] = { text };
                    if (JSON.stringify(next) !== JSON.stringify(items)) void saveBody(next);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  disabled={index === 0}
                  onClick={() => void moveItem(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  disabled={index === items.length - 1}
                  onClick={() => void moveItem(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="New item"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem();
            }}
          />
          <button type="button" className="btn btn-small" onClick={() => void addItem()}>
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      {applyOpen ? (
        <ApplyTemplateModal template={template} onClose={() => setApplyOpen(false)} />
      ) : null}
    </div>
  );
}

function ApplyTemplateModal({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  useEffect(() => {
    void listStudents().then(setStudents);
  }, []);

  const apply = async (studentId: number) => {
    const row = await getStudent(studentId);
    if (!row) return;
    const next = applyChecklistToWorkspace(parseWorkspace(row.worksheet), template);
    await updateStudent(studentId, { worksheet: serializeWorkspace(next) });
    onClose();
  };

  return (
    <Modal title={`Apply ${template.title}`} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        Adds these items to a checklist tab on the student’s workspace. Existing items stay.
      </p>
      <div className="max-h-80 space-y-2 overflow-auto">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left"
            onClick={() => void apply(s.id)}
          >
            <span>
              {s.name}
              <span className="block text-xs text-[var(--ink-muted)]">{s.subject}</span>
            </span>
            <span className="text-xs">Apply</span>
          </button>
        ))}
        {students.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Add a student first.</p>
        ) : null}
      </div>
    </Modal>
  );
}
