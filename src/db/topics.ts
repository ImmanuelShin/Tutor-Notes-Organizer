import { getDb } from "./client";
import type {
  Assessment,
  ExampleProblem,
  LearningGoal,
  StudentTopic,
  SubUnit,
  Topic,
  TopicProgress,
} from "../types";

export async function listTopics(opts?: {
  archived?: boolean;
  query?: string;
}): Promise<Topic[]> {
  const db = await getDb();
  const archived = opts?.archived ? 1 : 0;
  const query = opts?.query?.trim();
  if (query) {
    const like = `%${query}%`;
    return db.select<Topic[]>(
      `SELECT t.*,
        (SELECT COUNT(*) FROM sub_units WHERE topic_id = t.id) AS sub_unit_count
       FROM topics t
       WHERE t.archived = $1
         AND (t.title LIKE $2 OR t.subject LIKE $2 OR t.tags LIKE $2 OR t.description LIKE $2)
       ORDER BY CASE WHEN trim(t.subject) = '' THEN 1 ELSE 0 END,
                t.subject COLLATE NOCASE, t.sort_order, t.title COLLATE NOCASE, t.id`,
      [archived, like],
    );
  }
  return db.select<Topic[]>(
    `SELECT t.*,
      (SELECT COUNT(*) FROM sub_units WHERE topic_id = t.id) AS sub_unit_count
     FROM topics t
     WHERE t.archived = $1
     ORDER BY CASE WHEN trim(t.subject) = '' THEN 1 ELSE 0 END,
              t.subject COLLATE NOCASE, t.sort_order, t.title COLLATE NOCASE, t.id`,
    [archived],
  );
}

export async function listSubjects(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ subject: string }[]>(
    `SELECT DISTINCT subject FROM topics
     WHERE trim(subject) != ''
     ORDER BY subject COLLATE NOCASE`,
  );
  return rows.map((r) => r.subject);
}

export async function getTopic(id: number): Promise<Topic | null> {
  const db = await getDb();
  const rows = await db.select<Topic[]>("SELECT * FROM topics WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function nextTopicSort(subject: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Record<string, number | null>[]>(
    `SELECT MAX(sort_order) AS max_sort FROM topics WHERE trim(subject) = trim($1)`,
    [subject],
  );
  const row = rows[0] ?? {};
  const raw = row.max_sort ?? Object.values(row)[0];
  const max = raw == null || raw === ("" as never) ? Number.NaN : Number(raw);
  return (Number.isFinite(max) ? max : -1) + 1;
}

export async function createTopic(input: {
  title: string;
  subject?: string;
  description?: string;
  tags?: string;
  sortOrder?: number;
}): Promise<number> {
  const db = await getDb();
  const subject = input.subject ?? "";
  const sort = input.sortOrder ?? (await nextTopicSort(subject));
  const result = await db.execute(
    `INSERT INTO topics (title, subject, description, tags, sort_order) VALUES ($1, $2, $3, $4, $5)`,
    [input.title.trim(), subject, input.description ?? "", input.tags ?? "[]", sort],
  );
  return Number(result.lastInsertId);
}

export async function createTopics(
  titles: string[],
  subject: string,
): Promise<{ created: number; skipped: number; subject: string }> {
  const subjectValue = subject.trim();
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of titles) {
    const title = raw.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(title);
  }

  const existing = [
    ...(await listTopics({ archived: false })),
    ...(await listTopics({ archived: true })),
  ];
  const subjectKey = subjectValue.toLowerCase();
  const canonicalSubject =
    existing.find((t) => t.subject.trim().toLowerCase() === subjectKey)?.subject ?? subjectValue;
  const existingTitles = new Set(
    existing
      .filter((t) => t.subject.trim().toLowerCase() === subjectKey)
      .map((t) => t.title.trim().toLowerCase()),
  );

  let sort = await nextTopicSort(canonicalSubject);
  let created = 0;
  let skipped = 0;
  for (const title of unique) {
    if (existingTitles.has(title.toLowerCase())) {
      skipped += 1;
      continue;
    }
    await createTopic({ title, subject: canonicalSubject, sortOrder: sort });
    sort += 1;
    created += 1;
  }
  return { created, skipped, subject: canonicalSubject };
}

export async function updateTopic(
  id: number,
  patch: Partial<Pick<Topic, "title" | "subject" | "description" | "tags" | "archived">>,
): Promise<void> {
  const db = await getDb();
  const current = await getTopic(id);
  if (!current) return;
  const nextSubject = patch.subject ?? current.subject;
  const sortOrder =
    nextSubject !== current.subject ? await nextTopicSort(nextSubject) : current.sort_order;
  await db.execute(
    `UPDATE topics
     SET title = $1, subject = $2, description = $3, tags = $4, archived = $5,
         sort_order = $6, updated_at = datetime('now')
     WHERE id = $7`,
    [
      patch.title ?? current.title,
      nextSubject,
      patch.description ?? current.description,
      patch.tags ?? current.tags,
      patch.archived ?? current.archived,
      sortOrder,
      id,
    ],
  );
}

