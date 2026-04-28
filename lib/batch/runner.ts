import { TOKEN_BUDGETS } from "../llm/budgets";
import { resolveConfigForCommand } from "../llm/router";
import { streamLLM } from "../llm/stream";
import type { LLMConfig, LLMMessage } from "../llm/types";
import {
  buildCreativeMessages,
  buildDistillMessages,
  buildScreenplayChunkMessages,
  buildStoryboardChunkMessages,
} from "./prompts";
import {
  getBatchProject,
  listBatchItems,
  updateBatchItem,
  updateBatchProject,
} from "./store";
import type { BatchItem, BatchProject, BatchStage } from "./types";

export interface RunBatchResult {
  stage: BatchStage;
  created: number;
  updated: number;
  failed: number;
}

// Episodes per LLM call. Each episode is dense (5–6 子场次, 1500–2500 字),
// so 3-per-batch lands around 5000–7500 字 ≈ 4–6k tokens — comfortably under
// the 12k longArtifact cap, leaving room for reasoning tokens and avoiding
// length-cap retry loops. Earlier we used 5 here, which routinely tripped
// finish_reason=length on every chunk.
const EPISODES_PER_CHUNK = 3;
// How many trailing characters of already-generated screenplay to feed into
// the next chunk's prompt for continuity. ~600 chars ≈ a couple of子场次,
// enough to pick up the cliffhanger without bloating the context.
const CONTINUITY_TAIL_CHARS = 600;

