import { TOKEN_BUDGETS } from "../llm/budgets";
import { resolveConfigForCommand } from "../llm/router";
import { streamLLM } from "../llm/stream";
import type { LLMConfig, LLMMessage } from "../llm/types";
import {
  buildCreativeMessages,
  buildScreenplayMessages,
  buildStoryboardMessages,
} from "./prompts";
import {
  getBatchProject,
  listBatchItems,
  updateBatchItem,
  updateBatchProject,
} from "./store";
import type { BatchItem, BatchStage } from "./types";

export interface RunBatchResult {
  stage: BatchStage;
  created: number;
  updated: number;
  failed: number;
}

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
      const messages =
        input.stage === "creative"
          ? buildCreativeMessages(project, item)
          : input.stage === "screenplay"
          ? buildScreenplayMessages(project, item)
          : buildStoryboardMessages(project, item);
      const content = await collectLLM(cfg, messages, {
        temperature: input.stage === "creative" ? 0.75 : 0.65,
        maxTokens: TOKEN_BUDGETS.longArtifact,
        signal: input.signal,
      });
      let patch: Partial<BatchItem> & { status: BatchItem["status"]; error: string };
      if (input.stage === "creative") {
        const parsed = parseCreativeStructured(content);
        patch = {
          ...parsed,
          creativeMd: renderCreativeMd(parsed, content),
          status: "creative_ready",
          error: "",
        };
      } else if (input.stage === "screenplay") {
        patch = { screenplayMd: content, status: "screenplay_ready", error: "" };
      } else {
        patch = { storyboardMd: content, status: "storyboard_ready", error: "" };
      }
      updateBatchItem(item.id, patch);
      updated += 1;
    } catch (err) {
      failed += 1;
      updateBatchItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  updateBatchProject(project.id, { status: `${input.stage}_ready` });
  return { stage: input.stage, created: 0, updated, failed };
}

function resolveConfigForBatchStage(stage: BatchStage): LLMConfig | null {
  if (stage === "screenplay") return resolveConfigForCommand("episode");
  if (stage === "storyboard") return resolveConfigForCommand("episode");
  return resolveConfigForCommand("creative") ?? resolveConfigForCommand("start");
}

function selectTargets(items: BatchItem[], stage: BatchStage, selectedOnly: boolean): BatchItem[] {
  if (stage === "creative") {
    return items.filter(
      (item) => item.sourceText && !item.creativeMd && !item.act1 && (!selectedOnly || item.ideaSelected)
    );
  }
  if (stage === "screenplay") {
    return items.filter(
      (item) => (item.creativeMd || item.act1) && !item.screenplayMd && (!selectedOnly || item.creativeSelected)
    );
  }
  if (stage === "storyboard") {
    return items.filter(
      (item) => item.screenplayMd && !item.storyboardMd && (!selectedOnly || item.screenplaySelected)
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
}

const CREATIVE_LABELS: Array<{ key: keyof ParsedCreative; aliases: RegExp }> = [
  { key: "title", aliases: /^(?:新剧名|剧名|标题)/ },
  { key: "protagonist", aliases: /^第一主角/ },
  { key: "narrativePov", aliases: /^叙事视角/ },
  { key: "audience", aliases: /^受众/ },
  { key: "storyType", aliases: /^故事类型/ },
  { key: "setting", aliases: /^故事背景/ },
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

  // one-liner: 优先用故事类型或第一段 Act 1 的开头压缩
  if (!out.oneLiner) {
    const seed = out.storyType || (out.act1 ? out.act1.slice(0, 60) : "");
    out.oneLiner = seed.replace(/\s+/g, " ").trim();
  }

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

function extractActs(rawLines: string[]): { act1: string; act2: string; act3: string } {
  const trimmed = rawLines.map((line) =>
    line.replace(/^#+\s*/, "").replace(/^[*-]\s*/, "").replace(/\*\*/g, "")
  );
  const find = (pattern: RegExp): number =>
    trimmed.findIndex((line) => pattern.test(line.trim()));
  const idx1 = find(/^(?:故事梗概[:：]?\s*)?Act\s*1[:：]/i);
  const idx2 = find(/^Act\s*2[:：]/i);
  const idx3 = find(/^Act\s*3[:：]/i);
  const slice = (from: number, to: number): string => {
    if (from < 0) return "";
    const end = to > from ? to : trimmed.length;
    const buf: string[] = [];
    const head = trimmed[from].replace(/^故事梗概[:：]?\s*/i, "").replace(/^Act\s*[123][:：]\s*/i, "");
    if (head.trim()) buf.push(head.trim());
    for (let i = from + 1; i < end; i += 1) {
      const line = trimmed[i];
      if (/^(?:故事梗概[:：]?\s*)?Act\s*[123][:：]/i.test(line.trim())) break;
      buf.push(line);
    }
    return buf.join("\n").trim();
  };
  return {
    act1: slice(idx1, idx2 >= 0 ? idx2 : idx3 >= 0 ? idx3 : -1),
    act2: slice(idx2, idx3 >= 0 ? idx3 : -1),
    act3: slice(idx3, -1),
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
): Promise<string> {
  let acc = "";
  for await (const ev of streamLLM(cfg, messages, opts)) {
    if (ev.type === "delta") acc += ev.text;
    else if (ev.type === "error") throw new Error(ev.message);
  }
  return acc.trim();
}
