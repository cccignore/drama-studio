import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Cog, FolderKanban, Terminal } from "lucide-react";
import { getProject } from "@/lib/drama/store";
import { RunPlayground } from "./run-playground";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  return (
    <DashboardShell
      title={project.title}
      subtitle={`项目 ${project.id} · 当前阶段：${project.state.currentStep}`}
      nav={[
        { label: "项目列表", href: "/studio", icon: <FolderKanban className="h-4 w-4" /> },
        { label: "模型设置", href: "/settings/models", icon: <Cog className="h-4 w-4" /> },
        { label: "首页", href: "/", icon: <Terminal className="h-4 w-4" /> },
      ]}
    >
      <RunPlayground projectId={project.id} />
    </DashboardShell>
  );
}
