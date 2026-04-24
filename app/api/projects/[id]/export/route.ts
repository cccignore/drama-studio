import { NextRequest } from "next/server";
import { AppError, toJsonError } from "@/lib/api/errors";
import { getProject, updateProject, logEvent } from "@/lib/drama/store";
import { advanceAfter, promoteStep } from "@/lib/drama/state-machine";
import { collectExportBundle } from "@/lib/drama/export/collect";
import {
  renderEpisodeMarkdown,
  renderEpisodeStoryboardMarkdown,
  renderProjectMarkdown,
  renderScreenplayMarkdown,
  renderStoryboardMarkdown,
  type ExportRange,
} from "@/lib/drama/export/md";
import {
  buildEpisodeDocx,
  buildEpisodeStoryboardDocx,
  buildProjectDocx,
  buildScreenplayDocx,
  buildStoryboardDocx,
} from "@/lib/drama/export/docx";
import { buildProjectZip } from "@/lib/drama/export/zip";

export const runtime = "nodejs";

const FORMATS = new Set(["md", "docx", "zip"]);
const KINDS = new Set(["screenplay", "storyboard", "project"]);

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
    const kind = (searchParams.get("kind") || "screenplay").toLowerCase();
    if (!KINDS.has(kind)) throw new AppError("invalid_input", "kind 必须是 screenplay / storyboard / project", 400);
    const episodeParam = searchParams.get("episode");
    const episodeIndex = episodeParam ? parseInt(episodeParam, 10) : null;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const range: ExportRange = {
      from: fromParam ? parseInt(fromParam, 10) : undefined,
      to: toParam ? parseInt(toParam, 10) : undefined,
    };

    const bundle = collectExportBundle(project);
    if (bundle.episodes.length === 0) {
      throw new AppError("not_ready", "尚未写出任何剧本，请先完成 episode 步骤", 400);
    }

    const baseName = safeFileName(project.title || project.state.dramaTitle);
    const rangeSuffix =
      episodeIndex
        ? `-ep${episodeIndex}`
        : range.from || range.to
        ? `-${range.from ?? 1}-${range.to ?? project.state.totalEpisodes}`
        : "";
    const kindLabel =
      format === "zip"
        ? "交付包"
        : kind === "storyboard"
        ? "分镜脚本"
        : kind === "project"
        ? "项目资料"
        : "完整剧本";

    let body: Uint8Array | string;
    let mime: string;
    let ext: string;

    if (format === "md") {
      if (kind === "storyboard") {
        body = episodeIndex
          ? renderEpisodeStoryboardMarkdown(bundle, episodeIndex)
          : renderStoryboardMarkdown(bundle, range);
      } else if (kind === "project") {
        body = renderProjectMarkdown(bundle);
      } else {
        body = episodeIndex
          ? renderEpisodeMarkdown(bundle, episodeIndex)
          : renderScreenplayMarkdown(bundle, range);
      }
      mime = "text/markdown; charset=utf-8";
      ext = "md";
    } else if (format === "docx") {
      if (kind === "storyboard") {
        body = episodeIndex
          ? await buildEpisodeStoryboardDocx(bundle, episodeIndex)
          : await buildStoryboardDocx(bundle, range);
      } else if (kind === "project") {
        body = await buildProjectDocx(bundle);
      } else {
        body = episodeIndex
          ? await buildEpisodeDocx(bundle, episodeIndex)
          : await buildScreenplayDocx(bundle, range);
      }
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
    logEvent(id, "export", "done", {
      format,
      kind,
      episodeIndex: episodeIndex ?? null,
      from: range.from ?? null,
      to: range.to ?? null,
    });

    const filename = `${baseName}-${kindLabel}${rangeSuffix}.${ext}`;
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
