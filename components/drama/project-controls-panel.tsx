"use client";
import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
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
import { useProjectControls } from "./controls/use-project-controls";
import { MoEPresetPanel } from "./controls/moe-panel";
import { BindingPanel } from "./controls/binding-panel";
import { MarketPanel } from "./controls/market-panel";
import { MultiAgentPanel } from "./controls/multi-agent-panel";

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
  const [mode, setMode] = React.useState(initialMode);
  const [multiAgentEnabled, setMultiAgentEnabled] = React.useState(!!initialMultiAgentEnabled);
  const [multiAgentCommands, setMultiAgentCommands] = React.useState<("plan" | "episode")[]>(
    initialMultiAgentCommands?.length ? initialMultiAgentCommands : ["episode"]
  );

  const controls = useProjectControls(projectId);

  React.useEffect(() => {
    if (open) void controls.refresh();
  }, [open, controls]);

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
              <MoEPresetPanel
                configs={controls.configs}
                presetForm={controls.presetForm}
                setPresetForm={controls.setPresetForm}
                onApply={controls.applyPreset}
                resolvedBindings={controls.resolvedBindings}
              />
              <BindingPanel
                configs={controls.configs}
                bindings={controls.bindings}
                setBindings={controls.setBindings}
                loading={controls.loading}
                savingCommand={controls.savingCommand}
                onSave={controls.saveBinding}
              />
            </section>

            <section className="space-y-4">
              <MarketPanel
                projectId={projectId}
                mode={mode}
                onSetMode={setMode}
                onClose={() => setOpen(false)}
                patchState={controls.patchState}
              />
              <MultiAgentPanel
                enabled={multiAgentEnabled}
                setEnabled={setMultiAgentEnabled}
                commands={multiAgentCommands}
                setCommands={setMultiAgentCommands}
                patchState={controls.patchState}
              />
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
