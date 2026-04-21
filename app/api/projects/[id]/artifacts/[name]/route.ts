import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toJsonError, AppError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getProject, logEvent } from "@/lib/drama/store";
import { getLatestArtifact, saveArtifact } from "@/lib/drama/artifacts";
import { buildArtifactMeta, normalizeArtifactContent, validateArtifactContent } from "@/lib/drama/artifact-meta";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  content: z.string().min(1, "content 不能为空"),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);
    const artifact = getLatestArtifact(id, name);
    if (!artifact) throw new AppError("not_found", `产物 ${name} 不存在`, 404);
    return NextResponse.json({ success: true, data: { item: artifact } });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);
    const latest = getLatestArtifact(id, name);
    if (!latest) throw new AppError("not_found", `产物 ${name} 不存在`, 404);
    const body = await readJsonBody(request);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const content = normalizeArtifactContent(name, parsed.data.content);
    validateArtifactContent(name, content);
    const artifact = saveArtifact({
      projectId: id,
      name,
      content,
      meta: buildArtifactMeta(name, content),
      source: "manual-edit",
      parentVersion: latest.version,
    });
    logEvent(id, name, "manual-edit", { version: artifact.version, parentVersion: latest.version });
    return NextResponse.json({ success: true, data: { item: artifact } });
  } catch (err) {
    return toJsonError(err);
  }
}
