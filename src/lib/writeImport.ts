import { createStudent } from "../db/students";
import {
  createAssessment,
  createExample,
  createGoal,
  createSubUnit,
  createTopic,
  deleteTopics,
  listAssessments,
  listExamples,
  listGoals,
  listSubUnits,
  listTopics,
  nextTopicSort,
  reorderTopics,
  updateExample,
} from "../db/topics";
import { createResource } from "../db/resources";
import { docToText, serializeTags, textToDoc } from "./format";
import { subjectGroupLabel, topicKey, type TopicImportEntry } from "./importTables";

export type PasteEntity = "students" | "topics" | "resources";

export const PASTE_FIELDS: Record<
  PasteEntity,
  { key: string; label: string; required?: boolean }[]
> = {
  students: [
    { key: "name", label: "Name", required: true },
    { key: "subject", label: "Subject" },
    { key: "level", label: "Level" },
    { key: "contact", label: "Contact" },
    { key: "tags", label: "Tags" },
    { key: "notes", label: "Notes" },
  ],
  topics: [
    { key: "title", label: "Topic title", required: true },
    { key: "subject", label: "Subject" },
    { key: "sub_unit", label: "Sub-unit / unit" },
    { key: "learning_goal", label: "Learning goal" },
    { key: "example_problem", label: "Example problem" },
    { key: "assessment", label: "Assessment" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
  ],
  resources: [
    { key: "title", label: "Title", required: true },
    { key: "type", label: "Type (pdf / image / link / lecture_note)" },
    { key: "url", label: "URL" },
    { key: "tags", label: "Tags" },
  ],
};

export function guessField(header: string, entity: PasteEntity): string {
  const h = header.toLowerCase().trim();
  const rules: Record<string, string[]> = {
    name: ["name", "student", "full name"],
    subject: ["subject", "course", "class", "grade"],
    level: ["level", "grade", "year"],
    contact: ["contact", "email", "phone", "parent"],
    tags: ["tag", "tags", "labels"],
    notes: ["notes", "note", "comments"],
    title: ["title", "topic", "resource"],
    description: ["description", "desc", "overview"],
    sub_unit: ["sub-unit", "subunit", "sub unit", "unit", "units", "section"],
    learning_goal: ["goal", "learning goal", "objective"],
    example_problem: ["example", "problem", "exercise"],
    assessment: ["assessment", "assessments", "assess", "quiz", "exam", "checkpoint"],
    type: ["type", "kind"],
    url: ["url", "link", "website", "href"],
  };
  const allowed = new Set(PASTE_FIELDS[entity].map((f) => f.key));
  for (const [field, needles] of Object.entries(rules)) {
    if (!allowed.has(field)) continue;
    if (needles.some((n) => h === n || h.includes(n))) return field;
  }
  if (entity === "topics" && (h === "name" || h === "topics")) return "title";
  return "";
}

export function guessMapping(headers: string[], entity: PasteEntity): string[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const guessed = guessField(header, entity);
    if (!guessed || used.has(guessed)) return "";
    used.add(guessed);
    return guessed;
  });
}

function mappedCell(row: string[], mapping: string[], key: string): string {
  const idx = mapping.indexOf(key);
  if (idx < 0) return "";
  return (row[idx] ?? "").trim();
}

function splitCellLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

export function gridToTopicEntries(
  dataRows: string[][],
  mapping: string[],
  defaultSubject: string,
): TopicImportEntry[] {
  const entries: TopicImportEntry[] = [];
  let lastTitle = "";
  let lastUnit = "";
  for (const row of dataRows) {
    const titleRaw = mappedCell(row, mapping, "title");
    const unitRaw = mappedCell(row, mapping, "sub_unit");
    const unitLines = splitCellLines(unitRaw);
    if (titleRaw) lastTitle = titleRaw;
    if (unitLines.length) lastUnit = unitLines[unitLines.length - 1] ?? "";
    const title = titleRaw || lastTitle;
    if (!title) continue;
    const units = unitLines.length ? unitLines : lastUnit ? [lastUnit] : [""];
    const goals = splitCellLines(mappedCell(row, mapping, "learning_goal"));
    const examples = splitCellLines(mappedCell(row, mapping, "example_problem"));
    const assessments = splitCellLines(mappedCell(row, mapping, "assessment"));
    const n = Math.max(units.length, goals.length, examples.length, assessments.length, 1);
    const subject = mappedCell(row, mapping, "subject") || defaultSubject.trim();
    for (let i = 0; i < n; i++) {
      entries.push({
        subject,
        title,
        unit: units[i] ?? units[units.length - 1] ?? "",
        learningGoal: goals[i] ?? "",
        example: examples[i] ?? "",
        assessment: assessments[i] ?? "",
      });
    }
  }
  return entries;
}

