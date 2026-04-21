import { getDb } from "../db/sqlite";

export type ConversationRole = "user" | "assistant" | "system";

export interface StepConversation {
  id: number;
  projectId: string;
  artifactName: string;
  role: ConversationRole;
  content: string;
  patch: unknown | null;
  appliedVersion: number | null;
  ts: number;
}

interface StepConversationRow {
  id: number;
  project_id: string;
  artifact_name: string;
  role: string;
  content: string;
  patch_json: string | null;
  applied_version: number | null;
  ts: number;
}

function rowToConversation(row: StepConversationRow): StepConversation {
  return {
    id: row.id,
    projectId: row.project_id,
    artifactName: row.artifact_name,
    role: row.role as ConversationRole,
    content: row.content,
    patch: row.patch_json ? safeParse(row.patch_json) : null,
    appliedVersion: row.applied_version ?? null,
    ts: row.ts,
  };
}

export function listStepConversations(
  projectId: string,
  artifactName: string,
  opts: { limit?: number } = {}
): StepConversation[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = getDb()
    .prepare(
      `SELECT * FROM step_conversations
       WHERE project_id = ? AND artifact_name = ?
       ORDER BY ts DESC, id DESC
       LIMIT ?`
    )
    .all(projectId, artifactName, limit) as StepConversationRow[];
  return rows.reverse().map(rowToConversation);
}

export function appendStepConversation(input: {
  projectId: string;
  artifactName: string;
  role: ConversationRole;
  content: string;
  patch?: unknown;
  appliedVersion?: number | null;
}): StepConversation {
  const now = Date.now();
  const info = getDb()
    .prepare(
      `INSERT INTO step_conversations
       (project_id, artifact_name, role, content, patch_json, applied_version, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.projectId,
      input.artifactName,
      input.role,
      input.content,
      input.patch === undefined ? null : JSON.stringify(input.patch),
      input.appliedVersion ?? null,
      now
    );
  return {
    id: Number(info.lastInsertRowid),
    projectId: input.projectId,
    artifactName: input.artifactName,
    role: input.role,
    content: input.content,
    patch: input.patch ?? null,
    appliedVersion: input.appliedVersion ?? null,
    ts: now,
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
