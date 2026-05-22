import type { HookCallback, HookEvent } from "@anthropic-ai/claude-agent-sdk";
import { recordAgentEvent } from "@/lib/agent/observability";

const auditHook: HookCallback = async (input, toolUseId) => {
  await recordAgentEvent({
    event: `hook.${input.hook_event_name}`,
    sessionId: input.session_id,
    messageId: toolUseId,
    data: {
      cwd: input.cwd,
      agentId: input.agent_id,
      agentType: input.agent_type,
    },
  });

  return {};
};

const denyToolUseHook: HookCallback = async (input, toolUseId) => {
  await recordAgentEvent({
    event: "hook.PreToolUse.denied",
    sessionId: input.session_id,
    messageId: toolUseId,
    data: { toolName: "tool_name" in input ? input.tool_name : undefined },
  });

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "This agent is currently configured as a tool-less chatbot. MCP tools will be added later.",
    },
  };
};

const injectRuntimeContextHook: HookCallback = async () => ({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext:
      "Runtime context: database and action MCP tools are not connected yet. Do not claim to query live data.",
  },
});

export const agentHooks: Partial<
  Record<HookEvent, { matcher?: string; hooks: HookCallback[]; timeout?: number }[]>
> = {
  SessionStart: [{ hooks: [auditHook] }],
  Setup: [{ hooks: [auditHook] }],
  UserPromptSubmit: [{ hooks: [auditHook, injectRuntimeContextHook] }],
  PreToolUse: [{ hooks: [denyToolUseHook] }],
  PostToolUse: [{ hooks: [auditHook] }],
  PostToolUseFailure: [{ hooks: [auditHook] }],
  PostToolBatch: [{ hooks: [auditHook] }],
  PermissionRequest: [{ hooks: [auditHook] }],
  PermissionDenied: [{ hooks: [auditHook] }],
  Notification: [{ hooks: [auditHook] }],
  Stop: [{ hooks: [auditHook] }],
  StopFailure: [{ hooks: [auditHook] }],
  PreCompact: [{ hooks: [auditHook] }],
  PostCompact: [{ hooks: [auditHook] }],
  ConfigChange: [{ hooks: [auditHook] }],
  InstructionsLoaded: [{ hooks: [auditHook] }],
  CwdChanged: [{ hooks: [auditHook] }],
  FileChanged: [{ hooks: [auditHook] }],
};
