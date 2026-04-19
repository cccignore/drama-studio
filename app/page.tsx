import Link from "next/link";
import { ArrowRight, Sparkles, Settings, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(70% 50% at 20% 0%, hsl(262 80% 35% / 0.35), transparent), radial-gradient(50% 40% at 100% 10%, hsl(201 85% 40% / 0.25), transparent)",
        }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <Film className="h-5 w-5 text-[color:var(--color-primary)]" />
          Drama Studio
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/settings/models">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
              模型设置
            </Button>
          </Link>
          <Link href="/studio">
            <Button size="sm">
              进入工作台 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-16 w-full max-w-4xl px-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1 text-xs text-[color:var(--color-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-accent)]" /> 专业微短剧
          AI 编剧流水线
        </div>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
          从选题到导出，<br />
          <span className="title-gradient">把短剧剧本做成流水线</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-[color:var(--color-muted-foreground)]">
          不需要懂命令行、不需要写 prompt。选题材 → 生成方案 → 角色关系 → 分集目录 → 逐集剧本
          → 自检评分 → 一键导出。首次使用建议先跑通一个 5 集迷你剧闭环，再扩展到长剧。
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/studio">
            <Button size="lg">
              开始创作 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/models">
            <Button size="lg" variant="secondary">
              <Settings className="h-4 w-4" /> 先配置 LLM
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-24 grid w-full max-w-5xl grid-cols-1 gap-4 px-6 md:grid-cols-3">
        {[
          { t: "自由选择 LLM", d: "DeepSeek / OpenAI 兼容 / Anthropic 兼容，自定义 endpoint、自定义模型。" },
          { t: "按需注入方法论", d: "8 份行业方法论按命令按需加载，prompt 不臃肿。" },
          { t: "流式可视化", d: "SSE 实时回显进度与文本，过程可见、错误友好。" },
        ].map((x) => (
          <div key={x.t} className="panel p-5">
            <div className="mb-1 text-sm font-medium">{x.t}</div>
            <div className="text-sm text-[color:var(--color-muted)]">{x.d}</div>
          </div>
        ))}
      </section>

      <footer className="mx-auto mt-24 w-full max-w-6xl px-6 py-10 text-center text-xs text-[color:var(--color-muted)]">
        Drama Studio · 面向微短剧的 AI 编剧工作台
      </footer>
    </div>
  );
}
