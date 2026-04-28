import type { BatchItem, BatchProject } from "../batch/types";
import { buildBatchArtifactDocx } from "../batch/feishu-docx";
import {
  FeishuError,
  createRecord,
  ensureFields,
  getTenantAccessToken,
  listFirstTableId,
  parseBitableUrl,
  uploadMedia,
  type SchemaSpec,
} from "./client";

const SCHEMA: SchemaSpec[] = [
  { name: "序号", kind: "text" },
  { name: "日期", kind: "datetime" },
  { name: "剧名", kind: "text" },
  { name: "三幕创意", kind: "text" },
  { name: "完整剧本", kind: "attachment" },
  { name: "分镜脚本", kind: "attachment" },
];

const PREVIEW_LIMIT = 600;

function preview(text: string): string {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= PREVIEW_LIMIT) return compact;
  return `${compact.slice(0, PREVIEW_LIMIT)}…`;
}

function safeFileSegment(input: string): string {
  return (input || "untitled").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "untitled";
}

function creativeBlock(item: BatchItem): string {
  if (item.creativeMd?.trim()) return item.creativeMd;
  const lines: string[] = [];
  if (item.audience) lines.push(`受众：${item.audience}`);
  if (item.storyType) lines.push(`故事类型：${item.storyType}`);
  if (item.setting) lines.push(`故事背景：${item.setting}`);
  if (item.act1) lines.push(`Act 1：${item.act1}`);
  if (item.act2) lines.push(`Act 2：${item.act2}`);
  if (item.act3) lines.push(`Act 3：${item.act3}`);
  return lines.join("\n");
}

export interface FeishuExportOptions {
  appId: string;
  appSecret: string;
  bitableUrl: string;
}

export interface FeishuExportResult {
  bitableUrl: string;
  exported: number;
  skipped: Array<{ title: string; reason: string }>;
}

export async function exportBatchToFeishu(
  project: BatchProject,
  items: BatchItem[],
  opts: FeishuExportOptions
): Promise<FeishuExportResult> {
  const ref = parseBitableUrl(opts.bitableUrl);
  const token = await getTenantAccessToken(opts.appId, opts.appSecret);
  const tableId = ref.tableId ?? (await listFirstTableId(token, ref.appToken));
  await ensureFields(token, ref.appToken, tableId, SCHEMA);

  const skipped: Array<{ title: string; reason: string }> = [];
  let exported = 0;
  const exportedAt = Date.now();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const title = item.title || item.sourceTitle || `第 ${i + 1} 部`;
    if (!item.screenplayMd?.trim() && !item.storyboardMd?.trim()) {
      skipped.push({ title, reason: "完整剧本和分镜都为空" });
      continue;
    }
    try {
      const fileBase = safeFileSegment(title);
      const screenplayBuf = item.screenplayMd?.trim()
        ? await buildBatchArtifactDocx({
            title: `${title} · 完整剧本`,
            subtitle: `${project.title} · ${project.totalEpisodes} 集`,
            body: item.screenplayMd,
          })
        : null;
      const storyboardBuf = item.storyboardMd?.trim()
        ? await buildBatchArtifactDocx({
            title: `${title} · 分镜脚本`,
            subtitle: `${project.title} · ${project.totalEpisodes} 集`,
            body: item.storyboardMd,
          })
        : null;

      const screenplayToken = screenplayBuf
        ? await uploadMedia(token, ref.appToken, `${fileBase}-完整剧本.docx`, screenplayBuf)
        : null;
      const storyboardToken = storyboardBuf
        ? await uploadMedia(token, ref.appToken, `${fileBase}-分镜脚本.docx`, storyboardBuf)
        : null;

      const fields: Record<string, string | number | Array<{ file_token: string }>> = {
        序号: String(i + 1),
        日期: exportedAt,
        剧名: title,
        三幕创意: preview(creativeBlock(item)),
      };
      if (screenplayToken) fields["完整剧本"] = [{ file_token: screenplayToken }];
      if (storyboardToken) fields["分镜脚本"] = [{ file_token: storyboardToken }];
      await createRecord(token, ref.appToken, tableId, fields);
      exported += 1;
    } catch (err) {
      const message = err instanceof FeishuError ? `${err.code} · ${err.message}` : err instanceof Error ? err.message : String(err);
      skipped.push({ title, reason: message });
    }
  }

  return {
    bitableUrl: ref.tableId ? opts.bitableUrl : `${opts.bitableUrl}${opts.bitableUrl.includes("?") ? "&" : "?"}table=${tableId}`,
    exported,
    skipped,
  };
}
