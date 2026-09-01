import { getDb } from "./client";
import type { Template, TemplateKind } from "../types";
import { emptyTemplateBody, parseTemplateKind } from "../lib/templates";

export async function listTemplates(opts?: {
  archived?: boolean;
  query?: string;
  kind?: TemplateKind;
}): Promise<Template[]> {
  const db = await getDb();
  const archived = opts?.archived ? 1 : 0;
  const query = opts?.query?.trim();
  const kind = opts?.kind;
  let rows: Template[] = [];
  if (query && kind) {
    const like = `%${query}%`;
    rows = await db.select<Template[]>(
      `SELECT * FROM templates
       WHERE archived = $1 AND kind = $2
         AND (title LIKE $3 OR subject LIKE $3 OR body LIKE $3)
       ORDER BY CASE WHEN trim(subject) = '' THEN 1 ELSE 0 END,
                subject COLLATE NOCASE, sort_order, title COLLATE NOCASE, id`,
      [archived, kind, like],
    );
  } else if (query) {
    const like = `%${query}%`;
    rows = await db.select<Template[]>(
      `SELECT * FROM templates
       WHERE archived = $1
         AND (title LIKE $2 OR subject LIKE $2 OR body LIKE $2)
       ORDER BY CASE WHEN trim(subject) = '' THEN 1 ELSE 0 END,
                subject COLLATE NOCASE, sort_order, title COLLATE NOCASE, id`,
      [archived, like],
    );
  } else if (kind) {
    rows = await db.select<Template[]>(
      `SELECT * FROM templates
       WHERE archived = $1 AND kind = $2
       ORDER BY CASE WHEN trim(subject) = '' THEN 1 ELSE 0 END,
                subject COLLATE NOCASE, sort_order, title COLLATE NOCASE, id`,
      [archived, kind],
    );
  } else {
    rows = await db.select<Template[]>(
      `SELECT * FROM templates
       WHERE archived = $1
       ORDER BY CASE WHEN trim(subject) = '' THEN 1 ELSE 0 END,
                subject COLLATE NOCASE, sort_order, title COLLATE NOCASE, id`,
      [archived],
    );
  }
  return rows.map((row) => ({ ...row, kind: parseTemplateKind(row.kind) }));
}

export async function listTemplateSubjects(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ subject: string }[]>(
    `SELECT DISTINCT subject FROM templates
     WHERE trim(subject) != ''
     ORDER BY subject COLLATE NOCASE`,
  );
  return rows.map((r) => r.subject);
}

export async function getTemplate(id: number): Promise<Template | null> {
  const db = await getDb();
  const rows = await db.select<Template[]>("SELECT * FROM templates WHERE id = $1", [id]);
  const row = rows[0];
  if (!row) return null;
  return { ...row, kind: parseTemplateKind(row.kind) };
}

async function nextTemplateSort(subject: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Record<string, number | null>[]>(
    `SELECT MAX(sort_order) AS max_sort FROM templates WHERE trim(subject) = trim($1)`,
    [subject],
  );
  const row = rows[0] ?? {};
  const raw = row.max_sort ?? Object.values(row)[0];
  const max = raw == null || raw === ("" as never) ? Number.NaN : Number(raw);
  return (Number.isFinite(max) ? max : -1) + 1;
}

export async function createTemplate(input: {
  title: string;
  subject?: string;
  kind?: TemplateKind;
  body?: string;
}): Promise<number> {
  const db = await getDb();
  const kind = parseTemplateKind(input.kind ?? "checklist");
  const subject = input.subject ?? "";
  const sort = await nextTemplateSort(subject);
  const result = await db.execute(
    `INSERT INTO templates (kind, title, subject, body, sort_order) VALUES ($1, $2, $3, $4, $5)`,
    [kind, input.title.trim(), subject, input.body ?? emptyTemplateBody(kind), sort],
  );
  return Number(result.lastInsertId);
}

export async function updateTemplate(
  id: number,
  patch: Partial<Pick<Template, "title" | "subject" | "body" | "archived" | "kind">>,
): Promise<void> {
  const db = await getDb();
  const current = await getTemplate(id);
  if (!current) return;
  const nextSubject = patch.subject ?? current.subject;
  const sortOrder =
    nextSubject !== current.subject ? await nextTemplateSort(nextSubject) : current.sort_order;
  await db.execute(
    `UPDATE templates
     SET kind = $1, title = $2, subject = $3, body = $4, archived = $5,
         sort_order = $6, updated_at = datetime('now')
     WHERE id = $7`,
    [
      parseTemplateKind(patch.kind ?? current.kind),
      patch.title ?? current.title,
      nextSubject,
      patch.body ?? current.body,
      patch.archived ?? current.archived,
      sortOrder,
      id,
    ],
  );
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM templates WHERE id = $1", [id]);
}

export async function deleteTemplates(ids: number[]): Promise<void> {
  for (const id of ids) {
    await deleteTemplate(id);
  }
}
