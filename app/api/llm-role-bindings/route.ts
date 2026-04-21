import { ok, toJsonError } from "@/lib/api/errors";
import { listLLMRoleBindings, ROLE_SLOTS } from "@/lib/llm/role-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const existing = listLLMRoleBindings();
    const items = ROLE_SLOTS.map((slot) => {
      const hit = existing.find((item) => item.slot === slot);
      return hit ?? { slot, configId: "", config: null, updatedAt: 0 };
    });
    return ok({ items });
  } catch (err) {
    return toJsonError(err);
  }
}
