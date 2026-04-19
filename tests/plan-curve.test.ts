import { describe, expect, it } from "vitest";
import { extractPlanCurve } from "../lib/drama/parsers/extract-plan-curve";

describe("extractPlanCurve", () => {
  it("parses explicit structured waveform table", () => {
    const markdown = `
# 节奏规划

## 五、节奏波形数据
| 集数 | 情绪强度(1-5) | 爽点释放(1-5) | 钩子强度(1-5) | 付费卡点 | 备注 |
|------|---------------|---------------|---------------|----------|------|
| 1 | 4 | 3 | 5 | 否 | 开场困境 |
| 2 | 5 | 4 | 4 | 是 | 身份反杀 |
`;

    expect(extractPlanCurve(markdown)).toEqual([
      { episode: 1, intensity: 4, payoff: 3, hook: 5, paywall: false, note: "开场困境" },
      { episode: 2, intensity: 5, payoff: 4, hook: 4, paywall: true, note: "身份反杀" },
    ]);
  });

  it("falls back to stage and paywall parsing for old plans", () => {
    const markdown = `
# 节奏规划

## 一、四段节奏划分
| 阶段 | 集数区间 | 情绪强度 | 本段叙事使命 |
|------|---------|---------|--------------|
| 起势段 | 1-2 | ★★☆☆☆ | 建立世界 |
| 决战段 | 3-4 | ★★★★★ | 终局爆发 |

## 二、爽点地图
- 第 3 集 · 「身份曝光」 · 类型（身份碾压） · 强度（★★★★★） · 一句话描述

## 三、付费卡点
- 🔒 第 2 集卡点 · 类型（身份即将揭露） · 一句话描述未解的悬念
`;

    const points = extractPlanCurve(markdown);
    expect(points).toHaveLength(4);
    expect(points[1].paywall).toBe(true);
    expect(points[2].payoff).toBeGreaterThanOrEqual(5);
  });
});
