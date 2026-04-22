import type { LLMConfig, LLMMessage, LLMStreamEvent, LLMCallOptions } from "../types";
import { iterSSELines } from "../sse-parse";
import { friendlyNetworkError, friendlyUpstreamError } from "../provider-error";
import { fetchWithRetry } from "../retry";

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

  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { method: "POST", headers, body, signal: opts.signal },
      {
        signal: opts.signal,
        onRetry: ({ attempt, delayMs, reason }) => {
          console.warn(
            `[llm-retry] ${cfg.name} (${cfg.model}) attempt ${attempt} in ${delayMs}ms · ${reason}`
          );
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: friendlyNetworkError(msg) };
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield { type: "error", message: friendlyUpstreamError(res.status, text) };
    return;
  }

  let usage: { input?: number; output?: number } | undefined;
  try {
    for await (const raw of iterSSELines(res.body)) {
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
      if (json?.usage) {
        usage = {
          input: json.usage.prompt_tokens ?? json.usage.input_tokens,
          output: json.usage.completion_tokens ?? json.usage.output_tokens,
        };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `流式解析错误：${msg}` };
    return;
  }
  yield { type: "done", usage };
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
