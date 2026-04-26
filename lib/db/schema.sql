CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '未命名',
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  content_md TEXT NOT NULL,
  meta_json  TEXT,
  version    INTEGER NOT NULL DEFAULT 1,
  source     TEXT NOT NULL DEFAULT 'generate',
  parent_version INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, name);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT NOT NULL,
  command      TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT,
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, ts);

CREATE TABLE IF NOT EXISTS llm_configs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  protocol      TEXT NOT NULL,
  base_url      TEXT NOT NULL,
  api_key       TEXT NOT NULL,
  model         TEXT NOT NULL,
  extra_headers TEXT,
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_llm_bindings (
  project_id TEXT NOT NULL,
  command    TEXT NOT NULL,
  config_id  TEXT NOT NULL,
  PRIMARY KEY(project_id, command)
);

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
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  source_text           TEXT NOT NULL,
  target_market         TEXT NOT NULL DEFAULT 'overseas',
  total_episodes        INTEGER NOT NULL DEFAULT 30,
  status                TEXT NOT NULL DEFAULT 'draft',
  use_complex_reversal  INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
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
