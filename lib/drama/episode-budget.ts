import type { DramaState } from "./types";

export interface EpisodeBudget {
  /** 单集目标时长（秒） */
  secMin: number;
  secMax: number;
  /** 中文字数区间（国内） */
  cnMin: number;
  cnMax: number;
  /** 英文词数区间（出海） */
  enMin: number;
  enMax: number;
  /** 单句台词上限：中文字 / 英文词 */
  lineMaxCn: number;
  lineMaxEn: number;
}

/**
 * 按市场返回单集体量预算。
 *
 * - 国内短剧：每集 120–180s，中文约 1800–2700 字（按 15 字/秒估算）
 * - 海外短剧：每集 50–90s，英文约 130–240 词（按 2.4 词/秒估算）；
 *   出海模式为中文场记 + 英文对白，所以我们只约束英文台词的词数，
 *   中文旁白字数由 cnMin/cnMax 给一个松的地板值。
 */
export function getEpisodeBudget(mode: DramaState["mode"]): EpisodeBudget {
  if (mode === "overseas") {
    return {
      secMin: 50,
      secMax: 90,
      cnMin: 400,
      cnMax: 900,
      enMin: 130,
      enMax: 240,
      lineMaxCn: 20,
      lineMaxEn: 14,
    };
  }
  return {
    secMin: 120,
    secMax: 180,
    cnMin: 1800,
    cnMax: 2700,
    enMin: 0,
    enMax: 0,
    lineMaxCn: 25,
    lineMaxEn: 14,
  };
}

export function describeBudget(mode: DramaState["mode"]): string {
  const b = getEpisodeBudget(mode);
  if (mode === "overseas") {
    return `出海短剧：每集 ${b.secMin}-${b.secMax}s，英文台词约 ${b.enMin}-${b.enMax} 词，中文场记 ≈ ${b.cnMin}-${b.cnMax} 字`;
  }
  return `国内短剧：每集 ${b.secMin}-${b.secMax}s，约 ${b.cnMin}-${b.cnMax} 字`;
}
