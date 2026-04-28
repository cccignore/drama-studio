import type { LLMConfig, LLMMessage, LLMStreamEvent, LLMCallOptions, LLMFinishReason } from "../types";
import { TOKEN_BUDGETS } from "../budgets";
import { iterSSELines } from "../sse-parse";
import { friendlyNetworkError, friendlyUpstreamError } from "../provider-error";
import { fetchWithRetry } from "../retry";

// See openai-compatible.ts for the rationale — same timer, same reset-on-retry
// behavior, registered in the onRetry callback below.
const STREAM_IDLE_TIMEOUT_MS = 90_000;

function mapStopReason(raw: unknown): LLMFinishReason | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "end_turn" || raw === "stop_sequence") return "stop";
  if (raw === "max_tokens") return "length";
  if (raw === "tool_use") return "tool_calls";
  return "unknown";
}

function composeSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const valid = signals.filter((s): s is AbortSignal => Boolean(s));
  if (valid.length === 1) return valid[0];
  const controller = new AbortController();
  for (const sig of valid) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      break;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Anthropic-compatible /v1/messages streaming endpoint.
 * 约定 cfg.baseUrl 指到 `https://api.anthropic.com/v1`（不带尾部斜杠）。
 */
export async function* streamAnthropicCompat(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: LLMCallOptions = {}
): AsyncGenerator<LLMStreamEvent> {
  const url = cfg.baseUrl.replace(/\/$/, "") + "/messages";
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const dialog = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": cfg.apiKey,
    "anthropic-version": "2023-06-01",
    ...(cfg.extraHeaders ?? {}),
  };
  const body = JSON.stringify({
    model: cfg.model,
    stream: true,
    max_tokens: opts.maxTokens ?? TOKEN_BUDGETS.longArtifact,
    temperature: opts.temperature ?? 0.7,
    ...(system ? { system } : {}),
    messages: dialog,
  });

  const idleAbort = new AbortController();
  const composedSignal = composeSignals(opts.signal, idleAbort.signal);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleAbort.abort(new Error("idle_timeout"));
    }, STREAM_IDLE_TIMEOUT_MS);
  };
  armIdleTimer();

  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { method: "POST", headers, body, signal: composedSignal },
      {
        signal: composedSignal,
        onRetry: ({ attempt, delayMs, reason }) => {
          console.warn(
            `[llm-retry] ${cfg.name} (${cfg.model}) attempt ${attempt} in ${delayMs}ms · ${reason}`
          );
          armIdleTimer();
        },
      }
    );
  } catch (err: unknown) {
    if (idleTimer) clearTimeout(idleTimer);
    const msg = err instanceof Error ? err.message : String(err);
    if (idleAbort.signal.aborted) {
      yield { type: "error", message: `流空闲超时（${STREAM_IDLE_TIMEOUT_MS / 1000}s 没有新 token）`, code: "idle_timeout" };
      return;
    }
    yield { type: "error", message: friendlyNetworkError(msg), code: "network_error" };
    return;
  }

  if (!res.ok || !res.body) {
    if (idleTimer) clearTimeout(idleTimer);
    const text = await res.text().catch(() => "");
    yield { type: "error", message: friendlyUpstreamError(res.status, text), code: "upstream_error" };
    return;
  }

  let usage: { input?: number; output?: number } | undefined;
  let finishReason: LLMFinishReason | undefined;
  try {
    for await (const raw of iterSSELines(res.body)) {
      armIdleTimer();
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      if (json.type === "content_block_delta") {
        const t = json?.delta?.text;
        if (t) yield { type: "delta", text: t };
      } else if (json.type === "message_delta") {
        const fr = mapStopReason(json?.delta?.stop_reason);
        if (fr) finishReason = fr;
        if (json.usage) {
          usage = {
            input: json.usage.input_tokens,
            output: json.usage.output_tokens,
          };
        }
      } else if (json.type === "message_stop") {
        break;
      } else if (json.type === "error") {
        if (idleTimer) clearTimeout(idleTimer);
        yield { type: "error", message: json?.error?.message ?? "上游 anthropic 错误", code: "upstream_error" };
        return;
      }
    }
  } catch (err: unknown) {
    if (idleTimer) clearTimeout(idleTimer);
    const msg = err instanceof Error ? err.message : String(err);
    if (idleAbort.signal.aborted) {
      yield { type: "error", message: `流空闲超时（${STREAM_IDLE_TIMEOUT_MS / 1000}s 没有新 token）`, code: "idle_timeout" };
      return;
    }
    yield { type: "error", message: `流式解析错误：${msg}`, code: "stream_error" };
    return;
  }
  if (idleTimer) clearTimeout(idleTimer);
  yield { type: "done", usage, finishReason };
}

export async function pingAnthropicCompat(cfg: LLMConfig): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let full = "";
  let error = "";
  try {
    for await (const ev of streamAnthropicCompat(
      cfg,
      [
        { role: "system", content: "Respond with exactly: PONG" },
        { role: "user", content: "ping" },
      ],
      { temperature: 0, maxTokens: 16, signal: controller.signal }
    )) {
      if (ev.type === "delta") full += ev.text;
      if (ev.type === "error") error = ev.message;
      if (ev.type === "done") break;
    }
  } finally {
    clearTimeout(timer);
  }
  if (error) return { ok: false, detail: error };
  if (!full.trim()) return { ok: false, detail: "上游无输出" };
  return { ok: true, detail: full.trim().slice(0, 120) };
}
