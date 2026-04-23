import { describe, expect, it } from "vitest";
import {
  extractCreative,
  summarizeCreative,
  formatCreativeBrief,
} from "../lib/drama/parsers/extract-creative";

const FULL = `# 三幕创意方案

## 一、题材与三幕大纲
剧名：继承战争
受众：女频
故事类型：豪门婚恋+假结婚+隐藏千金
故事背景：现代 + 都市（金融豪门）

**Act 1：**
林夏在婚礼当天被前未婚夫当众抛弃，被迫与陌生亿万继承人陆辰协议结婚。婚礼上她被整个家族羞辱，直到陆辰公开宣布她是唯一妻子。首集结尾她发现自己竟是失踪多年的林氏千金。

**Act 2：**
林夏一边学着在豪门生存，一边暗中追查当年被调包的真相。反派继妹联手前未婚夫设局陷害她。中段的大反转：她发现陆辰早就知道她的真实身份，这场婚姻是他精心设计的赌局。Act 2 结尾钩子：林夏被推下楼梯，滑落前看见监控里冷笑的陆辰。

**Act 3：**
真相在林氏股东大会上揭开。陆辰其实是卧底，他帮助林夏反手拿回 51% 股权。反派当众被送进监狱，林氏家族偏心长辈被踢出董事会。林夏与陆辰在她父亲的旧办公室完成情感回收。

## 二、世界观设定
- 空间与时代：当代上海金融圈
- 底层规则：豪门继承权按股权结构决定，而非血缘
- 主要阵营：林氏本家 / 陆氏财阀 / 反派联盟

## 三、视觉基调
- 色彩：冷调蓝黑 + 红金高光
- 光影：大光比，高反差

## 四、核心主题
- 一句话主题：被制度当作祭品的女孩，用同一套制度反噬家族。
- 情绪母题：羞辱、反噬、护短

## 五、Optional Upgrade
- 第 1 集开场改为新娘淋雨奔跑 30 秒，强化狗血度。
- 加一个"孩子是谁的"悬念用于 Act 2 中段爆点。
- 在 Act 3 终局加一个女二的悲剧弧光，提升情绪浓度。
`;

describe("extractCreative", () => {
  it("parses title / audience / genre / setting fields", () => {
    const art = extractCreative(FULL);
    expect(art.title).toBe("继承战争");
    expect(art.audience).toBe("女频");
    expect(art.genre).toContain("豪门婚恋");
    expect(art.setting).toContain("现代");
  });

  it("extracts all three acts as non-empty paragraphs", () => {
    const art = extractCreative(FULL);
    expect(art.act1).toMatch(/婚礼/);
    expect(art.act2).toMatch(/反转/);
    expect(art.act3).toMatch(/股东大会/);
  });

  it("extracts core theme and upgrade bullets", () => {
    const art = extractCreative(FULL);
    expect(art.coreTheme).toContain("制度");
    expect(art.upgrades?.length).toBeGreaterThanOrEqual(2);
    expect(art.upgrades?.[0]).toContain("淋雨");
  });

  it("summary reports actCount=3 and titleFound", () => {
    const s = summarizeCreative(extractCreative(FULL));
    expect(s.actCount).toBe(3);
    expect(s.titleFound).toBe(true);
    expect(s.hasUpgrade).toBe(true);
  });

  it("formatCreativeBrief clips to maxChars", () => {
    const art = extractCreative(FULL);
    const brief = formatCreativeBrief(art, 400);
    expect(brief.length).toBeLessThanOrEqual(400);
    expect(brief).toMatch(/剧名：/);
  });

  it("tolerates partial documents (only Act 1 present)", () => {
    const partial = `剧名：半成品\n\n**Act 1：**\n开场爆点...\n`;
    const art = extractCreative(partial);
    expect(art.title).toBe("半成品");
    expect(art.act1).toContain("开场爆点");
    expect(art.act2).toBeUndefined();
    expect(summarizeCreative(art).actCount).toBe(1);
  });

  it("accepts heading-style acts (### Act 2)", () => {
    const md = `### Act 2\n中段逆转与付费爆点。\n\n### Act 3\n终局打脸。`;
    const art = extractCreative(md);
    expect(art.act2).toContain("中段");
    expect(art.act3).toContain("终局");
  });

  it("rejects placeholder values like {{剧名}}", () => {
    const md = `剧名：{{剧名}}\n受众：{{女频 / 男频}}\n`;
    const art = extractCreative(md);
    expect(art.title).toBeUndefined();
    expect(art.audience).toBeUndefined();
  });
});
