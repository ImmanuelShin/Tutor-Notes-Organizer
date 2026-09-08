import { getDb } from "./client";
import type { Resource, ResourceType } from "../types";
import { EMPTY_DOC } from "../types";
import { collectReferencedFiles } from "../lib/libraryFiles";
import { deleteAppFile } from "../lib/media";

export async function listResources(opts?: {
  type?: ResourceType | "all";
  query?: string;
  ownerStudentId?: number;
}): Promise<Resource[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts?.ownerStudentId != null) {
    params.push(opts.ownerStudentId);
    clauses.push(`owner_student_id = $${params.length}`);
  } else {
    clauses.push("owner_student_id IS NULL");
  }

  const type = opts?.type && opts.type !== "all" ? opts.type : null;
  if (type) {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }

  const query = opts?.query?.trim();
  if (query) {
    const like = `%${query}%`;
    params.push(like, like, like);
    const n = params.length;
    clauses.push(`(title LIKE $${n - 2} OR tags LIKE $${n - 1} OR url LIKE $${n})`);
  }

  const order =
    opts?.ownerStudentId != null ? "ORDER BY created_at DESC" : "ORDER BY title COLLATE NOCASE";
  return db.select<Resource[]>(
    `SELECT * FROM resources WHERE ${clauses.join(" AND ")} ${order}`,
    params,
  );
}

export async function listStudentsWithOwnedResources(): Promise<
  { id: number; name: string; subject: string }[]
> {
  const db = await getDb();
  return db.select(
    `SELECT s.id, s.name, s.subject
     FROM students s
     WHERE EXISTS (SELECT 1 FROM resources r WHERE r.owner_student_id = s.id)
     ORDER BY s.name COLLATE NOCASE`,
  );
}

export async function getResource(id: number): Promise<Resource | null> {
  const db = await getDb();
  const rows = await db.select<Resource[]>("SELECT * FROM resources WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createResource(input: {
  type: ResourceType;
  title: string;
  tags?: string;
  url?: string | null;
  file_path?: string | null;
  body?: string;
  owner_student_id?: number | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO resources (type, title, tags, url, file_path, body, owner_student_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.type,
      input.title.trim(),
      input.tags ?? "[]",
      input.url ?? null,
      input.file_path ?? null,
      input.body ?? EMPTY_DOC,
      input.owner_student_id ?? null,
    ],
  );
  return Number(result.lastInsertId);
}

export async function updateResource(
  id: number,
  patch: Partial<Pick<Resource, "title" | "tags" | "url" | "file_path" | "body">>,
): Promise<void> {
  const db = await getDb();
  const current = await getResource(id);
  if (!current) return;
  await db.execute(
    `UPDATE resources
     SET title = $1, tags = $2, url = $3, file_path = $4, body = $5, updated_at = datetime('now')
     WHERE id = $6`,
    [
      patch.title ?? current.title,
      patch.tags ?? current.tags,
      patch.url === undefined ? current.url : patch.url,
      patch.file_path === undefined ? current.file_path : patch.file_path,
      patch.body ?? current.body,
      id,
    ],
  );
}

export async function deleteResource(id: number): Promise<void> {
  const current = await getResource(id);
  const db = await getDb();
  await db.execute("DELETE FROM resources WHERE id = $1", [id]);
  if (current?.file_path) {
    const refs = await collectReferencedFiles();
    if (!refs.includes(current.file_path.replace(/\\/g, "/"))) {
      try {
        await deleteAppFile(current.file_path);
      } catch {
        // File may already be gone; the row is deleted either way.
      }
    }
  }
}

export async function deleteOwnedResources(studentId: number): Promise<void> {
  const owned = await listResources({ ownerStudentId: studentId });
  for (const row of owned) {
    await deleteResource(row.id);
  }
}

export async function listLinkedResources(opts: {
  studentId?: number;
  topicId?: number;
}): Promise<Resource[]> {
  const db = await getDb();
  if (opts.studentId) {
    return db.select<Resource[]>(
      `SELECT r.* FROM resources r
       JOIN resource_links l ON l.resource_id = r.id
       WHERE l.student_id = $1
       ORDER BY l.pinned DESC, r.title COLLATE NOCASE`,
      [opts.studentId],
    );
  }
  if (opts.topicId) {
    return db.select<Resource[]>(
      `SELECT r.* FROM resources r
       JOIN resource_links l ON l.resource_id = r.id
       WHERE l.topic_id = $1
       ORDER BY l.pinned DESC, r.title COLLATE NOCASE`,
      [opts.topicId],
    );
  }
  return [];
}

export async function linkResource(input: {
  resourceId: number;
  studentId?: number | null;
  topicId?: number | null;
  pinned?: boolean;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM resource_links
     WHERE resource_id = $1
       AND IFNULL(student_id, -1) = IFNULL($2, -1)
       AND IFNULL(topic_id, -1) = IFNULL($3, -1)`,
    [input.resourceId, input.studentId ?? null, input.topicId ?? null],
  );
  if (existing[0]) return;
  await db.execute(
    `INSERT INTO resource_links (resource_id, student_id, topic_id, pinned)
     VALUES ($1, $2, $3, $4)`,
    [
      input.resourceId,
      input.studentId ?? null,
      input.topicId ?? null,
      input.pinned ? 1 : 0,
    ],
  );
}

export async function unlinkResource(linkOr: {
  resourceId: number;
  studentId?: number;
  topicId?: number;
}): Promise<void> {
  const db = await getDb();
  if (linkOr.studentId) {
    await db.execute(
      `DELETE FROM resource_links WHERE resource_id = $1 AND student_id = $2`,
      [linkOr.resourceId, linkOr.studentId],
    );
    return;
  }
  if (linkOr.topicId) {
    await db.execute(
      `DELETE FROM resource_links WHERE resource_id = $1 AND topic_id = $2`,
      [linkOr.resourceId, linkOr.topicId],
    );
  }
}
