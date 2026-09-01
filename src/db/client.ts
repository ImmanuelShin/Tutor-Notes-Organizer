import Database from "@tauri-apps/plugin-sql";
import { SCHEMA_STATEMENTS } from "./schema";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      const instance = await Database.load("sqlite:tutor.db");
      await instance.execute("PRAGMA foreign_keys = ON");
      try {
        await instance.execute("PRAGMA journal_mode = WAL");
      } catch {
        // WAL is optional; some environments reject PRAGMA via execute
      }
      for (const statement of SCHEMA_STATEMENTS) {
        await instance.execute(statement);
      }
      await migrateStudentsColumns(instance);
      await migrateResourcesColumns(instance);
      await migrateTemplatesTable(instance);
      db = instance;
      return instance;
    })();
  }
  return initPromise;
}

async function migrateStudentsColumns(instance: Database): Promise<void> {
  const cols = await instance.select<{ name: string }[]>("PRAGMA table_info(students)");
  if (!cols.some((c) => c.name === "worksheet")) {
    await instance.execute("ALTER TABLE students ADD COLUMN worksheet TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c) => c.name === "session_started_at")) {
    await instance.execute("ALTER TABLE students ADD COLUMN session_started_at TEXT");
  }
  if (!cols.some((c) => c.name === "page_layout")) {
    await instance.execute("ALTER TABLE students ADD COLUMN page_layout TEXT NOT NULL DEFAULT ''");
  }
}

async function migrateTemplatesTable(instance: Database): Promise<void> {
  await instance.execute(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '{"items":[]}',
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await instance.execute(
    "CREATE INDEX IF NOT EXISTS idx_templates_kind ON templates(kind, sort_order)",
  );
}

async function migrateResourcesColumns(instance: Database): Promise<void> {
  const cols = await instance.select<{ name: string }[]>("PRAGMA table_info(resources)");
  if (!cols.some((c) => c.name === "owner_student_id")) {
    await instance.execute(
      "ALTER TABLE resources ADD COLUMN owner_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE",
    );
  }
  await instance.execute(
    "CREATE INDEX IF NOT EXISTS idx_resources_owner ON resources(owner_student_id)",
  );
}

export async function initDb(): Promise<void> {
  await getDb();
}
