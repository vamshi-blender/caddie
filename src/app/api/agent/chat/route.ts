import { runAgent } from "@/lib/agent/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    sessionId?: string;
    resumeSessionAt?: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({ type: "ack", receivedAt: new Date().toISOString() });

        const response = await runAgent({
          prompt: body.prompt ?? "",
          sessionId: body.sessionId,
          resumeSessionAt: body.resumeSessionAt,
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
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown agent error.",
        });
      } finally {
        controller.close();
      }
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
