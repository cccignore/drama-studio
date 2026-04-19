import { NextRequest, NextResponse } from "next/server";
import { toJsonError, AppError } from "@/lib/api/errors";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";

export const runtime = "nodejs";

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
