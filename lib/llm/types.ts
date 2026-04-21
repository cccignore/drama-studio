export type LLMProtocol = "openai" | "anthropic";

export type ProjectLLMCommand =
  | "default"
  | "start"
  | "plan"
  | "characters"
  | "outline"
  | "episode"
  | "review"
  | "export"
  | "overseas"
  | "compliance";

export type LLMRoleSlot = "primary" | "secondary" | "tertiary" | "overseas";

export interface LLMConfig {
  id: string;
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  apiKey: string; // 明文（仅内存态，落库时加密）
  model: string;
  extraHeaders?: Record<string, string>;
  isDefault?: boolean;
  createdAt?: number;
}

export interface LLMConfigRow {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  api_key: string; // 密文
  model: string;
  extra_headers: string | null;
  is_default: number;
  created_at: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMStreamEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done"; usage?: { input?: number; output?: number } }
  | { type: "error"; message: string };

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}
