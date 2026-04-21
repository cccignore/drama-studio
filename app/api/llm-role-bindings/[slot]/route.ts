import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { ROLE_SLOTS, upsertLLMRoleBinding } from "@/lib/llm/role-store";
import type { LLMRoleSlot } from "@/lib/llm/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  configId: z.string().min(1, "configId 必填"),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slot: string }> }
) {
  try {
    const { slot } = await params;
    if (!ROLE_SLOTS.includes(slot as LLMRoleSlot)) {
      throw new AppError("invalid_input", "非法模型角色", 400);
    }
    const body = await readJsonBody(request);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const item = upsertLLMRoleBinding(slot as LLMRoleSlot, parsed.data.configId);
    return ok({ item });
  } catch (err) {
    return toJsonError(err);
  }
}
