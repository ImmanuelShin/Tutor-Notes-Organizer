export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
    worksheet TEXT NOT NULL DEFAULT '',
    session_started_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    duration_minutes INTEGER,
    notes TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
    homework TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sub_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS learning_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_unit_id INTEGER NOT NULL REFERENCES sub_units(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS example_problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_unit_id INTEGER NOT NULL REFERENCES sub_units(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_unit_id INTEGER NOT NULL REFERENCES sub_units(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS student_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'in_progress',
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, topic_id)
  )`,
  `CREATE TABLE IF NOT EXISTS student_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    UNIQUE(student_id, goal_id)
  )`,
  `CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    file_path TEXT,
    body TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
    owner_student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS resource_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    pinned INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '{"items":[]}',
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sub_units_topic ON sub_units(topic_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_goals_sub_unit ON learning_goals(sub_unit_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_examples_sub_unit ON example_problems(sub_unit_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_sub_unit ON assessments(sub_unit_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_student_topics_student ON student_topics(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)`,
  `CREATE INDEX IF NOT EXISTS idx_resource_links_student ON resource_links(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_resource_links_topic ON resource_links(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_templates_kind ON templates(kind, sort_order)`,
];
