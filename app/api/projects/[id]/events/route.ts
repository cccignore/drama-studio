import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { getProject, listEvents } from "@/lib/drama/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    const url = new URL(request.url);
    const command = url.searchParams.get("command") ?? undefined;
    const sinceRaw = url.searchParams.get("since");
    const limitRaw = url.searchParams.get("limit");
    const sinceTs = sinceRaw ? Number(sinceRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const events = listEvents(id, {
      command,
      sinceTs: Number.isFinite(sinceTs as number) ? (sinceTs as number) : undefined,
      limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
    });
    return ok({ items: events });
  } catch (err) {
    return toJsonError(err);
  }
}
