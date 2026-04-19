"use client";
import * as React from "react";
import Link from "next/link";
import { BrainCircuit, Globe2, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ROUTING_PRESETS } from "@/lib/llm/presets";
import type { ProjectLLMCommand } from "@/lib/llm/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface LLMConfig {
  id: string;
  name: string;
  protocol: "openai" | "anthropic";
  model: string;
}

interface BindingItem {
  command: ProjectLLMCommand;
  configId: string;
}

const COMMANDS: Array<{ id: ProjectLLMCommand; label: string; desc: string }> = [
  { id: "default", label: "默认", desc: "未单独绑定时使用" },
  { id: "start", label: "立项", desc: "立项卡与题材判断" },
  { id: "plan", label: "节奏", desc: "节奏、爽点与卡点规划" },
  { id: "characters", label: "角色", desc: "人物卡与关系图" },
  { id: "outline", label: "分集", desc: "完整目录与标记" },
  { id: "episode", label: "剧本", desc: "长文本生成" },
  { id: "review", label: "复盘", desc: "评分与问题清单" },
  { id: "overseas", label: "出海", desc: "英文与文化适配" },
  { id: "compliance", label: "合规", desc: "批量审查" },
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

export function ProjectControlsPanel({
  projectId,
  initialMode,
  initialMultiAgentEnabled,
  initialMultiAgentCommands,
}: {
  projectId: string;
  initialMode: "domestic" | "overseas";
  initialMultiAgentEnabled?: boolean;
  initialMultiAgentCommands?: ("plan" | "episode")[];
}) {
  const [open, setOpen] = React.useState(false);
  const [configs, setConfigs] = React.useState<LLMConfig[]>([]);
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [savingCommand, setSavingCommand] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState(initialMode);
  const [multiAgentEnabled, setMultiAgentEnabled] = React.useState(!!initialMultiAgentEnabled);
  const [multiAgentCommands, setMultiAgentCommands] = React.useState<("plan" | "episode")[]>(
    initialMultiAgentCommands?.length ? initialMultiAgentCommands : ["episode"]
  );
  const [presetForm, setPresetForm] = React.useState({
    defaultConfigId: "",
    primaryConfigId: "",
    secondaryConfigId: "",
    tertiaryConfigId: "",
  });

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfgData, bindingData] = await Promise.all([
        api<{ items: LLMConfig[] }>("/api/llm-configs"),
        api<{ items: BindingItem[] }>(`/api/projects/${projectId}/llm-bindings`),
      ]);
      setConfigs(cfgData.items);
      const nextBindings = Object.fromEntries(bindingData.items.map((item) => [item.command, item.configId]));
      setBindings(nextBindings);
      const defaultId = nextBindings.default ?? cfgData.items.find((c) => c.id)?.id ?? "";
      setPresetForm((prev) => ({
        defaultConfigId: prev.defaultConfigId || defaultId,
        primaryConfigId: prev.primaryConfigId || defaultId,
        secondaryConfigId: prev.secondaryConfigId || defaultId,
        tertiaryConfigId: prev.tertiaryConfigId || defaultId,
      }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const saveBinding = async (command: ProjectLLMCommand, configId: string) => {
    setSavingCommand(command);
    try {
      if (!configId) {
        await api(`/api/projects/${projectId}/llm-bindings/${command}`, { method: "DELETE" });
      } else {
        await api(`/api/projects/${projectId}/llm-bindings/${command}`, {
          method: "PUT",
          body: JSON.stringify({ configId }),
        });
      }
      setBindings((prev) => ({ ...prev, [command]: configId }));
      toast.success(`已更新 ${COMMANDS.find((c) => c.id === command)?.label ?? command} 模型绑定`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCommand(null);
    }
  };

  const patchState = async (patch: Record<string, unknown>) => {
    await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ state: patch }),
    });
  };

  const saveMultiAgent = async () => {
    try {
      await patchState({
        multiAgentEnabled,
        multiAgentCommands,
      });
      toast.success("已保存多角色协同设置");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const applyPreset = async (presetId: string) => {
    try {
      await api(`/api/projects/${projectId}/llm-bindings/apply-preset`, {
        method: "POST",
        body: JSON.stringify({ presetId, ...presetForm }),
      });
      toast.success("已应用路由预设");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal className="h-4 w-4" />
          项目增强
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl overflow-hidden p-0">
        <div className="max-h-[88vh] overflow-y-auto p-6">
          <DialogHeader className="sticky top-0 z-10 bg-[color:var(--color-surface)] pb-4">
            <DialogTitle>项目增强设置</DialogTitle>
            <DialogDescription>
              配置按命令模型绑定、出海/合规快捷入口，以及多角色协同模式。
            </DialogDescription>
          </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <section className="space-y-4">
            <div className="panel-2 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-[color:var(--color-primary)]" />
                MoE 路由预设
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <FieldSelect
                  label="默认模型"
                  value={presetForm.defaultConfigId}
                  onChange={(value) => setPresetForm((prev) => ({ ...prev, defaultConfigId: value }))}
                  options={configs}
                  allowEmpty={false}
                />
                <FieldSelect
                  label="主模型"
                  value={presetForm.primaryConfigId}
                  onChange={(value) => setPresetForm((prev) => ({ ...prev, primaryConfigId: value }))}
                  options={configs}
                  allowEmpty={false}
                />
                <FieldSelect
                  label="第二模型"
                  value={presetForm.secondaryConfigId}
                  onChange={(value) => setPresetForm((prev) => ({ ...prev, secondaryConfigId: value }))}
                  options={configs}
                />
                <FieldSelect
                  label="第三模型"
                  value={presetForm.tertiaryConfigId}
                  onChange={(value) => setPresetForm((prev) => ({ ...prev, tertiaryConfigId: value }))}
                  options={configs}
                />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {ROUTING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-3 text-left text-sm transition hover:border-[color:var(--color-primary)]/50"
                  >
                    <div className="font-medium">{preset.name}</div>
                    <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-2 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BrainCircuit className="h-4 w-4 text-[color:var(--color-accent)]" />
                按命令绑定模型
              </div>
              <div className="space-y-3">
                {COMMANDS.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 md:grid-cols-[160px_1fr_auto] md:items-center">
                    <div>
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-[color:var(--color-muted)]">{item.desc}</div>
                    </div>
                    <FieldSelect
                      label=""
                      value={bindings[item.id] ?? ""}
                      onChange={(value) => setBindings((prev) => ({ ...prev, [item.id]: value }))}
                      options={configs}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading || savingCommand === item.id}
                      onClick={() => saveBinding(item.id, bindings[item.id] ?? "")}
                    >
                      保存
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="panel-2 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Globe2 className="h-4 w-4 text-[color:var(--color-primary)]" />
                出海 / 合规快捷入口
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
                  <div className="font-medium">当前市场模式：{mode === "overseas" ? "出海" : "国内"}</div>
                  <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                    出海模式会生成英文剧本，并切换到 Hollywood 标准格式。
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link href={`/studio/${projectId}/overseas`}>
                      <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                        打开出海模式
                      </Button>
                    </Link>
                    {mode === "overseas" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await patchState({ mode: "domestic", language: "zh-CN" });
                            setMode("domestic");
                            toast.success("已切回国内模式");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        切回国内
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
                  <div className="font-medium">合规检查</div>
                  <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                    基于已写剧本生成红线 / 风险 / 通过项三色面板。
                  </div>
                  <div className="mt-3">
                    <Link href={`/studio/${projectId}/compliance`}>
                      <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                        <ShieldCheck className="h-4 w-4" />
                        打开合规检查
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel-2 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BrainCircuit className="h-4 w-4 text-[color:var(--color-success)]" />
                Multi-agent 协同
              </div>
              <div className="space-y-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={multiAgentEnabled}
                    onChange={(e) => setMultiAgentEnabled(e.target.checked)}
                  />
                  启用多角色协同（Planner / Writer / Critic）
                </label>
                <div className="grid gap-2">
                  {(["plan", "episode"] as const).map((command) => (
                    <label key={command} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={multiAgentCommands.includes(command)}
                        onChange={(e) =>
                          setMultiAgentCommands((prev) =>
                            e.target.checked ? [...new Set([...prev, command])] : prev.filter((item) => item !== command)
                          )
                        }
                      />
                      {command === "plan" ? "节奏规划启用多角色协同" : "分集剧本启用多角色协同"}
                    </label>
                  ))}
                </div>
                <Button size="sm" variant="secondary" onClick={saveMultiAgent}>
                  保存 multi-agent 设置
                </Button>
              </div>
            </div>
          </section>
        </div>
          <div className="mt-6 flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost">关闭</Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: LLMConfig[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs text-[color:var(--color-muted)]">
      {label ? <span className="block">{label}</span> : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-foreground)]"
      >
        {allowEmpty && <option value="">使用默认模型</option>}
        {options.map((cfg) => (
          <option key={cfg.id} value={cfg.id}>
            {cfg.name} · {cfg.model}
          </option>
        ))}
      </select>
    </label>
  );
}
