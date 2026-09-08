import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db/client";

const PATH_RE = /(?:media|pdfs)\/[^"\\]+/g;

export type PathRewrite = {
  from: string;
  to: string;
};

function addPaths(text: string | null | undefined, into: Set<string>) {
  if (!text) return;
  const matches = text.match(PATH_RE);
  if (!matches) return;
  for (const match of matches) {
    into.add(match.replace(/\\/g, "/"));
  }
}

function rewriteText(text: string, map: Record<string, string>): string {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const from of keys) {
    const to = map[from];
    if (!from || from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

export async function collectReferencedFiles(): Promise<string[]> {
  const db = await getDb();
  const found = new Set<string>();

  const resources = await db.select<{ file_path: string | null; body: string }[]>(
    "SELECT file_path, body FROM resources",
  );
  for (const row of resources) {
    if (row.file_path) found.add(row.file_path.replace(/\\/g, "/"));
    addPaths(row.body, found);
  }

  const students = await db.select<{ notes: string; worksheet: string; page_layout: string }[]>(
    "SELECT notes, worksheet, IFNULL(page_layout, '') AS page_layout FROM students",
  );
  for (const row of students) {
    addPaths(row.notes, found);
    addPaths(row.worksheet, found);
    addPaths(row.page_layout, found);
  }

  const sessions = await db.select<{ notes: string }[]>("SELECT notes FROM sessions");
  for (const row of sessions) addPaths(row.notes, found);

  const examples = await db.select<{ body: string }[]>("SELECT body FROM example_problems");
  for (const row of examples) addPaths(row.body, found);

  return [...found];
}

export async function sweepOrphanedFiles(): Promise<number> {
  const keep = await collectReferencedFiles();
  return invoke<number>("sweep_orphaned_files", { keep });
}

export async function applyPathRewrites(rewrites: PathRewrite[]): Promise<number> {
  const map = Object.fromEntries(rewrites.map((r) => [r.from, r.to]));
  if (!rewrites.length) return 0;
  const db = await getDb();
  let updated = 0;

  const resources = await db.select<{ id: number; file_path: string | null; body: string }[]>(
    "SELECT id, file_path, body FROM resources",
  );
  for (const row of resources) {
    const file_path = row.file_path && map[row.file_path] ? map[row.file_path] : row.file_path;
    const body = rewriteText(row.body ?? "", map);
    if (file_path === row.file_path && body === row.body) continue;
    await db.execute(
      "UPDATE resources SET file_path = $1, body = $2, updated_at = datetime('now') WHERE id = $3",
      [file_path, body, row.id],
    );
    updated += 1;
  }

  const students = await db.select<
    { id: number; notes: string; worksheet: string; page_layout: string }[]
  >("SELECT id, notes, worksheet, IFNULL(page_layout, '') AS page_layout FROM students");
  for (const row of students) {
    const notes = rewriteText(row.notes ?? "", map);
    const worksheet = rewriteText(row.worksheet ?? "", map);
    const page_layout = rewriteText(row.page_layout ?? "", map);
    if (notes === row.notes && worksheet === row.worksheet && page_layout === row.page_layout) {
      continue;
    }
    await db.execute(
      "UPDATE students SET notes = $1, worksheet = $2, page_layout = $3, updated_at = datetime('now') WHERE id = $4",
      [notes, worksheet, page_layout, row.id],
    );
    updated += 1;
  }

  const sessions = await db.select<{ id: number; notes: string }[]>("SELECT id, notes FROM sessions");
  for (const row of sessions) {
    const notes = rewriteText(row.notes ?? "", map);
    if (notes === row.notes) continue;
    await db.execute("UPDATE sessions SET notes = $1 WHERE id = $2", [notes, row.id]);
    updated += 1;
  }

  const examples = await db.select<{ id: number; body: string }[]>(
    "SELECT id, body FROM example_problems",
  );
  for (const row of examples) {
    const body = rewriteText(row.body ?? "", map);
    if (body === row.body) continue;
    await db.execute("UPDATE example_problems SET body = $1 WHERE id = $2", [body, row.id]);
    updated += 1;
  }

  return updated;
}

export async function optimizeLibrary(): Promise<{ rewrites: number; removed: number }> {
  const rewrites = await invoke<PathRewrite[]>("optimize_library");
  await applyPathRewrites(rewrites);
  const removed = await sweepOrphanedFiles();
  return { rewrites: rewrites.length, removed };
}
