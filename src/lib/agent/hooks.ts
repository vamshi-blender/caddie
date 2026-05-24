import type { HookCallback, HookEvent } from "@anthropic-ai/claude-agent-sdk";
import { CADDIE_MCP_SERVER_NAME } from "@/lib/agent/config";
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
  const toolName = "tool_name" in input ? input.tool_name : undefined;

  if (typeof toolName === "string" && toolName.startsWith(`mcp__${CADDIE_MCP_SERVER_NAME}__`)) {
    await recordAgentEvent({
      event: "hook.PreToolUse.allowed",
      sessionId: input.session_id,
      messageId: toolUseId,
      data: { toolName },
    });

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "Caddie MCP tools are allowed for database analysis.",
      },
    };
  }

  await recordAgentEvent({
    event: "hook.PreToolUse.denied",
    sessionId: input.session_id,
    messageId: toolUseId,
    data: { toolName },
  });

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "Only Caddie MCP tools are currently enabled for this agent.",
    },
  };
};

const injectRuntimeContextHook: HookCallback = async () => ({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext:
      "Runtime context: Caddie MCP database tools are connected. Use them only when live data, schema, or database-backed analysis is needed.",
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
