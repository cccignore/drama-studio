import { z } from "zod";

export const ReviewIssueSchema = z.object({
  level: z.enum(["danger", "warn", "info"]),
  scene: z.number().int().nullable().optional(),
  desc: z.string().min(1),
  fix: z.string().min(1),
  rule: z.string().min(1).optional(),
});

export const ReviewScoresSchema = z.object({
  pace: z.number().min(0).max(10),
  satisfy: z.number().min(0).max(10),
  dialogue: z.number().min(0).max(10),
  format: z.number().min(0).max(10),
  coherence: z.number().min(0).max(10),
});

export const ReviewSchema = z.object({
  scores: ReviewScoresSchema,
  issues: z.array(ReviewIssueSchema),
  summary: z.string().min(1),
});

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewScores = z.infer<typeof ReviewScoresSchema>;
export type ReviewResult = z.infer<typeof ReviewSchema>;

export type ExtractResult =
  | { ok: true; data: ReviewResult; raw: string }
  | { ok: false; error: string; raw: string };

function stripFences(input: string): string {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = input.match(fenceRe);
  if (m) return m[1].trim();
  return input.trim();
}

function firstJsonObject(input: string): string | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return input.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function extractReviewJson(raw: string): ExtractResult {
  const stripped = stripFences(raw);
  const candidate = firstJsonObject(stripped) ?? firstJsonObject(raw);
  if (!candidate) {
    return { ok: false, error: "未找到 JSON 对象（请直接输出单个 JSON，不要额外说明文字）", raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `JSON 语法错误：${msg}`, raw };
  }
  const check = ReviewSchema.safeParse(parsed);
  if (!check.success) {
    const issues = check.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("；");
    return { ok: false, error: `结构不符合要求：${issues}`, raw };
  }
  return { ok: true, data: check.data, raw };
}

export function averageScore(scores: ReviewScores): number {
  const vals = [scores.pace, scores.satisfy, scores.dialogue, scores.format, scores.coherence];
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}
