import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { csvToItems } from "@/lib/batch/csv";
import { renderCreativeMd } from "@/lib/batch/runner";
import { getBatchProject, upsertImportedItems } from "@/lib/batch/store";
import type { BatchItem } from "@/lib/batch/types";

export const runtime = "nodejs";

const ImportSchema = z.object({
  format: z.enum(["csv"]).default("csv"),
  content: z.string().min(1, "导入内容不能为空"),
  // Default mode: "replace" — CSV is the source of truth. Rows missing from the
  // CSV are deleted from the batch. Use "merge" to keep existing rows untouched.
  mode: z.enum(["replace", "merge"]).default("replace"),
  // Legacy review-stage selection. Kept for backward-compat with old UIs.
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
    const rows = csvToItems(parsed.data.content).map(normalizeImportedRow);
    const items = upsertImportedItems(id, rows, {
      reviewStage: parsed.data.reviewStage,
      replaceSelection: parsed.data.replaceSelection,
      replaceAll: parsed.data.mode === "replace",
    });
    return ok({ imported: items.length, items, mode: parsed.data.mode });
  } catch (err) {
    return toJsonError(err);
  }
}

// If the CSV only has structured creative fields (act1/act2/act3 etc.) but no
// creative_md blob, synthesize one so downstream stages have something to feed
// the screenplay/storyboard prompts. Conversely, if creative_md is present but
// the structured fields are blank, the runner.parseCreativeStructured handles
// the reverse — but doing it eagerly here keeps the DB self-consistent.
function normalizeImportedRow(row: Partial<BatchItem>): Partial<BatchItem> {
  const hasStructured = Boolean(row.act1 || row.act2 || row.act3 || row.protagonist);
  if (hasStructured && !row.creativeMd) {
    row.creativeMd = renderCreativeMd({
      title: row.title ?? "",
      oneLiner: row.oneLiner ?? "",
      protagonist: row.protagonist ?? "",
      narrativePov: row.narrativePov ?? "",
      audience: row.audience ?? "",
      storyType: row.storyType ?? "",
      setting: row.setting ?? "",
      act1: row.act1 ?? "",
      act2: row.act2 ?? "",
      act3: row.act3 ?? "",
    });
  }
  return row;
}
