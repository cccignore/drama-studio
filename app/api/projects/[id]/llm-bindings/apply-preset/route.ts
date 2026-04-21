import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/read-json-body";
import { getProject } from "@/lib/drama/store";
import { ROUTING_PRESETS } from "@/lib/llm/presets";
import {
  deleteProjectLLMBinding,
  getLLMConfig,
  upsertProjectLLMBinding,
  type ProjectLLMBinding,
} from "@/lib/llm/store";
import { upsertLLMRoleBinding } from "@/lib/llm/role-store";
import type { LLMRoleSlot, ProjectLLMCommand } from "@/lib/llm/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  presetId: z.string().min(1, "presetId 必填"),
  primaryConfigId: z.string().optional(),
  secondaryConfigId: z.string().optional(),
  tertiaryConfigId: z.string().optional(),
  overseasConfigId: z.string().optional(),
  defaultConfigId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getProject(id)) throw new AppError("not_found", "项目不存在", 404);
    const body = await readJsonBody(request);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const preset = ROUTING_PRESETS.find((p) => p.id === parsed.data.presetId);
    if (!preset) throw new AppError("not_found", "预设不存在", 404);

    const buckets = {
      default: parsed.data.defaultConfigId,
      primary: parsed.data.primaryConfigId ?? parsed.data.defaultConfigId,
      secondary: parsed.data.secondaryConfigId ?? parsed.data.primaryConfigId ?? parsed.data.defaultConfigId,
      tertiary:
        parsed.data.tertiaryConfigId ??
        parsed.data.secondaryConfigId ??
        parsed.data.primaryConfigId ??
        parsed.data.defaultConfigId,
      overseas: parsed.data.overseasConfigId ?? parsed.data.primaryConfigId ?? parsed.data.defaultConfigId,
    };

    const slotInputs: Partial<Record<LLMRoleSlot, string | undefined>> = {
      primary: buckets.primary,
      secondary: buckets.secondary,
      tertiary: buckets.tertiary,
      overseas: buckets.overseas,
    };
    for (const [slot, configId] of Object.entries(slotInputs) as Array<[LLMRoleSlot, string | undefined]>) {
      if (configId) upsertLLMRoleBinding(slot, configId);
    }

    const items: ProjectLLMBinding[] = [];
    for (const [command, bucket] of Object.entries(preset.commands)) {
      if (!bucket) continue;
      const configId = bucket === "default" ? buckets.default : `slot:${bucket}`;
      if (!configId) {
        deleteProjectLLMBinding(id, command as ProjectLLMCommand);
        continue;
      }
      if (!configId.startsWith("slot:") && !getLLMConfig(configId)) {
        throw new AppError("not_found", `模型配置 ${configId} 不存在`, 404);
      }
      items.push(upsertProjectLLMBinding(id, command as ProjectLLMCommand, configId));
    }

    return ok({ items, preset });
  } catch (err) {
    return toJsonError(err);
  }
}
