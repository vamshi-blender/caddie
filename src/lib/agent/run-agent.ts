import { query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_CWD, AGENT_ENV, AGENT_SYSTEM_PROMPT } from "@/lib/agent/config";
import { fileSessionStore } from "@/lib/agent/file-session-store";
import { agentHooks } from "@/lib/agent/hooks";
import { recordAgentEvent, recordSdkMessage } from "@/lib/agent/observability";
import {
  createSession,
  deleteSessionRecord,
  getAgentMessages,
  titleSessionFromPrompt,
  updateSession,
} from "@/lib/agent/session-index";

type RunAgentInput = {
  prompt: string;
  sessionId?: string;
  resumeSessionAt?: string;
  onStream?: (event: AgentStreamEvent) => Promise<void> | void;
};

const activeSessions = new Set<string>();

export type AgentStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "result"; sessionId: string; subtype: SDKResultMessage["subtype"] };

export async function runAgent(input: RunAgentInput) {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const isBranch = Boolean(input.sessionId && input.resumeSessionAt);
  const existingMessages =
    input.sessionId && !isBranch ? await getAgentMessages(input.sessionId).catch(() => []) : [];
  const shouldResume = Boolean(input.sessionId && !isBranch && existingMessages.length > 0);
  const sessionRecord = isBranch
    ? await createSession("Branching analysis")
    : input.sessionId
      ? await updateSession(input.sessionId, { status: "running" })
      : await createSession("New analysis");

  if (activeSessions.has(sessionRecord.id)) {
    throw new Error("This session is already running. Wait for the current response to finish.");
  }

  activeSessions.add(sessionRecord.id);
  await updateSession(sessionRecord.id, {
    status: "running",
    sourceSessionId: isBranch ? input.sessionId : undefined,
    sourceMessageId: input.resumeSessionAt,
  });

  let result: SDKResultMessage | undefined;
  const messages: SDKMessage[] = [];

  try {
    const stream = query({
      prompt,
      options: {
        sessionId: isBranch || shouldResume ? undefined : sessionRecord.id,
        resume: isBranch ? input.sessionId : shouldResume ? sessionRecord.id : undefined,
        resumeSessionAt: input.resumeSessionAt,
        forkSession: isBranch,
        title: sessionRecord.title,
        cwd: AGENT_CWD,
        env: AGENT_ENV,
        systemPrompt: AGENT_SYSTEM_PROMPT,
        settingSources: [],
        skills: [],
        tools: [],
        allowedTools: [],
        disallowedTools: [
          "Read",
          "Write",
          "Edit",
          "Bash",
          "Glob",
          "Grep",
          "WebSearch",
          "WebFetch",
          "Monitor",
          "Agent",
          "Skill",
          "AskUserQuestion",
          "TaskCreate",
          "TaskUpdate",
          "ToolSearch",
        ],
        mcpServers: {},
        strictMcpConfig: true,
        model: "haiku",
        permissionMode: "dontAsk",
        effort: "low",
        hooks: agentHooks,
        includeHookEvents: true,
        includePartialMessages: true,
        promptSuggestions: true,
        sessionStore: fileSessionStore,
        sessionStoreFlush: "eager",
        loadTimeoutMs: 30000,
        stderr: (data) => {
          void recordAgentEvent({
            event: "sdk.stderr",
            sessionId: sessionRecord.id,
            data: { data },
          });
        },
      },
    });

    for await (const message of stream) {
      messages.push(message);
      await recordSdkMessage(message);

      if (message.type === "system" && message.subtype === "init" && message.session_id !== sessionRecord.id) {
        await updateSession(message.session_id, {
          title: sessionRecord.title,
          status: "running",
          sourceSessionId: input.sessionId,
          sourceMessageId: input.resumeSessionAt,
        });
      }

      if (message.type === "system" && message.subtype === "init") {
        await input.onStream?.({ type: "session", sessionId: message.session_id });
      }

      if (message.type === "stream_event") {
        const text = extractPartialText(message.event);

        if (text) {
          await input.onStream?.({ type: "text", text });
        }
      }

      if (message.type === "result") {
        result = message;
        await input.onStream?.({
          type: "result",
          sessionId: message.session_id,
          subtype: message.subtype,
        });
      }
    }

    if (!result) {
      throw new Error("Agent finished without returning a result message.");
    }

    const finalSessionId = result.session_id;
    if (finalSessionId !== sessionRecord.id) {
      await deleteSessionRecord(sessionRecord.id);
    }

    await updateSession(finalSessionId, {
      status: result.subtype === "success" ? "idle" : "error",
      lastError: result.subtype === "success" ? undefined : result.subtype,
    });

    await titleSessionFromPrompt(finalSessionId, prompt);

    return {
      sessionId: finalSessionId,
      result,
      messages: await getAgentMessages(finalSessionId),
      events: messages.map((message) => ({
        type: message.type,
        subtype: "subtype" in message ? message.subtype : undefined,
      })),
    };
  } catch (error) {
    await updateSession(sessionRecord.id, {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    activeSessions.delete(sessionRecord.id);
  }
}

function extractPartialText(event: unknown) {
  if (!event || typeof event !== "object") return "";

  const record = event as {
    type?: string;
    delta?: { type?: string; text?: string };
  };

  if (record.type === "content_block_delta" && record.delta?.type === "text_delta") {
    return record.delta.text ?? "";
  }

  return "";
}
