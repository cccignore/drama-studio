import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite";
import { defaultDramaState, type DramaState, type Project, type ProjectRow } from "./types";

function rowToProject(row: ProjectRow): Project {
  let state: DramaState;
  try {
    state = JSON.parse(row.state_json) as DramaState;
  } catch {
    state = defaultDramaState();
  }
  return { id: row.id, title: row.title, state, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(input: { title?: string; state?: Partial<DramaState> }): Project {
  const id = `prj_${nanoid(10)}`;
  const now = Date.now();
  const state: DramaState = { ...defaultDramaState(), ...(input.state ?? {}) };
  getDb()
    .prepare(
      `INSERT INTO projects (id, title, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, input.title?.trim() || "未命名项目", JSON.stringify(state), now, now);
  return getProject(id)!;
}

export function updateProject(
  id: string,
  patch: { title?: string; state?: Partial<DramaState> }
): Project | null {
  const existing = getProject(id);
  if (!existing) return null;
  const nextState = patch.state ? { ...existing.state, ...patch.state } : existing.state;
  const nextTitle = patch.title?.trim() || existing.title;
  const now = Date.now();
  getDb()
    .prepare(`UPDATE projects SET title = ?, state_json = ?, updated_at = ? WHERE id = ?`)
    .run(nextTitle, JSON.stringify(nextState), now, id);
  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM artifacts WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM events WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM project_llm_bindings WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  tx();
  return true;
}

export function logEvent(projectId: string, command: string, type: string, payload?: unknown) {
  getDb()
    .prepare(`INSERT INTO events (project_id, command, type, payload_json, ts) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, command, type, payload === undefined ? null : JSON.stringify(payload), Date.now());
}
