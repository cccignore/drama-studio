import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toJsonError, AppError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getProject, logEvent, updateProject } from "@/lib/drama/store";
import { saveArtifact } from "@/lib/drama/artifacts";
import { buildArtifactMeta, normalizeArtifactContent, validateArtifactContent } from "@/lib/drama/artifact-meta";
import { COMMAND_TO_STEP, promoteStep } from "@/lib/drama/state-machine";
import type { DramaStep } from "@/lib/drama/types";

export const runtime = "nodejs";

/**
 * Artifact 名称 → 本步骤到了哪个 DramaStep。
 * 用于"独立能力"：用户直接导入一份完整剧本，就能跳到 storyboard / export。
 */
const ARTIFACT_STEP_MAP: Array<{ match: (name: string) => boolean; step: DramaStep }> = [
  { match: (n) => n === "start-card", step: "creative" },
  { match: (n) => n === "creative", step: "plan" },
  { match: (n) => n === "plan", step: "characters" },
  { match: (n) => n === "characters", step: "outline" },
  { match: (n) => n === "outline", step: "episode" },
  { match: (n) => /^episode-\d+$/.test(n), step: "review" },
  { match: (n) => /^review-\d+$/.test(n), step: "storyboard" },
  { match: (n) => /^storyboard-\d+$/.test(n), step: "export" },
];

function stepFor(name: string): DramaStep | null {
  for (const entry of ARTIFACT_STEP_MAP) {
    if (entry.match(name)) return entry.step;
  }
  return null;
}

const ImportSchema = z.object({
  name: z
    .string()
    .min(1, "name 不能为空")
    .regex(
      /^(start-card|creative|plan|characters|outline|overseas-brief|compliance-report|(episode|review|storyboard)-\d+)$/,
      "name 不在允许列表"
    ),
  content: z.string().min(1, "content 不能为空"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);

    const body = await readJsonBody(request);
    const parsed = ImportSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const { name, content: rawContent } = parsed.data;

    const content = normalizeArtifactContent(name, rawContent);
    validateArtifactContent(name, content);

    const artifact = saveArtifact({
      projectId: id,
      name,
      content,
      meta: buildArtifactMeta(name, content),
      source: "manual-edit",
    });

    const targetStep = stepFor(name);
    let nextState = project.state;
    if (targetStep) {
      nextState = promoteStep(project.state, targetStep);
      if (nextState !== project.state) {
        const updated = updateProject(id, { state: nextState });
        if (updated) nextState = updated.state;
      }
    }

    logEvent(id, name, "import", {
      version: artifact.version,
      step: nextState.currentStep,
      cmdTarget: COMMAND_TO_STEP[name] ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        item: artifact,
        state: nextState,
      },
    });
  } catch (err) {
    return toJsonError(err);
  }
}
