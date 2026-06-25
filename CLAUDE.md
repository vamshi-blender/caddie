# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What Caddie is

Caddie is a conversational **data-analyst assistant for HMWSSB** (Hyderabad Metropolitan Water Supply and Sewerage Board) officers. A Next.js chat UI drives a Claude agent (via the **Claude Agent SDK**) whose *only* capability is calling a custom **MCP server** that runs read-only SQL against an on-prem **Oracle** database. Responses are localized for India (IST, INR, DD/MM/YYYY, metric, Indian digit grouping) — see the system prompt in [config.ts](src/lib/agent/config.ts).

## Commands

Package manager is **pnpm**. The app runs as up to three cooperating processes:

```bash
pnpm dev            # Next.js app (localhost:3000)
pnpm mcp:dev        # MCP HTTP server (scripts/mcp-server.mjs, port 8787)
pnpm ngrok:mcp      # ngrok tunnel exposing the MCP server publicly
pnpm dev:public     # all three concurrently (next + mcp + ngrok)

pnpm build          # next build
pnpm start          # next start (prod)
pnpm lint           # eslint
```

There is **no test suite**. The Oracle path can be exercised directly from PowerShell without the agent:

```powershell
. scripts/oracle-tools.ps1   # then:  oq "SELECT 1 FROM dual"
powershell -F scripts/oq.ps1 "SELECT COUNT(*) FROM SOME_TABLE"
```

## Required local setup

- **`scripts/oracle.config.local.json`** — copy from `oracle.config.example.json` and fill in `user`/`password`/`dsn`. The Python executor reads this; without it every query returns a `config_error`.
- **`.env`** — copy from `.env.example`. Needs `ANTHROPIC_API_KEY`. `CADDIE_MCP_URL` selects which MCP endpoint the agent talks to (defaults to `http://localhost:8787/mcp` in [config.ts](src/lib/agent/config.ts); the ngrok URL is the public alternative).
- **Python with `oracledb`** must be on PATH — the MCP server shells out to `python scripts/mcp_oracle_exec.py`.

## Architecture: request flow

1. **UI** ([AgentChat.tsx](src/components/AgentChat.tsx)) POSTs a prompt to **`/api/agent/chat`** ([route.ts](src/app/api/agent/chat/route.ts)), which returns a streamed **NDJSON** body (one JSON event per line, not SSE).
2. **`runAgent`** ([run-agent.ts](src/lib/agent/run-agent.ts)) calls the Claude Agent SDK `query()` and translates SDK `stream_event` messages into the UI's `AgentStreamEvent` union (`assistant_start` / `text` / `mcp_start` / `mcp_done` / `result` …). This file is the core of the system — session lifecycle, prewarming, abort handling, and event mapping all live here.
3. The agent's only allowed tools are `mcp__caddie-db__*`; **all built-in tools (Read/Write/Bash/Glob/WebSearch/…) are explicitly disallowed**, and a `PreToolUse` hook ([hooks.ts](src/lib/agent/hooks.ts)) hard-denies anything outside the Caddie MCP namespace as defense-in-depth.
4. The MCP tool `run_sql_query` ([mcp-server.mjs](scripts/mcp-server.mjs)) spawns **[mcp_oracle_exec.py](scripts/mcp_oracle_exec.py)**, which connects via `oracledb`, **enforces read-only** (only `SELECT`/`WITH`/`SHOW`/`DESCRIBE`/`EXPLAIN` pass; everything else is a `read_only_violation`), and returns structured JSON: rows, column metadata, timings, and typed errors.

### Agent configuration choices ([run-agent.ts](src/lib/agent/run-agent.ts) `buildAgentOptions`)
- `model: "haiku"`, `thinking: disabled`, `effort: "low"`, `permissionMode: "dontAsk"` — tuned for fast, cheap DB Q&A.
- **Prewarming**: `prewarmAgent()` keeps a warm SDK `startup()` query ready; `GET/POST /api/agent/sessions` trigger it so the first real prompt is fast. New (non-resume, non-branch) runs consume the warm agent.
- `settingSources: []` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` — the agent intentionally does **not** load this repo's CLAUDE.md/settings; its behavior comes only from the explicit `systemPrompt` + options.

### Sessions, branching, and persistence
All agent state lives under **`.agent-data/`** (gitignored), written by three modules:
- **[file-session-store.ts](src/lib/agent/file-session-store.ts)** — a custom SDK `SessionStore` writing transcripts to `.agent-data/session-store/<projectKey>/<sessionId>/transcript.jsonl`, with per-file locking and uuid-dedup on append.
- **[session-index.ts](src/lib/agent/session-index.ts)** — a separate human-facing index `.agent-data/sessions.json` (title/status/timestamps), merged with SDK session info for listing. Also rebuilds UI chat messages from transcript entries (including MCP tool-use/tool-result pairing).
- **[observability.ts](src/lib/agent/observability.ts)** — appends every SDK message and hook event to `.agent-data/logs/events.jsonl`.

**Two distinct session IDs exist**: `runAgent` creates a local record id, but the SDK assigns its own `session_id` on `init`. The code reconciles them mid-stream (deleting the throwaway record if they differ). "Branching" = resume an existing SDK session at a specific message (`forkSession`); "resume" = continue the same session. Be careful editing this reconciliation logic.

## Conventions & gotchas

- **Next.js 16 / React 19, App Router.** Per [AGENTS.md](AGENTS.md), this Next.js version has breaking changes vs. older knowledge — consult `node_modules/next/dist/docs/` before writing framework code.
- API routes that touch the agent set `runtime = "nodejs"` and `dynamic = "force-dynamic"` (they need Node APIs and must not be cached).
- The Python executor strips a single trailing `;` and a leading comment block before classifying the statement — keep that in mind if changing the read-only guard.
- `src/app/test1|test2|test3` and the chart panels under `src/components/charts/` (D3 / ECharts / Vega) are **standalone visualization experiments**, not part of the agent flow.
- `src/app/new/` is untracked WIP (an alternate AgentChat/page); don't assume it's wired in.
