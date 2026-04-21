import { describe, expect, it } from "vitest";
import { applyPatches, parseRevisePatch } from "../lib/drama/revise/patch";

describe("revise patch", () => {
  it("applies a uniquely anchored patch", () => {
    const original = "## 场 2 · 办公室\n**陈辰**（冷静）：我不会放手。";
    const result = applyPatches(original, [
      {
        anchor_before: "## 场 2 · 办公室\n",
        old: "**陈辰**（冷静）：我不会放手。",
        new: "△ 陈辰猛地摔下咖啡杯\n**陈辰**（怒）：我不会放手！",
      },
    ]);
    expect(result.applied).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.content).toContain("摔下咖啡杯");
  });

  it("reports missing and non-unique anchors", () => {
    const missing = applyPatches("abc", [{ anchor_before: "x", old: "y", new: "z" }]);
    expect(missing.applied).toBe(0);
    expect(missing.failures[0]).toContain("未找到锚点");

    const duplicate = applyPatches("A old A old", [{ anchor_before: "A ", old: "old", new: "new" }]);
    expect(duplicate.applied).toBe(0);
    expect(duplicate.failures[0]).toContain("锚点不唯一");
  });

  it("parses fenced JSON patch payload", () => {
    const parsed = parseRevisePatch(`
\`\`\`json
{"summary":"x","patches":[{"anchor_before":"A","old":"B","new":"C"}],"fallback":null}
\`\`\`
`);
    expect(parsed.summary).toBe("x");
    expect(parsed.patches).toHaveLength(1);
  });
});
