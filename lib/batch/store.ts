import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite";
import { parseSourceDramas } from "./prompts";
import type { BatchItem, BatchItemStatus, BatchMarket, BatchProject, BatchReviewStage, ParsedSourceDrama } from "./types";

interface BatchProjectRow {
  id: string;
  title: string;
  source_text: string;
  target_market: string;
  total_episodes: number;
  status: string;
  use_complex_reversal: number | null;
  created_at: number;
  updated_at: number;
}

interface BatchItemRow {
  id: string;
  batch_id: string;
  source_title: string | null;
  source_keywords: string | null;
  source_summary: string | null;
  source_text: string | null;
  title: string | null;
  one_liner: string | null;
  protagonist: string | null;
  narrative_pov: string | null;
  audience: string | null;
  story_type: string | null;
  setting_text: string | null;
  act1: string | null;
  act2: string | null;
  act3: string | null;
  worldview: string | null;
  visual_tone: string | null;
  core_theme: string | null;
  creative_md: string | null;
  characters_md: string | null;
  outline_md: string | null;
  screenplay_md: string | null;
  storyboard_md: string | null;
  idea_selected: number;
  creative_selected: number;
  screenplay_selected: number;
  status: string;
  error: string | null;
  meta_json: string | null;
  created_at: number;
  updated_at: number;
}

