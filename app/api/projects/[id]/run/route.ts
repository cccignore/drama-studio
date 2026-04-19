import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, toJsonError } from "@/lib/api/errors";
import { createSSEResponse } from "@/lib/api/sse";
import { getProject, logEvent } from "@/lib/drama/store";
import { resolveConfigForCommand } from "@/lib/llm/router";
import { streamLLM } from "@/lib/llm/stream";
import { getLLMConfig } from "@/lib/llm/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const RunSchema = z.object({
  command: z.string().min(1),
  args: z.record(z.any()).optional(),
  configId: z.string().optional(),
});

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

    // 解析模型配置
    const cfg = configId ? getLLMConfig(configId, true) : resolveConfigForCommand(command, id);
    if (!cfg || !cfg.apiKey) {
      throw new AppError(
        "no_llm_config",
        "未配置可用的模型，请先到「模型设置」添加一个 LLM 配置",
        400
      );
    }

    return createSSEResponse(async ({ send, signal }) => {
      send({ type: "start", command, model: cfg.name, protocol: cfg.protocol });
      logEvent(id, command, "start", { model: cfg.name });

      try {
        if (command === "ping") {
          await runPing({ cfg, args, send, signal });
        } else {
          send({
            type: "error",
            code: "not_implemented",
            message: `命令 ${command} 在 M1 阶段尚未实现（仅 ping 可用）`,
          });
          return;
        }
        send({ type: "done" });
        logEvent(id, command, "done");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg, code: "run_failed" });
        logEvent(id, command, "error", { message: msg });
      }
    }, { signal: request.signal });
  } catch (err) {
    return toJsonError(err);
  }
}

async function runPing({
  cfg,
  args,
  send,
  signal,
}: {
  cfg: NonNullable<ReturnType<typeof getLLMConfig>>;
  args?: Record<string, unknown>;
  send: (ev: Record<string, unknown> & { type: string }) => void;
  signal: AbortSignal;
}) {
  const userMsg =
    (typeof args?.message === "string" && args.message.trim()) ||
    "用一句话自我介绍，并说明你擅长短剧创作的哪些方面。";

  send({ type: "progress", stage: "calling-llm", message: `正在调用 ${cfg.name} …` });

  let acc = "";
  for await (const ev of streamLLM(
    cfg,
    [
      { role: "system", content: "你是一位专业的短剧编剧助手。" },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.7, maxTokens: 256, signal }
  )) {
    if (ev.type === "delta") {
      acc += ev.text;
      send({ type: "partial", text: ev.text });
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    } else if (ev.type === "done") {
      send({ type: "usage", usage: ev.usage ?? null });
    }
  }
  send({ type: "artifact", name: "ping-echo", length: acc.length });
}
