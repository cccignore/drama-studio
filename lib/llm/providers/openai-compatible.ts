import type { LLMConfig, LLMMessage, LLMStreamEvent, LLMCallOptions, LLMFinishReason } from "../types";
import { iterSSELines } from "../sse-parse";
import { friendlyNetworkError, friendlyUpstreamError } from "../provider-error";
import { fetchWithRetry } from "../retry";

// Abort the stream if no new chunk arrives within this window. Models that
// "think" silently (GPT-5.4 reasoning, o-series) emit `reasoning` deltas as
// keepalive — so the timer resets on every event, not just visible content.
// Without this, a yunwu-style relay can hold the connection open for 5+ min
// before silently closing with [DONE] and zero deltas.
//
// The timer is also reset between fetchWithRetry attempts (via the onRetry
// callback below), because the upstream may take tens of seconds to fail
// before a retry runs — counting that against the "no new token" window
// would force a false idle_timeout on the next attempt.
const STREAM_IDLE_TIMEOUT_MS = 90_000;

function normalizeFinishReason(raw: unknown): LLMFinishReason | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "stop" || raw === "length" || raw === "content_filter" || raw === "tool_calls") return raw;
  return "unknown";
}

/**
 * OpenAI-compatible chat completions endpoint（DeepSeek / OpenAI / SiliconFlow / 通义等）
 * 请求：POST {base_url}/chat/completions
 */
export async function* streamOpenAICompat(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts: LLMCallOptions = {}
): AsyncGenerator<LLMStreamEvent> {
  const url = cfg.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${cfg.apiKey}`,
    ...(cfg.extraHeaders ?? {}),
  };
  const body = JSON.stringify({
    model: cfg.model,
    stream: true,
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  });

  // Compose the caller's abort signal with our own idle-timeout signal so
  // either one can cancel the in-flight fetch.
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
          // Each retry gets a fresh idle window — otherwise a slow first
          // attempt eats the budget and the next attempt is killed before
          // it can produce anything.
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
      if (raw === "[DONE]") break;
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const choice = json?.choices?.[0];
      const reasoning: string | undefined = choice?.delta?.reasoning_content;
      if (reasoning) yield { type: "reasoning", text: reasoning };
      const delta: string | undefined = choice?.delta?.content;
      if (delta) yield { type: "delta", text: delta };
      const fr = normalizeFinishReason(choice?.finish_reason);
      if (fr) finishReason = fr;
      if (json?.usage) {
        usage = {
          input: json.usage.prompt_tokens ?? json.usage.input_tokens,
          output: json.usage.completion_tokens ?? json.usage.output_tokens,
        };
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

/** 一次 ping 调用，用于连通性测试 */
export async function pingOpenAICompat(cfg: LLMConfig): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let full = "";
  let error = "";
  try {
    for await (const ev of streamOpenAICompat(
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
