"use client";
import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DramaStep } from "@/lib/drama/types";
import { STEP_LABEL, stepIndex } from "@/lib/drama/state-machine";

const VISIBLE: DramaStep[] = ["start", "plan", "characters", "outline", "episode", "review", "export"];

export function StepProgress({
  projectId,
  currentStep,
  activeStep,
}: {
  projectId: string;
  currentStep: DramaStep;
  activeStep?: DramaStep;
}) {
  const currentIdx = stepIndex(currentStep);
  return (
    <div className="panel flex items-center gap-1 overflow-x-auto p-2">
      {VISIBLE.map((step, i) => {
        const idx = stepIndex(step);
        const done = idx < currentIdx;
        const here = step === activeStep;
        const reachable = idx <= currentIdx;
        const body = (
          <>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                done && "border-[color:var(--color-success)] bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
                here && "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/25 text-[color:var(--color-primary)]",
                !done && !here && "border-[color:var(--color-border)]"
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="whitespace-nowrap">{STEP_LABEL[step]}</span>
          </>
        );
        const cls = cn(
          "group flex min-w-0 shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
          here && "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)] ring-1 ring-[color:var(--color-primary)]/30",
          !here && done && "text-[color:var(--color-success)] hover:bg-[color:var(--color-surface-2)]",
          !here && !done && reachable && "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-2)]",
          !here && !reachable && "cursor-not-allowed text-[color:var(--color-muted)]"
        );
        return (
          <React.Fragment key={step}>
            {reachable ? (
              <Link href={`/studio/${projectId}/${step}`} className={cls}>
                {body}
              </Link>
            ) : (
              <span className={cls}>{body}</span>
            )}
            {i < VISIBLE.length - 1 && (
              <span className="mx-0.5 h-px w-4 shrink-0 bg-[color:var(--color-border)]" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
