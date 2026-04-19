import Link from "next/link";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  active?: boolean;
}

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({ title, subtitle, nav, headerRight, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen">
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          <div className="flex h-14 items-center gap-2 border-b border-[color:var(--color-border)] px-4 font-semibold">
            <Film className="h-5 w-5 text-[color:var(--color-primary)]" />
            Drama Studio
          </div>
          <nav className="flex flex-col gap-0.5 p-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  item.active
                    ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-foreground)]"
                )}
              >
                {item.icon && <span className="h-4 w-4">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-[color:var(--color-primary)]/15 px-2 py-0.5 text-[10px] text-[color:var(--color-primary)]">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/85 px-6 backdrop-blur">
            <div>
              <div className="text-sm font-semibold">{title}</div>
              {subtitle && <div className="text-xs text-[color:var(--color-muted)]">{subtitle}</div>}
            </div>
            {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
