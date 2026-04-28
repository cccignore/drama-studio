import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { createBatchProject, listBatchItems, listBatchProjects } from "@/lib/batch/store";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().optional(),
  sourceText: z.string().min(1, "请输入题材内容"),
  targetMarket: z.enum(["domestic", "overseas"]).default("overseas"),
  totalEpisodes: z.number().int().min(1).max(120).optional(),
  useComplexReversal: z.boolean().optional().default(false),
  // hongguo: sourceText is multi-line `标题|标签|简介`, items go through distill
  // before creative. manual: each non-empty line is a one-liner; items skip
  // distill and start at creative.
  sourceMode: z.enum(["hongguo", "manual"]).optional().default("hongguo"),
});

export async function GET() {
  try {
    return ok({ items: listBatchProjects() });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = CreateSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const item = createBatchProject(parsed.data);
    return ok({ item, items: listBatchItems(item.id) });
  } catch (err) {
    return toJsonError(err);
  }
}
