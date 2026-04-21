import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getProject, logEvent } from "@/lib/drama/store";
import { buildArtifactMeta } from "@/lib/drama/artifact-meta";
import { getArtifactVersion, getLatestArtifact, saveArtifact } from "@/lib/drama/artifacts";

export const runtime = "nodejs";

const BodySchema = z.object({
  version: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    const body = await readJsonBody(request);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const target = getArtifactVersion(id, name, parsed.data.version);
    if (!target) throw new AppError("not_found", `版本 v${parsed.data.version} 不存在`, 404);
    const latest = getLatestArtifact(id, name);
    const artifact = saveArtifact({
      projectId: id,
      name,
      content: target.content,
      meta: buildArtifactMeta(name, target.content) ?? target.meta,
      source: "revert",
      parentVersion: latest?.version ?? null,
    });
    logEvent(id, name, "revert", { version: artifact.version, fromVersion: target.version });
    return ok({ item: artifact });
  } catch (err) {
    return toJsonError(err);
  }
}
