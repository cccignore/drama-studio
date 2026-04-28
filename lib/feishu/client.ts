// Minimal Feishu (Lark) API client for the bitable + drive subset we need.
//
// Auth: tenant_access_token from internal app credentials. Token cached in
// module scope per app_id and refreshed ~5 min before its declared expiry.
//
// Surface: parseBitableUrl, ensureFields, uploadMedia, createRecord. The
// caller (lib/feishu/export.ts) wires them together.

const HOST = "https://open.feishu.cn";

export class FeishuError extends Error {
  readonly code: number;
  readonly logId?: string;
  constructor(code: number, message: string, logId?: string) {
    super(message);
    this.code = code;
    this.logId = logId;
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = tokenCache.get(appId);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached.token;

  const res = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const body = (await res.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
  if (body.code !== 0 || !body.tenant_access_token) {
    throw new FeishuError(body.code, `飞书鉴权失败：${body.msg}`);
  }
  const expiresAt = Date.now() + (body.expire ?? 7200) * 1000;
  tokenCache.set(appId, { token: body.tenant_access_token, expiresAt });
  return body.tenant_access_token;
}

// Bitable URL shapes:
//   https://<tenant>.feishu.cn/base/<app_token>
//   https://<tenant>.feishu.cn/base/<app_token>?table=<table_id>&view=<view_id>
//   https://<tenant>.feishu.cn/wiki/<wiki_token>?table=<table_id>  ← wiki-wrapped, app_token == wiki_token here for our purposes
export interface BitableRef {
  appToken: string;
  tableId?: string;
}
export function parseBitableUrl(url: string): BitableRef {
  const trimmed = url.trim();
  const match = trimmed.match(/\/(?:base|wiki)\/([A-Za-z0-9]+)/);
  if (!match) throw new FeishuError(-1, `无法从 URL 解析 app_token：${trimmed}`);
  const appToken = match[1];
  let tableId: string | undefined;
  try {
    const u = new URL(trimmed);
    const t = u.searchParams.get("table");
    if (t) tableId = t;
  } catch {
    // ignore — not a strict URL, just take the path piece
  }
  return { appToken, tableId };
}

interface FeishuField {
  field_id: string;
  field_name: string;
  type: number;
  is_primary?: boolean;
  ui_type?: string;
}

async function api<T>(
  path: string,
  init: RequestInit & { token: string },
  parser?: (raw: unknown) => T
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${HOST}${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${token}`,
      ...(headers ?? {}),
    },
  });
  const body = (await res.json()) as { code: number; msg: string; data?: unknown; error?: { log_id?: string } };
  if (body.code !== 0) {
    throw new FeishuError(body.code, `${body.msg} (path=${path})`, body.error?.log_id);
  }
  return parser ? parser(body.data) : (body.data as T);
}

export async function listFirstTableId(token: string, appToken: string): Promise<string> {
  const data = await api<{ items: Array<{ table_id: string }> }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables`,
    { method: "GET", token },
    (raw) => raw as { items: Array<{ table_id: string }> }
  );
  if (!data.items.length) throw new FeishuError(-1, "多维表格里没有可用的数据表");
  return data.items[0].table_id;
}

// Create a brand-new bitable. folderToken is optional: if omitted, Feishu
// drops the bitable into the app's default workspace, accessible via the URL
// returned in the response (the user typically won't see it in their drive UI
// without that link).
export async function createBitable(
  token: string,
  name: string,
  folderToken?: string
): Promise<{ appToken: string; tableId: string; url: string }> {
  const data = await api<{ app: { app_token: string; default_table_id: string; url: string } }>(
    `/open-apis/bitable/v1/apps`,
    {
      method: "POST",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, folder_token: folderToken ?? "" }),
    },
    (raw) => raw as { app: { app_token: string; default_table_id: string; url: string } }
  );
  return {
    appToken: data.app.app_token,
    tableId: data.app.default_table_id,
    url: data.app.url,
  };
}

export async function listFields(
  token: string,
  appToken: string,
  tableId: string
): Promise<FeishuField[]> {
  const data = await api<{ items: FeishuField[] }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`,
    { method: "GET", token },
    (raw) => raw as { items: FeishuField[] }
  );
  return data.items;
}

export type FieldKind = "text" | "datetime" | "attachment";
const FIELD_TYPE: Record<FieldKind, number> = { text: 1, datetime: 5, attachment: 17 };

async function createField(
  token: string,
  appToken: string,
  tableId: string,
  name: string,
  kind: FieldKind
): Promise<FeishuField> {
  const data = await api<{ field: FeishuField }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: "POST",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ field_name: name, type: FIELD_TYPE[kind] }),
    },
    (raw) => raw as { field: FeishuField }
  );
  return data.field;
}

async function renameField(
  token: string,
  appToken: string,
  tableId: string,
  fieldId: string,
  name: string,
  type: number
): Promise<void> {
  await api<unknown>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`,
    {
      method: "PUT",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ field_name: name, type }),
    }
  );
}

