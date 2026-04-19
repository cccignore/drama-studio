/**
 * SSE 工具：createSSEStream(handler) 返回符合 Next Route Handler 的 Response。
 * handler 里调用 send({ type, ... }) 即可推事件。
 */

export type SSEEvent = Record<string, unknown> & { type: string };

export type SSESender = (event: SSEEvent) => void;

export interface SSEHandlerContext {
  send: SSESender;
  signal: AbortSignal;
}

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function createSSEResponse(
  handler: (ctx: SSEHandlerContext) => Promise<void> | void,
  init?: { signal?: AbortSignal }
): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(streamCtrl) {
      const send: SSESender = (event) => {
        try {
          streamCtrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // swallow: stream may be closed
        }
      };

      // keep-alive 心跳，避免某些代理 buffer
      const heartbeat = setInterval(() => {
        try {
          streamCtrl.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      try {
        await handler({ send, signal: controller.signal });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg, code: "handler_crashed" });
      } finally {
        clearInterval(heartbeat);
        try {
          streamCtrl.close();
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
