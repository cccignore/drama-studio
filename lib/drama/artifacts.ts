import { getDb } from "../db/sqlite";

export interface ArtifactRow {
  id: number;
  project_id: string;
  name: string;
  content_md: string;
  meta_json: string | null;
  version: number;
  created_at: number;
}

export interface Artifact {
  id: number;
  projectId: string;
  name: string;
  content: string;
  meta: Record<string, unknown> | null;
  version: number;
  createdAt: number;
}

function rowToArtifact(row: ArtifactRow): Artifact {
  let meta: Record<string, unknown> | null = null;
  if (row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json);
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    content: row.content_md,
    meta,
    version: row.version,
    createdAt: row.created_at,
  };
}

export function getLatestArtifact(projectId: string, name: string): Artifact | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? AND name = ? ORDER BY version DESC LIMIT 1`
    )
    .get(projectId, name) as ArtifactRow | undefined;
  return row ? rowToArtifact(row) : null;
}

export function listArtifacts(projectId: string): Artifact[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

export function saveArtifact(input: {
  projectId: string;
  name: string;
  content: string;
  meta?: Record<string, unknown> | null;
}): Artifact {
  const db = getDb();
  const latest = getLatestArtifact(input.projectId, input.name);
  const nextVersion = (latest?.version ?? 0) + 1;
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO artifacts (project_id, name, content_md, meta_json, version, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.projectId,
      input.name,
      input.content,
      input.meta ? JSON.stringify(input.meta) : null,
      nextVersion,
      now
    );
  return {
    id: Number(info.lastInsertRowid),
    projectId: input.projectId,
    name: input.name,
    content: input.content,
    meta: input.meta ?? null,
    version: nextVersion,
    createdAt: now,
  };
}
