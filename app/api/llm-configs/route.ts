import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { createLLMConfig, listLLMConfigs } from "@/lib/llm/store";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1, "name 必填"),
  protocol: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().url("baseUrl 必须是 URL"),
  apiKey: z.string().min(1, "apiKey 必填"),
  model: z.string().min(1, "model 必填"),
  extraHeaders: z.record(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  try {
    return ok({ items: listLLMConfigs() });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const created = createLLMConfig(parsed.data);
    return ok({ item: created }, { status: 201 });
  } catch (err) {
    return toJsonError(err);
  }
}
