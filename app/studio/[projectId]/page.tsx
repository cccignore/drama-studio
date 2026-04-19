import { redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";

export const dynamic = "force-dynamic";

export default async function ProjectRoot({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  const step = project?.state.currentStep ?? "start";
  const target = step === "done" ? "export" : step;
  redirect(`/studio/${projectId}/${target}`);
}
