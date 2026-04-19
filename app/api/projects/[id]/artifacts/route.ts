import { NextRequest, NextResponse } from "next/server";
import { toJsonError, AppError } from "@/lib/api/errors";
import { getProject } from "@/lib/drama/store";
import { listArtifacts } from "@/lib/drama/artifacts";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);
    const items = listArtifacts(id).map((a) => ({
      id: a.id,
      name: a.name,
      version: a.version,
      meta: a.meta,
      createdAt: a.createdAt,
      length: a.content.length,
    }));
    return NextResponse.json({ success: true, data: { items } });
  } catch (err) {
    return toJsonError(err);
  }
}
