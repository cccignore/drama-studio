import { describe, expect, it } from "vitest";
import { parseStoryboard, summarizeStoryboard } from "../lib/drama/parsers/storyboard";

const SAMPLE = `# 第 3 集 · 合同之战 分镜脚本

## 场 1 · 办公室（白天）

| 镜号 | 场 | 景别 | 机位/运动 | 画面描述 | 台词/SFX | 时长(s) | 备注 |
|------|----|------|-----------|----------|----------|---------|------|
| 001 | 1 | 特写(ECU) | 推 | 她的指尖握紧钢笔，抵在合同签名栏。 | — | 1.5 | 建立道具 |
| 002 | 1 | 中景(MS) | 固定 | 男主倚在落地窗前，逆光不可见表情。 | SFX：钢笔划纸 | 2.0 | 身份立牌 |
| 003 | 1 | 近景(CU) | 甩 | 女主抬眼，与他对视。 | **林夏**（冷）："你输了。" | 2.2 | 情绪切点 |

## 场 2 · 天台（夜）

| 镜号 | 场 | 景别 | 机位/运动 | 画面描述 | 台词/SFX | 时长(s) | 备注 |
|------|----|------|-----------|----------|----------|---------|------|
| 004 | 2 | 远景(WS) | 升降 | 俯瞰两人在天台对峙。 | — | 2.5 | 建置 |
| 005 | 2 | 过肩(OTS) | 固定 | 从陆辰肩后看林夏。 | **陆辰**：我不会再放手。 | 2.0 | |
`;

describe("parseStoryboard", () => {
  it("extracts episode index and title", () => {
    const doc = parseStoryboard(SAMPLE);
    expect(doc.episodeIndex).toBe(3);
    expect(doc.title).toBe("合同之战");
  });

  it("parses shots across multiple scenes with correct scene numbers", () => {
    const doc = parseStoryboard(SAMPLE);
    expect(doc.shots).toHaveLength(5);
    expect(doc.shots[0].scene).toBe(1);
    expect(doc.shots[3].scene).toBe(2);
    expect(doc.shots[0].shotId).toBe("001");
    expect(doc.shots[0].shotType).toContain("特写");
    expect(doc.shots[2].dialogueOrSfx).toMatch(/林夏/);
  });

  it("parses numeric durations", () => {
    const doc = parseStoryboard(SAMPLE);
    expect(doc.shots[0].durationSec).toBe(1.5);
    expect(doc.shots[3].durationSec).toBe(2.5);
  });

  it("summary counts shots, scenes, duration, dialogue vs silent", () => {
    const doc = parseStoryboard(SAMPLE);
    const stats = summarizeStoryboard(doc);
    expect(stats.shotCount).toBe(5);
    expect(stats.sceneCount).toBe(2);
    expect(stats.totalDurationSec).toBeCloseTo(10.2, 1);
    expect(stats.avgDurationSec).toBeGreaterThan(1);
    expect(stats.dialogueShots).toBe(2);
    expect(stats.silentShots).toBe(3);
  });

  it("tolerates missing optional columns via header alias lookup", () => {
    const md = `# 第 1 集 · X

## 场 1 · A

| 镜号 | 景别 | 机位 | 画面描述 | 台词/SFX | 时长 |
|------|------|------|----------|----------|------|
| 01 | 近景 | 固定 | 主角入镜 | — | 1.2 |
| 02 | 特写 | 推 | 她的眼神 | SFX：心跳 | 1.0 |
`;
    const doc = parseStoryboard(md);
    expect(doc.shots).toHaveLength(2);
    expect(doc.shots[0].scene).toBe(1); // 从 H2 推断
    expect(doc.shots[1].dialogueOrSfx).toContain("心跳");
  });

  it("skips non-shot rows inside tables (non-numeric shot id)", () => {
    const md = `## 场 1 · A

| 镜号 | 景别 | 机位 | 画面 | 台词 | 时长 |
|------|------|------|------|------|------|
| -    | 近景 | 固定 | 占位 | — | 1.0 |
| 001  | 近景 | 固定 | 正片 | — | 1.0 |
`;
    const doc = parseStoryboard(md);
    expect(doc.shots).toHaveLength(1);
    expect(doc.shots[0].shotId).toBe("001");
  });

  it("handles bilingual dialogue cells", () => {
    const md = `## 场 1 · Café

| 镜号 | 景别 | 机位 | 画面 | 台词/SFX | 时长 |
|------|------|------|------|----------|------|
| 001 | MS | 固定 | Lin Xia 进门 | **Lin Xia**: "Chen? What are you doing here?" | 2.0 |
`;
    const doc = parseStoryboard(md);
    expect(doc.shots[0].dialogueOrSfx).toContain("Chen?");
  });
});
