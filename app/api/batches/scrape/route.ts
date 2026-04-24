import { NextRequest } from "next/server";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { hongguoScrapeSourceUrl, scrapeHongguoSources, scrapedSourcesToText } from "@/lib/batch/scrape";
import type { HongguoScrapeSource } from "@/lib/batch/scrape";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 12);
    if (!Number.isFinite(limit) || limit < 1 || limit > 30) {
      throw new AppError("invalid_input", "limit 必须在 1-30 之间", 400);
    }
    const source = (searchParams.get("source") || "latest") as HongguoScrapeSource;
    if (source !== "latest" && source !== "rank") {
      throw new AppError("invalid_input", "source 必须是 latest 或 rank", 400);
    }
    const items = await scrapeHongguoSources({ limit, source });
    return ok({
      source: hongguoScrapeSourceUrl(source),
      fetchedAt: Date.now(),
      items,
      text: scrapedSourcesToText(items),
    });
  } catch (err) {
    return toJsonError(err);
  }
}