export type TopicImportMode = "replace-group" | "merge" | "add-only";

export type TopicImportConflict = {
  label: string;
  existingCount: number;
  matchingTitles: number;
};

export type TopicImportResult = {
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
};

function subjectKeyOf(subject: string): string {
  return subject.trim().toLowerCase();
}

function normText(value: string): string {
  return value.trim().toLowerCase();
}

async function loadAllTopics() {
  return [
    ...(await listTopics({ archived: false })),
    ...(await listTopics({ archived: true })),
  ];
}

export async function detectTopicImportConflicts(
  entries: TopicImportEntry[],
): Promise<TopicImportConflict[]> {
  const existing = await loadAllTopics();
  const existingBySubject = new Map<string, typeof existing>();
  for (const topic of existing) {
    const key = subjectKeyOf(topic.subject);
    const list = existingBySubject.get(key) ?? [];
    list.push(topic);
    existingBySubject.set(key, list);
  }

  const imported = new Map<string, { label: string; titles: Set<string> }>();
  for (const row of entries) {
    const key = subjectKeyOf(row.subject);
    const title = row.title.trim();
    if (!title) continue;
    let group = imported.get(key);
    if (!group) {
      group = { label: subjectGroupLabel(row.subject), titles: new Set() };
      imported.set(key, group);
    }
    group.titles.add(title.toLowerCase());
  }

  const conflicts: TopicImportConflict[] = [];
  for (const [key, group] of imported) {
    const present = existingBySubject.get(key) ?? [];
    if (!present.length) continue;
    const existingTitles = new Set(present.map((t) => t.title.trim().toLowerCase()));
    let matchingTitles = 0;
    for (const title of group.titles) {
      if (existingTitles.has(title)) matchingTitles += 1;
    }
    conflicts.push({
      label: group.label,
      existingCount: present.length,
      matchingTitles,
    });
  }
  return conflicts;
}

