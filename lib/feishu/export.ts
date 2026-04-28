import type { BatchItem, BatchProject } from "../batch/types";
import { buildBatchArtifactDocx, buildStoryboardDocx } from "../batch/feishu-docx";
import {
  FeishuError,
  createBitable,
  createRecord,
  deleteAllRecords,
  ensureFields,
  getTenantAccessToken,
  setBitablePublicPermission,
  uploadMedia,
  type SchemaSpec,
} from "./client";

const SCHEMA: SchemaSpec[] = [
  // 飞书表格自带行号列，所以不再单独加「序号」字段。
  { name: "日期", kind: "datetime" },
  { name: "剧名", kind: "text" },
  { name: "创意与大纲", kind: "attachment" },
  { name: "完整剧本", kind: "attachment" },
  { name: "分镜脚本", kind: "attachment" },
];

function safeFileSegment(input: string): string {
  return (input || "untitled").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "untitled";
}

// Compose the "Word 文档一": 剧名 + 类型 + 三幕大纲 + 人物小传 + 分集大纲.
// We always emit these 5 sections in that order. Missing sections are skipped
// silently, but the title + 类型 block always appears at the top so the
// document is recognizable even on rows that haven't generated synopsis yet.
function buildOverviewMarkdown(item: BatchItem): string {
  const out: string[] = [];
  const heading = item.title || item.sourceTitle || "未命名作品";
  out.push(`# ${heading}`);

  const meta: string[] = [];
  if (item.audience) meta.push(`受众：${item.audience}`);
  if (item.storyType) meta.push(`故事类型：${item.storyType}`);
  if (item.setting) meta.push(`故事背景：${item.setting}`);
  if (item.protagonist) meta.push(`第一主角：${item.protagonist}`);
  if (item.narrativePov) meta.push(`叙事视角：${item.narrativePov}`);
  if (meta.length) {
    out.push("");
    out.push(...meta);
  }

  const hasActs = item.act1 || item.act2 || item.act3;
  if (hasActs || item.creativeMd) {
    out.push("");
    out.push("## 三幕创意");
    if (hasActs) {
      if (item.act1) {
        out.push("");
        out.push("### Act 1");
        out.push(item.act1);
      }
      if (item.act2) {
        out.push("");
        out.push("### Act 2");
        out.push(item.act2);
      }
      if (item.act3) {
        out.push("");
        out.push("### Act 3");
        out.push(item.act3);
      }
      if (item.worldview) {
        out.push("");
        out.push("### 世界观设定");
        out.push(item.worldview);
      }
      if (item.visualTone) {
        out.push("");
        out.push("### 视觉基调");
        out.push(item.visualTone);
      }
      if (item.coreTheme) {
        out.push("");
        out.push("### 核心主题");
        out.push(item.coreTheme);
      }
    } else if (item.creativeMd) {
      // Fallback: legacy item that only has the raw creativeMd.
      out.push("");
      out.push(item.creativeMd);
    }
  }

  if (item.charactersMd?.trim()) {
    out.push("");
    out.push("## 人物小传");
    out.push("");
    out.push(item.charactersMd.trim());
  }

  if (item.outlineMd?.trim()) {
    out.push("");
    out.push("## 分集大纲");
    out.push("");
    out.push(item.outlineMd.trim());
  }

  return out.join("\n");
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
  // Public-link permission state. `applied` is the strongest setting that
  // stuck (e.g. "anyone_editable" if it worked, "tenant_readable" if the
  // tenant blocks external sharing, or null if every fallback failed). The
  // UI surfaces a warning when applied !== "anyone_editable".
  publicPermission: {
    applied: "anyone_editable" | "anyone_readable" | "tenant_editable" | "tenant_readable" | null;
    attempts: Array<{ entity: string; ok: boolean; message?: string }>;
  };
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
  // Open up the link before we write any records so the user can share the
  // URL the moment the export finishes — even if some rows fail later, the
  // permission stays applied.
  const publicPermission = await setBitablePublicPermission(token, appToken);

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
      const overviewMd = buildOverviewMarkdown(item);
      const overviewBuf = overviewMd.trim()
        ? await buildBatchArtifactDocx({
            title: `${title} · 创意与大纲`,
            subtitle: `${project.title} · ${project.totalEpisodes} 集`,
            body: overviewMd,
          })
        : null;
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

      const overviewToken = overviewBuf
        ? await uploadMedia(token, appToken, `${fileBase}-创意与大纲.docx`, overviewBuf)
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
      };
      if (overviewToken) fields["创意与大纲"] = [{ file_token: overviewToken }];
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
    publicPermission,
  };
}
