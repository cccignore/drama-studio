import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, toJsonError } from "@/lib/api/errors";
import { createSSEResponse, type SSESender } from "@/lib/api/sse";
import { getProject, logEvent, updateProject } from "@/lib/drama/store";
import { resolveConfigForCommand } from "@/lib/llm/router";
import { streamLLM } from "@/lib/llm/stream";
import { getLLMConfig } from "@/lib/llm/store";
import {
  canRunCommand,
  advanceAfter,
  COMMAND_TO_STEP,
  promoteStep,
} from "@/lib/drama/state-machine";
import { loadRefsForCommand } from "@/lib/drama/references";
import {
  getEpisodeIndices,
  getLatestArtifact,
  getReviewIndices,
  saveArtifact,
} from "@/lib/drama/artifacts";
import { buildStartMessages, type StartArgs } from "@/lib/drama/prompts/start";
import { buildPlanMessages } from "@/lib/drama/prompts/plan";
import { buildCharactersMessages } from "@/lib/drama/prompts/characters";
import { buildOutlineMessages } from "@/lib/drama/prompts/outline";
import { buildEpisodeMessages } from "@/lib/drama/prompts/episode";
import { buildReviewMessages } from "@/lib/drama/prompts/review";
import { buildOverseasMessages } from "@/lib/drama/prompts/overseas";
import { buildComplianceMessages } from "@/lib/drama/prompts/compliance";
import {
  buildEpisodeCriticMessages,
  buildEpisodePlannerMessages,
  buildPlanCriticMessages,
  buildPlanPlannerMessages,
} from "@/lib/drama/prompts/multi-agent";
import { extractMermaid } from "@/lib/drama/parsers/extract-mermaid";
import { sanitizeMermaid } from "@/lib/drama/parsers/sanitize-mermaid";
import { parseDirectory } from "@/lib/drama/parsers/extract-directory";
import { extractEpisodeOutline } from "@/lib/drama/parsers/extract-episode-outline";
import { extractPlanCurve } from "@/lib/drama/parsers/extract-plan-curve";
import {
  extractEpisodeTail,
  parseScreenplay,
  summarizeScreenplay,
} from "@/lib/drama/parsers/screenplay";
import { extractReviewJson } from "@/lib/drama/parsers/extract-review-json";
import { extractComplianceJson } from "@/lib/drama/parsers/extract-compliance-json";
import type { Project } from "@/lib/drama/types";
import type { LLMConfig, LLMMessage } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const RunSchema = z.object({
  command: z.string().min(1),
  args: z.record(z.any()).optional(),
  configId: z.string().optional(),
});

type RunCtx = {
  cfg: LLMConfig;
  project: Project;
  args: Record<string, unknown>;
  send: SSESender;
  signal: AbortSignal;
};

type StreamCollectOptions = {
  streamPartial?: boolean;
  emitUsage?: boolean;
};

