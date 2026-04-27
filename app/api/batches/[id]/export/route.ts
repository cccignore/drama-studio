import { NextRequest } from "next/server";
import { AppError, toJsonError } from "@/lib/api/errors";
import { buildBatchZip, renderBatchMarkdown } from "@/lib/batch/export";
import { itemsToCsv, itemsToSimpleCsv } from "@/lib/batch/csv";
import { getBatchProject, listBatchItems } from "@/lib/batch/store";
import type { BatchStage } from "@/lib/batch/types";

export const runtime = "nodejs";

const STAGES = new Set(["sources", "creative", "screenplay", "storyboard"]);
const FORMATS = new Set(["csv", "md", "zip"]);

function safeFileName(input: string): string {
  return (input || "hongguo-batch").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80) || "hongguo-batch";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getBatchProject(id);
    if (!project) throw new AppError("not_found", "批量任务不存在", 404);
    const { searchParams } = new URL(request.url);
    const stage = (searchParams.get("stage") || "sources") as BatchStage;
    const format = (searchParams.get("format") || "csv").toLowerCase();
    if (!STAGES.has(stage)) throw new AppError("invalid_input", "stage 不合法", 400);
    if (!FORMATS.has(format)) throw new AppError("invalid_input", "format 必须是 csv / md / zip", 400);

    const items = listBatchItems(id);
    let body: Uint8Array | string;
    let mime: string;
    let ext: string;
    if (format === "zip") {
      body = await buildBatchZip(project, items);
      mime = "application/zip";
      ext = "zip";
    } else if (format === "md") {
      body = renderBatchMarkdown(project, items, stage);
      mime = "text/markdown; charset=utf-8";
      ext = "md";
    } else {
      // sources stage keeps the full schema so the "export → edit → re-import"
      // round-trip still works. Downstream stages use a simplified delivery
      // schema whose column count grows with the pipeline stage.
      body = stage === "sources" ? itemsToCsv(items) : itemsToSimpleCsv(items, stage);
      mime = "text/csv; charset=utf-8";
      ext = "csv";
    }

    const payload = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
    const filename = `${safeFileName(project.title)}-${stage}.${ext}`;
    return new Response(ab, {
      headers: {
        "content-type": mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return toJsonError(err);
  }
}
