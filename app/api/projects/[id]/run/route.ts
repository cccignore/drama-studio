import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, toJsonError } from "@/lib/api/errors";
import { createSSEResponse, type SSESender } from "@/lib/api/sse";
import { getProject, logEvent, updateProject } from "@/lib/drama/store";
import { resolveConfigForCommand } from "@/lib/llm/router";
import { streamLLM } from "@/lib/llm/stream";
import { getLLMConfig } from "@/lib/llm/store";
import { canRunCommand, advanceAfter, COMMAND_TO_STEP } from "@/lib/drama/state-machine";
import { loadRefsForCommand } from "@/lib/drama/references";
import { getLatestArtifact, saveArtifact } from "@/lib/drama/artifacts";
import { buildStartMessages, type StartArgs } from "@/lib/drama/prompts/start";
import { buildPlanMessages } from "@/lib/drama/prompts/plan";
import { buildCharactersMessages } from "@/lib/drama/prompts/characters";
import { buildOutlineMessages } from "@/lib/drama/prompts/outline";
import { extractMermaid } from "@/lib/drama/parsers/extract-mermaid";
import { parseDirectory } from "@/lib/drama/parsers/extract-directory";
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

    const check = canRunCommand(command, project.state);
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
          } else {
            send({
              type: "error",
              code: "not_implemented",
              message: `命令 ${command} 将在后续模块接入`,
            });
            return;
          }

          if (command !== "ping" && COMMAND_TO_STEP[command]) {
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
  send: SSESender
): Promise<string> {
  let acc = "";
  for await (const ev of streamLLM(cfg, messages, opts)) {
    if (ev.type === "delta") {
      acc += ev.text;
      send({ type: "partial", text: ev.text });
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    } else if (ev.type === "done") {
      send({ type: "usage", usage: ev.usage ?? null });
    }
  }
  return acc;
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
  const messages = buildPlanMessages(project.state, startCard.content, refs);
  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} 设计节奏 …` });
  const content = await streamAndCollect(
    cfg,
    messages,
    { temperature: 0.7, maxTokens: 2200, signal },
    send
  );
  const artifact = saveArtifact({ projectId: project.id, name: "plan", content });
  send({ type: "artifact", name: "plan", version: artifact.version, length: content.length });
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
  const artifact = saveArtifact({
    projectId: project.id,
    name: "characters",
    content,
    meta: { hasMermaid: !!mm.code, mermaidChars: mm.code?.length ?? 0 },
  });
  send({
    type: "artifact",
    name: "characters",
    version: artifact.version,
    length: content.length,
    hasMermaid: !!mm.code,
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