type MultiAgentCommand = "plan" | "episode";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);

    const body = await readJsonBody(request);
    const parsed = RunSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const { command, args, configId } = parsed.data;

    const writtenEpisodes = getEpisodeIndices(id).length;
    const reviewedEpisodes = getReviewIndices(id).length;
    const check = canRunCommand(command, project.state, { writtenEpisodes, reviewedEpisodes });
    if (!check.ok) throw new AppError("stage_blocked", check.reason, 400);

    const cfg = configId ? getLLMConfig(configId, true) : resolveConfigForCommand(command, id);
    if (!cfg || !cfg.apiKey) {
      throw new AppError(
        "no_llm_config",
        "未配置可用的模型，请先到「模型设置」添加一个 LLM 配置",
        400
      );
    }

    return createSSEResponse(
      async ({ send, signal }) => {
        send({ type: "start", command, model: cfg.name, protocol: cfg.protocol });
        logEvent(id, command, "start", { model: cfg.name });

        const ctx: RunCtx = { cfg, project, args: args ?? {}, send, signal };

        try {
          if (command === "ping") {
            await runPing(ctx);
          } else if (command === "start") {
            await runStart(ctx);
          } else if (command === "plan") {
            await runPlan(ctx);
          } else if (command === "characters") {
            await runCharacters(ctx);
          } else if (command === "outline") {
            await runOutline(ctx);
          } else if (command === "episode") {
            await runEpisode(ctx);
          } else if (command === "review") {
            await runReview(ctx);
          } else if (command === "overseas") {
            await runOverseas(ctx);
          } else if (command === "compliance") {
            await runCompliance(ctx);
          } else {
            send({
              type: "error",
              code: "not_implemented",
              message: `命令 ${command} 将在后续模块接入`,
            });
            return;
          }

          // episode / review handle state advancement themselves (multi-run commands)
          if (
            command !== "ping" &&
            command !== "episode" &&
            command !== "review" &&
            COMMAND_TO_STEP[command]
          ) {
            const fresh = getProject(id);
            if (fresh) {
              const nextState = advanceAfter(command, fresh.state);
              updateProject(id, { state: nextState });
              send({ type: "state", state: nextState });
            }
          }

          send({ type: "done" });
          logEvent(id, command, "done");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ type: "error", message: msg, code: "run_failed" });
          logEvent(id, command, "error", { message: msg });
        }
      },
      { signal: request.signal }
    );
  } catch (err) {
    return toJsonError(err);
  }
}

async function streamAndCollect(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: { temperature?: number; maxTokens?: number; signal: AbortSignal },
  send: SSESender,
  collectOpts: StreamCollectOptions = {}
): Promise<string> {
  const { streamPartial = true, emitUsage = true } = collectOpts;
  let acc = "";
  for await (const ev of streamLLM(cfg, messages, opts)) {
    if (ev.type === "delta") {
      acc += ev.text;
      if (streamPartial) send({ type: "partial", text: ev.text });
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    } else if (ev.type === "done") {
      if (emitUsage) send({ type: "usage", usage: ev.usage ?? null });
    }
  }
  return acc;
}

function summarizePreview(text: string, maxChars = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}…`;
}

function multiAgentEnabled(project: Project, command: MultiAgentCommand): boolean {
  return Boolean(
    project.state.multiAgentEnabled &&
      project.state.multiAgentCommands?.includes(command)
  );
}

function excerptForCompliance(content: string, maxChars = 2200): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const head = trimmed.slice(0, Math.floor(maxChars * 0.6));
  const tail = trimmed.slice(-Math.floor(maxChars * 0.28));
  return `${head}\n\n[...中段已截断...]\n\n${tail}`;
}

async function runAgentTask({
  cfg,
  messages,
  send,
  signal,
  role,
  title,
  episode,
  temperature = 0.4,
  maxTokens = 1200,
}: {
  cfg: LLMConfig;
  messages: LLMMessage[];
  send: SSESender;
  signal: AbortSignal;
  role: "planner" | "critic" | "writer";
  title: string;
  episode?: number;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  send({
    type: "agent",
    status: "start",
    role,
    title,
    model: cfg.name,
    episode,
  });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature, maxTokens, signal },
    send,
    { streamPartial: false, emitUsage: false }
  );
  send({
    type: "agent",
    status: "done",
    role,
    title,
    model: cfg.name,
    episode,
    chars: content.length,
    preview: summarizePreview(content),
  });
  return content;
}

async function runPing({ cfg, args, send, signal }: RunCtx) {
  const userMsg =
    (typeof args?.message === "string" && (args.message as string).trim()) ||
    "用一句话自我介绍，并说明你擅长短剧创作的哪些方面。";
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} …` });
  const acc = await streamAndCollect(
    cfg,
    [
      { role: "system", content: "你是一位专业的短剧编剧助手。" },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.7, maxTokens: 256, signal },
    send
  );
  send({ type: "artifact", name: "ping-echo", length: acc.length });
}

