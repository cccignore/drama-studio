import { notFound } from "next/navigation";
import { Cog, FolderKanban, Home } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageTransition } from "@/components/layout/page-transition";
import { StepProgress } from "@/components/wizard/step-progress";
import { ProjectControlsPanel } from "@/components/drama/project-controls-panel";
import { ArtifactIOBar } from "@/components/drama/artifact-io-bar";
import { getProject } from "@/lib/drama/store";
import { repairProjectProgress } from "@/lib/drama/progress";
import { deriveMaxAccessibleStep, STEP_LABEL } from "@/lib/drama/state-machine";
import { getEpisodeIndices, getReviewIndices } from "@/lib/drama/artifacts";

export const dynamic = "force-dynamic";

export default async function StudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const found = getProject(projectId);
  if (!found) notFound();
  const project = repairProjectProgress(found);
  const writtenEpisodes = getEpisodeIndices(project.id).length;
  const reviewedEpisodes = getReviewIndices(project.id).length;
  const maxAccessibleStep = deriveMaxAccessibleStep(project.state, {
    writtenEpisodes,
    reviewedEpisodes,
  });
  const subtitleParts = [`${project.id} · 当前阶段：${STEP_LABEL[project.state.currentStep]}`];
  if (writtenEpisodes > 0 && project.state.currentStep === "episode") {
    subtitleParts.push(`已写 ${writtenEpisodes} 集，可进入复盘/导出`);
  } else if (reviewedEpisodes > 0 && project.state.currentStep === "review") {
    subtitleParts.push(`已复盘 ${reviewedEpisodes} 集`);
  }
  if (project.state.multiAgentEnabled && project.state.multiAgentCommands?.length) {
    subtitleParts.push(`Multi-agent：${project.state.multiAgentCommands.join(" / ")}`);
  }

  return (
    <DashboardShell
      title={project.title}
      subtitle={subtitleParts.join(" · ")}
      headerRight={
        <ProjectControlsPanel
          projectId={project.id}
          initialMode={project.state.mode}
          initialMultiAgentEnabled={project.state.multiAgentEnabled}
          initialMultiAgentCommands={project.state.multiAgentCommands}
        />
      }
      nav={[
        { label: "首页", href: "/", icon: <Home className="h-4 w-4" /> },
        { label: "项目列表", href: "/studio", icon: <FolderKanban className="h-4 w-4" /> },
        { label: "模型设置", href: "/settings/models", icon: <Cog className="h-4 w-4" /> },
      ]}
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <StepProgress
          projectId={project.id}
          currentStep={project.state.currentStep}
          maxAccessibleStep={maxAccessibleStep}
        />
        <ArtifactIOBar projectId={project.id} />
        <PageTransition>{children}</PageTransition>
      </div>
    </DashboardShell>
  );
}
