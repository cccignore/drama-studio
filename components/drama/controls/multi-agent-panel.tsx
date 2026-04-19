"use client";
import * as React from "react";
import { BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MultiAgentCommand = "plan" | "episode";

export function MultiAgentPanel({
  enabled,
  setEnabled,
  commands,
  setCommands,
  patchState,
}: {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  commands: MultiAgentCommand[];
  setCommands: React.Dispatch<React.SetStateAction<MultiAgentCommand[]>>;
  patchState: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const save = async () => {
    try {
      await patchState({ multiAgentEnabled: enabled, multiAgentCommands: commands });
      toast.success("已保存多角色协同设置");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="panel-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <BrainCircuit className="h-4 w-4 text-[color:var(--color-success)]" />
        Multi-agent 协同
      </div>
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用多角色协同（Planner / Writer / Critic）
        </label>
        <div className="grid gap-2">
          {(["plan", "episode"] as const).map((command) => (
            <label key={command} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={commands.includes(command)}
                onChange={(e) =>
                  setCommands((prev) =>
                    e.target.checked
                      ? [...new Set([...prev, command])]
                      : prev.filter((item) => item !== command)
                  )
                }
              />
              {command === "plan" ? "节奏规划启用多角色协同" : "分集剧本启用多角色协同"}
            </label>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={save}>
          保存 multi-agent 设置
        </Button>
      </div>
    </div>
  );
}
