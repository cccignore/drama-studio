import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getProject } from "@/lib/drama/store";
import {
  deleteProjectLLMBinding,
  getLLMConfig,
  isProjectLLMCommand,
  upsertProjectLLMBinding,
} from "@/lib/llm/store";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  configId: z.string().min(1, "configId 必填"),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; command: string }> }
) {
  try {
    const { id, command } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    if (!isProjectLLMCommand(command)) throw new AppError("invalid_input", "非法命令", 400);
    const body = await readJsonBody(request);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    if (!getLLMConfig(parsed.data.configId)) {
      throw new AppError("not_found", "模型配置不存在", 404);
    }
    return ok({ item: upsertProjectLLMBinding(id, command, parsed.data.configId) });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; command: string }> }
) {
  try {
    const { id, command } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    if (!isProjectLLMCommand(command)) throw new AppError("invalid_input", "非法命令", 400);
    deleteProjectLLMBinding(id, command);
    return ok({ deleted: true });
  } catch (err) {
    return toJsonError(err);
  }
}
