import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getBatchProject } from "@/lib/batch/store";
import { runBatchStage } from "@/lib/batch/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const RunSchema = z.object({
  stage: z.enum(["creative", "screenplay", "storyboard"]),
  batchSize: z.number().int().min(1).max(100).optional(),
  selectedOnly: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    const parsed = RunSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const result = await runBatchStage({ batchId: id, ...parsed.data, signal: request.signal });
    return ok({ result });
  } catch (err) {
    return toJsonError(err);
  }
}
