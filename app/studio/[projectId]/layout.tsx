import { notFound } from "next/navigation";
import { Cog, FolderKanban, Home } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StepProgress } from "@/components/wizard/step-progress";
import { getProject } from "@/lib/drama/store";
import { STEP_LABEL } from "@/lib/drama/state-machine";

export const dynamic = "force-dynamic";

export default async function StudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  return (
    <DashboardShell
      title={project.title}
      subtitle={`${project.id} · 当前阶段：${STEP_LABEL[project.state.currentStep]}`}
      nav={[
        { label: "首页", href: "/", icon: <Home className="h-4 w-4" /> },
        { label: "项目列表", href: "/studio", icon: <FolderKanban className="h-4 w-4" /> },
        { label: "模型设置", href: "/settings/models", icon: <Cog className="h-4 w-4" /> },
      ]}
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <StepProgress projectId={project.id} currentStep={project.state.currentStep} />
        {children}
      </div>
    </DashboardShell>
  );
}