export async function runBatchStage(input: {
  batchId: string;
  stage: BatchStage;
  batchSize?: number;
  selectedOnly?: boolean;
  signal?: AbortSignal;
}): Promise<RunBatchResult> {
  const project = getBatchProject(input.batchId);
  if (!project) throw new Error("批量任务不存在");
  const cfg = resolveConfigForBatchStage(input.stage);
  if (!cfg?.apiKey) throw new Error("未配置可用的模型，请先到模型设置添加 LLM 配置");

  const targets = selectTargets(listBatchItems(project.id), input.stage, input.selectedOnly ?? false);
  let updated = 0;
  let failed = 0;
  await mapWithConcurrency(targets, input.batchSize ?? 3, async (item) => {
    if (input.signal?.aborted) throw new Error("已取消");
    try {
      updateBatchItem(item.id, { status: `${input.stage}_running` as BatchItem["status"], error: "" });
      if (input.stage === "distill") {
        const { content } = await collectLLM(cfg, buildDistillMessages(item, project.targetMarket), {
          temperature: 0.4,
          maxTokens: TOKEN_BUDGETS.shortDraft,
          signal: input.signal,
        });
        // Strip stray prefixes/quotes the model sometimes prepends despite
        // the system instructions (一句话：xxx, "xxx"，「xxx」). Keep only
        // the first non-empty line — the prompt explicitly asks for a single
        // sentence so anything beyond is noise.
        const oneLiner = sanitizeDistillOutput(content);
        updateBatchItem(item.id, {
          oneLiner,
          status: "distill_ready",
          error: "",
        });
      } else if (input.stage === "creative") {
        const { content } = await collectLLM(cfg, buildCreativeMessages(project, item), {
          temperature: 0.75,
          maxTokens: TOKEN_BUDGETS.longArtifact,
          signal: input.signal,
        });
        const parsed = parseCreativeStructured(content);
        updateBatchItem(item.id, {
          ...parsed,
          // Preserve the distill-stage oneLiner — `parsed` no longer carries
          // a oneLiner field, but defending against future regressions.
          oneLiner: item.oneLiner || parsed.oneLiner || "",
          creativeMd: renderCreativeMd(parsed, content),
          status: "creative_ready",
          error: "",
        });
      } else if (input.stage === "screenplay") {
        const screenplay = await generateScreenplayChunked(cfg, project, item, input.signal);
        updateBatchItem(item.id, {
          screenplayMd: screenplay,
          status: "screenplay_ready",
          error: "",
        });
      } else {
        const storyboard = await generateStoryboardChunked(cfg, project, item, input.signal);
        updateBatchItem(item.id, {
          storyboardMd: storyboard,
          status: "storyboard_ready",
          error: "",
        });
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      // Persist any partial output the chunk runner accumulated, so a failed
      // run doesn't lose what was already generated. The chunk helpers attach
      // the partial as `(err as any).partial`.
      const partial =
        err && typeof err === "object" && "partial" in err
          ? (err as { partial?: string }).partial ?? ""
          : "";
      const patch: Partial<BatchItem> & { status: BatchItem["status"]; error: string } = {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
      if (partial && input.stage === "screenplay") patch.screenplayMd = partial;
      if (partial && input.stage === "storyboard") patch.storyboardMd = partial;
      updateBatchItem(item.id, patch);
    }
  });
  updateBatchProject(project.id, { status: `${input.stage}_ready` });
  return { stage: input.stage, created: 0, updated, failed };
}

function resolveConfigForBatchStage(stage: BatchStage): LLMConfig | null {
  if (stage === "screenplay") return resolveConfigForCommand("episode");
  if (stage === "storyboard") return resolveConfigForCommand("episode");
  // distill + creative both fall back to the start/creative slot.
  return resolveConfigForCommand("creative") ?? resolveConfigForCommand("start");
}

// Best-effort cleanup of distill output. The system prompt forbids prefixes
// and surrounding quotes, but providers occasionally ignore that. Keep the
// first non-empty line and strip wrapping quotes / Markdown noise.
function sanitizeDistillOutput(raw: string): string {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  return firstLine
    .replace(/^[#*\-\d.、)]+\s*/, "")
    .replace(/^一句话(?:题材)?[:：]\s*/, "")
    .replace(/^本剧讲述[:：]?\s*/, "")
    .replace(/^[「『""'']+/, "")
    .replace(/[」』""'']+$/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function selectTargets(items: BatchItem[], stage: BatchStage, selectedOnly: boolean): BatchItem[] {
  // A row is targeted if its current artifact slot is missing OR the previous
  // run ended in `failed` / left a zombie `*_running` state behind (e.g. the
  // container restarted mid-run). Resuming is safe: the chunked runner reads
  // existing partial output from the DB and continues from the cursor.
  const isResumable = (status: BatchItem["status"], stageRunning: BatchItem["status"]): boolean =>
    status === "failed" || status === stageRunning;
  if (stage === "distill") {
    return items.filter(
      (item) =>
        item.sourceText &&
        (!item.oneLiner || isResumable(item.status, "distill_running")) &&
        (!selectedOnly || item.ideaSelected)
    );
  }
  if (stage === "creative") {
    return items.filter(
      (item) =>
        // Creative stage now consumes the distilled one-liner. Manual entries
        // already have oneLiner filled and status === "distill_ready"; Hongguo
        // entries get their oneLiner from the distill stage. We fall back to
        // sourceText for legacy batches where oneLiner was never populated.
        (item.oneLiner || item.sourceText) &&
        ((!item.creativeMd && !item.act1) || isResumable(item.status, "creative_running")) &&
        (!selectedOnly || item.ideaSelected)
    );
  }
  if (stage === "screenplay") {
    return items.filter(
      (item) =>
        (item.creativeMd || item.act1) &&
        (!item.screenplayMd || isResumable(item.status, "screenplay_running")) &&
        (!selectedOnly || item.creativeSelected)
    );
  }
  if (stage === "storyboard") {
    return items.filter(
      (item) =>
        item.screenplayMd &&
        (!item.storyboardMd || isResumable(item.status, "storyboard_running")) &&
        (!selectedOnly || item.screenplaySelected)
    );
  }
  return [];
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const concurrency = Math.max(1, Math.min(100, Math.floor(limit || 1)));
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export interface ParsedCreative {
  title: string;
  oneLiner: string;
  protagonist: string;
  narrativePov: string;
  audience: string;
  storyType: string;
  setting: string;
  act1: string;
  act2: string;
  act3: string;
  worldview: string;
  visualTone: string;
  coreTheme: string;
}

const CREATIVE_LABELS: Array<{ key: keyof ParsedCreative; aliases: RegExp }> = [
  { key: "title", aliases: /^(?:新剧名|剧名|标题)/ },
  { key: "protagonist", aliases: /^第一主角/ },
  { key: "narrativePov", aliases: /^叙事视角/ },
  { key: "audience", aliases: /^受众/ },
  { key: "storyType", aliases: /^故事类型/ },
  { key: "setting", aliases: /^故事背景/ },
  { key: "worldview", aliases: /^世界观设定/ },
  { key: "visualTone", aliases: /^视觉基调/ },
  { key: "coreTheme", aliases: /^核心主题/ },
];

export function parseCreativeStructured(content: string): ParsedCreative {
  const out: ParsedCreative = {
    title: "",
    oneLiner: "",
    protagonist: "",
    narrativePov: "",
    audience: "",
    storyType: "",
    setting: "",
    act1: "",
    act2: "",
    act3: "",
    worldview: "",
    visualTone: "",
    coreTheme: "",
  };
  const rawLines = content.split(/\r?\n/);
  const lines = rawLines.map((line) =>
    line
      .replace(/^#+\s*/, "")
      .replace(/^[-]\s*/, "")
      .replace(/^\*+\s*/, "")
      .replace(/\*+$/, "")
      .replace(/^\d+[.、)]\s*/, "")
      .replace(/\*\*/g, "")
      .trim()
  );

  const labelIndex = (predicate: (line: string) => boolean): number =>
    lines.findIndex(predicate);

  const sliceUntilNextLabel = (startIdx: number): string => {
    const buf: string[] = [];
    for (let i = startIdx; i < lines.length; i += 1) {
      const line = lines[i];
      if (isAnyLabel(line)) break;
      buf.push(rawLines[i]);
    }
    return buf.join("\n").trim();
  };

  for (const { key, aliases } of CREATIVE_LABELS) {
    const idx = labelIndex((line) => aliases.test(line));
    if (idx < 0) continue;
    const headLine = lines[idx];
    const colonIdx = headLine.search(/[:：]/);
    let inline = colonIdx >= 0 ? headLine.slice(colonIdx + 1).trim() : "";
    inline = inline.replace(/^《(.+)》$/, "$1").trim();
    if (key === "title") {
      // Legacy form: `# 1. 新剧名` followed by `《Title》` on the next non-empty line.
      if (!inline) {
        for (let j = idx + 1; j < lines.length; j += 1) {
          const candidate = lines[j];
          if (!candidate) continue;
          if (isAnyLabel(candidate)) break;
          inline = candidate.replace(/^《(.+)》$/, "$1").trim();
          break;
        }
      }
      out.title = inline;
    } else {
      const tail = sliceUntilNextLabel(idx + 1);
      const combined = inline ? (tail ? `${inline}\n${tail}` : inline) : tail;
      out[key] = combined.trim();
    }
  }

  // act1/act2/act3 — 故事梗概 通常先于 Act 1，但也可能省略。
  const actBlocks = extractActs(rawLines);
  out.act1 = actBlocks.act1;
  out.act2 = actBlocks.act2;
  out.act3 = actBlocks.act3;

  // Note: oneLiner is owned by the distill stage now and intentionally NOT
  // derived here — the runner explicitly preserves item.oneLiner when
  // applying the parsed creative output. The field stays on ParsedCreative
  // only for backward-compat with extractCreativeHead callers.

  // 清理 title 残留
  out.title = out.title.replace(/^《(.+)》$/, "$1").trim();

  return out;
}

function isAnyLabel(line: string): boolean {
  if (!line) return false;
  if (CREATIVE_LABELS.some(({ aliases }) => aliases.test(line))) return true;
  if (/^故事梗概/.test(line)) return true;
  if (/^Act\s*[123][:：]/i.test(line)) return true;
  return false;
}

const POST_ACT_LABELS = /^(?:世界观设定|视觉基调|核心主题)/;

function extractActs(rawLines: string[]): { act1: string; act2: string; act3: string } {
  const trimmed = rawLines.map((line) =>
    line.replace(/^#+\s*/, "").replace(/^[*-]\s*/, "").replace(/\*\*/g, "")
  );
  const find = (pattern: RegExp): number =>
    trimmed.findIndex((line) => pattern.test(line.trim()));
  const idx1 = find(/^(?:故事梗概[:：]?\s*)?Act\s*1[:：]/i);
  const idx2 = find(/^Act\s*2[:：]/i);
  const idx3 = find(/^Act\s*3[:：]/i);
  // Act 3 ends at the first post-act section (世界观设定/视觉基调/核心主题) or EOF.
  const idxPostAct = trimmed.findIndex((line) => POST_ACT_LABELS.test(line.trim()));
  const slice = (from: number, to: number): string => {
    if (from < 0) return "";
    const end = to > from ? to : trimmed.length;
    const buf: string[] = [];
    const head = trimmed[from].replace(/^故事梗概[:：]?\s*/i, "").replace(/^Act\s*[123][:：]\s*/i, "");
    if (head.trim()) buf.push(head.trim());
    for (let i = from + 1; i < end; i += 1) {
      const line = trimmed[i];
      if (/^(?:故事梗概[:：]?\s*)?Act\s*[123][:：]/i.test(line.trim())) break;
      if (POST_ACT_LABELS.test(line.trim())) break;
      buf.push(line);
    }
    return buf.join("\n").trim();
  };
  const act3End = idxPostAct >= 0 ? idxPostAct : -1;
  return {
    act1: slice(idx1, idx2 >= 0 ? idx2 : idx3 >= 0 ? idx3 : act3End),
    act2: slice(idx2, idx3 >= 0 ? idx3 : act3End),
    act3: slice(idx3, act3End),
  };
}

export function renderCreativeMd(parsed: ParsedCreative, fallbackRaw?: string): string {
  const hasStructured = Boolean(parsed.title || parsed.act1 || parsed.protagonist);
  if (!hasStructured && fallbackRaw) return fallbackRaw.trim();
  const lines: string[] = [];
  if (parsed.title) lines.push(`# ${parsed.title}`, "");
  if (parsed.protagonist) lines.push(`**第一主角**: ${parsed.protagonist}`);
  if (parsed.narrativePov) lines.push(`**叙事视角**: ${parsed.narrativePov}`);
  if (parsed.audience) lines.push(`**受众**: ${parsed.audience}`);
  if (parsed.storyType) lines.push(`**故事类型**: ${parsed.storyType}`);
  if (parsed.setting) lines.push(`**故事背景**: ${parsed.setting}`);
  if (parsed.act1 || parsed.act2 || parsed.act3) {
    lines.push("", "## 故事梗概");
    if (parsed.act1) lines.push("", "**Act 1**", "", parsed.act1);
    if (parsed.act2) lines.push("", "**Act 2**", "", parsed.act2);
    if (parsed.act3) lines.push("", "**Act 3**", "", parsed.act3);
  }
  if (parsed.worldview) lines.push("", "## 世界观设定", "", parsed.worldview);
  if (parsed.visualTone) lines.push("", "## 视觉基调", "", parsed.visualTone);
  if (parsed.coreTheme) lines.push("", "## 核心主题", "", parsed.coreTheme);
  return lines.join("\n").trim();
}

// Backward-compat shim — old code path that only needs title/oneLiner
export function extractCreativeHead(content: string): { title?: string; oneLiner?: string } {
  const parsed = parseCreativeStructured(content);
  let oneLiner = parsed.oneLiner;
  if (!oneLiner) {
    // Legacy markdown had a separate `一句话题材` heading.
    const lines = content.split(/\r?\n/).map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/^[*-]\s*/, "")
        .replace(/^\d+[.、)]\s*/, "")
        .replace(/\*\*/g, "")
        .trim()
    );
    const idx = lines.findIndex((line) => /^(?:一句话题材|一句话|题材)/.test(line));
    if (idx >= 0) {
      const inline = lines[idx].split(/[:：]/).slice(1).join(":").trim();
      if (inline) {
        oneLiner = inline;
      } else {
        for (let j = idx + 1; j < lines.length; j += 1) {
          if (!lines[j]) continue;
          oneLiner = lines[j].replace(/^《(.+)》$/, "$1").trim();
          break;
        }
      }
    }
  }
  return {
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(oneLiner ? { oneLiner } : {}),
  };
}

async function collectLLM(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<{ content: string; finishReason?: string; errorCode?: string }> {
  let acc = "";
  let finishReason: string | undefined;
  for await (const ev of streamLLM(cfg, messages, opts)) {
    if (ev.type === "delta") acc += ev.text;
    else if (ev.type === "done") finishReason = ev.finishReason;
    else if (ev.type === "error") {
      // Surface the error code so callers can decide whether to retry. We
      // still throw so the chunk runner's catch path runs.
      const err = new Error(ev.message) as Error & { code?: string };
      err.code = ev.code;
      throw err;
    }
  }
  return { content: acc.trim(), finishReason };
}

interface PartialError extends Error {
  partial?: string;
}

function partialError(message: string, partial: string): PartialError {
  const err = new Error(message) as PartialError;
  err.partial = partial;
  return err;
}

// Maximum number of LLM calls we'll spend on a single screenplay/storyboard
// before giving up. With EPISODES_PER_CHUNK=5 and totalEpisodes up to ~80,
// 32 attempts gives generous slack even when several chunks hit the truncate
// path and need to be split further.
const MAX_CHUNK_ITERATIONS = 32;

async function generateScreenplayChunked(
  cfg: LLMConfig,
  project: BatchProject,
  item: BatchItem,
  signal: AbortSignal | undefined
): Promise<string> {
  const total = project.totalEpisodes;
  // Resume support: if the item already carries partial screenplay output,
  // start from where it left off instead of regenerating episodes 1..N.
  let aggregate = (item.screenplayMd || "").trim();
  // If the existing partial ends mid-episode, drop the half-written tail so
  // the next chunk doesn't see a broken header.
  if (aggregate) {
    const lastFull = lastCompleteEpisodeNumber(aggregate);
    if (lastFull !== null) {
      aggregate = trimToEpisode(aggregate, lastFull);
    } else {
      // No fully-finished episode recoverable — start from scratch.
      aggregate = "";
    }
  }
  const startedFrom = aggregate ? lastCompleteEpisodeNumber(aggregate) ?? 0 : 0;
  let cursor = startedFrom + 1;
  let iter = 0;
  console.warn(
    `[batch-screenplay] resume cursor=${cursor} (already complete: ${startedFrom}/${total})`
  );
  // Persist the trimmed aggregate so the UI's "已生成 N/总 集" badge stays
  // honest even if we crash before the first new chunk lands.
  if (aggregate && aggregate !== item.screenplayMd) {
    updateBatchItem(item.id, { screenplayMd: aggregate });
  }
  while (cursor <= total) {
    if (signal?.aborted) throw partialError("已取消", aggregate);
    if (iter >= MAX_CHUNK_ITERATIONS) {
      throw partialError(
        `批次迭代上限 ${MAX_CHUNK_ITERATIONS} 次后仍未写完所有集数（已写到第 ${cursor - 1} 集）`,
        aggregate
      );
    }
    iter += 1;
    const start = cursor;
    const end = Math.min(total, start + EPISODES_PER_CHUNK - 1);
    const previousTail = tail(aggregate, CONTINUITY_TAIL_CHARS);
    const { content, truncated } = await runChunkWithRetry({
      label: `第 ${start}-${end} 集`,
      buildMessages: () => buildScreenplayChunkMessages(project, item, start, end, previousTail),
      cfg,
      signal,
      temperature: 0.65,
      partialSoFar: () => aggregate,
    });
    const cleaned = stripStraySummary(content);
    // Filter the new chunk: keep only episodes whose number is >= start. The
    // model occasionally rewrites earlier episodes (e.g. it sees the previous
    // tail and decides to "re-establish" it); we discard those duplicates so
    // the existing aggregate stays canonical.
    const filtered = filterEpisodesAtOrAbove(cleaned, start);
    if (!filtered.trim()) {
      // Nothing usable from this attempt. Don't fail the whole stage —
      // bump the iteration counter, leave cursor where it is, and retry.
      console.warn(
        `[batch-screenplay] 第 ${start}-${end} 集 LLM 输出无效（仅含 < ${start} 的集，已丢弃），iter=${iter}/${MAX_CHUNK_ITERATIONS}`
      );
      continue;
    }
    aggregate = aggregate ? `${aggregate}\n\n${filtered}` : filtered;
    // Advance the cursor based on what was actually written. If the model
    // hit max_tokens mid-batch and only completed up to e.g. episode 12 out
    // of [11..15], we resume at 13 in the next call. Critical: we trust the
    // last fully-written `第 N 集` header and roll back any half-written
    // tail so the next chunk can rewrite it cleanly.
    const lastFullEpisode = lastCompleteEpisodeNumber(aggregate);
    if (lastFullEpisode === null || lastFullEpisode < start) {
      // We accepted some content but no episode crossed the finish line yet
      // (could be a half-written 第 N 集 with no 钩子). Don't advance cursor;
      // retry the same range up to MAX_CHUNK_ITERATIONS.
      console.warn(
        `[batch-screenplay] 第 ${start}-${end} 集 仅写到中段（lastFull=${lastFullEpisode ?? "null"}），下轮重试`
      );
      // Persist what we got anyway so the user can see progress.
      updateBatchItem(item.id, { screenplayMd: aggregate });
      continue;
    }
    if (truncated) {
      // Drop the half-written trailing episode (cursor will rewrite it).
      aggregate = trimToEpisode(aggregate, lastFullEpisode);
    }
    cursor = lastFullEpisode + 1;
    // Checkpoint: persist current aggregate so the UI's progress badge
    // updates between chunks and a crash here doesn't lose work.
    updateBatchItem(item.id, { screenplayMd: aggregate });
  }
  return aggregate.trim();
}

async function generateStoryboardChunked(
  cfg: LLMConfig,
  project: BatchProject,
  item: BatchItem,
  signal: AbortSignal | undefined
): Promise<string> {
  const total = project.totalEpisodes;
  // Resume support, mirrors the screenplay logic.
  let aggregate = (item.storyboardMd || "").trim();
  if (aggregate) {
    const lastFull = lastStoryboardEpisode(aggregate);
    if (lastFull !== null) {
      aggregate = trimToStoryboardEpisode(aggregate, lastFull);
    } else {
      aggregate = "";
    }
  }
  const startedFrom = aggregate ? lastStoryboardEpisode(aggregate) ?? 0 : 0;
  let cursor = startedFrom + 1;
  let iter = 0;
  console.warn(
    `[batch-storyboard] resume cursor=${cursor} (already complete: ${startedFrom}/${total})`
  );
  if (aggregate && aggregate !== item.storyboardMd) {
    updateBatchItem(item.id, { storyboardMd: aggregate });
  }
  while (cursor <= total) {
    if (signal?.aborted) throw partialError("已取消", aggregate);
    if (iter >= MAX_CHUNK_ITERATIONS) {
      throw partialError(
        `批次迭代上限 ${MAX_CHUNK_ITERATIONS} 次后仍未写完分镜（已写到第 ${cursor - 1} 集）`,
        aggregate
      );
    }
    iter += 1;
    const start = cursor;
    const end = Math.min(total, start + EPISODES_PER_CHUNK - 1);
    const slice = sliceScreenplayByEpisodes(item.screenplayMd, [[start, end]])[0] || "";
    if (!slice.trim()) {
      // No screenplay material for this range — skip and advance cursor.
      cursor = end + 1;
      continue;
    }
    const { content, truncated } = await runChunkWithRetry({
      label: `第 ${start}-${end} 集分镜`,
      buildMessages: () => buildStoryboardChunkMessages(project, item, slice, start, end),
      cfg,
      signal,
      temperature: 0.6,
      partialSoFar: () => aggregate,
    });
    const cleaned = stripStraySummary(content);
    const filtered = filterStoryboardEpisodesAtOrAbove(cleaned, start);
    if (!filtered.trim()) {
      console.warn(
        `[batch-storyboard] 第 ${start}-${end} 集 LLM 输出无效（仅含 < ${start} 的集），iter=${iter}/${MAX_CHUNK_ITERATIONS}`
      );
      continue;
    }
    aggregate = aggregate ? `${aggregate}\n\n${filtered}` : filtered;
    const lastFullEpisode = lastStoryboardEpisode(aggregate);
    if (lastFullEpisode === null || lastFullEpisode < start) {
      console.warn(
        `[batch-storyboard] 第 ${start}-${end} 集 仅写到中段（lastFull=${lastFullEpisode ?? "null"}），下轮重试`
      );
      updateBatchItem(item.id, { storyboardMd: aggregate });
      continue;
    }
    if (truncated) {
      aggregate = trimToStoryboardEpisode(aggregate, lastFullEpisode);
    }
    cursor = lastFullEpisode + 1;
    // Checkpoint to DB so progress is visible between chunks.
    updateBatchItem(item.id, { storyboardMd: aggregate });
  }
  return aggregate.trim();
}

function tail(text: string, chars: number): string {
  if (text.length <= chars) return text;
  return text.slice(-chars);
}

// Find the last episode number in the aggregate that has a "钩子：" line
// after its `第 N 集` header (or is followed by another episode header).
// This treats an episode as "complete" only when its hook block exists or
// when the next episode has started — so a half-written final episode that
// stopped mid-子场次 is correctly excluded.
export function lastCompleteEpisodeNumber(aggregate: string): number | null {
  const lines = aggregate.split(/\r?\n/);
  let lastComplete: number | null = null;
  let currentEp: number | null = null;
  let currentEpHasHook = false;
  for (const line of lines) {
    const epHead = line.trim().match(/^第\s*(\d+)\s*集\s*$/);
    if (epHead) {
      // Closing the previous episode: it counts as complete only if it had
      // a hook line, OR if a new episode header appeared right after it
      // (which means the previous one finished).
      if (currentEp !== null) lastComplete = currentEp;
      currentEp = Number(epHead[1]);
      currentEpHasHook = false;
      continue;
    }
    if (currentEp !== null && /^钩子[:：]/.test(line.trim())) {
      currentEpHasHook = true;
    }
  }
  // Tail episode: complete only if the model wrote out its 钩子 block.
  if (currentEp !== null && currentEpHasHook) lastComplete = currentEp;
  return lastComplete;
}

// Storyboard variant — keeps only `## 第 N 集分镜` blocks where N >= min.
export function filterStoryboardEpisodesAtOrAbove(text: string, minEpisode: number): string {
  if (!text.trim()) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let keeping = false;
  let seenAny = false;
  for (const line of lines) {
    const head = line.trim().match(/^##\s*第\s*(\d+)\s*集分镜/);
    if (head) {
      const n = Number(head[1]);
      keeping = n >= minEpisode;
      seenAny = true;
    } else if (!seenAny) {
      continue;
    }
    if (keeping) out.push(line);
  }
  return out.join("\n").trim();
}

// Drop any episode block whose header is `第 N 集` with N < minEpisode.
// Used to defend against the model regenerating earlier episodes inside a
// chunk meant for a higher range.
export function filterEpisodesAtOrAbove(text: string, minEpisode: number): string {
  if (!text.trim()) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let keeping = false;
  let seenAny = false;
  for (const line of lines) {
    const head = line.trim().match(/^第\s*(\d+)\s*集\s*$/);
    if (head) {
      const n = Number(head[1]);
      keeping = n >= minEpisode;
      seenAny = true;
    } else if (!seenAny) {
      // Pre-header preamble: drop. Episode headers must come first.
      continue;
    }
    if (keeping) out.push(line);
  }
  return out.join("\n").trim();
}

export function trimToEpisode(aggregate: string, episode: number): string {
  const lines = aggregate.split(/\r?\n/);
  const out: string[] = [];
  let seenEpisode = false;
  for (const line of lines) {
    const head = line.trim().match(/^第\s*(\d+)\s*集\s*$/);
    if (head) {
      const n = Number(head[1]);
      if (n > episode) break;
      if (n === episode) seenEpisode = true;
    }
    out.push(line);
  }
  if (!seenEpisode) return aggregate.trim();
  return out.join("\n").trim();
}

// For storyboard tables we look for "## 第 N 集分镜" markers. An episode is
// counted as complete when its table body starts (i.e. at least one row) or
// when the next episode header appears.
export function lastStoryboardEpisode(aggregate: string): number | null {
  const lines = aggregate.split(/\r?\n/);
  let lastSeen: number | null = null;
  let currentEp: number | null = null;
  let currentEpHasRow = false;
  for (const line of lines) {
    const head = line.trim().match(/^##\s*第\s*(\d+)\s*集分镜/);
    if (head) {
      if (currentEp !== null && currentEpHasRow) lastSeen = currentEp;
      currentEp = Number(head[1]);
      currentEpHasRow = false;
      continue;
    }
    // A pipe-separated row that isn't the header/separator counts as a real shot.
    if (currentEp !== null && /^\|\s*\d+\s*\|/.test(line)) currentEpHasRow = true;
  }
  if (currentEp !== null && currentEpHasRow) lastSeen = currentEp;
  return lastSeen;
}

export function trimToStoryboardEpisode(aggregate: string, episode: number): string {
  const lines = aggregate.split(/\r?\n/);
  const out: string[] = [];
  let seen = false;
  for (const line of lines) {
    const head = line.trim().match(/^##\s*第\s*(\d+)\s*集分镜/);
    if (head) {
      const n = Number(head[1]);
      if (n > episode) break;
      if (n === episode) seen = true;
    }
    out.push(line);
  }
  if (!seen) return aggregate.trim();
  return out.join("\n").trim();
}

// Strip trailing model self-talk like "本批次结束 / 待续 / continued..." so the
// concatenated output reads as one document.
function stripStraySummary(text: string): string {
  return text
    .replace(/(?:^|\n)(?:本批次结束|待续|未完待续|continued|to be continued|END OF CHUNK)[\s\S]*$/i, "")
    .trim();
}

function sliceScreenplayByEpisodes(
  screenplay: string,
  ranges: Array<[number, number]>
): string[] {
  if (!screenplay) return ranges.map(() => "");
  const lines = screenplay.split(/\r?\n/);
  // Map of episodeNumber -> [startLine, endLineExclusive]
  const epStart = new Map<number, number>();
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].trim().match(/^第\s*(\d+)\s*集\s*$/);
    if (match) {
      const n = Number(match[1]);
      if (!Number.isNaN(n) && !epStart.has(n)) epStart.set(n, i);
    }
  }
  return ranges.map(([start, end]) => {
    const startLine = epStart.get(start);
    if (startLine === undefined) return "";
    let endLine = lines.length;
    // Find the line where 第 (end+1) 集 starts; that's where the slice stops.
    const next = epStart.get(end + 1);
    if (next !== undefined) endLine = next;
    return lines.slice(startLine, endLine).join("\n").trim();
  });
}

// Run one chunk LLM call with retry on empty content / stream errors.
//
// Why retry empty: yunwu (and similar OpenAI-compatible relays) sometimes
// silently close GPT-5.4 streams after ~5 min of idle (the model is still
// reasoning and hasn't emitted any visible token yet). The HTTP response is
// 200 with [DONE] but zero deltas — our collectLLM then returns "". A second
// attempt almost always succeeds because the relay re-establishes a fresh
// connection. We retry up to MAX_CHUNK_ATTEMPTS times before bubbling
// up as a partialError so the surrounding code can persist what's done.
//
// finishReason==="length" is NOT retried — the model deliberately filled
// max_tokens, retrying would just truncate again at a different point. The
// partial output is kept and the surrounding loop is expected to continue
// from where it left off (see continueFrom logic in the screenplay/storyboard
// chunk drivers).
const MAX_CHUNK_ATTEMPTS = 3;
// Backoff between chunk-level retries. Bumped from 4s because upstream wobbles
// on yunwu-style relays often last several minutes — retrying after 4s/8s
// usually hits the same broken window. 15s/30s gives the relay a real chance
// to reconnect to a healthy backend before we burn another attempt.
const RETRY_BACKOFF_MS = 15_000;

interface ChunkResult {
  content: string;
  truncated: boolean; // true when finishReason === "length"
}

async function runChunkWithRetry(opts: {
  label: string;
  buildMessages: () => LLMMessage[];
  cfg: LLMConfig;
  signal: AbortSignal | undefined;
  temperature: number;
  partialSoFar: () => string;
}): Promise<ChunkResult> {
  let lastReason = "";
  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt += 1) {
    if (opts.signal?.aborted) throw partialError("已取消", opts.partialSoFar());
    try {
      const { content, finishReason } = await collectLLM(opts.cfg, opts.buildMessages(), {
        temperature: opts.temperature,
        maxTokens: TOKEN_BUDGETS.longArtifact,
        signal: opts.signal,
      });
      if (content.trim()) {
        if (finishReason === "length") {
          console.warn(
            `[batch-chunk-truncated] ${opts.label} hit max_tokens; keeping partial and continuing from cliff`
          );
          return { content, truncated: true };
        }
        return { content, truncated: false };
      }
      lastReason = "LLM 返回空内容（疑似上游空闲超时或风控）";
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
    console.warn(
      `[batch-chunk-retry] ${opts.label} attempt ${attempt}/${MAX_CHUNK_ATTEMPTS} failed: ${lastReason}`
    );
    if (attempt < MAX_CHUNK_ATTEMPTS) {
      await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw partialError(`${opts.label}生成失败：${lastReason}`, opts.partialSoFar());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
