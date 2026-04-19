"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { BrainCircuit, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SSEEvent } from "@/hooks/use-streaming-command";

type AgentRole = "planner" | "critic" | "writer";

interface AgentWorkflowPanelProps {
  enabled: boolean;
  running: boolean;
  commandLabel: string;
  events: SSEEvent[];
}

interface AgentState {
  role: AgentRole;
  title: string;
  status: "idle" | "running" | "done" | "stopped";
  preview?: string;
}

const ROLE_LABEL: Record<AgentRole, string> = {
  planner: "Planner",
  critic: "Critic",
  writer: "Writer",
};

export function AgentWorkflowPanel({
  enabled,
  running,
  commandLabel,
  events,
}: AgentWorkflowPanelProps) {
  const agentStates = React.useMemo<AgentState[]>(() => {
    const states: AgentState[] = (["planner", "critic", "writer"] as AgentRole[]).map((role) => ({
      role,
      title: ROLE_LABEL[role],
      status: "idle",
    }));
    const roleMap = new Map<AgentRole, AgentState>(states.map((item) => [item.role, item]));

    for (const event of events) {
      if (event.type !== "agent") continue;
      const role = event.role as AgentRole | undefined;
      if (!role || !roleMap.has(role)) continue;
      const current = roleMap.get(role)!;
      current.title = typeof event.title === "string" && event.title ? event.title : ROLE_LABEL[role];
      current.status = event.status === "done" ? "done" : "running";
      if (typeof event.preview === "string" && event.preview) {
        current.preview = event.preview;
      }
    }

    if (!running) {
      for (const state of states) {
        if (state.status === "running") {
          state.status = "stopped";
        }
      }
    }

    return states;
  }, [events, running]);

  if (!enabled) return null;

  return (
    <section className="panel-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-[color:var(--color-success)]" />
            Multi-agent 正在接管 {commandLabel}
          </div>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            当前命令会按 <code>Planner → Critic → Writer</code> 三段协同执行，生成过程会把每个角色的状态直接展示在前端。
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            running
              ? "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]"
              : "bg-[color:var(--color-surface)] text-[color:var(--color-muted)]"
          )}
        >
          {running ? "协同进行中" : "等待本次生成"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {agentStates.map((agent, index) => (
          <motion.div
            key={agent.role}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: index * 0.04 }}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{agent.title}</div>
                <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                  {agent.role === "planner"
                    ? "先搭节奏骨架或 beat sheet"
                    : agent.role === "critic"
                      ? "提出具体修正意见"
                      : "吸收前两者结果，产出最终稿"}
                </div>
              </div>
              <AgentStatusBadge status={agent.status} />
            </div>
            <div className="mt-3 min-h-12 text-xs leading-5 text-[color:var(--color-muted)]">
              {agent.preview
                ? agent.preview
                : agent.status === "idle"
                  ? "等待本轮生成触发。"
                  : agent.status === "stopped"
                    ? "上次运行已中断。"
                    : "正在处理中…"}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AgentStatusBadge({ status }: { status: AgentState["status"] }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-success)]/15 px-2 py-1 text-[11px] text-[color:var(--color-success)]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已完成
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-primary)]/15 px-2 py-1 text-[11px] text-[color:var(--color-primary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        运行中
      </span>
    );
  }
  if (status === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] text-amber-300">
        <CircleDashed className="h-3.5 w-3.5" />
        已中断
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-2)] px-2 py-1 text-[11px] text-[color:var(--color-muted)]">
      <CircleDashed className="h-3.5 w-3.5" />
      待命
    </span>
  );
}
