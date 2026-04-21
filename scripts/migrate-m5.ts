import { getDb } from "../lib/db/sqlite";

export function runM5Migration() {
  const db = getDb();
  const columns = db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));
  if (!names.has("source")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN source TEXT NOT NULL DEFAULT 'generate'`);
  }
  if (!names.has("parent_version")) {
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
  console.log("[migrate-m5] schema ready");
}

if (process.argv[1]?.endsWith("migrate-m5.ts")) {
  runM5Migration();
}
