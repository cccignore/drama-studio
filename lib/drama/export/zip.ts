import JSZip from "jszip";
import type { ExportBundle } from "./collect";
import { renderProjectMarkdown } from "./md";
import { buildProjectDocx } from "./docx";

export async function buildProjectZip(bundle: ExportBundle): Promise<Uint8Array> {
  const zip = new JSZip();
  const safeName = (bundle.project.title || "drama").replace(/[\\/:*?"<>|]+/g, "_");

  zip.file("README.md", renderProjectMarkdown(bundle));

  const raw = zip.folder("raw");
  if (bundle.startCard) raw!.file("01-start-card.md", bundle.startCard.content);
  if (bundle.plan) raw!.file("02-plan.md", bundle.plan.content);
  if (bundle.characters) raw!.file("03-characters.md", bundle.characters.content);
  if (bundle.outline) raw!.file("04-outline.md", bundle.outline.content);

  const eps = zip.folder("episodes");
  for (const { index, artifact } of bundle.episodes) {
    eps!.file(`ep-${String(index).padStart(2, "0")}.md`, artifact.content);
  }

  const reviews = zip.folder("reviews");
  for (const { index, artifact } of bundle.reviews) {
    reviews!.file(`review-${String(index).padStart(2, "0")}.json`, artifact.content);
  }

  const docx = await buildProjectDocx(bundle);
  zip.file(`${safeName}.docx`, docx);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
