import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getBatchProject } from "@/lib/batch/store";
import { startBatchRun, getRunState } from "@/lib/batch/run-supervisor";
import type { BatchStage } from "@/lib/batch/types";

export const runtime = "nodejs";
// Long deadline for long-running batches; the work happens in a detached
// promise inside the supervisor so this number only bounds *our own* HTTP
// response, not the underlying generation. Bumped from 300 to 3600 just in
// case some runtime still honors it for the immediate ack response.
export const maxDuration = 3600;

// Two ways to call:
//   - { stage: "creative" }                         single stage
//   - { chain: true }                               creative → screenplay → storyboard
//   - { chain: true, fromStage: "screenplay" }      screenplay → storyboard
const RunSchema = z
  .object({
    stage: z.enum(["distill", "creative", "screenplay", "storyboard"]).optional(),
    chain: z.boolean().optional(),
    fromStage: z.enum(["creative", "screenplay", "storyboard"]).optional(),
    batchSize: z.number().int().min(1).max(100).optional(),
    selectedOnly: z.boolean().optional(),
  })
  .refine((d) => d.stage || d.chain, { message: "stage 或 chain 必须传一个" });

const CHAIN_FULL: BatchStage[] = ["creative", "screenplay", "storyboard"];

// We don't await the run here. The runner gets handed off to a process-scope
// supervisor and the API returns immediately with `started` or
// `already_running`. The browser is free to refresh / close — the run will
// keep going. The UI polls /api/batches/{id} for progress.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    const parsed = RunSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const data = parsed.data;
    let stages: BatchStage[];
    if (data.chain) {
      const from = data.fromStage ?? "creative";
      const startIdx = CHAIN_FULL.indexOf(from);
      stages = CHAIN_FULL.slice(startIdx);
    } else {
      stages = [data.stage as BatchStage];
    }
    const result = startBatchRun({
      batchId: id,
      stage: stages[0],
      stages,
      batchSize: data.batchSize,
      selectedOnly: data.selectedOnly,
    });
    return ok({ run: result, stages });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage") as "distill" | "creative" | "screenplay" | "storyboard" | null;
    if (!stage) throw new AppError("invalid_input", "缺少 stage 参数", 400);
    return ok({ run: getRunState(id, stage) });
  } catch (err) {
    return toJsonError(err);
  }
}
