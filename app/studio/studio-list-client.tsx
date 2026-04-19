"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  title: string;
  state: { currentStep: string; totalEpisodes: number; dramaTitle?: string };
  createdAt: number;
  updatedAt: number;
}

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

export function StudioListClient() {
  const [items, setItems] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: Project[] }>("/api/projects");
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() || "未命名项目" }),
      });
      setTitle("");
      toast.success("已创建");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("确定删除该项目？其产物也会一并删除。")) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      toast.success("已删除");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <form onSubmit={onCreate} className="panel flex items-center gap-3 p-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新项目名称（留空则默认为 未命名项目）"
          className="flex-1"
        />
        <Button type="submit" disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新建
        </Button>
      </form>

      {loading ? (
        <div className="panel flex h-40 items-center justify-center text-sm text-[color:var(--color-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-[color:var(--color-muted)]">
          还没有项目。先创建一个。
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((p) => (
            <div key={p.id} className="panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.title}</span>
                  <Badge tone="muted">{p.state.currentStep}</Badge>
                </div>
                <div className="mt-1 font-mono text-[11px] text-[color:var(--color-muted)]">
                  {p.id} · 更新于 {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/studio/${p.id}`}>
                  <Button size="sm" variant="secondary">
                    打开 <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button size="icon" variant="ghost" onClick={() => onDelete(p.id)}>
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
