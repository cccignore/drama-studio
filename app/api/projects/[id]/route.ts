import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { deleteProject, getProject, updateProject } from "@/lib/drama/store";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  title: z.string().optional(),
  state: z.record(z.any()).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw new AppError("not_found", "项目不存在", 404);
    return ok({ item: project });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const updated = updateProject(id, parsed.data as any);
    if (!updated) throw new AppError("not_found", "项目不存在", 404);
    return ok({ item: updated });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    deleteProject(id);
    return ok({ deleted: true });
  } catch (err) {
    return toJsonError(err);
  }
}
