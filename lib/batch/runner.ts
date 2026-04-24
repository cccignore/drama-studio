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

  const targets = selectTargets(listBatchItems(project.id), input.stage, input.selectedOnly ?? true);
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
        maxTokens: input.stage === "creative" ? 2600 : input.stage === "screenplay" ? 7000 : 7000,
        signal: input.signal,
      });
      const patch =
        input.stage === "creative"
          ? { ...extractCreativeHead(content), creativeMd: content, status: "creative_ready" as const, error: "" }
          : input.stage === "screenplay"
          ? { screenplayMd: content, status: "screenplay_ready" as const, error: "" }
          : { storyboardMd: content, status: "storyboard_ready" as const, error: "" };
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
    return items.filter((item) => item.sourceText && !item.creativeMd && (!selectedOnly || item.ideaSelected));
  }
  if (stage === "screenplay") {
    return items.filter((item) => item.creativeMd && !item.screenplayMd && (!selectedOnly || item.creativeSelected));
  }
  if (stage === "storyboard") {
    return items.filter((item) => item.screenplayMd && !item.storyboardMd && (!selectedOnly || item.screenplaySelected));
  }
  return [];
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const concurrency = Math.max(1, Math.min(20, Math.floor(limit || 1)));
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

export function extractCreativeHead(content: string): { title?: string; oneLiner?: string } {
  const inlineTitle = content.match(/(?:新剧名|标题)[:：]\s*《?([^《》\n#*]{2,80})》?/i)?.[1]?.trim();
  const title = cleanCreativeHead(inlineTitle) ?? readSectionFirstLine(content, /(?:新剧名|标题)/i, 80);
  const inlineOneLiner = content.match(/(?:一句话题材|一句话|题材)[:：]\s*([^\n]{8,220})/i)?.[1]?.trim();
  const oneLiner = cleanCreativeHead(inlineOneLiner) ?? readSectionFirstLine(content, /(?:一句话题材|一句话|题材)/i, 220);
  return {
    ...(title ? { title } : {}),
    ...(oneLiner ? { oneLiner } : {}),
  };
}

function readSectionFirstLine(content: string, heading: RegExp, maxLen: number): string | undefined {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((line) => heading.test(line.replace(/^#+\s*/, "")));
  if (idx < 0) return undefined;
  for (const line of lines.slice(idx + 1)) {
    const cleaned = cleanCreativeHead(line);
    if (cleaned) return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}...` : cleaned;
  }
  return undefined;
}

function cleanCreativeHead(input?: string): string | undefined {
  const text = (input ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/^[*-]\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^《(.+)》$/, "$1")
    .trim();
  if (!text || /^(新剧名|标题|一句话题材|一句话|题材)$/i.test(text)) return undefined;
  return text;
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
