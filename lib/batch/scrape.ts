import type { ParsedSourceDrama } from "./types";

export interface ScrapedDrama extends ParsedSourceDrama {
  sourceUrl: string;
  episodes: string;
}

const PAYAMI_BASE = "https://www.payami.cn";
const PAYAMI_SOURCES = {
  rank: `${PAYAMI_BASE}/yf/3.html`,
  latest: `${PAYAMI_BASE}/yf/4.html`,
} as const;

export type HongguoScrapeSource = keyof typeof PAYAMI_SOURCES;

export async function scrapeHongguoSources(input: { limit?: number; source?: HongguoScrapeSource } = {}): Promise<ScrapedDrama[]> {
  const limit = Math.max(1, Math.min(30, Math.floor(input.limit ?? 12)));
  const html = await fetchText(PAYAMI_SOURCES[input.source ?? "latest"]);
  const urls = extractDetailUrls(html).slice(0, limit);
  const items = await mapWithConcurrency(urls, 4, scrapePayamiDetail);
  return items.filter((item): item is ScrapedDrama => Boolean(item));
}

export function hongguoScrapeSourceUrl(source: HongguoScrapeSource): string {
  return PAYAMI_SOURCES[source];
}

export function scrapedSourcesToText(items: ScrapedDrama[]): string {
  return items
    .map((item) => `${item.sourceTitle} | ${item.sourceKeywords || "红果榜单"} | ${item.sourceSummary}`)
    .join("\n");
}

export function extractDetailUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /href=["'](\/vq\/\d+\.html)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    urls.add(new URL(match[1], PAYAMI_BASE).toString());
  }
  return [...urls];
}

export function parsePayamiDetail(html: string, sourceUrl: string): ScrapedDrama | null {
  const title = htmlDecode(
    attr(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ??
      text(html, /<h1[^>]*class=["']page-title["'][^>]*>([\s\S]*?)<\/h1>/i)
  );
  if (!title) return null;

  const summary = htmlDecode(
    attr(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i) ??
      text(html, /<span\s+class=["']video-info-itemtitle["']>剧情：<\/span>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i)
  );
  const tags = extractTags(html);
  const episodes = htmlDecode(
    text(html, /<span\s+class=["']video-info-itemtitle["']>连载：<\/span>\s*<div[^>]*>([\s\S]*?)<\/div>/i) ??
      text(html, /<div\s+class=["']module-item-text["']>([\s\S]*?)<\/div>/i)
  );
  const keywords = [...tags, episodes].filter(Boolean).join(" / ");
  const sourceSummary = summary || "公开榜单未提供简介";

  return {
    sourceTitle: title,
    sourceKeywords: keywords || "红果榜单",
    sourceSummary,
    sourceText: `${title} | ${keywords || "红果榜单"} | ${sourceSummary}`,
    sourceUrl,
    episodes,
  };
}

async function scrapePayamiDetail(sourceUrl: string): Promise<ScrapedDrama | null> {
  try {
    return parsePayamiDetail(await fetchText(sourceUrl), sourceUrl);
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`抓取失败：${res.status}`);
  return res.text();
}

function extractTags(html: string): string[] {
  const block = html.match(/<span\s+class=["']video-info-itemtitle["']>TAG：<\/span>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!block) return [];
  const tags = new Set<string>();
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    const value = htmlDecode(stripTags(match[1]));
    if (value && value !== "未知") tags.add(value);
  }
  return [...tags];
}

function attr(html: string, re: RegExp): string {
  return html.match(re)?.[1] ?? "";
}

function text(html: string, re: RegExp): string {
  return stripTags(html.match(re)?.[1] ?? "");
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlDecode(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      out[index - 1] = await worker(item);
    }
  });
  await Promise.all(runners);
  return out;
}