export async function reorderTopics(ids: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.execute(`UPDATE topics SET sort_order = $1 WHERE id = $2`, [i, ids[i]]);
  }
}

export async function deleteTopic(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM topics WHERE id = $1", [id]);
}

export async function deleteTopics(ids: number[]): Promise<void> {
  for (const id of ids) {
    await deleteTopic(id);
  }
}

export async function listSubUnits(topicId: number): Promise<SubUnit[]> {
  const db = await getDb();
  return db.select<SubUnit[]>(
    `SELECT * FROM sub_units WHERE topic_id = $1 ORDER BY sort_order, id`,
    [topicId],
  );
}

export async function createSubUnit(topicId: number, title: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max_sort: number | null }[]>(
    `SELECT MAX(sort_order) AS max_sort FROM sub_units WHERE topic_id = $1`,
    [topicId],
  );
  const sort = (rows[0]?.max_sort ?? -1) + 1;
  const result = await db.execute(
    `INSERT INTO sub_units (topic_id, title, sort_order) VALUES ($1, $2, $3)`,
    [topicId, title.trim(), sort],
  );
  return Number(result.lastInsertId);
}

export async function updateSubUnit(id: number, title: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE sub_units SET title = $1 WHERE id = $2`, [title.trim(), id]);
}

export async function deleteSubUnit(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sub_units WHERE id = $1", [id]);
}

export async function moveSubUnit(id: number, direction: -1 | 1): Promise<void> {
  const db = await getDb();
  const rows = await db.select<SubUnit[]>("SELECT * FROM sub_units WHERE id = $1", [id]);
  const current = rows[0];
  if (!current) return;
  const siblings = await listSubUnits(current.topic_id);
  const index = siblings.findIndex((s) => s.id === id);
  const swapWith = siblings[index + direction];
  if (!swapWith) return;
  await db.execute(`UPDATE sub_units SET sort_order = $1 WHERE id = $2`, [
    swapWith.sort_order,
    current.id,
  ]);
  await db.execute(`UPDATE sub_units SET sort_order = $1 WHERE id = $2`, [
    current.sort_order,
    swapWith.id,
  ]);
}

export async function listGoals(subUnitId: number): Promise<LearningGoal[]> {
  const db = await getDb();
  return db.select<LearningGoal[]>(
    `SELECT * FROM learning_goals WHERE sub_unit_id = $1 ORDER BY sort_order, id`,
    [subUnitId],
  );
}

export async function createGoal(subUnitId: number, text: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max_sort: number | null }[]>(
    `SELECT MAX(sort_order) AS max_sort FROM learning_goals WHERE sub_unit_id = $1`,
    [subUnitId],
  );
  const sort = (rows[0]?.max_sort ?? -1) + 1;
  const result = await db.execute(
    `INSERT INTO learning_goals (sub_unit_id, text, sort_order) VALUES ($1, $2, $3)`,
    [subUnitId, text.trim(), sort],
  );
  return Number(result.lastInsertId);
}

export async function updateGoal(id: number, text: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE learning_goals SET text = $1 WHERE id = $2`, [text.trim(), id]);
}

export async function deleteGoal(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM learning_goals WHERE id = $1", [id]);
}

export async function listExamples(subUnitId: number): Promise<ExampleProblem[]> {
  const db = await getDb();
  return db.select<ExampleProblem[]>(
    `SELECT * FROM example_problems WHERE sub_unit_id = $1 ORDER BY sort_order, id`,
    [subUnitId],
  );
}

export async function createExample(
  subUnitId: number,
  title = "Example",
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max_sort: number | null }[]>(
    `SELECT MAX(sort_order) AS max_sort FROM example_problems WHERE sub_unit_id = $1`,
    [subUnitId],
  );
  const sort = (rows[0]?.max_sort ?? -1) + 1;
  const result = await db.execute(
    `INSERT INTO example_problems (sub_unit_id, title, sort_order) VALUES ($1, $2, $3)`,
    [subUnitId, title, sort],
  );
  return Number(result.lastInsertId);
}

export async function updateExample(
  id: number,
  patch: Partial<Pick<ExampleProblem, "title" | "body">>,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<ExampleProblem[]>(
    "SELECT * FROM example_problems WHERE id = $1",
    [id],
  );
  const current = rows[0];
  if (!current) return;
  await db.execute(`UPDATE example_problems SET title = $1, body = $2 WHERE id = $3`, [
    patch.title ?? current.title,
    patch.body ?? current.body,
    id,
  ]);
}

export async function deleteExample(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM example_problems WHERE id = $1", [id]);
}

export async function listAssessments(subUnitId: number): Promise<Assessment[]> {
  const db = await getDb();
  return db.select<Assessment[]>(
    `SELECT * FROM assessments WHERE sub_unit_id = $1 ORDER BY sort_order, id`,
    [subUnitId],
  );
}

