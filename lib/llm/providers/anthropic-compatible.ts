import type { LLMConfig, LLMMessage, LLMStreamEvent, LLMCallOptions } from "../types";
import { iterSSELines } from "../sse-parse";
import { friendlyNetworkError, friendlyUpstreamError } from "../provider-error";

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
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    ...(system ? { system } : {}),
    messages: dialog,
  });

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal: opts.signal });
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
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      if (json.type === "content_block_delta") {
        const t = json?.delta?.text;
        if (t) yield { type: "delta", text: t };
      } else if (json.type === "message_delta" && json.usage) {
        usage = {
          input: json.usage.input_tokens,
          output: json.usage.output_tokens,
        };
      } else if (json.type === "message_stop") {
        break;
      } else if (json.type === "error") {
        yield { type: "error", message: json?.error?.message ?? "上游 anthropic 错误" };
        return;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: `流式解析错误：${msg}` };
    return;
  }
  yield { type: "done", usage };
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
