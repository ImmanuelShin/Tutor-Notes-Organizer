import { getDb } from "./client";
import type { Session } from "../types";
import { EMPTY_DOC } from "../types";

export async function listSessions(studentId: number): Promise<Session[]> {
  const db = await getDb();
  return db.select<Session[]>(
    `SELECT * FROM sessions WHERE student_id = $1 ORDER BY occurred_at DESC, id DESC`,
    [studentId],
  );
}

export async function getSession(id: number): Promise<Session | null> {
  const db = await getDb();
  const rows = await db.select<Session[]>("SELECT * FROM sessions WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createSession(input: {
  student_id: number;
  occurred_at: string;
  duration_minutes?: number | null;
  notes?: string;
  homework?: string;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO sessions (student_id, occurred_at, duration_minutes, notes, homework)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.student_id,
      input.occurred_at,
      input.duration_minutes ?? null,
      input.notes ?? EMPTY_DOC,
      input.homework ?? "",
    ],
  );
  return Number(result.lastInsertId);
}

export async function updateSession(
  id: number,
  patch: Partial<Pick<Session, "occurred_at" | "duration_minutes" | "notes" | "homework">>,
): Promise<void> {
  const db = await getDb();
  const current = await getSession(id);
  if (!current) return;
  await db.execute(
    `UPDATE sessions
     SET occurred_at = $1, duration_minutes = $2, notes = $3, homework = $4
     WHERE id = $5`,
    [
      patch.occurred_at ?? current.occurred_at,
      patch.duration_minutes === undefined ? current.duration_minutes : patch.duration_minutes,
      patch.notes ?? current.notes,
      patch.homework ?? current.homework,
      id,
    ],
  );
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
}