export async function createAssessment(subUnitId: number, text: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max_sort: number | null }[]>(
    `SELECT MAX(sort_order) AS max_sort FROM assessments WHERE sub_unit_id = $1`,
    [subUnitId],
  );
  const sort = (rows[0]?.max_sort ?? -1) + 1;
  const result = await db.execute(
    `INSERT INTO assessments (sub_unit_id, text, sort_order) VALUES ($1, $2, $3)`,
    [subUnitId, text.trim(), sort],
  );
  return Number(result.lastInsertId);
}

export async function updateAssessment(id: number, text: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE assessments SET text = $1 WHERE id = $2`, [text.trim(), id]);
}

export async function deleteAssessment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM assessments WHERE id = $1", [id]);
}

export async function applyTopicToStudent(
  studentId: number,
  topicId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO student_topics (student_id, topic_id, status)
     VALUES ($1, $2, 'in_progress')`,
    [studentId, topicId],
  );
}

export async function applyTopicsToStudent(
  studentId: number,
  topicIds: number[],
): Promise<void> {
  for (const topicId of topicIds) {
    await applyTopicToStudent(studentId, topicId);
  }
}

export async function listStudentIdsWithAllTopics(topicIds: number[]): Promise<number[]> {
  if (!topicIds.length) return [];
  const db = await getDb();
  const placeholders = topicIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ student_id: number }[]>(
    `SELECT student_id FROM student_topics
     WHERE topic_id IN (${placeholders})
     GROUP BY student_id
     HAVING COUNT(DISTINCT topic_id) = ${topicIds.length}`,
    topicIds,
  );
  return rows.map((r) => r.student_id);
}

export async function unapplyTopic(studentId: number, topicId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM student_goals
     WHERE student_id = $1
       AND goal_id IN (
         SELECT g.id FROM learning_goals g
         JOIN sub_units u ON u.id = g.sub_unit_id
         WHERE u.topic_id = $2
       )`,
    [studentId, topicId],
  );
  await db.execute(
    `DELETE FROM student_topics WHERE student_id = $1 AND topic_id = $2`,
    [studentId, topicId],
  );
}

export async function setStudentTopicStatus(
  studentId: number,
  topicId: number,
  status: StudentTopic["status"],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE student_topics SET status = $1 WHERE student_id = $2 AND topic_id = $3`,
    [status, studentId, topicId],
  );
}

export async function setGoalCompleted(
  studentId: number,
  goalId: number,
  completed: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO student_goals (student_id, goal_id, completed, completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(student_id, goal_id) DO UPDATE SET
       completed = excluded.completed,
       completed_at = excluded.completed_at`,
    [studentId, goalId, completed ? 1 : 0, completed ? new Date().toISOString() : null],
  );
}

export async function listStudentTopics(studentId: number): Promise<StudentTopic[]> {
  const db = await getDb();
  return db.select<StudentTopic[]>(
    `SELECT st.*, t.title, t.subject
     FROM student_topics st
     JOIN topics t ON t.id = st.topic_id
     WHERE st.student_id = $1
     ORDER BY CASE WHEN trim(t.subject) = '' THEN 1 ELSE 0 END,
              t.subject COLLATE NOCASE, t.sort_order, t.title COLLATE NOCASE, t.id`,
    [studentId],
  );
}

export async function getStudentTopicProgress(
  studentId: number,
): Promise<TopicProgress[]> {
  const applied = await listStudentTopics(studentId);
  const db = await getDb();
  const result: TopicProgress[] = [];
  for (const row of applied) {
    const subUnits = await listSubUnits(row.topic_id);
    const units = [];
    for (const unit of subUnits) {
      const goals = await db.select<
        { id: number; text: string; sort_order: number; completed: number | null }[]
      >(
        `SELECT g.id, g.text, g.sort_order, COALESCE(sg.completed, 0) AS completed
         FROM learning_goals g
         LEFT JOIN student_goals sg
           ON sg.goal_id = g.id AND sg.student_id = $1
         WHERE g.sub_unit_id = $2
         ORDER BY g.sort_order, g.id`,
        [studentId, unit.id],
      );
      const assessments = await db.select<{ id: number; text: string }[]>(
        `SELECT id, text FROM assessments WHERE sub_unit_id = $1 ORDER BY sort_order, id`,
        [unit.id],
      );
      units.push({
        id: unit.id,
        title: unit.title,
        sort_order: unit.sort_order,
        goals: goals.map((g) => ({
          id: g.id,
          text: g.text,
          sort_order: g.sort_order,
          completed: g.completed ?? 0,
        })),
        assessments,
      });
    }
    result.push({
      topic_id: row.topic_id,
      title: row.title ?? "Topic",
      subject: row.subject ?? "",
      status: row.status,
      sub_units: units,
    });
  }
  return result;
}

export async function listStudentsForTopic(
  topicId: number,
): Promise<{ id: number; name: string; status: string }[]> {
  const db = await getDb();
  return db.select(
    `SELECT s.id, s.name, st.status
     FROM student_topics st
     JOIN students s ON s.id = st.student_id
     WHERE st.topic_id = $1
     ORDER BY s.name COLLATE NOCASE`,
    [topicId],
  );
}
