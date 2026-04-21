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
  `);
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
