import { getDb } from "../db/sqlite";

export interface ArtifactRow {
  id: number;
  project_id: string;
  name: string;
  content_md: string;
  meta_json: string | null;
  version: number;
  source?: string;
  parent_version?: number | null;
  created_at: number;
}

export interface Artifact {
  id: number;
  projectId: string;
  name: string;
  content: string;
  meta: Record<string, unknown> | null;
  version: number;
  source: string;
  parentVersion: number | null;
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
    source: row.source ?? "generate",
    parentVersion: row.parent_version ?? null,
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

export function getArtifactVersion(projectId: string, name: string, version: number): Artifact | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? AND name = ? AND version = ? LIMIT 1`
    )
    .get(projectId, name, version) as ArtifactRow | undefined;
  return row ? rowToArtifact(row) : null;
}

export function listArtifactHistory(projectId: string, name: string): Artifact[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? AND name = ? ORDER BY version DESC`
    )
    .all(projectId, name) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

export function listArtifacts(projectId: string): Artifact[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

export function listArtifactsByPrefix(projectId: string, prefix: string): Artifact[] {
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM artifacts a
       JOIN (SELECT name, MAX(version) AS v FROM artifacts WHERE project_id = ? AND name LIKE ? GROUP BY name) m
       ON m.name = a.name AND m.v = a.version
       WHERE a.project_id = ?
       ORDER BY a.name ASC`
    )
    .all(projectId, `${prefix}%`, projectId) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

export function getEpisodeIndices(projectId: string): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT name FROM artifacts WHERE project_id = ? AND name LIKE 'episode-%'`
    )
    .all(projectId) as { name: string }[];
  const idxs: number[] = [];
  for (const r of rows) {
    const m = r.name.match(/^episode-(\d+)$/);
    if (m) idxs.push(parseInt(m[1], 10));
  }
  return idxs.sort((a, b) => a - b);
}

export function getReviewIndices(projectId: string): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT name FROM artifacts WHERE project_id = ? AND name LIKE 'review-%'`
    )
    .all(projectId) as { name: string }[];
  const idxs: number[] = [];
  for (const r of rows) {
    const m = r.name.match(/^review-(\d+)$/);
    if (m) idxs.push(parseInt(m[1], 10));
  }
  return idxs.sort((a, b) => a - b);
}

export function saveArtifact(input: {
  projectId: string;
  name: string;
  content: string;
  meta?: Record<string, unknown> | null;
  source?: "generate" | "ai-edit" | "manual-edit" | "revert";
  parentVersion?: number | null;
}): Artifact {
  const db = getDb();
  const latest = getLatestArtifact(input.projectId, input.name);
  const nextVersion = (latest?.version ?? 0) + 1;
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO artifacts (project_id, name, content_md, meta_json, version, source, parent_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.projectId,
      input.name,
      input.content,
      input.meta ? JSON.stringify(input.meta) : null,
      nextVersion,
      input.source ?? "generate",
      input.parentVersion ?? null,
      now
    );
  return {
    id: Number(info.lastInsertRowid),
    projectId: input.projectId,
    name: input.name,
    content: input.content,
    meta: input.meta ?? null,
    version: nextVersion,
    source: input.source ?? "generate",
    parentVersion: input.parentVersion ?? null,
    createdAt: now,
  };
}
