import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import {
  deleteBatchProject,
  getBatchProject,
  listBatchItems,
  updateBatchProject,
} from "@/lib/batch/store";

export const runtime = "nodejs";

const PatchSchema = z.object({
  title: z.string().optional(),
  sourceText: z.string().optional(),
  targetMarket: z.enum(["domestic", "overseas"]).optional(),
  totalEpisodes: z.number().int().min(1).max(120).optional(),
  status: z.string().optional(),
  useComplexReversal: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = getBatchProject(id);
    if (!item) throw new AppError("not_found", "批量任务不存在", 404);
    return ok({ item, items: listBatchItems(id) });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = PatchSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const item = updateBatchProject(id, parsed.data);
    if (!item) throw new AppError("not_found", "批量任务不存在", 404);
    return ok({ item });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    deleteBatchProject(id);
    return ok({ deleted: true });
  } catch (err) {
    return toJsonError(err);
  }
}
