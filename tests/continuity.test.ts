import { describe, expect, it } from "vitest";
import {
  extractContinuity,
  extractContinuityBrief,
  formatContinuityBrief,
} from "../lib/drama/parsers/extract-continuity";

const STANDARD = `# 第 3 集 · 撕毁合同

## 场 1 · 办公室（白天）

△ （特写）林夏推门进入。

**林夏**（冷静）："你输了。"

【本集完】

## 连续性检查点
- 妆发：女主头发微乱、口红被蹭
- 服装：白衬衫右袖口沾到咖啡污渍
- 关键道具：手中仍握着那半张撕烂的合同
- 伤痕：左手虎口新擦伤，尚未包扎
- 站位：站在办公室门口，背对陆辰
`;

const OVERSEAS = `# Episode 2 · Late Showdown

## 场 1 · Café（外滩 / 夜）

**Lin Xia** (calm): "You lost."

【本集完】

## 连续性检查点
- Hair: damp, eye makeup smudged
- Costume: black trench, right cuff torn
- Key Props: holding half-torn contract
- Injuries: left hand knuckle scrape, unbandaged
- Position: standing at café doorway, back to Chen
`;

const PARTIAL = `# 第 5 集

【本集完】

## 连续性检查点
- 妆发：未变
- 服装：未变
`;

describe("extractContinuity", () => {
  it("parses the standard Chinese checkpoint block", () => {
    const cp = extractContinuity(STANDARD);
    expect(cp).not.toBeNull();
    expect(cp!.makeup).toContain("头发微乱");
    expect(cp!.costume).toContain("咖啡污渍");
    expect(cp!.props).toContain("撕烂的合同");
    expect(cp!.injury).toContain("虎口");
    expect(cp!.position).toContain("背对");
  });

  it("parses the bilingual / English-key variant", () => {
    const cp = extractContinuity(OVERSEAS);
    expect(cp).not.toBeNull();
    expect(cp!.makeup).toContain("smudged");
    expect(cp!.costume).toContain("trench");
    expect(cp!.props).toContain("contract");
    expect(cp!.injury).toContain("knuckle");
    expect(cp!.position).toContain("doorway");
  });

  it("rejects checkpoints with fewer than 2 recognized fields", () => {
    // Only spurious labels — should not falsely match
    const noisy = `## 连续性检查点\n- 备注：随便写写\n- 其他：另一段\n`;
    expect(extractContinuity(noisy)).toBeNull();
  });

  it("accepts partial checkpoints with at least 2 fields", () => {
    const cp = extractContinuity(PARTIAL);
    expect(cp).not.toBeNull();
    expect(cp!.makeup).toBe("未变");
    expect(cp!.costume).toBe("未变");
    expect(cp!.props).toBeUndefined();
  });

  it("returns null when there is no checkpoint heading", () => {
    expect(extractContinuity("# 第 1 集\n## 场 1\n△ 啥也没有\n【本集完】")).toBeNull();
  });

  it("formatContinuityBrief produces a tight bullet list", () => {
    const cp = extractContinuity(STANDARD)!;
    const brief = formatContinuityBrief(cp);
    expect(brief).toMatch(/^- 妆发：/);
    expect(brief.split("\n")).toHaveLength(5);
    expect(brief.length).toBeLessThan(400);
  });

  it("extractContinuityBrief composes both steps", () => {
    expect(extractContinuityBrief(STANDARD)).not.toBeNull();
    expect(extractContinuityBrief("nothing here")).toBeNull();
  });

  it("clips long fields so the brief never explodes context", () => {
    const long = "## 连续性检查点\n- 妆发：" + "啊".repeat(500) + "\n- 服装：短\n";
    const brief = extractContinuityBrief(long)!;
    expect(brief).toContain("妆发");
    expect(brief.length).toBeLessThan(400);
  });
});
