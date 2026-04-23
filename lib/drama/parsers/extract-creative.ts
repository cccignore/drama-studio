/**
 * 三幕创意方案解析器。
 *
 * 产物是一份 Markdown 文档（由 prompts/creative.ts 指导 LLM 生成），这里
 * 做容错切片：取出 Act1/Act2/Act3 三段、标题、受众、核心主题等关键字段，
 * 用于前端展示和后续阶段注入。
 *
 * 解析目标："信息抽得出来"优先于"结构必须严格"——字段缺失时返回 undefined，
 * 不抛异常。
 */

export interface CreativeArtifact {
  /** 剧名（从 "剧名：XXX" 抽取） */
  title?: string;
  /** 受众定位：女频 / 男频 / 全年龄 */
  audience?: string;
  /** 故事类型（题材组合） */
  genre?: string;
  /** 故事背景（市场+时代空间） */
  setting?: string;
  act1?: string;
  act2?: string;
  act3?: string;
  /** 一句话主题 */
  coreTheme?: string;
  /** Optional Upgrade 要点（每条独立一条） */
  upgrades?: string[];
}

export interface CreativeSummary {
  actCount: number;
  hasUpgrade: boolean;
  titleFound: boolean;
}

export function extractCreative(markdown: string): CreativeArtifact {
  const out: CreativeArtifact = {};
  if (!markdown.trim()) return out;

  out.title = matchField(markdown, /^\s*剧名[：:]\s*(.+)$/m);
  out.audience = matchField(markdown, /^\s*受众[：:]\s*(.+)$/m);
  out.genre = matchField(markdown, /^\s*故事类型[：:]\s*(.+)$/m);
  out.setting = matchField(markdown, /^\s*故事背景[：:]\s*(.+)$/m);

  out.act1 = extractAct(markdown, 1);
  out.act2 = extractAct(markdown, 2);
  out.act3 = extractAct(markdown, 3);

  const coreThemeLine = matchField(markdown, /^\s*[-*·]\s*一句话主题[：:]\s*(.+)$/m);
  if (coreThemeLine) out.coreTheme = coreThemeLine;

  const upgradeSection = sliceAfterHeading(markdown, /^#{2,3}\s*[一二三四五]?[、\.]*\s*Optional\s*Upgrade/im);
  if (upgradeSection) {
    const items = upgradeSection
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*·]\s+/.test(l) || /^\d+[\.)、]\s+/.test(l))
      .map((l) => l.replace(/^[-*·]\s+/, "").replace(/^\d+[\.)、]\s+/, "").trim())
      .filter(Boolean);
    if (items.length) out.upgrades = items;
  }

  return out;
}

export function summarizeCreative(art: CreativeArtifact): CreativeSummary {
  let actCount = 0;
  if (art.act1) actCount++;
  if (art.act2) actCount++;
  if (art.act3) actCount++;
  return {
    actCount,
    hasUpgrade: Boolean(art.upgrades?.length),
    titleFound: Boolean(art.title),
  };
}

/**
 * 把三幕创意方案压缩成给下一步（plan / outline）注入的短摘要，
 * 控制在 ~800 字内以免炸上下文。
 */
export function formatCreativeBrief(art: CreativeArtifact, maxChars = 1400): string {
  const parts: string[] = [];
  if (art.title) parts.push(`剧名：${art.title}`);
  if (art.audience) parts.push(`受众：${art.audience}`);
  if (art.genre) parts.push(`题材：${art.genre}`);
  if (art.setting) parts.push(`背景：${art.setting}`);
  if (art.coreTheme) parts.push(`一句话主题：${art.coreTheme}`);
  if (art.act1) parts.push(`Act1：${clip(art.act1, 260)}`);
  if (art.act2) parts.push(`Act2：${clip(art.act2, 260)}`);
  if (art.act3) parts.push(`Act3：${clip(art.act3, 260)}`);
  if (art.upgrades?.length) {
    parts.push(`Upgrade：${art.upgrades.slice(0, 3).map((u) => clip(u, 80)).join("；")}`);
  }
  const brief = parts.join("\n");
  return brief.length > maxChars ? brief.slice(0, maxChars - 1) + "…" : brief;
}

// ---------- helpers ----------

function matchField(md: string, re: RegExp): string | undefined {
  const m = md.match(re);
  if (!m) return undefined;
  const value = m[1].trim();
  // 剥掉占位符（模板里 {{...}} 的痕迹）
  if (/^\{\{.*\}\}$/.test(value)) return undefined;
  return value;
}

/**
 * 抽 Act N 那段文字。模板里写的是 `**Act 1：**\n内容…`，但 LLM 有时写 `### Act 1`、
 * `**Act 1**：内容`、甚至 `Act 1：` 直接跟正文。这里都兼容。
 */
function extractAct(md: string, n: 1 | 2 | 3): string | undefined {
  const label = `Act\\s*${n}`;
  // 形式 A: **Act 1：**...下一段直到 Act2 / 下一个粗体锚
  const reBold = new RegExp(
    `\\*\\*${label}[：:]?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*Act\\s*\\d|\\n#{1,3}\\s+|\\n\\*\\*[一二三四五]、|$)`,
    "i"
  );
  const m1 = md.match(reBold);
  if (m1) return m1[1].trim() || undefined;

  // 形式 B: ### Act 1 / ## Act 1 ...下一段直到下一 heading
  const reHead = new RegExp(
    `^#{2,4}\\s*${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,4}\\s+|\\n\\*\\*Act\\s*\\d|$)`,
    "im"
  );
  const m2 = md.match(reHead);
  if (m2) return m2[1].trim() || undefined;

  // 形式 C: Act 1：content...（行首）
  const rePlain = new RegExp(
    `^${label}[：:]\\s*([\\s\\S]*?)(?=\\n\\s*Act\\s*\\d[：:]|\\n#{1,4}\\s+|$)`,
    "im"
  );
  const m3 = md.match(rePlain);
  if (m3) return m3[1].trim() || undefined;

  return undefined;
}

function sliceAfterHeading(md: string, headingRe: RegExp): string | undefined {
  const m = md.match(headingRe);
  if (!m || m.index == null) return undefined;
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = rest.match(/\n#{1,3}\s+/);
  return next ? rest.slice(0, next.index) : rest;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