function rowToProject(row: BatchProjectRow): BatchProject {
  return {
    id: row.id,
    title: row.title,
    sourceText: row.source_text,
    targetMarket: row.target_market === "domestic" ? "domestic" : "overseas",
    totalEpisodes: row.total_episodes,
    status: row.status,
    useComplexReversal: row.use_complex_reversal === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToItem(row: BatchItemRow): BatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    sourceTitle: row.source_title ?? "",
    sourceKeywords: row.source_keywords ?? "",
    sourceSummary: row.source_summary ?? "",
    sourceText: row.source_text ?? "",
    title: row.title ?? "",
    oneLiner: row.one_liner ?? "",
    protagonist: row.protagonist ?? "",
    narrativePov: row.narrative_pov ?? "",
    audience: row.audience ?? "",
    storyType: row.story_type ?? "",
    setting: row.setting_text ?? "",
    act1: row.act1 ?? "",
    act2: row.act2 ?? "",
    act3: row.act3 ?? "",
    worldview: row.worldview ?? "",
    visualTone: row.visual_tone ?? "",
    coreTheme: row.core_theme ?? "",
    creativeMd: row.creative_md ?? "",
    charactersMd: row.characters_md ?? "",
    outlineMd: row.outline_md ?? "",
    screenplayMd: row.screenplay_md ?? "",
    storyboardMd: row.storyboard_md ?? "",
    ideaSelected: row.idea_selected === 1,
    creativeSelected: row.creative_selected === 1,
    screenplaySelected: row.screenplay_selected === 1,
    status: row.status as BatchItemStatus,
    error: row.error ?? "",
    meta: row.meta_json ? safeJson(row.meta_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function listBatchProjects(): BatchProject[] {
  const rows = getDb()
    .prepare(`SELECT * FROM batch_projects ORDER BY updated_at DESC`)
    .all() as BatchProjectRow[];
  return rows.map(rowToProject);
}

export function getBatchProject(id: string): BatchProject | null {
  const row = getDb()
    .prepare(`SELECT * FROM batch_projects WHERE id = ?`)
    .get(id) as BatchProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function createBatchProject(input: {
  title?: string;
  sourceText: string;
  targetMarket: BatchMarket;
  totalEpisodes?: number;
  useComplexReversal?: boolean;
  sourceMode?: "hongguo" | "manual";
}): BatchProject {
  const now = Date.now();
  const id = `bat_${nanoid(10)}`;
  const db = getDb();
  db
    .prepare(
      `INSERT INTO batch_projects
       (id, title, source_text, target_market, total_episodes, status, use_complex_reversal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.title?.trim() || "红果批量工厂",
      input.sourceText.trim(),
      input.targetMarket,
      input.totalEpisodes ?? 30,
      "draft",
      input.useComplexReversal ? 1 : 0,
      now,
      now
    );
  const mode = input.sourceMode ?? "hongguo";
  if (mode === "manual") {
    const lines = input.sourceText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 6); // reject "复仇" or "重生" 这种过短输入
    if (lines.length > 0) insertManualOneLiners(id, lines);
  } else {
    const sources = parseSourceDramas(input.sourceText);
    if (sources.length > 0) insertSourceDramas(id, sources);
  }
  return getBatchProject(id)!;
}

export function updateBatchProject(
  id: string,
  patch: Partial<
    Pick<BatchProject, "title" | "sourceText" | "targetMarket" | "totalEpisodes" | "status" | "useComplexReversal">
  >
): BatchProject | null {
  const existing = getBatchProject(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE batch_projects
       SET title = ?, source_text = ?, target_market = ?, total_episodes = ?, status = ?, use_complex_reversal = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.title,
      next.sourceText,
      next.targetMarket,
      next.totalEpisodes,
      next.status,
      next.useComplexReversal ? 1 : 0,
      now,
      id
    );
  return getBatchProject(id);
}

export function deleteBatchProject(id: string): boolean {
  getDb().prepare(`DELETE FROM batch_projects WHERE id = ?`).run(id);
  return true;
}

export function listBatchItems(batchId: string): BatchItem[] {
  const rows = getDb()
    .prepare(`SELECT * FROM batch_items WHERE batch_id = ? ORDER BY created_at ASC`)
    .all(batchId) as BatchItemRow[];
  return rows.map(rowToItem);
}

export function getBatchItem(id: string): BatchItem | null {
  const row = getDb()
    .prepare(`SELECT * FROM batch_items WHERE id = ?`)
    .get(id) as BatchItemRow | undefined;
  return row ? rowToItem(row) : null;
}

// Manual entry: each line is already a polished one-liner from the user, so
// items skip the distill stage and land at status="distill_ready" — the
// creative stage will pick them up directly.
export function insertManualOneLiners(batchId: string, lines: string[]): BatchItem[] {
  const db = getDb();
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO batch_items
     (id, batch_id, source_title, source_keywords, source_summary, source_text, title, one_liner, status, created_at, updated_at)
     VALUES (?, ?, '', '', '', ?, '', ?, 'distill_ready', ?, ?)`
  );
  const ids: string[] = [];
  const tx = db.transaction(() => {
    for (const line of lines) {
      const id = `bit_${nanoid(10)}`;
      ids.push(id);
      insert.run(id, batchId, line, line, now + ids.length, now + ids.length);
    }
    db.prepare(`UPDATE batch_projects SET status = ?, updated_at = ? WHERE id = ?`).run("distill_ready", now, batchId);
  });
  tx();
  return ids.map((id) => getBatchItem(id)!).filter(Boolean);
}

export function insertSourceDramas(batchId: string, sources: ParsedSourceDrama[]): BatchItem[] {
  const db = getDb();
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO batch_items
     (id, batch_id, source_title, source_keywords, source_summary, source_text, title, one_liner, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', 'source_ready', ?, ?)`
  );
  const ids: string[] = [];
  const tx = db.transaction(() => {
    for (const source of sources) {
      const id = `bit_${nanoid(10)}`;
      ids.push(id);
      insert.run(
        id,
        batchId,
        source.sourceTitle.trim(),
        source.sourceKeywords.trim(),
        source.sourceSummary.trim(),
        source.sourceText.trim(),
        source.sourceTitle.trim(),
        now + ids.length,
        now + ids.length
      );
    }
    db.prepare(`UPDATE batch_projects SET status = ?, updated_at = ? WHERE id = ?`).run("sources_ready", now, batchId);
  });
  tx();
  return ids.map((id) => getBatchItem(id)!).filter(Boolean);
}

export function upsertImportedItems(
  batchId: string,
  rows: Array<Partial<BatchItem> & { id?: string }>,
  options?: { reviewStage?: BatchReviewStage; replaceSelection?: boolean; replaceAll?: boolean }
): BatchItem[] {
  const out: BatchItem[] = [];
  const importedIds = new Set<string>();
  for (const row of rows) {
    const requested = row.id ? getBatchItem(row.id) : null;
    const id = requested && requested.batchId === batchId ? requested.id : `bit_${nanoid(10)}`;
    const existing = getBatchItem(id);
    if (existing) {
      out.push(updateBatchItem(id, row)!);
    } else {
      const now = Date.now();
      getDb()
        .prepare(
          `INSERT INTO batch_items
           (id, batch_id, source_title, source_keywords, source_summary, source_text, title, one_liner,
            protagonist, narrative_pov, audience, story_type, setting_text, act1, act2, act3,
            worldview, visual_tone, core_theme,
            creative_md, characters_md, outline_md, screenplay_md, storyboard_md,
            idea_selected, creative_selected, screenplay_selected, status, error, meta_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          batchId,
          row.sourceTitle ?? row.title ?? "",
          row.sourceKeywords ?? "",
          row.sourceSummary ?? "",
          row.sourceText ?? "",
          row.title ?? "",
          row.oneLiner ?? "",
          row.protagonist ?? "",
          row.narrativePov ?? "",
          row.audience ?? "",
          row.storyType ?? "",
          row.setting ?? "",
          row.act1 ?? "",
          row.act2 ?? "",
          row.act3 ?? "",
          row.worldview ?? "",
          row.visualTone ?? "",
          row.coreTheme ?? "",
          row.creativeMd ?? "",
          row.charactersMd ?? "",
          row.outlineMd ?? "",
          row.screenplayMd ?? "",
          row.storyboardMd ?? "",
          row.ideaSelected === false ? 0 : 1,
          row.creativeSelected === false ? 0 : 1,
          row.screenplaySelected === false ? 0 : 1,
          row.status ?? inferStatus(row),
          row.error ?? "",
          row.meta ? JSON.stringify(row.meta) : null,
          now,
          now
        );
      out.push(getBatchItem(id)!);
    }
    importedIds.add(id);
  }
  if (options?.replaceAll) {
    deleteBatchItemsExcept(batchId, importedIds);
  }
  if (options?.reviewStage && options.replaceSelection) {
    replaceStageSelection(batchId, options.reviewStage, out.map((item) => item.id));
  }
  updateBatchProject(batchId, { status: "imported" });
  return out;
}

export function deleteBatchItemsExcept(batchId: string, keepIds: Set<string>): number {
  const db = getDb();
  if (keepIds.size === 0) {
    const res = db.prepare(`DELETE FROM batch_items WHERE batch_id = ?`).run(batchId);
    return res.changes;
  }
  const placeholders = Array.from(keepIds).map(() => "?").join(",");
  const res = db
    .prepare(`DELETE FROM batch_items WHERE batch_id = ? AND id NOT IN (${placeholders})`)
    .run(batchId, ...Array.from(keepIds));
  return res.changes;
}

export function deleteBatchItems(batchId: string, ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const res = getDb()
    .prepare(`DELETE FROM batch_items WHERE batch_id = ? AND id IN (${placeholders})`)
    .run(batchId, ...ids);
  return res.changes;
}

function replaceStageSelection(batchId: string, stage: BatchReviewStage, keptIds: string[]): void {
  const column =
    stage === "sources" ? "idea_selected" : stage === "creative" ? "creative_selected" : "screenplay_selected";
  const db = getDb();
  if (keptIds.length === 0) {
    db.prepare(`UPDATE batch_items SET ${column} = 0, updated_at = ? WHERE batch_id = ?`).run(Date.now(), batchId);
    return;
  }
  const placeholders = keptIds.map(() => "?").join(",");
  const now = Date.now();
  db.prepare(`UPDATE batch_items SET ${column} = 0, updated_at = ? WHERE batch_id = ? AND id NOT IN (${placeholders})`)
    .run(now, batchId, ...keptIds);
  db.prepare(`UPDATE batch_items SET ${column} = 1, updated_at = ? WHERE batch_id = ? AND id IN (${placeholders})`)
    .run(now, batchId, ...keptIds);
}

function inferStatus(row: Partial<BatchItem>): BatchItemStatus {
  if (row.storyboardMd) return "storyboard_ready";
  if (row.screenplayMd) return "screenplay_ready";
  if (row.creativeMd || row.act1 || row.act2 || row.act3) return "creative_ready";
  return "source_ready";
}

export function updateBatchItem(id: string, patch: Partial<BatchItem>): BatchItem | null {
  const existing = getBatchItem(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE batch_items
       SET source_title = ?, source_keywords = ?, source_summary = ?, source_text = ?, title = ?, one_liner = ?,
           protagonist = ?, narrative_pov = ?, audience = ?, story_type = ?, setting_text = ?, act1 = ?, act2 = ?, act3 = ?,
           worldview = ?, visual_tone = ?, core_theme = ?,
           creative_md = ?, characters_md = ?, outline_md = ?, screenplay_md = ?, storyboard_md = ?,
           idea_selected = ?, creative_selected = ?, screenplay_selected = ?, status = ?, error = ?, meta_json = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.sourceTitle,
      next.sourceKeywords,
      next.sourceSummary,
      next.sourceText,
      next.title,
      next.oneLiner,
      next.protagonist,
      next.narrativePov,
      next.audience,
      next.storyType,
      next.setting,
      next.act1,
      next.act2,
      next.act3,
      next.worldview,
      next.visualTone,
      next.coreTheme,
      next.creativeMd,
      next.charactersMd,
      next.outlineMd,
      next.screenplayMd,
      next.storyboardMd,
      next.ideaSelected ? 1 : 0,
      next.creativeSelected ? 1 : 0,
      next.screenplaySelected ? 1 : 0,
      next.status,
      next.error,
      next.meta ? JSON.stringify(next.meta) : null,
      now,
      id
    );
  updateBatchProject(existing.batchId, { status: next.status });
  return getBatchItem(id);
}

export function updateBatchItemsSelection(
  batchId: string,
  input: Array<{ id: string; ideaSelected?: boolean; creativeSelected?: boolean; screenplaySelected?: boolean }>
): BatchItem[] {
  const out: BatchItem[] = [];
  for (const row of input) {
    const item = getBatchItem(row.id);
    if (!item || item.batchId !== batchId) continue;
    const updated = updateBatchItem(row.id, {
      ideaSelected: row.ideaSelected ?? item.ideaSelected,
      creativeSelected: row.creativeSelected ?? item.creativeSelected,
      screenplaySelected: row.screenplaySelected ?? item.screenplaySelected,
    });
    if (updated) out.push(updated);
  }
  return out;
}
