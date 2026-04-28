import type { BatchItem, BatchProject } from "../batch/types";
import { buildBatchArtifactDocx, buildStoryboardDocx } from "../batch/feishu-docx";
import {
  FeishuError,
  createBitable,
  createRecord,
  deleteAllRecords,
  ensureFields,
  getTenantAccessToken,
  uploadMedia,
  type SchemaSpec,
} from "./client";

const SCHEMA: SchemaSpec[] = [
  // 飞书表格自带行号列，所以不再单独加「序号」字段。
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
  // Optional folder where the new bitable should be created. If omitted the
  // bitable lives in the app's default workspace and is reachable via the
  // returned URL only.
  folderToken?: string;
}

export interface FeishuExportResult {
  bitableUrl: string;
  bitableName: string;
  exported: number;
  skipped: Array<{ title: string; reason: string }>;
}

function bitableNameFor(project: BatchProject): string {
  // YYYY-MM-DD HH:mm in Asia/Shanghai. Avoid Intl quirks across server
  // timezones by formatting manually from a UTC+8 offset.
  const now = new Date(Date.now() + 8 * 60 * 60_000);
  const y = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const stamp = `${y}-${mm}-${dd} ${hh}:${mi}`;
  const title = (project.title || "未命名批次").trim().slice(0, 40);
  return `drama-studio · ${title} · ${stamp}`;
}

export async function exportBatchToFeishu(
  project: BatchProject,
  items: BatchItem[],
  opts: FeishuExportOptions
): Promise<FeishuExportResult> {
  const token = await getTenantAccessToken(opts.appId, opts.appSecret);
  const bitableName = bitableNameFor(project);
  const { appToken, tableId, url: createdUrl } = await createBitable(token, bitableName, opts.folderToken);
  await ensureFields(token, appToken, tableId, SCHEMA);
  // Fresh bitables ship with 10 blank records in their default table; remove
  // them so our exported rows actually start at row 1.
  await deleteAllRecords(token, appToken, tableId);

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
        ? await buildStoryboardDocx({
            title: `${title} · 分镜脚本`,
            subtitle: `${project.title} · ${project.totalEpisodes} 集`,
            body: item.storyboardMd,
          })
        : null;

      const screenplayToken = screenplayBuf
        ? await uploadMedia(token, appToken, `${fileBase}-完整剧本.docx`, screenplayBuf)
        : null;
      const storyboardToken = storyboardBuf
        ? await uploadMedia(token, appToken, `${fileBase}-分镜脚本.docx`, storyboardBuf)
        : null;

      const fields: Record<string, string | number | Array<{ file_token: string }>> = {
        日期: exportedAt,
        剧名: title,
        三幕创意: preview(creativeBlock(item)),
      };
      if (screenplayToken) fields["完整剧本"] = [{ file_token: screenplayToken }];
      if (storyboardToken) fields["分镜脚本"] = [{ file_token: storyboardToken }];
      await createRecord(token, appToken, tableId, fields);
      exported += 1;
    } catch (err) {
      const message = err instanceof FeishuError ? `${err.code} · ${err.message}` : err instanceof Error ? err.message : String(err);
      skipped.push({ title, reason: message });
    }
  }

  return {
    bitableUrl: `${createdUrl}?table=${tableId}`,
    bitableName,
    exported,
    skipped,
  };
}
