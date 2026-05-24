import { AgentRunStoppedError, runAgent } from "@/lib/agent/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    sessionId?: string;
    resumeSessionAt?: string;
  };

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const abortAgent = () => abortController.abort();

  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener("abort", abortAgent, { once: true });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const send = (event: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          isClosed = true;
          abortController.abort();
        }
      };

      try {
        send({ type: "ack", receivedAt: new Date().toISOString() });

        const response = await runAgent({
          prompt: body.prompt ?? "",
          sessionId: body.sessionId,
          resumeSessionAt: body.resumeSessionAt,
          abortSignal: abortController.signal,
          onStream: async (event) => send(event),
        });

        send({
          type: "done",
          sessionId: response.sessionId,
          messages: response.messages,
          result: {
            subtype: response.result.subtype,
            totalCostUsd: response.result.total_cost_usd,
            numTurns: response.result.num_turns,
          },
        });
      } catch (error) {
        if (error instanceof AgentRunStoppedError) {
          send({ type: "stopped", sessionId: body.sessionId });
          return;
        }

        send({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown agent error.",
        });
      } finally {
        request.signal.removeEventListener("abort", abortAgent);
        isClosed = true;
        try {
          controller.close();
        } catch {
          // The client may have already cancelled the stream.
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
