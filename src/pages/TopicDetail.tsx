import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Plus } from "lucide-react";
import {
  applyTopicsToStudent,
  createAssessment,
  createExample,
  createGoal,
  createSubUnit,
  deleteAssessment,
  deleteExample,
  deleteGoal,
  deleteSubUnit,
  deleteTopic,
  getTopic,
  listAssessments,
  listExamples,
  listGoals,
  listStudentIdsWithAllTopics,
  listStudentsForTopic,
  listSubUnits,
  listSubjects,
  listTopics,
  moveSubUnit,
  updateAssessment,
  updateExample,
  updateGoal,
  updateSubUnit,
  updateTopic,
} from "../db/topics";
import { listStudents } from "../db/students";
import {
  linkResource,
  listLinkedResources,
  unlinkResource,
} from "../db/resources";
import type { Assessment, ExampleProblem, LearningGoal, Student, SubUnit, Topic } from "../types";
import { parseTags, serializeTags } from "../lib/format";
import { subjectGroupLabel } from "../lib/importTables";
import { importGroupIntoWorksheet } from "../lib/workspace";
import { ConfirmButton, Modal, PageHeader, SubjectCombobox, TagInput } from "../components/ui";
import { RichEditor } from "../components/RichEditor";
import { ResourceRow } from "../components/ResourceRow";
import { AttachResourceModal } from "../components/AttachResourceModal";
import { setAppWindowTitle } from "../lib/windows";

