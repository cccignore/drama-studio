import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Cog, Factory, FolderKanban, Home } from "lucide-react";
import { BatchFactoryClient } from "./batch-factory-client";

export const dynamic = "force-dynamic";

export default function BatchFactoryPage() {
  return (
    <DashboardShell
      title="红果批量工厂"
      subtitle="每部红果源剧对应一条生成任务，批量生成三幕创意、完整剧本和分镜脚本。"
      nav={[
        { label: "红果批量工厂", href: "/studio/batch", icon: <Factory className="h-4 w-4" />, active: true },
        { label: "项目列表", href: "/studio", icon: <FolderKanban className="h-4 w-4" /> },
        { label: "模型设置", href: "/settings/models", icon: <Cog className="h-4 w-4" /> },
        { label: "首页", href: "/", icon: <Home className="h-4 w-4" /> },
      ]}
    >
      <BatchFactoryClient />
    </DashboardShell>
  );
}
