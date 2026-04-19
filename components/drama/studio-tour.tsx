"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

function getRect(target: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour-id="${target}"]`);
  return el?.getBoundingClientRect() ?? null;
}

export function StudioTour({
  open,
  steps,
  onClose,
}: {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const refresh = () => setRect(getRect(steps[index]?.target));
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [index, open, steps]);

  React.useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  if (!open || !steps[index]) return null;

  const step = steps[index];
  const cardStyle = rect
    ? {
        top: Math.min(window.innerHeight - 240, rect.bottom + 16),
        left: Math.min(window.innerWidth - 360, Math.max(16, rect.left)),
      }
    : { top: 96, left: 24 };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="tour-backdrop"
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {rect && (
        <motion.div
          key={`tour-highlight-${index}`}
          className="pointer-events-none fixed z-[101] rounded-2xl border border-[color:var(--color-primary)]/80 shadow-[0_0_0_9999px_rgba(3,7,14,0.28)]"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
        />
      )}

      <motion.div
        key={`tour-card-${index}`}
        className="fixed z-[102] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-2xl"
        style={cardStyle}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2 }}
      >
        <div className="text-xs text-[color:var(--color-primary)]">
          新手引导 {index + 1} / {steps.length}
        </div>
        <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          {step.body}
        </p>
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
          >
            跳过引导
          </button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              上一步
            </Button>
            {index < steps.length - 1 ? (
              <Button size="sm" onClick={() => setIndex((value) => value + 1)}>
                下一步
              </Button>
            ) : (
              <Button size="sm" onClick={onClose}>
                开始使用
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
