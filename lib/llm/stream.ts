import type { LLMConfig, LLMMessage, LLMStreamEvent, LLMCallOptions } from "./types";
import { streamOpenAICompat, pingOpenAICompat } from "./providers/openai-compatible";
import { streamAnthropicCompat, pingAnthropicCompat } from "./providers/anthropic-compatible";

export function streamLLM(
  cfg: LLMConfig,
  messages: LLMMessage[],
  opts?: LLMCallOptions
): AsyncGenerator<LLMStreamEvent> {
  if (cfg.protocol === "anthropic") return streamAnthropicCompat(cfg, messages, opts);
  return streamOpenAICompat(cfg, messages, opts);
}

export async function pingLLM(cfg: LLMConfig): Promise<{ ok: boolean; detail: string }> {
  if (cfg.protocol === "anthropic") return pingAnthropicCompat(cfg);
  return pingOpenAICompat(cfg);
}
