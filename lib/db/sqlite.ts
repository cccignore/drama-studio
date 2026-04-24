import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dataDir = process.env.DRAMA_DATA_DIR
    ? path.resolve(process.env.DRAMA_DATA_DIR)
    : path.resolve(process.cwd(), ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "drama.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.resolve(process.cwd(), "lib/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
  runMigrations(db);

  _db = db;
  return db;
}

function runMigrations(db: Database.Database) {
  const artifactColumns = db
    .prepare(`PRAGMA table_info(artifacts)`)
    .all() as Array<{ name: string }>;
  const hasColumn = (name: string) => artifactColumns.some((col) => col.name === name);
  if (!hasColumn("source")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN source TEXT NOT NULL DEFAULT 'generate'`);
  }
  if (!hasColumn("parent_version")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN parent_version INTEGER`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_role_bindings (
      slot       TEXT PRIMARY KEY,
      config_id  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_conversations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      TEXT NOT NULL,
      artifact_name   TEXT NOT NULL,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      patch_json      TEXT,
      applied_version INTEGER,
      ts              INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stepconv_project ON step_conversations(project_id, artifact_name, ts);

    CREATE TABLE IF NOT EXISTS batch_projects (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      source_text    TEXT NOT NULL,
      target_market  TEXT NOT NULL DEFAULT 'overseas',
      total_episodes INTEGER NOT NULL DEFAULT 30,
      status         TEXT NOT NULL DEFAULT 'draft',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_items (
      id                    TEXT PRIMARY KEY,
      batch_id              TEXT NOT NULL,
      source_title          TEXT,
      source_keywords       TEXT,
      source_summary        TEXT,
      source_text           TEXT,
      title                 TEXT,
      one_liner             TEXT,
      creative_md           TEXT,
      screenplay_md         TEXT,
      storyboard_md         TEXT,
      idea_selected         INTEGER NOT NULL DEFAULT 1,
      creative_selected     INTEGER NOT NULL DEFAULT 1,
      screenplay_selected   INTEGER NOT NULL DEFAULT 1,
      status                TEXT NOT NULL DEFAULT 'source_ready',
      error                 TEXT,
      meta_json             TEXT,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(batch_id) REFERENCES batch_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items(batch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items(batch_id, status);
  `);

  const batchItemColumns = db
    .prepare(`PRAGMA table_info(batch_items)`)
    .all() as Array<{ name: string }>;
  const hasBatchColumn = (name: string) => batchItemColumns.some((col) => col.name === name);
  if (!hasBatchColumn("source_title")) {
    db.exec(`ALTER TABLE batch_items ADD COLUMN source_title TEXT`);
  }
  if (!hasBatchColumn("source_keywords")) {
    db.exec(`ALTER TABLE batch_items ADD COLUMN source_keywords TEXT`);
  }
  if (!hasBatchColumn("source_summary")) {
    db.exec(`ALTER TABLE batch_items ADD COLUMN source_summary TEXT`);
  }
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
