"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Compass, Factory, Loader2, Plus, Settings, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StudioTour, type TourStep } from "@/components/drama/studio-tour";

interface Project {
  id: string;
  title: string;
  state: { currentStep: string; totalEpisodes: number; dramaTitle?: string };
  createdAt: number;
  updatedAt: number;
}

const TOUR_STORAGE_KEY = "drama-studio-tour-v1";

const TOUR_STEPS: TourStep[] = [
  {
    target: "quickstart",
    title: "先看默认路径",
    body: "第一次使用建议直接跑 5 集试玩闭环：先立项，再生成节奏、角色、分集、剧本、复盘和导出。",
  },
  {
    target: "create-form",
    title: "从这里创建项目",
    body: "先建一个空项目即可。进入项目后，立项页已经内置了“一键填入 5 集试玩案例”的快捷入口。",
  },
  {
    target: "project-list",
    title: "从项目卡进入工作台",
    body: "项目创建后会出现在这里。打开后可在右上角“项目增强”里配置出海、合规和 multi-agent。",
  },
];

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
  const [tourOpen, setTourOpen] = React.useState(false);

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(TOUR_STORAGE_KEY)) {
      setTourOpen(true);
    }
  }, []);

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

  const closeTour = React.useCallback(() => {
    setTourOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "seen");
    }
  }, []);

  return (
    <>
      <StudioTour open={tourOpen} steps={TOUR_STEPS} onClose={closeTour} />
      <div className="mx-auto max-w-4xl space-y-6">
        <div
          data-tour-id="quickstart"
          className="panel-2 flex flex-wrap items-center justify-between gap-4 p-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Compass className="h-4 w-4 text-[color:var(--color-primary)]" />
              首次使用建议
            </div>
            <div className="text-sm text-[color:var(--color-muted)]">
              先创建项目，再在立项页一键填入 5 集试玩案例。完整闭环跑通后，再扩展成长剧。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/models">
              <Button variant="secondary" size="sm">
                <Settings className="h-4 w-4" />
                配置模型
              </Button>
            </Link>
            <Link href="/studio/batch">
              <Button variant="secondary" size="sm">
                <Factory className="h-4 w-4" />
                红果批量工厂
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setTourOpen(true)}>
              <Sparkles className="h-4 w-4" />
              重播引导
            </Button>
          </div>
        </div>

        <motion.form
          data-tour-id="create-form"
          onSubmit={onCreate}
          className="panel flex items-center gap-3 p-4"
          whileHover={{ y: -2 }}
          transition={{ duration: 0.18 }}
        >
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
        </motion.form>

        <div data-tour-id="project-list">
          {loading ? (
            <div className="panel flex h-40 items-center justify-center text-sm text-[color:var(--color-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-[color:var(--color-muted)]">
              还没有项目。先创建一个，然后进入立项页跑通 5 集试玩闭环。
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((p) => (
                <motion.div
                  key={p.id}
                  className="panel flex items-center justify-between gap-3 p-4"
                  whileHover={{ y: -3, scale: 1.002 }}
                  transition={{ duration: 0.18 }}
                >
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
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
