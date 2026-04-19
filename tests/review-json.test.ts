import { describe, expect, it } from "vitest";
import { extractReviewJson, averageScore } from "../lib/drama/parsers/extract-review-json";

const valid = {
  scores: { pace: 8, satisfy: 7, dialogue: 9, format: 9, coherence: 8 },
  issues: [
    { level: "warn", scene: 2, desc: "节奏偏平", fix: "加一个爽点" },
    { level: "info", scene: null, desc: "细节可选", fix: "按需调整" },
  ],
  summary: "整体可用",
};

describe("extractReviewJson", () => {
  it("parses bare JSON", () => {
    const result = extractReviewJson(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.scores.pace).toBe(8);
  });

  it("strips ```json fences and surrounding text", () => {
    const raw = `这是模型说明\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\n\n收工。`;
    const result = extractReviewJson(raw);
    expect(result.ok).toBe(true);
  });

  it("rejects missing required fields with actionable error", () => {
    const bad = { scores: valid.scores, issues: [] };
    const result = extractReviewJson(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/summary/);
  });

  it("rejects invalid level enum", () => {
    const bad = {
      ...valid,
      issues: [{ level: "critical", scene: 1, desc: "x", fix: "y" }],
    };
    const result = extractReviewJson(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("ignores braces inside strings when locating the JSON object", () => {
    const raw = `prefix with a "{" brace mention, then ${JSON.stringify(valid)} trailing`;
    const result = extractReviewJson(raw);
    expect(result.ok).toBe(true);
  });

  it("averageScore rounds to 1 decimal", () => {
    expect(averageScore({ pace: 8, satisfy: 7, dialogue: 9, format: 9, coherence: 8 })).toBe(8.2);
  });
});
