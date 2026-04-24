import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Cog, Factory, FolderKanban, Terminal } from "lucide-react";
import { StudioListClient } from "./studio-list-client";

export const dynamic = "force-dynamic";

export default function StudioListPage() {
  return (
    <DashboardShell
      title="项目列表"
      subtitle="每个项目独立隔离状态与产物。建议先创建一个 5 集试玩项目，再扩展到长剧。"
      nav={[
        {
          label: "项目列表",
          href: "/studio",
          icon: <FolderKanban className="h-4 w-4" />,
          active: true,
        },
        { label: "红果批量工厂", href: "/studio/batch", icon: <Factory className="h-4 w-4" /> },
        { label: "模型设置", href: "/settings/models", icon: <Cog className="h-4 w-4" /> },
        { label: "首页", href: "/", icon: <Terminal className="h-4 w-4" /> },
      ]}
    >
      <StudioListClient />
    </DashboardShell>
  );
}
