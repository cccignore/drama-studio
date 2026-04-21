import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { createSSEResponse, type SSESender } from "@/lib/api/sse";
import { getLatestArtifact, saveArtifact } from "@/lib/drama/artifacts";
import { buildArtifactMeta, normalizeArtifactContent, validateArtifactContent } from "@/lib/drama/artifact-meta";
import { appendStepConversation, listStepConversations } from "@/lib/drama/conversations";
import { getProject, logEvent } from "@/lib/drama/store";
import { applyPatches, parseRevisePatch, type RevisePatch } from "@/lib/drama/revise/patch";
import { artifactCommandFor, buildRevisePrompt, buildRewritePrompt } from "@/lib/drama/revise/prompts";
import { resolveConfigForCommand } from "@/lib/llm/router";
import { streamLLM } from "@/lib/llm/stream";
import type { LLMConfig, LLMMessage } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  artifact: z.string().min(1),
  instruction: z.string().min(1, "请填写修改指令"),
  mode: z.enum(["patch", "rewrite"]).optional().default("patch"),
});

const locks = new Set<string>();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);
    const body = await readJsonBody(request);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const key = `${id}:${parsed.data.artifact}`;
    if (locks.has(key)) throw new AppError("busy", "当前产物正在改写，请稍后再试", 409);

    return createSSEResponse(
      async ({ send, signal }) => {
        locks.add(key);
        try {
          await runRevise({
            projectId: id,
            artifactName: parsed.data.artifact,
            instruction: parsed.data.instruction,
            mode: parsed.data.mode,
            cfg: resolveConfigForCommand(artifactCommandFor(parsed.data.artifact), id),
            send,
            signal,
          });
        } finally {
          locks.delete(key);
        }
      },
      { signal: request.signal }
    );
  } catch (err) {
    return toJsonError(err);
  }
}

async function runRevise({
  projectId,
  artifactName,
  instruction,
  mode,
  cfg,
  send,
  signal,
}: {
  projectId: string;
  artifactName: string;
  instruction: string;
  mode: "patch" | "rewrite";
  cfg: LLMConfig | null;
  send: SSESender;
  signal: AbortSignal;
}) {
  if (!cfg?.apiKey) throw new Error("未配置可用模型");
  const latest = getLatestArtifact(projectId, artifactName);
  if (!latest) throw new Error(`产物 ${artifactName} 不存在`);
  const recent = listStepConversations(projectId, artifactName, { limit: 8 });
  appendStepConversation({ projectId, artifactName, role: "user", content: instruction });

  send({ type: "progress", stage: "locating", message: "正在定位要改的段落…" });
  if (mode === "rewrite") {
    await rewriteArtifact({ projectId, artifactName, instruction, latest, recent, cfg, send, signal });
    return;
  }

  const raw = await collectLLM(
    cfg,
    buildRevisePrompt(artifactName, latest.content, instruction, recent, "patch"),
    { temperature: 0.25, maxTokens: 1800, signal },
    send
  );
  let patch: RevisePatch;
  try {
    patch = parseRevisePatch(raw);
  } catch (err) {
    send({
      type: "progress",
      stage: "fallback-rewrite",
      message: `Patch JSON 解析失败，正在整体重写：${(err as Error).message}`,
    });
    await rewriteArtifact({ projectId, artifactName, instruction, latest, recent, cfg, send, signal });
    return;
  }
  send({ type: "patch", patch });
  const applied = applyPatches(latest.content, patch.patches);
  if (patch.fallback === "REWRITE" || applied.applied === 0) {
    send({
      type: "progress",
      stage: "fallback-rewrite",
      message: applied.failures.length
        ? `未能精确定位，正在整体重写：${applied.failures.join("；")}`
        : "模型判断改动范围较大，正在整体重写…",
    });
    await rewriteArtifact({ projectId, artifactName, instruction, latest, recent, cfg, send, signal });
    return;
  }

  const content = normalizeArtifactContent(artifactName, applied.content);
  validateArtifactContent(artifactName, content);
  const artifact = saveArtifact({
    projectId,
    name: artifactName,
    content,
    meta: buildArtifactMeta(artifactName, content),
    source: "ai-edit",
    parentVersion: latest.version,
  });
  appendStepConversation({
    projectId,
    artifactName,
    role: "assistant",
    content: patch.summary,
    patch,
    appliedVersion: artifact.version,
  });
  logEvent(projectId, artifactName, "ai-edit", {
    version: artifact.version,
    parentVersion: latest.version,
    patchCount: applied.applied,
    failures: applied.failures,
  });
  send({
    type: "applied",
    version: artifact.version,
    source: "ai-edit",
    patchCount: applied.applied,
    failures: applied.failures,
  });
  send({ type: "done" });
}

async function rewriteArtifact({
  projectId,
  artifactName,
  instruction,
  latest,
  recent,
  cfg,
  send,
  signal,
}: {
  projectId: string;
  artifactName: string;
  instruction: string;
  latest: { content: string; version: number };
  recent: ReturnType<typeof listStepConversations>;
  cfg: LLMConfig;
  send: SSESender;
  signal: AbortSignal;
}) {
  send({ type: "progress", stage: "rewrite", message: "正在生成完整修改版…" });
  const content = normalizeArtifactContent(
    artifactName,
    await collectLLM(
      cfg,
      buildRewritePrompt(artifactName, latest.content, instruction, recent),
      { temperature: 0.45, maxTokens: 4200, signal },
      send
    )
  );
  validateArtifactContent(artifactName, content);
  const artifact = saveArtifact({
    projectId,
    name: artifactName,
    content,
    meta: buildArtifactMeta(artifactName, content),
    source: "ai-edit",
    parentVersion: latest.version,
  });
  const patch: RevisePatch = { summary: "已按指令整体改写", patches: [], fallback: "REWRITE" };
  appendStepConversation({
    projectId,
    artifactName,
    role: "assistant",
    content: patch.summary,
    patch,
    appliedVersion: artifact.version,
  });
  logEvent(projectId, artifactName, "ai-edit", {
    version: artifact.version,
    parentVersion: latest.version,
    patchCount: 0,
    fallback: "REWRITE",
  });
  send({ type: "applied", version: artifact.version, source: "ai-edit", patchCount: 0 });
  send({ type: "done" });
}

async function collectLLM(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: { temperature: number; maxTokens: number; signal: AbortSignal },
  send: SSESender
): Promise<string> {
  let acc = "";
  let reasoningBuf = "";
  let lastReasoningSend = 0;
  for await (const ev of streamLLM(cfg, messages, opts)) {
    if (ev.type === "delta") {
      acc += ev.text;
      send({ type: "delta", text: ev.text });
    } else if (ev.type === "reasoning") {
      reasoningBuf += ev.text;
      const now = Date.now();
      if (now - lastReasoningSend > 600) {
        lastReasoningSend = now;
        const compact = reasoningBuf.replace(/\s+/g, " ").trim();
        const tail = compact.length > 60 ? `…${compact.slice(-60)}` : compact;
        send({ type: "progress", stage: "thinking", message: `深度思考中 · ${tail}` });
      }
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    } else if (ev.type === "done") {
      send({ type: "usage", usage: ev.usage ?? null });
    }
  }
  return acc;
}