async function runStart({ cfg, project, args, send, signal }: RunCtx) {
  send({ type: "progress", stage: "compose-prompt", message: "整合立项信息与题材指南 …" });
  const refs = loadRefsForCommand("start");
  const startArgs = args as StartArgs;

  // 如果客户端传了这些字段，先更新 project.state，让后续步骤可用
  const patch: Partial<typeof project.state> = {};
  if (startArgs.dramaTitle) patch.dramaTitle = startArgs.dramaTitle;
  if (startArgs.genre?.length) patch.genre = startArgs.genre;
  if (startArgs.audience) patch.audience = startArgs.audience as typeof project.state.audience;
  if (startArgs.tone) patch.tone = startArgs.tone as typeof project.state.tone;
  if (startArgs.ending) patch.ending = startArgs.ending as typeof project.state.ending;
  if (typeof startArgs.totalEpisodes === "number") patch.totalEpisodes = startArgs.totalEpisodes;
  if (startArgs.mode) patch.mode = startArgs.mode;
  if (typeof startArgs.freeText === "string") patch.freeText = startArgs.freeText;
  if (Object.keys(patch).length) {
    const next = updateProject(project.id, {
      title: patch.dramaTitle || undefined,
      state: patch,
    });
    if (next) project = next;
  }

  const messages = buildStartMessages(project.state, startArgs, refs);
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} 生成立项卡 …` });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.75, maxTokens: 1500, signal },
    send
  );
  const artifact = saveArtifact({ projectId: project.id, name: "start-card", content });
  send({ type: "artifact", name: "start-card", version: artifact.version, length: content.length });
}

async function runPlan({ cfg, project, send, signal }: RunCtx) {
  const startCard = getLatestArtifact(project.id, "start-card");
  if (!startCard) throw new Error("缺少立项卡，请先完成 /start");
  send({ type: "progress", stage: "compose-prompt", message: "加载节奏曲线与付费策略参考 …" });
  const refs = loadRefsForCommand("plan");
  let plannerBrief: string | undefined;
  let criticNotes: string | undefined;

  if (multiAgentEnabled(project, "plan")) {
    send({
      type: "progress",
      stage: "multi-agent",
      message: "Multi-agent 已启用：Planner / Critic 正在协同搭建节奏骨架 …",
    });
    plannerBrief = await runAgentTask({
      cfg: resolveConfigForCommand("plan", project.id) ?? cfg,
      messages: buildPlanPlannerMessages(project.state, startCard.content, refs),
      send,
      signal,
      role: "planner",
      title: "Planner 节奏骨架",
      temperature: 0.45,
      maxTokens: 1400,
    });
    criticNotes = await runAgentTask({
      cfg: resolveConfigForCommand("review", project.id) ?? cfg,
      messages: buildPlanCriticMessages(project.state, plannerBrief),
      send,
      signal,
      role: "critic",
      title: "Critic 节奏审校",
      temperature: 0.2,
      maxTokens: 1000,
    });
  }

  const messages = buildPlanMessages(project.state, startCard.content, refs, {
    plannerBrief,
    criticNotes,
  });
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} 设计节奏 …` });
  send({
    type: "agent",
    status: "start",
    role: "writer",
    title: "Writer 最终节奏稿",
    model: cfg.name,
  });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.7, maxTokens: 2200, signal },
    send
  );
  send({
    type: "agent",
    status: "done",
    role: "writer",
    title: "Writer 最终节奏稿",
    model: cfg.name,
    chars: content.length,
    preview: summarizePreview(content),
  });
  const curve = extractPlanCurve(content);
  const artifact = saveArtifact({
    projectId: project.id,
    name: "plan",
    content,
    meta: {
      curve,
      pointCount: curve.length,
      paywallEpisodes: curve.filter((item) => item.paywall).map((item) => item.episode),
    },
  });
  send({
    type: "artifact",
    name: "plan",
    version: artifact.version,
    length: content.length,
    pointCount: curve.length,
  });
}

