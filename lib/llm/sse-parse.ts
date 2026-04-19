/**
 * 解析上游 LLM 返回的 SSE 流：按 `data: <json>\n\n` 分帧。
 * 返回 async iterator，每个元素是一条 data 字符串（原始，不 parse）。
 */
export async function* iterSSELines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const rawEvent = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLines = rawEvent
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
