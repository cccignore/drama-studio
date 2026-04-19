import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { deleteLLMConfig, getLLMConfig, updateLLMConfig } from "@/lib/llm/store";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  protocol: z.enum(["openai", "anthropic"]).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(), // 空串 = 不改
  model: z.string().min(1).optional(),
  extraHeaders: z.record(z.string()).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cfg = getLLMConfig(id);
    if (!cfg) throw new AppError("not_found", "配置不存在", 404);
    return ok({ item: cfg });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const updated = updateLLMConfig(id, parsed.data);
    if (!updated) throw new AppError("not_found", "配置不存在", 404);
    return ok({ item: updated });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const done = deleteLLMConfig(id);
    if (!done) throw new AppError("not_found", "配置不存在", 404);
    return ok({ deleted: true });
  } catch (err) {
    return toJsonError(err);
  }
}
