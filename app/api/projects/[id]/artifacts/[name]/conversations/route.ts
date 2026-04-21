import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { getProject } from "@/lib/drama/store";
import { listStepConversations } from "@/lib/drama/conversations";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    return ok({ items: listStepConversations(id, name, { limit: 80 }) });
  } catch (err) {
    return toJsonError(err);
  }
}
