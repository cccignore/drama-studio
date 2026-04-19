export function extractEpisodeOutline(directoryMd: string, episodeIndex: number): string {
  const lines = directoryMd.split(/\r?\n/);
  const startRe = new RegExp(`^###\\s+第?\\s*${episodeIndex}\\s*集\\s*[·•\\-]`);
  const nextRe = /^(###\s+第?\s*\d+\s*集|##\s+)/;
  let capture = false;
  const out: string[] = [];
  for (const line of lines) {
    if (capture) {
      if (nextRe.test(line)) break;
      out.push(line);
      continue;
    }
    if (startRe.test(line)) {
      capture = true;
      out.push(line);
    }
  }
  return out.join("\n").trim();
}
