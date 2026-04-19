import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Cog, FolderKanban, Terminal } from "lucide-react";
import { ModelsClient } from "./models-client";

export const dynamic = "force-dynamic";

export default function ModelsPage() {
  return (
    <DashboardShell
      title="模型设置"
      subtitle="配置用于生成剧本的大语言模型。可添加任意 OpenAI / Anthropic 兼容的 endpoint。"
      nav={[
        { label: "项目列表", href: "/studio", icon: <FolderKanban className="h-4 w-4" /> },
        {
          label: "模型设置",
          href: "/settings/models",
          icon: <Cog className="h-4 w-4" />,
          active: true,
        },
        { label: "首页", href: "/", icon: <Terminal className="h-4 w-4" /> },
      ]}
    >
      <ModelsClient />
    </DashboardShell>
  );
}
