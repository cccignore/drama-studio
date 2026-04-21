"use client";
import * as React from "react";
import { toast } from "sonner";
import type { ProjectLLMCommand } from "@/lib/llm/types";

export interface LLMConfig {
  id: string;
  name: string;
  protocol: "openai" | "anthropic";
  model: string;
}

export interface BindingItem {
  command: ProjectLLMCommand;
  configId: string;
  config?: LLMConfig | null;
  slot?: string | null;
  resolvedConfig?: LLMConfig | null;
}

export interface RoleBindingItem {
  slot: "primary" | "secondary" | "tertiary" | "overseas";
  configId: string;
  config: LLMConfig | null;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
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

export interface PresetForm {
  defaultConfigId: string;
  primaryConfigId: string;
  secondaryConfigId: string;
  tertiaryConfigId: string;
  overseasConfigId: string;
}

export function useProjectControls(projectId: string) {
  const [configs, setConfigs] = React.useState<LLMConfig[]>([]);
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  const [resolvedBindings, setResolvedBindings] = React.useState<Record<string, LLMConfig | null>>({});
  const [roleBindings, setRoleBindings] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [savingCommand, setSavingCommand] = React.useState<string | null>(null);
  const [presetForm, setPresetForm] = React.useState<PresetForm>({
    defaultConfigId: "",
    primaryConfigId: "",
    secondaryConfigId: "",
    tertiaryConfigId: "",
    overseasConfigId: "",
  });

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cfgData, bindingData, roleData] = await Promise.all([
        api<{ items: LLMConfig[] }>("/api/llm-configs"),
        api<{ items: BindingItem[] }>(`/api/projects/${projectId}/llm-bindings`),
        api<{ items: RoleBindingItem[] }>("/api/llm-role-bindings"),
      ]);
      setConfigs(cfgData.items);
      const nextBindings = Object.fromEntries(
        bindingData.items.map((item) => [item.command, item.configId])
      );
      setBindings(nextBindings);
      setResolvedBindings(
        Object.fromEntries(bindingData.items.map((item) => [item.command, item.resolvedConfig ?? item.config ?? null]))
      );
      const nextRoles = Object.fromEntries(roleData.items.map((item) => [item.slot, item.configId]));
      setRoleBindings(nextRoles);
      const defaultId = nextBindings.default ?? cfgData.items[0]?.id ?? "";
      setPresetForm((prev) => ({
        defaultConfigId: prev.defaultConfigId || defaultId,
        primaryConfigId: prev.primaryConfigId || nextRoles.primary || defaultId,
        secondaryConfigId: prev.secondaryConfigId || nextRoles.secondary || defaultId,
        tertiaryConfigId: prev.tertiaryConfigId || nextRoles.tertiary || defaultId,
        overseasConfigId: prev.overseasConfigId || nextRoles.overseas || nextRoles.primary || defaultId,
      }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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
      toast.success(`已更新 ${command} 的模型绑定`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCommand(null);
    }
  };

  const patchState = React.useCallback(
    (patch: Record<string, unknown>) =>
      api(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ state: patch }),
      }),
    [projectId]
  );

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

  return {
    configs,
    bindings,
    setBindings,
    resolvedBindings,
    roleBindings,
    loading,
    savingCommand,
    presetForm,
    setPresetForm,
    refresh,
    saveBinding,
    patchState,
    applyPreset,
  };
}
