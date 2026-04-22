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

  it("accepts the new optional `rule` field on issues", () => {
    const withRules = {
      ...valid,
      issues: [
        { level: "danger", scene: 1, rule: "R1 局势变化", desc: "场尾未发生变化", fix: "把第 1 场结尾改为决策形成" },
        { level: "warn", scene: 2, rule: "R11 台词长度", desc: "陆辰台词 38 字", fix: "拆成两句并加一个动作打断" },
      ],
    };
    const result = extractReviewJson(JSON.stringify(withRules));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.issues[0].rule).toBe("R1 局势变化");
      expect(result.data.issues[1].rule).toMatch(/R11/);
    }
  });

  it("still parses legacy issues without the rule field", () => {
    const legacy = {
      ...valid,
      issues: [{ level: "warn", scene: 2, desc: "节奏偏平", fix: "加一个爽点" }],
    };
    const result = extractReviewJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.issues[0].rule).toBeUndefined();
  });
});