async function runCharacters({ cfg, project, send, signal }: RunCtx) {
  const startCard = getLatestArtifact(project.id, "start-card");
  const plan = getLatestArtifact(project.id, "plan");
  if (!startCard || !plan) throw new Error("请先完成 /start 与 /plan");
  send({ type: "progress", stage: "compose-prompt", message: "加载反派设计参考 …" });
  const refs = loadRefsForCommand("characters");
  const messages = buildCharactersMessages(project.state, startCard.content, plan.content, refs);
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} 生成人物设计 …` });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.75, maxTokens: 2500, signal },
    send
  );
  const mm = extractMermaid(content);
  const normalizedContent = mm.code
    ? content.replace(
        /```mermaid\s*\n([\s\S]*?)```/i,
        `\`\`\`mermaid\n${sanitizeMermaid(mm.code)}\n\`\`\``
      )
    : content;
  const normalizedMermaid = extractMermaid(normalizedContent);
  const artifact = saveArtifact({
    projectId: project.id,
    name: "characters",
    content: normalizedContent,
    meta: {
      hasMermaid: !!normalizedMermaid.code,
      mermaidChars: normalizedMermaid.code?.length ?? 0,
    },
  });
  send({
    type: "artifact",
    name: "characters",
    version: artifact.version,
    length: normalizedContent.length,
    hasMermaid: !!normalizedMermaid.code,
  });
}

