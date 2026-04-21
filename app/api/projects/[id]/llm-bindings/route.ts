import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { getProject } from "@/lib/drama/store";
import { listProjectLLMBindings } from "@/lib/llm/store";
import { parseSlotConfigId, resolveConfigFromSlot } from "@/lib/llm/role-store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    const items = listProjectLLMBindings(id).map((item) => {
      const slot = parseSlotConfigId(item.configId);
      return {
        ...item,
        slot,
        resolvedConfig: slot ? resolveConfigFromSlot(slot, false) : item.config,
      };
    });
    return ok({ items });
  } catch (err) {
    return toJsonError(err);
  }
}
