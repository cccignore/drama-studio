"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/50",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] hover:brightness-110 active:brightness-95 shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_20px_-8px_rgba(124,58,237,0.6)]",
        secondary:
          "bg-[color:var(--color-surface-2)] text-[color:var(--color-foreground)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]/70 hover:border-[color:var(--color-border-strong)]",
        ghost:
          "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-2)]",
        danger:
          "bg-[color:var(--color-danger)] text-white hover:brightness-110",
        outline:
          "border border-[color:var(--color-border-strong)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-2)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";

export { buttonVariants };
