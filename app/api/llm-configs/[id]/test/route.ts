import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { getLLMConfig } from "@/lib/llm/store";
import { pingLLM } from "@/lib/llm/stream";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cfg = getLLMConfig(id, true);
    if (!cfg) throw new AppError("not_found", "配置不存在", 404);
    const result = await pingLLM(cfg);
    return ok(result);
  } catch (err) {
    return toJsonError(err);
  }
}
