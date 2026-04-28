import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { exportBatchToFeishu } from "@/lib/feishu/export";
import { getBatchProject, listBatchItems } from "@/lib/batch/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getBatchProject(id);
    if (!project) throw new AppError("not_found", "批量任务不存在", 404);

    const appId = process.env.FEISHU_APP_ID?.trim();
    const appSecret = process.env.FEISHU_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      throw new AppError(
        "feishu_not_configured",
        "服务端未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，无法导出到飞书",
        400
      );
    }

    const body = (await request.json().catch(() => ({}))) as { bitableUrl?: string };
    const bitableUrl = (body.bitableUrl || process.env.FEISHU_BITABLE_URL || "").trim();
    if (!bitableUrl) {
      throw new AppError(
        "feishu_bitable_missing",
        "未提供多维表格 URL（请传 bitableUrl 或配置 FEISHU_BITABLE_URL）",
        400
      );
    }

    const items = listBatchItems(id);
    if (!items.length) throw new AppError("empty_batch", "批量任务为空，没有可导出的剧目", 400);

    const result = await exportBatchToFeishu(project, items, { appId, appSecret, bitableUrl });
    return ok(result);
  } catch (err) {
    return toJsonError(err);
  }
}
