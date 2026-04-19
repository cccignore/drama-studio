"use client";
import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Loader2, Plus, Star, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface LLMConfig {
  id: string;
  name: string;
  protocol: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string; // masked
  isDefault?: boolean;
  extraHeaders?: Record<string, string>;
}

const PRESETS = [
  {
    label: "DeepSeek (OpenAI 兼容)",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    label: "SiliconFlow",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-72B-Instruct",
  },
  {
    label: "Anthropic Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
] as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
  }
  return json.data as T;
}

export function ModelsClient() {
  const [items, setItems] = React.useState<LLMConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<LLMConfig | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: LLMConfig[] }>("/api/llm-configs");
      setItems(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDelete = async (id: string) => {
    if (!confirm("确定删除该配置？")) return;
    try {
      await api(`/api/llm-configs/${id}`, { method: "DELETE" });
      toast.success("已删除");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onTest = async (id: string) => {
    setTestingId(id);
    try {
      const data = await api<{ ok: boolean; detail: string }>(
        `/api/llm-configs/${id}/test`,
        { method: "POST" }
      );
      if (data.ok) toast.success(`连通 ✓  ${data.detail}`);
      else toast.error(`连通失败：${data.detail}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTestingId(null);
    }
  };

  const onSetDefault = async (id: string) => {
    try {
      await api(`/api/llm-configs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      toast.success("已设为默认");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-[color:var(--color-muted)]">
          {items.length > 0 ? `共 ${items.length} 个配置` : "尚未添加任何配置"}
        </div>
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> 新增配置
            </Button>
          </DialogTrigger>
          <ConfigForm
            editing={editing}
            onClose={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSaved={async () => {
              setFormOpen(false);
              setEditing(null);
              await refresh();
            }}
          />
        </Dialog>
      </div>

      {loading ? (
        <div className="panel flex h-48 items-center justify-center text-sm text-[color:var(--color-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : items.length === 0 ? (
        <EmptyState onAdd={() => setFormOpen(true)} />
      ) : (
        <div className="grid gap-3">
          {items.map((cfg) => (
            <div key={cfg.id} className="panel flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{cfg.name}</span>
                  {cfg.isDefault && (
                    <Badge tone="primary">
                      <Star className="h-3 w-3" /> 默认
                    </Badge>
                  )}
                  <Badge tone="muted">{cfg.protocol === "openai" ? "OpenAI 兼容" : "Anthropic 兼容"}</Badge>
                </div>
                <div className="truncate font-mono text-xs text-[color:var(--color-muted)]">
                  {cfg.baseUrl}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--color-muted)]">
                  <span>model: <code className="text-[color:var(--color-foreground)]">{cfg.model}</code></span>
                  <span>key: <code>{cfg.apiKey || "(未设置)"}</code></span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onTest(cfg.id)}
                  disabled={testingId === cfg.id}
                >
                  {testingId === cfg.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  测试
                </Button>
                {!cfg.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => onSetDefault(cfg.id)}>
                    <Star className="h-3.5 w-3.5" />
                    设为默认
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(cfg);
                    setFormOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(cfg.id)}>
                  <Trash2 className="h-4 w-4 text-[color:var(--color-danger)]" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 p-10 text-center">
      <CircleAlert className="h-10 w-10 text-[color:var(--color-muted)]" />
      <div className="text-sm">还没有配置任何模型</div>
      <div className="max-w-md text-xs text-[color:var(--color-muted)]">
        配置任意 OpenAI 或 Anthropic 兼容的 endpoint。推荐先从 DeepSeek 开始（性价比高、中文流畅）。
      </div>
      <Button onClick={onAdd} className="mt-2">
        <Plus className="h-4 w-4" />
        添加第一个配置
      </Button>
    </div>
  );
}

interface ConfigFormProps {
  editing: LLMConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

function ConfigForm({ editing, onClose, onSaved }: ConfigFormProps) {
  const [name, setName] = React.useState("");
  const [protocol, setProtocol] = React.useState<"openai" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = React.useState("https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("deepseek-chat");
  const [extraHeaders, setExtraHeaders] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setName(editing.name);
      setProtocol(editing.protocol);
      setBaseUrl(editing.baseUrl);
      setApiKey(""); // 编辑时不回填真实 key
      setModel(editing.model);
      setIsDefault(!!editing.isDefault);
      setExtraHeaders(
        editing.extraHeaders ? JSON.stringify(editing.extraHeaders, null, 2) : ""
      );
    } else {
      applyPreset(0);
      setIsDefault(false);
    }
  }, [editing]);

  function applyPreset(i: number) {
    const p = PRESETS[i];
    if (!p) return;
    setName(p.label);
    setProtocol(p.protocol as "openai" | "anthropic");
    setBaseUrl(p.baseUrl);
    setModel(p.model);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let headers: Record<string, string> | undefined;
      if (extraHeaders.trim()) {
        try {
          headers = JSON.parse(extraHeaders);
        } catch {
          throw new Error("Extra Headers 不是合法 JSON");
        }
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        protocol,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        isDefault,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (headers) body.extraHeaders = headers;

      if (editing) {
        await api(`/api/llm-configs/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("已更新");
      } else {
        if (!apiKey.trim()) throw new Error("apiKey 必填");
        await api(`/api/llm-configs`, { method: "POST", body: JSON.stringify(body) });
        toast.success("已创建");
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{editing ? "编辑模型配置" : "新增模型配置"}</DialogTitle>
        <DialogDescription>
          支持任意 OpenAI 或 Anthropic 兼容 endpoint。api_key 会加密存储。
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>快速填充预设</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => applyPreset(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="name">名称</Label>
            <Input
              id="name"
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="DeepSeek"
              required
            />
          </div>
          <div>
            <Label>协议</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-1 text-sm">
              {(["openai", "anthropic"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rounded-md px-3 py-1 transition-colors ${
                    protocol === p
                      ? "bg-[color:var(--color-primary)] text-white"
                      : "text-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]"
                  }`}
                  onClick={() => setProtocol(p)}
                >
                  {p === "openai" ? "OpenAI 兼容" : "Anthropic 兼容"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="baseUrl">Base URL</Label>
          <Input
            id="baseUrl"
            className="mt-1.5 font-mono text-xs"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com/v1"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              className="mt-1.5 font-mono text-xs"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              required
            />
          </div>
          <div>
            <Label htmlFor="apiKey">API Key {editing && "（留空则不修改）"}</Label>
            <Input
              id="apiKey"
              type="password"
              className="mt-1.5 font-mono text-xs"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? "••••••••" : "sk-..."}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="extra">Extra Headers (JSON, 可选)</Label>
          <Textarea
            id="extra"
            className="mt-1.5 font-mono text-xs"
            value={extraHeaders}
            onChange={(e) => setExtraHeaders(e.target.value)}
            placeholder='{"X-Custom": "value"}'
            rows={3}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--color-primary)]"
          />
          设为全局默认
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            保存
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