export async function writeTopicEntries(
  entries: TopicImportEntry[],
  mode: TopicImportMode,
): Promise<TopicImportResult> {
  let existing = await loadAllTopics();
  const importSubjects = new Set(entries.map((row) => subjectKeyOf(row.subject)));
  let deleted = 0;

  if (mode === "replace-group") {
    const toDelete = existing.filter((t) => importSubjects.has(subjectKeyOf(t.subject)));
    deleted = toDelete.length;
    if (toDelete.length) await deleteTopics(toDelete.map((t) => t.id));
    existing = existing.filter((t) => !importSubjects.has(subjectKeyOf(t.subject)));
  }

  const byKey = new Map(existing.map((t) => [topicKey(t.subject, t.title), t.id]));
  const preexistingIds = new Set(existing.map((t) => t.id));
  const preexistingSubjects = new Set(existing.map((t) => subjectKeyOf(t.subject)));
  const unitCache = new Map<string, number>();
  const hydratedTopics = new Set<number>();
  const hydratedUnits = new Set<number>();
  const goalTexts = new Map<number, Set<string>>();
  const assessmentTexts = new Map<number, Set<string>>();
  const exampleTexts = new Map<number, Set<string>>();
  const nextSortBySubject = new Map<string, number>();
  const createdBySubject = new Map<string, number[]>();
  const skippedKeys = new Set<string>();
  const seenExisting = new Set<number>();
  const nestedAdded = new Set<number>();
  let created = 0;

  const hydrateTopic = async (topicId: number) => {
    if (hydratedTopics.has(topicId)) return;
    hydratedTopics.add(topicId);
    const units = await listSubUnits(topicId);
    for (const unit of units) {
      unitCache.set(`${topicId}::${normText(unit.title)}`, unit.id);
    }
  };

  const ensureUnitSets = (unitId: number) => {
    if (!goalTexts.has(unitId)) goalTexts.set(unitId, new Set());
    if (!assessmentTexts.has(unitId)) assessmentTexts.set(unitId, new Set());
    if (!exampleTexts.has(unitId)) exampleTexts.set(unitId, new Set());
  };

  const hydrateUnit = async (unitId: number) => {
    if (hydratedUnits.has(unitId)) return;
    hydratedUnits.add(unitId);
    const [goals, assessments, examples] = await Promise.all([
      listGoals(unitId),
      listAssessments(unitId),
      listExamples(unitId),
    ]);
    goalTexts.set(unitId, new Set(goals.map((g) => normText(g.text))));
    assessmentTexts.set(unitId, new Set(assessments.map((a) => normText(a.text))));
    exampleTexts.set(
      unitId,
      new Set(examples.map((ex) => normText(docToText(ex.body) || ex.title))),
    );
  };

  for (const row of entries) {
    const title = row.title.trim();
    if (!title) continue;
    const subject = row.subject.trim();
    const key = topicKey(subject, title);
    const subjectKey = subjectKeyOf(subject);
    let topicId = byKey.get(key);
    const existed = Boolean(topicId && preexistingIds.has(topicId));

    if (existed && mode === "add-only") {
      skippedKeys.add(key);
      continue;
    }

    if (!topicId) {
      if (!nextSortBySubject.has(subjectKey)) {
        nextSortBySubject.set(
          subjectKey,
          preexistingSubjects.has(subjectKey) ? await nextTopicSort(subject) : 0,
        );
      }
      const sortOrder = nextSortBySubject.get(subjectKey)!;
      nextSortBySubject.set(subjectKey, sortOrder + 1);
      topicId = await createTopic({ title, subject, sortOrder });
      byKey.set(key, topicId);
      const createdIds = createdBySubject.get(subjectKey) ?? [];
      createdIds.push(topicId);
      createdBySubject.set(subjectKey, createdIds);
      created += 1;
    }

    const mergeInto = mode === "merge" && existed;
    if (mergeInto) {
      seenExisting.add(topicId);
      await hydrateTopic(topicId);
    }

    const unitTitle = row.unit.trim() || "General";
    const unitKey = `${topicId}::${normText(unitTitle)}`;
    let unitId = unitCache.get(unitKey);
    if (!unitId) {
      unitId = await createSubUnit(topicId, unitTitle);
      unitCache.set(unitKey, unitId);
      ensureUnitSets(unitId);
      hydratedUnits.add(unitId);
      if (mergeInto) nestedAdded.add(topicId);
    } else if (mergeInto) {
      await hydrateUnit(unitId);
    }

    const addGoal = async () => {
      const text = row.learningGoal.trim();
      if (!text) return;
      if (mergeInto) {
        const set = goalTexts.get(unitId!) ?? new Set();
        goalTexts.set(unitId!, set);
        const n = normText(text);
        if (set.has(n)) return;
        set.add(n);
        nestedAdded.add(topicId!);
      }
      await createGoal(unitId!, text);
    };
    const addAssessment = async () => {
      const text = row.assessment.trim();
      if (!text) return;
      if (mergeInto) {
        const set = assessmentTexts.get(unitId!) ?? new Set();
        assessmentTexts.set(unitId!, set);
        const n = normText(text);
        if (set.has(n)) return;
        set.add(n);
        nestedAdded.add(topicId!);
      }
      await createAssessment(unitId!, text);
    };
    const addExample = async () => {
      const text = row.example.trim();
      if (!text) return;
      if (mergeInto) {
        const set = exampleTexts.get(unitId!) ?? new Set();
        exampleTexts.set(unitId!, set);
        const n = normText(text);
        if (set.has(n)) return;
        set.add(n);
        nestedAdded.add(topicId!);
      }
      const exId = await createExample(unitId!, "Imported example");
      await updateExample(exId, { body: textToDoc(text) });
    };

    await addGoal();
    await addAssessment();
    await addExample();
  }

  for (const [subjectKey, ids] of createdBySubject) {
    if (preexistingSubjects.has(subjectKey)) continue;
    await reorderTopics(ids);
  }

  const skippedExisting = [...seenExisting].filter((id) => !nestedAdded.has(id)).length;
  return {
    created,
    updated: nestedAdded.size,
    skipped: skippedKeys.size + skippedExisting,
    deleted,
  };
}

export async function writeStudentRows(
  dataRows: string[][],
  mapping: string[],
): Promise<number> {
  let count = 0;
  for (const row of dataRows) {
    const name = mappedCell(row, mapping, "name");
    if (!name) continue;
    await createStudent({
      name,
      subject: mappedCell(row, mapping, "subject"),
      level: mappedCell(row, mapping, "level"),
      contact: mappedCell(row, mapping, "contact"),
      tags: serializeTags(
        mappedCell(row, mapping, "tags")
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
      notes: textToDoc(mappedCell(row, mapping, "notes")),
    });
    count += 1;
  }
  return count;
}

export async function writeResourceRows(
  dataRows: string[][],
  mapping: string[],
): Promise<number> {
  let count = 0;
  for (const row of dataRows) {
    const title = mappedCell(row, mapping, "title");
    if (!title) continue;
    const rawType = mappedCell(row, mapping, "type").toLowerCase();
    const type = rawType.includes("pdf")
      ? "pdf"
      : rawType.includes("image") || rawType.includes("img") || rawType.includes("photo")
        ? "image"
        : rawType.includes("lecture") || rawType.includes("note")
          ? "lecture_note"
          : "link";
    await createResource({
      type,
      title,
      url: mappedCell(row, mapping, "url") || null,
      tags: serializeTags(
        mappedCell(row, mapping, "tags")
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    });
    count += 1;
  }
  return count;
}