async function deleteField(
  token: string,
  appToken: string,
  tableId: string,
  fieldId: string
): Promise<void> {
  await api<unknown>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`,
    { method: "DELETE", token }
  );
}

export interface SchemaSpec {
  name: string;
  kind: FieldKind;
}

// Reads existing fields, ensures the requested schema is present, and
// returns the final name → field map so callers can write records against it.
//
// Cleanup behavior on fresh bitables: a brand-new bitable always ships with
// 文本 / 单选 / 日期 / 附件 as its default columns. If we detect that the
// caller hasn't yet customized the table (≥ half of the requested schema is
// still missing), we rewrite the defaults — rename 文本→剧名 and 附件→完整剧本
// where compatible, and delete 单选 — so the final table ends up with exactly
// the requested 6 columns instead of 6 + 3 leftover defaults.
//
// On subsequent exports the schema fields exist, so nothing is renamed or
// deleted; user-added fields are never touched.
const DEFAULT_TEMPLATE = new Set(["文本", "单选", "附件"]);
const RENAME_PAIRS: Array<{ from: string; to: string; type: number }> = [
  { from: "文本", to: "剧名", type: FIELD_TYPE.text },
  { from: "附件", to: "完整剧本", type: FIELD_TYPE.attachment },
];

export async function ensureFields(
  token: string,
  appToken: string,
  tableId: string,
  spec: SchemaSpec[]
): Promise<Map<string, FeishuField>> {
  const existing = await listFields(token, appToken, tableId);
  const byName = new Map<string, FeishuField>(existing.map((f) => [f.field_name, f]));

  const missingCount = spec.filter((s) => !byName.has(s.name)).length;
  const looksFresh = missingCount * 2 >= spec.length;

  if (looksFresh) {
    for (const { from, to, type } of RENAME_PAIRS) {
      const src = byName.get(from);
      if (!src || src.type !== type || byName.has(to)) continue;
      await renameField(token, appToken, tableId, src.field_id, to, type);
      byName.delete(from);
      byName.set(to, { ...src, field_name: to });
    }
    // Drop default-template fields that don't map to anything in our schema
    // (e.g. 单选). Only the well-known template names are touched, so any
    // user-added field — even one named something we don't recognize — stays.
    for (const [name, field] of [...byName.entries()]) {
      if (!DEFAULT_TEMPLATE.has(name)) continue;
      if (spec.some((s) => s.name === name)) continue;
      await deleteField(token, appToken, tableId, field.field_id);
      byName.delete(name);
    }
  }

  for (const { name, kind } of spec) {
    const have = byName.get(name);
    if (have) {
      if (have.type !== FIELD_TYPE[kind]) {
        throw new FeishuError(
          -1,
          `字段「${name}」类型不匹配（期望 ${kind} / 实际 type=${have.type}），请在飞书里删掉这一列再重试`
        );
      }
      continue;
    }
    const created = await createField(token, appToken, tableId, name, kind);
    byName.set(name, created);
  }
  return byName;
}

// Upload a buffer as bitable_file media. The returned file_token is plugged
// into an attachment field as `{ file_token: ... }`.
export async function uploadMedia(
  token: string,
  appToken: string,
  fileName: string,
  buffer: Uint8Array,
  mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
): Promise<string> {
  const form = new FormData();
  form.append("file_name", fileName);
  form.append("parent_type", "bitable_file");
  form.append("parent_node", appToken);
  form.append("size", String(buffer.byteLength));
  // Slice the underlying buffer so the Blob receives a plain ArrayBuffer (not
  // a SharedArrayBuffer-tagged view that TS rejects from BlobPart).
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  form.append("file", new Blob([ab], { type: mimeType }), fileName);

  const res = await fetch(`${HOST}/open-apis/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const body = (await res.json()) as { code: number; msg: string; data?: { file_token: string } };
  if (body.code !== 0 || !body.data?.file_token) {
    throw new FeishuError(body.code, `附件上传失败：${body.msg}`);
  }
  return body.data.file_token;
}

export type RecordValue = string | number | Array<{ file_token: string }>;

export async function createRecord(
  token: string,
  appToken: string,
  tableId: string,
  fields: Record<string, RecordValue>
): Promise<{ recordId: string }> {
  const data = await api<{ record: { record_id: string } }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields }),
    },
    (raw) => raw as { record: { record_id: string } }
  );
  return { recordId: data.record.record_id };
}
