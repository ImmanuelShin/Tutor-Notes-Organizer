import { getDb } from "./client";
import type { Density, SearchHit, Theme } from "../types";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function loadUiSettings(): Promise<{ theme: Theme; density: Density }> {
  const theme = ((await getSetting("theme")) as Theme | null) ?? "light";
  const density = ((await getSetting("density")) as Density | null) ?? "comfortable";
  return {
    theme: theme === "dark" ? "dark" : "light",
    density: density === "compact" ? "compact" : "comfortable",
  };
}

export async function searchAll(query: string): Promise<SearchHit[]> {
  const db = await getDb();
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const students = await db.select<{ id: number; name: string; subject: string }[]>(
    `SELECT id, name, subject FROM students
     WHERE archived = 0 AND (name LIKE $1 OR subject LIKE $1 OR tags LIKE $1 OR contact LIKE $1)
     LIMIT 8`,
    [like],
  );
  const topics = await db.select<{ id: number; title: string; subject: string }[]>(
    `SELECT id, title, subject FROM topics
     WHERE archived = 0 AND (title LIKE $1 OR subject LIKE $1 OR tags LIKE $1 OR description LIKE $1)
     LIMIT 8`,
    [like],
  );
  const resources = await db.select<{ id: number; title: string; type: string }[]>(
    `SELECT id, title, type FROM resources
     WHERE owner_student_id IS NULL AND (title LIKE $1 OR tags LIKE $1 OR url LIKE $1)
     LIMIT 8`,
    [like],
  );
  const templates = await db.select<{ id: number; title: string; subject: string; kind: string }[]>(
    `SELECT id, title, subject, kind FROM templates
     WHERE archived = 0 AND (title LIKE $1 OR subject LIKE $1 OR body LIKE $1)
     LIMIT 8`,
    [like],
  );

  return [
    ...students.map((s) => ({
      kind: "student" as const,
      id: s.id,
      title: s.name,
      subtitle: s.subject || "Student",
    })),
    ...topics.map((t) => ({
      kind: "topic" as const,
      id: t.id,
      title: t.title,
      subtitle: t.subject.trim() || "Topic",
    })),
    ...templates.map((t) => ({
      kind: "template" as const,
      id: t.id,
      title: t.title,
      subtitle: t.subject.trim() || t.kind,
    })),
    ...resources.map((r) => ({
      kind: "resource" as const,
      id: r.id,
      title: r.title,
      subtitle: r.type.replace("_", " "),
    })),
  ];
}
