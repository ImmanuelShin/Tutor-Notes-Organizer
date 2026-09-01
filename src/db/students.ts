import { getDb } from "./client";
import type { Student } from "../types";
import { EMPTY_DOC } from "../types";
import { deleteOwnedResources } from "./resources";

export async function listStudents(opts?: {
  archived?: boolean;
  query?: string;
}): Promise<Student[]> {
  const db = await getDb();
  const archived = opts?.archived ? 1 : 0;
  const query = opts?.query?.trim();
  if (query) {
    const like = `%${query}%`;
    return db.select<Student[]>(
      `SELECT s.*,
        (SELECT MAX(occurred_at) FROM sessions WHERE student_id = s.id) AS last_session
       FROM students s
       WHERE s.archived = $1
         AND (s.name LIKE $2 OR s.subject LIKE $2 OR s.level LIKE $2 OR s.tags LIKE $2 OR s.contact LIKE $2)
       ORDER BY s.name COLLATE NOCASE`,
      [archived, like],
    );
  }
  return db.select<Student[]>(
    `SELECT s.*,
      (SELECT MAX(occurred_at) FROM sessions WHERE student_id = s.id) AS last_session
     FROM students s
     WHERE s.archived = $1
     ORDER BY s.name COLLATE NOCASE`,
    [archived],
  );
}

export async function getStudent(id: number): Promise<Student | null> {
  const db = await getDb();
  const rows = await db.select<Student[]>(
    `SELECT s.*,
      (SELECT MAX(occurred_at) FROM sessions WHERE student_id = s.id) AS last_session
     FROM students s WHERE s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createStudent(input: {
  name: string;
  subject?: string;
  level?: string;
  contact?: string;
  tags?: string;
  notes?: string;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO students (name, subject, level, contact, tags, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.name.trim(),
      input.subject ?? "",
      input.level ?? "",
      input.contact ?? "",
      input.tags ?? "[]",
      input.notes ?? EMPTY_DOC,
    ],
  );
  return Number(result.lastInsertId);
}

export async function updateStudent(
  id: number,
  patch: Partial<
    Pick<
      Student,
      | "name"
      | "subject"
      | "level"
      | "contact"
      | "tags"
      | "notes"
      | "worksheet"
      | "page_layout"
      | "archived"
      | "session_started_at"
    >
  >,
): Promise<void> {
  const db = await getDb();
  const current = await getStudent(id);
  if (!current) return;
  await db.execute(
    `UPDATE students
     SET name = $1, subject = $2, level = $3, contact = $4, tags = $5,
         notes = $6, worksheet = $7, page_layout = $8, archived = $9, session_started_at = $10,
         updated_at = datetime('now')
     WHERE id = $11`,
    [
      patch.name ?? current.name,
      patch.subject ?? current.subject,
      patch.level ?? current.level,
      patch.contact ?? current.contact,
      patch.tags ?? current.tags,
      patch.notes ?? current.notes,
      patch.worksheet ?? current.worksheet ?? "",
      patch.page_layout ?? current.page_layout ?? "",
      patch.archived ?? current.archived,
      patch.session_started_at === undefined
        ? (current.session_started_at ?? null)
        : patch.session_started_at,
      id,
    ],
  );
}

export async function deleteStudent(id: number): Promise<void> {
  await deleteOwnedResources(id);
  const db = await getDb();
  await db.execute("DELETE FROM students WHERE id = $1", [id]);
}
