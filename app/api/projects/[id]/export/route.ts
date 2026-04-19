import { NextRequest } from "next/server";
import { AppError, toJsonError } from "@/lib/api/errors";
import { getProject, updateProject, logEvent } from "@/lib/drama/store";
import { advanceAfter, promoteStep } from "@/lib/drama/state-machine";
import { collectExportBundle } from "@/lib/drama/export/collect";
import { renderProjectMarkdown, renderEpisodeMarkdown } from "@/lib/drama/export/md";
import { buildEpisodeDocx, buildProjectDocx } from "@/lib/drama/export/docx";
import { buildProjectZip } from "@/lib/drama/export/zip";

export const runtime = "nodejs";

const FORMATS = new Set(["md", "docx", "zip"]);

function safeFileName(input: string): string {
  return (input || "drama").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80) || "drama";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "md").toLowerCase();
    if (!FORMATS.has(format)) throw new AppError("invalid_input", "format 必须是 md / docx / zip", 400);
    const episodeParam = searchParams.get("episode");
    const episodeIndex = episodeParam ? parseInt(episodeParam, 10) : null;

    const bundle = collectExportBundle(project);
    if (bundle.episodes.length === 0) {
      throw new AppError("not_ready", "尚未写出任何剧本，请先完成 episode 步骤", 400);
    }

    const baseName = safeFileName(project.title || project.state.dramaTitle);
    const suffix = episodeIndex ? `-ep${episodeIndex}` : "";

    let body: Uint8Array | string;
    let mime: string;
    let ext: string;

    if (format === "md") {
      body = episodeIndex
        ? renderEpisodeMarkdown(bundle, episodeIndex)
        : renderProjectMarkdown(bundle);
      mime = "text/markdown; charset=utf-8";
      ext = "md";
    } else if (format === "docx") {
      body = episodeIndex
        ? await buildEpisodeDocx(bundle, episodeIndex)
        : await buildProjectDocx(bundle);
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = "docx";
    } else {
      body = await buildProjectZip(bundle);
      mime = "application/zip";
      ext = "zip";
    }

    if (!episodeIndex) {
      const fresh = getProject(id);
      if (fresh && fresh.state.currentStep !== "done") {
        const promoted = promoteStep(fresh.state, "export");
        updateProject(id, { state: promoted });
        if (format === "zip") {
          const nextState = advanceAfter("export", promoted);
          updateProject(id, { state: nextState });
        }
      }
    }
    logEvent(id, "export", "done", { format, episodeIndex: episodeIndex ?? null });

    const filename = `${baseName}${suffix}.${ext}`;
    const payload =
      typeof body === "string" ? new TextEncoder().encode(body) : (body as Uint8Array);
    const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
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