async function runOutline({ cfg, project, send, signal }: RunCtx) {
  const startCard = getLatestArtifact(project.id, "start-card");
  const plan = getLatestArtifact(project.id, "plan");
  const characters = getLatestArtifact(project.id, "characters");
  if (!startCard || !plan || !characters) throw new Error("请先完成前三步");
  send({ type: "progress", stage: "compose-prompt", message: "加载付费卡点与节奏参考 …" });
  const refs = loadRefsForCommand("outline");
  const messages = buildOutlineMessages(
    project.state,
    startCard.content,
    plan.content,
    characters.content,
    refs
  );
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} 生成分集目录 …` });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.7, maxTokens: 8000, signal },
    send
  );
  const parsed = parseDirectory(content);
  const artifact = saveArtifact({
    projectId: project.id,
    name: "outline",
    content,
    meta: {
      total: parsed.total,
      expected: project.state.totalEpisodes,
      paywall: parsed.acts.flatMap((a) => a.episodes.filter((e) => e.hasPaywall).map((e) => e.index)),
    },
  });
  send({
    type: "artifact",
    name: "outline",
    version: artifact.version,
    length: content.length,
    total: parsed.total,
  });
}

function resolveEpisodeTargets(args: Record<string, unknown>, totalExpected: number, existing: number[]): number[] {
  const total = Math.max(1, totalExpected);
  const mode = (args.mode as string | undefined) ?? "single";
  if (mode === "range") {
    const from = Math.max(1, Number(args.from) || 1);
    const to = Math.min(total, Number(args.to) || from);
    const list: number[] = [];
    for (let i = from; i <= to; i++) list.push(i);
    return list;
  }
  if (mode === "next") {
    const nextIdx = (existing.length ? Math.max(...existing) : 0) + 1;
    if (nextIdx > total) return [];
    return [nextIdx];
  }
  // single
  const idx = Number(args.index);
  if (!Number.isFinite(idx) || idx < 1) throw new Error("episode 参数缺少 index");
  if (idx > total) throw new Error(`index 超出总集数 ${total}`);
  return [idx];
}

async function runEpisode(ctx: RunCtx) {
  const { cfg, project, args, send, signal } = ctx;
  const outline = getLatestArtifact(project.id, "outline");
  const plan = getLatestArtifact(project.id, "plan");
  const characters = getLatestArtifact(project.id, "characters");
  if (!outline || !plan || !characters) throw new Error("请先完成 outline / plan / characters");

  const totalExpected = project.state.totalEpisodes || 0;
  const existing = getEpisodeIndices(project.id);
  const targets = resolveEpisodeTargets(args, totalExpected, existing);
  if (targets.length === 0) {
    send({ type: "progress", stage: "noop", message: "没有可写的集数（已全部完成）" });
    return;
  }

  const rewriteHint = typeof args.rewriteHint === "string" ? (args.rewriteHint as string) : undefined;
  const overseasBrief =
    project.state.mode === "overseas"
      ? getLatestArtifact(project.id, "overseas-brief")
      : null;

  for (const epIdx of targets) {
    if (signal.aborted) throw new Error("已取消");
    const epOutline = extractEpisodeOutline(outline.content, epIdx);
    if (!epOutline) {
      send({ type: "progress", stage: "skip", message: `第 ${epIdx} 集目录条目缺失，跳过` });
      continue;
    }
    const prev = epIdx > 1 ? getLatestArtifact(project.id, `episode-${epIdx - 1}`) : null;
    const prevTail = prev ? extractEpisodeTail(prev.content, 800) : undefined;
    const refs = loadRefsForCommand("episode", { episodeIndex: epIdx });
    let storyBeat: string | undefined;
    let polishNotes: string | undefined;

    if (multiAgentEnabled(project, "episode")) {
      send({
        type: "progress",
        stage: "multi-agent",
        message: `第 ${epIdx} 集启用多角色协同：Planner / Critic 正在准备写作约束 …`,
        episode: epIdx,
      });
      const plannerCtx = {
        episodeIndex: epIdx,
        episodeOutline: epOutline,
        planSummary: plan.content,
        charactersSummary: characters.content,
        prevEpisodeTail: prevTail,
        rewriteHint,
        overseasBrief: overseasBrief?.content,
      };
      storyBeat = await runAgentTask({
        cfg: resolveConfigForCommand("episode", project.id) ?? cfg,
        messages: buildEpisodePlannerMessages(project.state, plannerCtx, refs),
        send,
        signal,
        role: "planner",
        title: "Planner 单集 Beat Sheet",
        episode: epIdx,
        temperature: 0.5,
        maxTokens: 1200,
      });
      polishNotes = await runAgentTask({
        cfg: resolveConfigForCommand("review", project.id) ?? cfg,
        messages: buildEpisodeCriticMessages(project.state, plannerCtx, storyBeat),
        send,
        signal,
        role: "critic",
        title: "Critic 单集审校意见",
        episode: epIdx,
        temperature: 0.2,
        maxTokens: 900,
      });
    }

    send({
      type: "progress",
      stage: "calling-llm",
      message:
        project.state.mode === "overseas"
          ? `正在写第 ${epIdx} 集英文版（${cfg.name}）…`
          : `正在写第 ${epIdx} 集（${cfg.name}）…`,
      episode: epIdx,
    });
    send({
      type: "agent",
      status: "start",
      role: "writer",
      title:
        project.state.mode === "overseas"
          ? "Writer 英文终稿"
          : "Writer 剧本终稿",
      model: cfg.name,
      episode: epIdx,
    });

    const messages = buildEpisodeMessages(
      project.state,
      {
        episodeIndex: epIdx,
        episodeOutline: epOutline,
        planSummary: plan.content,
        charactersSummary: characters.content,
        prevEpisodeTail: prevTail,
        rewriteHint,
        storyBeat,
        polishNotes,
        overseasBrief: overseasBrief?.content,
      },
      refs
    );
    const content = await streamAndCollect(
      cfg,
      messages,
      { temperature: 0.8, maxTokens: 3200, signal },
      send
    );
    send({
      type: "agent",
      status: "done",
      role: "writer",
      title:
        project.state.mode === "overseas"
          ? "Writer 英文终稿"
          : "Writer 剧本终稿",
      model: cfg.name,
      episode: epIdx,
      chars: content.length,
      preview: summarizePreview(content),
    });
    const ast = parseScreenplay(content);
    const stats = summarizeScreenplay(ast);
    const artifact = saveArtifact({
      projectId: project.id,
      name: `episode-${epIdx}`,
      content,
      meta: {
        episodeIndex: epIdx,
        title: ast.title,
        closed: ast.closed,
        ...stats,
      },
    });
    send({
      type: "artifact",
      name: `episode-${epIdx}`,
      version: artifact.version,
      length: content.length,
      episode: epIdx,
      stats,
    });
  }

  const after = getEpisodeIndices(project.id);
  const fresh = getProject(project.id);
  if (fresh && totalExpected && after.length >= totalExpected) {
    const nextState = advanceAfter("episode", fresh.state);
    updateProject(project.id, { state: nextState });
    send({ type: "state", state: nextState });
  } else if (fresh) {
    send({ type: "state", state: fresh.state, written: after.length, total: totalExpected });
  }
}

function resolveReviewTargets(args: Record<string, unknown>, episodeIdxs: number[]): number[] {
  if (episodeIdxs.length === 0) return [];
  const mode = (args.mode as string | undefined) ?? "single";
  if (mode === "all") return [...episodeIdxs];
  if (mode === "range") {
    const from = Number(args.from) || episodeIdxs[0];
    const to = Number(args.to) || from;
    return episodeIdxs.filter((i) => i >= from && i <= to);
  }
  const idx = Number(args.index);
  if (!Number.isFinite(idx) || idx < 1) throw new Error("review 参数缺少 index");
  if (!episodeIdxs.includes(idx)) throw new Error(`第 ${idx} 集尚未写成`);
  return [idx];
}

async function runReview(ctx: RunCtx) {
  const { cfg, project, args, send, signal } = ctx;
  const outline = getLatestArtifact(project.id, "outline");
  if (!outline) throw new Error("缺少分集目录");
  const episodeIdxs = getEpisodeIndices(project.id);
  const targets = resolveReviewTargets(args, episodeIdxs);
  if (targets.length === 0) {
    send({ type: "progress", stage: "noop", message: "没有可复盘的集数" });
    return;
  }

  const refs = loadRefsForCommand("review");

  for (const epIdx of targets) {
    if (signal.aborted) throw new Error("已取消");
    const ep = getLatestArtifact(project.id, `episode-${epIdx}`);
    if (!ep) {
      send({ type: "progress", stage: "skip", message: `第 ${epIdx} 集未写，跳过` });
      continue;
    }
    const epOutline = extractEpisodeOutline(outline.content, epIdx);

    let attempt = 0;
    let retryHint: string | undefined;
    let review: ReturnType<typeof extractReviewJson> | null = null;
    let rawContent = "";

    while (attempt < 2) {
      attempt += 1;
      send({
        type: "progress",
        stage: "calling-llm",
        message: `正在复盘第 ${epIdx} 集${attempt > 1 ? "（重试）" : ""}…`,
        episode: epIdx,
        attempt,
      });
      const messages = buildReviewMessages(
        project.state,
        {
          episodeIndex: epIdx,
          episodeOutline: epOutline,
          episodeScreenplay: ep.content,
        },
        refs,
        retryHint
      );
      rawContent = await streamAndCollect(
        cfg,
        messages,
        { temperature: 0.3, maxTokens: 1800, signal },
        send
      );
      review = extractReviewJson(rawContent);
      if (review.ok) break;
      retryHint = review.error;
      send({
        type: "progress",
        stage: "retry",
        message: `第 ${epIdx} 集 JSON 校验失败：${review.error}`,
        episode: epIdx,
      });
    }

    if (!review || !review.ok) {
      const msg = review ? review.error : "review 失败";
      send({ type: "progress", stage: "fail", message: `第 ${epIdx} 集复盘失败：${msg}`, episode: epIdx });
      continue;
    }

    const data = review.data;
    const avg =
      (data.scores.pace +
        data.scores.satisfy +
        data.scores.dialogue +
        data.scores.format +
        data.scores.coherence) /
      5;
    const artifact = saveArtifact({
      projectId: project.id,
      name: `review-${epIdx}`,
      content: JSON.stringify(data, null, 2),
      meta: {
        episodeIndex: epIdx,
        avg: Math.round(avg * 10) / 10,
        scores: data.scores,
        danger: data.issues.filter((i) => i.level === "danger").length,
        warn: data.issues.filter((i) => i.level === "warn").length,
        info: data.issues.filter((i) => i.level === "info").length,
      },
    });
    send({
      type: "artifact",
      name: `review-${epIdx}`,
      version: artifact.version,
      length: artifact.content.length,
      episode: epIdx,
      avg: Math.round(avg * 10) / 10,
      issues: data.issues.length,
    });
  }

  const totalExpected = project.state.totalEpisodes || 0;
  const reviewed = getReviewIndices(project.id);
  const fresh = getProject(project.id);
  if (fresh && reviewed.length > 0 && fresh.state.currentStep === "episode") {
    const promoted = promoteStep(fresh.state, "review");
    updateProject(project.id, { state: promoted });
    send({ type: "state", state: promoted, reviewed: reviewed.length, total: totalExpected });
    return;
  }
  if (fresh && totalExpected && reviewed.length >= totalExpected) {
    const nextState = advanceAfter("review", fresh.state);
    updateProject(project.id, { state: nextState });
    send({ type: "state", state: nextState });
  } else if (fresh) {
    send({ type: "state", state: fresh.state, reviewed: reviewed.length, total: totalExpected });
  }
}

async function runOverseas({ cfg, project, send, signal }: RunCtx) {
  const startCard = getLatestArtifact(project.id, "start-card");
  if (!startCard) throw new Error("缺少立项卡，请先完成 /start");
  const plan = getLatestArtifact(project.id, "plan");
  const characters = getLatestArtifact(project.id, "characters");
  const outline = getLatestArtifact(project.id, "outline");

  send({
    type: "progress",
    stage: "compose-prompt",
    message: "加载项目现状并生成 overseas adaptation brief …",
  });

  const refs = loadRefsForCommand("overseas");
  const messages = buildOverseasMessages(
    { ...project.state, mode: "overseas", language: "en-US" },
    {
      startCard: startCard.content,
      plan: plan?.content,
      characters: characters?.content,
      outline: outline?.content,
    },
    refs
  );
  send({
    type: "progress",
    stage: "calling-llm",
    message: `正在调用 ${cfg.name} 生成出海适配方案 …`,
  });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.55, maxTokens: 2200, signal },
    send
  );
  const artifact = saveArtifact({
    projectId: project.id,
    name: "overseas-brief",
    content,
    meta: { language: "en-US", mode: "overseas" },
  });
  const updated = updateProject(project.id, {
    state: { mode: "overseas", language: "en-US" },
  });
  send({
    type: "artifact",
    name: "overseas-brief",
    version: artifact.version,
    length: content.length,
  });
  if (updated) send({ type: "state", state: updated.state });
}

async function runCompliance({ cfg, project, send, signal }: RunCtx) {
  const episodeIdxs = getEpisodeIndices(project.id);
  if (episodeIdxs.length === 0) throw new Error("请至少先写出 1 集剧本后再做合规审查");

  const inputs = episodeIdxs
    .map((index) => {
      const artifact = getLatestArtifact(project.id, `episode-${index}`);
      if (!artifact) return null;
      return {
        index,
        excerpt: excerptForCompliance(artifact.content),
      };
    })
    .filter((item): item is { index: number; excerpt: string } => !!item);

  const refs = loadRefsForCommand("compliance");
  let attempt = 0;
  let retryHint: string | undefined;
  let parsed: ReturnType<typeof extractComplianceJson> | null = null;
  let rawContent = "";

  while (attempt < 2) {
    attempt += 1;
    send({
      type: "progress",
      stage: "calling-llm",
      message: `正在生成合规审查报告${attempt > 1 ? "（重试）" : ""}…`,
      attempt,
    });
    const messages = buildComplianceMessages(project.state, inputs, refs, retryHint);
    rawContent = await streamAndCollect(
      cfg,
      messages,
      { temperature: 0.2, maxTokens: 2600, signal },
      send,
      { streamPartial: false }
    );
    parsed = extractComplianceJson(rawContent);
    if (parsed.ok) break;
    retryHint = parsed.error;
    send({
      type: "progress",
      stage: "retry",
      message: `合规 JSON 校验失败：${parsed.error}`,
      attempt,
    });
  }

  if (!parsed || !parsed.ok) {
    throw new Error(parsed?.error ?? "合规审查报告生成失败");
  }

  const artifact = saveArtifact({
    projectId: project.id,
    name: "compliance-report",
    content: JSON.stringify(parsed.data, null, 2),
    meta: {
      totals: parsed.data.totals,
      episodes: episodeIdxs,
      itemCount: parsed.data.items.length,
    },
  });
  send({
    type: "artifact",
    name: "compliance-report",
    version: artifact.version,
    length: artifact.content.length,
    totals: parsed.data.totals,
  });
}