export function TopicDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const topicId = Number(id);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [units, setUnits] = useState<SubUnit[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [examples, setExamples] = useState<ExampleProblem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [resources, setResources] = useState<Awaited<ReturnType<typeof listLinkedResources>>>([]);
  const [studentsOn, setStudentsOn] = useState<{ id: number; name: string; status: string }[]>([]);
  const [newUnit, setNewUnit] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newAssessment, setNewAssessment] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [groupTopics, setGroupTopics] = useState<Topic[]>([]);

  const active = units.find((u) => u.id === activeId) ?? units[0] ?? null;

  const reload = async () => {
    const row = await getTopic(topicId);
    setTopic(row);
    if (!row) return;
    void setAppWindowTitle(row.title);
    const nextUnits = await listSubUnits(topicId);
    setUnits(nextUnits);
    setResources(await listLinkedResources({ topicId }));
    setStudentsOn(await listStudentsForTopic(topicId));
    setSubjects(await listSubjects());
    if (row) setSubjectDraft(row.subject);
    const all = await listTopics();
    const label = subjectGroupLabel(row.subject);
    setGroupTopics(all.filter((t) => subjectGroupLabel(t.subject) === label));
    const nextActive =
      nextUnits.find((u) => u.id === activeId)?.id ?? nextUnits[0]?.id ?? null;
    setActiveId(nextActive);
  };

  useEffect(() => {
    void reload();
  }, [topicId]);

  useEffect(() => {
    if (!active) {
      setGoals([]);
      setExamples([]);
      setAssessments([]);
      return;
    }
    void listGoals(active.id).then(setGoals);
    void listExamples(active.id).then(setExamples);
    void listAssessments(active.id).then(setAssessments);
  }, [active?.id]);

  if (!topic) return <p className="text-[var(--ink-muted)]">Topic not found.</p>;

  const saveTopic = async (patch: Parameters<typeof updateTopic>[1]) => {
    await updateTopic(topic.id, patch);
    await reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" className="btn btn-quiet btn-small mb-2" onClick={() => nav("/topics")}>
        <ArrowLeft size={14} /> All topics
      </button>
      <PageHeader
        title={topic.title}
        subtitle={topic.subject || "Topic template"}
        actions={
          <>
            <ConfirmButton
              danger
              label="Delete"
              confirm="Click again to delete"
              onConfirm={() =>
                void deleteTopic(topic.id).then(() => nav("/topics"))
              }
            />
            <ConfirmButton
              label={topic.archived ? "Unarchive" : "Archive"}
              confirm="Click again to confirm"
              onConfirm={() => void saveTopic({ archived: topic.archived ? 0 : 1 })}
            />
            <button type="button" className="btn btn-primary" onClick={() => setApplyOpen(true)}>
              Apply group to student
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          Title
          <input
            className="field mt-1"
            defaultValue={topic.title}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== topic.title) {
                void saveTopic({ title: e.target.value });
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
              if (subjectDraft !== topic.subject) void saveTopic({ subject: subjectDraft });
            }}
          />
        </label>
        <div className="text-sm">
          Tags
          <div className="mt-1">
            <TagInput
              value={parseTags(topic.tags)}
              onChange={(tags) => void saveTopic({ tags: serializeTags(tags) })}
            />
          </div>
        </div>
      </div>
      <label className="mb-4 block text-sm">
        Description
        <textarea
          className="field mt-1 min-h-20"
          defaultValue={topic.description}
          onBlur={(e) => {
            if (e.target.value !== topic.description) void saveTopic({ description: e.target.value });
          }}
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <section className="card p-3">
          <h2 className="mb-2 px-1 text-lg">Sub-units</h2>
          <div className="space-y-1">
            {units.map((unit) => (
              <div
                key={unit.id}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${
                  unit.id === active?.id ? "bg-[var(--bg-hover)]" : ""
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  onClick={() => setActiveId(unit.id)}
                >
                  {unit.title}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => void moveSubUnit(unit.id, -1).then(reload)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => void moveSubUnit(unit.id, 1).then(reload)}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-1">
            <input
              className="field"
              placeholder="New sub-unit"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newUnit.trim()) {
                  void createSubUnit(topic.id, newUnit).then(() => {
                    setNewUnit("");
                    return reload();
                  });
                }
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!newUnit.trim()) return;
                void createSubUnit(topic.id, newUnit).then(() => {
                  setNewUnit("");
                  return reload();
                });
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          {studentsOn.length > 0 ? (
            <div className="mt-4 px-1">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">On students</div>
              <ul className="mt-1 space-y-1 text-sm">
                {studentsOn.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => nav(`/students/${s.id}`)}
                    >
                      {s.name}
                    </button>
                    <span className="text-[var(--ink-muted)]"> · {s.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="space-y-4">
          {active ? (
            <>
              <section className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    className="field text-lg"
                    defaultValue={active.title}
                    key={active.id}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== active.title) {
                        void updateSubUnit(active.id, e.target.value).then(reload);
                      }
                    }}
                  />
                  <ConfirmButton
                    danger
                    label="Delete unit"
                    confirm="Click again to delete"
                    onConfirm={() => void deleteSubUnit(active.id).then(reload)}
                  />
                </div>
                <h3 className="mb-2 text-sm uppercase tracking-wide text-[var(--ink-muted)]">
                  Learning goals
                </h3>
                <div className="space-y-2">
                  {goals.map((goal) => (
                    <div key={goal.id} className="flex gap-2">
                      <input
                        className="field"
                        defaultValue={goal.text}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== goal.text) {
                            void updateGoal(goal.id, e.target.value).then(() =>
                              listGoals(active.id).then(setGoals),
                            );
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-quiet btn-danger"
                        onClick={() =>
                          void deleteGoal(goal.id).then(() => listGoals(active.id).then(setGoals))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="field"
                    placeholder="New learning goal"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newGoal.trim()) {
                        void createGoal(active.id, newGoal).then(() => {
                          setNewGoal("");
                          return listGoals(active.id).then(setGoals);
                        });
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (!newGoal.trim()) return;
                      void createGoal(active.id, newGoal).then(() => {
                        setNewGoal("");
                        return listGoals(active.id).then(setGoals);
                      });
                    }}
                  >
                    Add
                  </button>
                </div>
              </section>

              <section className="card p-4">
                <h3 className="mb-2 text-sm uppercase tracking-wide text-[var(--ink-muted)]">
                  Assessment
                </h3>
                <div className="space-y-2">
                  {assessments.map((item) => (
                    <div key={item.id} className="flex gap-2">
                      <input
                        className="field"
                        defaultValue={item.text}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== item.text) {
                            void updateAssessment(item.id, e.target.value).then(() =>
                              listAssessments(active.id).then(setAssessments),
                            );
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-quiet btn-danger"
                        onClick={() =>
                          void deleteAssessment(item.id).then(() =>
                            listAssessments(active.id).then(setAssessments),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="field"
                    placeholder="Quiz, exit ticket, checkpoint…"
                    value={newAssessment}
                    onChange={(e) => setNewAssessment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newAssessment.trim()) {
                        void createAssessment(active.id, newAssessment).then(() => {
                          setNewAssessment("");
                          return listAssessments(active.id).then(setAssessments);
                        });
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (!newAssessment.trim()) return;
                      void createAssessment(active.id, newAssessment).then(() => {
                        setNewAssessment("");
                        return listAssessments(active.id).then(setAssessments);
                      });
                    }}
                  >
                    Add
                  </button>
                </div>
              </section>

              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-wide text-[var(--ink-muted)]">
                    Example problems
                  </h3>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      void createExample(active.id).then(() => listExamples(active.id).then(setExamples))
                    }
                  >
                    <Plus size={14} /> Add example
                  </button>
                </div>
                {examples.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    Worked examples and paste-in diagrams live here.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {examples.map((ex, i) => (
                      <div key={ex.id} className="rounded-xl border border-[var(--line)] p-3">
                        <div className="mb-2 flex gap-2">
                          <input
                            className="field"
                            defaultValue={ex.title || `Example ${i + 1}`}
                            onBlur={(e) => {
                              if (e.target.value !== ex.title) {
                                void updateExample(ex.id, { title: e.target.value });
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-quiet btn-danger"
                            onClick={() =>
                              void deleteExample(ex.id).then(() =>
                                listExamples(active.id).then(setExamples),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                        <RichEditor
                          key={ex.id}
                          initialJson={ex.body}
                          placeholder="Problem statement, solution sketches, paste a figure…"
                          onChange={(body) => void updateExample(ex.id, { body })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="card p-8 text-[var(--ink-muted)]">
              Add a sub-unit to start writing goals, assessments, and example problems.
            </section>
          )}

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg">Attached resources</h3>
              <button type="button" className="btn btn-small" onClick={() => setAttachOpen(true)}>
                Attach
              </button>
            </div>
            <div className="space-y-2">
              {resources.map((r) => (
                <ResourceRow
                  key={r.id}
                  resource={r}
                  trailing={
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() =>
                        void unlinkResource({ resourceId: r.id, topicId: topic.id }).then(reload)
                      }
                    >
                      ×
                    </button>
                  }
                />
              ))}
              {resources.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Diagrams, PDFs, images, and lecture notes for this topic.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {applyOpen ? (
        <ApplyToStudentModal
          groupLabel={subjectGroupLabel(topic.subject)}
          topicIds={groupTopics.map((t) => t.id)}
          onClose={() => {
            setApplyOpen(false);
            void reload();
          }}
        />
      ) : null}

      {attachOpen ? (
        <AttachResourceModal
          onPick={(resourceId) =>
            linkResource({ resourceId, topicId: topic.id }).then(() => {
              setAttachOpen(false);
              return reload();
            })
          }
          onClose={() => setAttachOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ApplyToStudentModal({
  groupLabel,
  topicIds,
  onClose,
}: {
  groupLabel: string;
  topicIds: number[];
  onClose: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [already, setAlready] = useState<number[]>([]);
  useEffect(() => {
    void listStudents().then(setStudents);
    void listStudentIdsWithAllTopics(topicIds).then(setAlready);
  }, [topicIds.join(",")]);

  return (
    <Modal title={`Apply ${groupLabel} to a student`} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--ink-muted)]">
        Applies all {topicIds.length} topic{topicIds.length === 1 ? "" : "s"} in this group. Each
        topic becomes a row on the student’s worksheet.
      </p>
      <div className="max-h-80 space-y-2 overflow-auto">
        {students.map((s) => {
          const used = already.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={used}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-left disabled:opacity-50"
              onClick={() =>
                void applyTopicsToStudent(s.id, topicIds)
                  .then(() => importGroupIntoWorksheet(s.id, topicIds))
                  .then(onClose)
              }
            >
              <span>
                {s.name}
                <span className="block text-xs text-[var(--ink-muted)]">{s.subject}</span>
              </span>
              {used ? <span className="text-xs">Already applied</span> : <span className="text-xs">Apply</span>}
            </button>
          );
        })}
        {students.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">Add a student first.</p>
        ) : null}
      </div>
    </Modal>
  );
}
