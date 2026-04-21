import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { getProject } from "@/lib/drama/store";
import { listArtifactHistory } from "@/lib/drama/artifacts";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    const items = listArtifactHistory(id, name).map((item) => ({
      id: item.id,
      name: item.name,
      version: item.version,
      source: item.source,
      parentVersion: item.parentVersion,
      createdAt: item.createdAt,
      preview: item.content.replace(/\s+/g, " ").trim().slice(0, 160),
      length: item.content.length,
    }));
    return ok({ items });
  } catch (err) {
    return toJsonError(err);
  }
}
