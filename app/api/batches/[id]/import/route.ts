import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { csvToItems } from "@/lib/batch/csv";
import { getBatchProject, upsertImportedItems } from "@/lib/batch/store";

export const runtime = "nodejs";

const ImportSchema = z.object({
  format: z.enum(["csv"]).default("csv"),
  content: z.string().min(1, "导入内容不能为空"),
  reviewStage: z.enum(["sources", "creative", "screenplay"]).optional(),
  replaceSelection: z.boolean().default(false),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getBatchProject(id)) throw new AppError("not_found", "批量任务不存在", 404);
    const parsed = ImportSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const rows = csvToItems(parsed.data.content);
    const items = upsertImportedItems(id, rows, {
      reviewStage: parsed.data.reviewStage,
      replaceSelection: parsed.data.replaceSelection,
    });
    return ok({ imported: items.length, items });
  } catch (err) {
    return toJsonError(err);
  }
}
