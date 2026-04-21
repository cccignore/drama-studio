import { z } from "zod";

export const RevisePatchSchema = z.object({
  summary: z.string().default("已根据指令修改"),
  patches: z
    .array(
      z.object({
        anchor_before: z.string(),
        old: z.string().min(1),
        new: z.string(),
      })
    )
    .default([]),
  fallback: z.union([z.literal("REWRITE"), z.null()]).default(null),
});

export type RevisePatch = z.infer<typeof RevisePatchSchema>;

export function parseRevisePatch(raw: string): RevisePatch {
  const candidate = extractJsonObject(raw);
  const json = JSON.parse(candidate);
  return RevisePatchSchema.parse(json);
}

export function applyPatches(
  original: string,
  patches: RevisePatch["patches"]
): { content: string; applied: number; failures: string[] } {
  let text = original;
  let applied = 0;
  const failures: string[] = [];
  for (const p of patches) {
    const needle = p.anchor_before + p.old;
    const firstIdx = text.indexOf(needle);
    const lastIdx = text.lastIndexOf(needle);
    if (firstIdx === -1) {
      failures.push(`未找到锚点：${preview(p.anchor_before)}…`);
      continue;
    }
    if (firstIdx !== lastIdx) {
      failures.push(`锚点不唯一：${preview(p.anchor_before)}…`);
      continue;
    }
    text = text.slice(0, firstIdx) + p.anchor_before + p.new + text.slice(firstIdx + needle.length);
    applied++;
  }
  return { content: text, applied, failures };
}

export function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  if (start < 0) throw new Error("未找到 JSON 对象");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("JSON 对象不完整");
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 24);
}
