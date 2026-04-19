import { z } from "zod";

export const ComplianceItemSchema = z.object({
  episode: z.number().int().min(1),
  level: z.enum(["blocker", "risk", "pass"]),
  category: z.string().min(1),
  rule: z.string().min(1),
  finding: z.string().min(1),
  suggestion: z.string().min(1),
});

export const ComplianceReportSchema = z.object({
  summary: z.string().min(1),
  totals: z.object({
    blocker: z.number().int().min(0),
    risk: z.number().int().min(0),
    pass: z.number().int().min(0),
  }),
  items: z.array(ComplianceItemSchema),
  globalAdvice: z.array(z.string().min(1)).min(1),
});

export type ComplianceItem = z.infer<typeof ComplianceItemSchema>;
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

export type ExtractComplianceResult =
  | { ok: true; data: ComplianceReport; raw: string }
  | { ok: false; error: string; raw: string };

function stripFences(input: string): string {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/i;
  const match = input.match(fenceRe);
  return match ? match[1].trim() : input.trim();
}

function firstJsonObject(input: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

export function extractComplianceJson(raw: string): ExtractComplianceResult {
  const stripped = stripFences(raw);
  const candidate = firstJsonObject(stripped) ?? firstJsonObject(raw);
  if (!candidate) {
    return { ok: false, error: "未找到 JSON 对象（请只输出一个 JSON 对象）", raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `JSON 语法错误：${message}`, raw };
  }

  const check = ComplianceReportSchema.safeParse(parsed);
  if (!check.success) {
    const issues = check.error.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("；");
    return { ok: false, error: `结构不符合要求：${issues}`, raw };
  }

  return { ok: true, data: check.data, raw };
}
