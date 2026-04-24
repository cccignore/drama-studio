import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getBatchProject, listBatchItems, updateBatchItemsSelection } from "@/lib/batch/store";

export const runtime = "nodejs";

const PatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      ideaSelected: z.boolean().optional(),
      creativeSelected: z.boolean().optional(),
      screenplaySelected: z.boolean().optional(),
    })
  ),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    return ok({ items: listBatchItems(id) });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    const parsed = PatchSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    return ok({ items: updateBatchItemsSelection(id, parsed.data.items) });
  } catch (err) {
    return toJsonError(err);
  }
}
