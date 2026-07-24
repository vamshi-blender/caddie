# Migration Plan: Donna (workupdate) → Caddie Web App

Status: **Planning only — no code has been migrated yet.**
Reference source: `D:\vamshi\Node_Projects\workupdate` (read-only; unmodified during this planning pass).
Target: `D:\vamshi\POC\caddie` (fresh Next.js 16 / React 19 / TypeScript / Tailwind v4 app).

This document inventories what exists in `workupdate`, decides what is reusable for a standalone Caddie web app, and lays out an ordered, low-risk migration. It does not include PMS tools/auth/storage, Chrome-extension packaging, or realtime voice — those are explicitly out of scope per the objective.

---

## 1. Current-state architecture summary

`workupdate` is **one git repository containing two independently-built codebases**:

1. **Backend** — lives at the repo root as a Next.js 16.2.7 App Router project (`app/api/**/route.ts`). There is no real frontend here today; `app/page.tsx`/`layout.tsx`/`globals.css` are untouched `create-next-app` scaffolding. This project's `tsconfig.json` explicitly excludes `chrome-extension/`, confirming the two are separate builds sharing a repo.
2. **Frontend** — `chrome-extension/`, a separate Vite + `@crxjs/vite-plugin` MV3 Chrome extension (React 19, plain CSS, no state library), with three entry surfaces (`popup`, `sidepanel`, `popout`) that all mount the same `App.tsx` → `ChatLayout.tsx`.

The two communicate over **cross-origin HTTP**: the extension calls a configurable backend URL (default `http://localhost:3000`) using plain `fetch`, because the extension currently lets a user store an arbitrary backend origin in `chrome.storage.sync`. This is why the backend today has permissive, hand-rolled CORS (`Access-Control-Allow-Origin: *`) and **no authentication at all** — both are explicitly documented in-repo as deliberate, temporary dev-phase relaxations (commit `409614d`).

Core chat flow: the backend defines a single OpenAI **Agents SDK** `Agent` ("Donna") with PMS-specific tools and instructions. Chat requests stream back to the client as **NDJSON over a raw `ReadableStream`** (not SSE, not WebSocket). Tool calls that require browser-side execution or user consent pause the run via the Agents SDK's **approval/interruption** mechanism; the paused `RunState` is serialized and held server-side in an **in-memory `Map`** (`pending-runs.ts`, 10-minute TTL) keyed by a `runId`, and the client resumes it via a second endpoint after approving/rejecting. Conversation history itself is not stored by this app at all — it's delegated entirely to OpenAI's **Conversations API** (`openai.conversations.create`), with the extension only persisting conversation *metadata* (titles, pin state, per-message UI state) client-side in `chrome.storage.local`.

Verified against current OpenAI documentation (see §references): the Conversations API usage, the `run(agent, input, {stream:true})` streaming loop, and the `interruptions` / `state.approve()` / `state.reject()` / resume-from-`state` approval lifecycle in `workupdate` all match the officially documented, current Agents SDK behavior — no drift found. This pattern is safe to carry forward as-is.

---

## 2. In-scope / out-of-scope inventory

### In scope (migrate/adapt)

**UI (`chrome-extension/src/`)**
- `components/MessageList.tsx` + `.css` — message rendering, Markdown/KaTeX/Mermaid, tool work-log, approval card UI
- `components/Composer.tsx` + `.css` — text input, send/stop, dictation + waveform
- `components/Greeting.tsx` + `.css` — empty-state greeting
- `components/Sidebar.tsx` + `.css` — conversation list, search, theme toggle
- `components/ChatLayout.tsx` + `.css` — orchestrator (state machine)
- `components/VoiceScreen.tsx`, `VoiceTranscript.tsx` + `.css` — voice UI shells (kept as dormant/optional; realtime voice itself is out of scope per objective, but UI is cheap to retain for later)
- `api/protocol.ts` — shared `ChatStreamEvent` types
- `api/chat.ts` — streaming/resume/title/delete client
- `api/transcriptions.ts` — dictation transcription client
- `api/chatSearch.ts` — local search (adapt to new storage)
- `api/chatStorage.ts` — storage *shape*/migration logic (swap backend)
- `theme.ts`, `design-system.css`, `base.css` — theming
- Icons (`@hugeicons/*`), Markdown/Mermaid/KaTeX stack, MiniSearch — all as npm deps

**Backend (`lib/agents/`, `app/api/`)**
- `lib/agents/donna.ts` — Agent definition pattern (strip PMS tools/instructions)
- `lib/agents/stream-run.ts` — Agents-SDK-run → NDJSON translator
- `lib/agents/protocol.ts` — shared event types (canonical copy)
- `lib/agents/pending-runs.ts` — approval pending-run pattern (rewrite store backend)
- `lib/agents/server-time.ts` — generic example tool
- `app/api/chat/route.ts`, `app/api/chat/resume/route.ts` — streaming + resume endpoints
- `app/api/conversations/route.ts` — delete conversation
- `app/api/conversations/title/route.ts` — title generation
- `app/api/transcriptions/route.ts` — Whisper-family transcription

### Out of scope (exclude entirely)

- `chrome-extension/manifest.config.ts`, `vite.config.ts`, `background.ts`, `mode.ts`, `popup/sidepanel/popout.html+tsx`, `@crxjs/vite-plugin`, `@types/chrome`
- `chrome-extension/src/api/pmsAuth.ts`, `pmsSession.ts`, `clientTools.ts` (PMS + page-context tool)
- `chrome-extension/src/pms/**` (types, bundle, derive, executor, primitives)
- `chrome-extension/src/components/PmsSessionGate.tsx` + `.css`
- `lib/pms/**` (types, schema, bundle, manifests/leave-application.ts)
- `app/api/pms/manifests/route.ts`
- PMS tool definitions inside `lib/agents/donna.ts` (`pmsLookup`, `submitPmsAction`, `listPmsCapabilities`)
- `lib/http/cors.ts` (wildcard CORS, no-auth design — rewritten, not reused)
- `app/api/realtime/session/route.ts`, `app/api/realtime/tools/route.ts`, `chrome-extension/src/realtime/**` (realtime voice — not needed per objective)
- `chrome-extension/src/api/backend.ts` (runtime-editable backend URL via `chrome.storage.sync` — dev-only escape hatch, not applicable to a same-origin web app)
- All `.git`, `.next`, `node_modules`, `dist/`, lockfiles, `.env.local` in `workupdate`

---

## 3. Source → target mapping

| Source (workupdate) | Target (caddie) | Treatment |
|---|---|---|
| `chrome-extension/src/components/MessageList.tsx/.css` | `app/(chat)/_components/MessageList.tsx/.module.css` (or plain `.css`) | REUSE |
| `chrome-extension/src/components/Composer.tsx/.css` | `app/(chat)/_components/Composer.tsx` | REUSE |
| `chrome-extension/src/components/Greeting.tsx/.css` | `app/(chat)/_components/Greeting.tsx` | REUSE |
| `chrome-extension/src/components/Sidebar.tsx/.css` | `app/(chat)/_components/Sidebar.tsx` | ADAPT (storage + theme persistence) |
| `chrome-extension/src/components/ChatLayout.tsx/.css` | `app/(chat)/_components/ChatLayout.tsx` | ADAPT (strip mode-switching, PMS user call, chrome APIs) |
| `chrome-extension/src/components/VoiceScreen.tsx`, `VoiceTranscript.tsx` | `app/(chat)/_components/voice/*` | ADAPT, but wired to a stub/disabled feature flag (voice deferred) |
| `chrome-extension/src/theme.ts` | `lib/theme.ts` | ADAPT (localStorage/cookie instead of `chrome.storage.sync`) |
| `chrome-extension/src/design-system.css`, `base.css` | `app/globals.css` (or `styles/design-system.css` imported from layout) | REUSE |
| `chrome-extension/src/api/protocol.ts` | `lib/agents/protocol.ts` (shared, imported by both client and server — no more hand-duplication) | REUSE, deduplicated |
| `chrome-extension/src/api/chat.ts` | `lib/api/chat-client.ts` | REUSE (swap `getBackendUrl()` for same-origin relative paths / `NEXT_PUBLIC_API_BASE_URL`) |
| `chrome-extension/src/api/transcriptions.ts` | `lib/api/transcriptions-client.ts` | REUSE |
| `chrome-extension/src/api/chatSearch.ts` | `lib/chat-search.ts` | REUSE |
| `chrome-extension/src/api/chatStorage.ts` | `lib/chat-storage.ts` (client) + new server persistence (Phase 4) | ADAPT |
| `lib/agents/donna.ts` (backend) | `lib/agents/caddie-agent.ts` | REWRITE instructions/persona; strip PMS tools; keep generic tool(s) + approval pattern |
| `lib/agents/stream-run.ts` | `lib/agents/stream-run.ts` | REUSE (rename Donna→Caddie references, drop PMS-only event fields) |
| `lib/agents/protocol.ts` (backend) | `lib/agents/protocol.ts` | REUSE — becomes the **single canonical copy**, imported directly by UI code in the same project (eliminates the hand-duplication noted in workupdate) |
| `lib/agents/pending-runs.ts` | `lib/agents/pending-runs.ts` | ADAPT now (keep in-memory Map for POC), flag for REWRITE later (durable store) |
| `lib/agents/server-time.ts` | `lib/agents/tools/server-time.ts` | REUSE |
| `app/api/chat/route.ts` | `app/api/chat/route.ts` | ADAPT (drop PMS-specific validation, rewrite CORS/auth) |
| `app/api/chat/resume/route.ts` | `app/api/chat/resume/route.ts` | ADAPT (same) |
| `app/api/conversations/route.ts` | `app/api/conversations/route.ts` | REUSE |
| `app/api/conversations/title/route.ts` | `app/api/conversations/title/route.ts` | REUSE |
| `app/api/transcriptions/route.ts` | `app/api/transcriptions/route.ts` | REUSE |
| `package.json` deps (non-PMS, non-Chrome) | `caddie/package.json` | REUSE as npm dependencies |

---

## 4. Chrome-specific dependencies to remove or replace

| Chrome API / package | Used for | Web replacement |
|---|---|---|
| `chrome.storage.sync` / `.local` | Theme, backend URL, chat history, display mode | `localStorage` (Phase 2) → server-side user settings/DB (later) |
| `chrome.runtime.getURL(...)` | Static asset paths (audio cues), extension origin lookup | Next.js `public/` static paths (`/audio/stream-start.ogg`) |
| `chrome.tabs`, `chrome.tabGroups`, `chrome.windows` | PMS session anchoring, popout window management | N/A — excluded (PMS + popout mode both out of scope) |
| `chrome.scripting.executeScript` | Reading PMS auth token / page context from another tab | N/A — excluded (no "other browser tab" concept in a web app) |
| `chrome.sidePanel`, `chrome.action` | Display-mode switching (popup/sidepanel/popout) | Responsive CSS layout — one page, no "modes" |
| `chrome.commands`, `chrome.runtime.onMessage` | Keyboard shortcut to open extension, cross-surface messaging | Standard `keydown` listener in-page (e.g. keep Ctrl+Shift+O "new chat" as a page-level shortcut) |
| `@crxjs/vite-plugin`, `@types/chrome`, MV3 `manifest.config.ts` | Extension build/packaging | Removed entirely — Next.js's own build pipeline |
| `manifest.json` permissions (`activeTab`, `scripting`, `sidePanel`, `tabGroups`, `tabs`, broad `host_permissions`) | Extension capabilities | N/A |

---

## 5. PMS / tool / auth / storage dependencies to exclude or decouple

| Component | Coupling | Disposition |
|---|---|---|
| `lib/pms/**`, `app/api/pms/manifests/route.ts` | Quixy-specific manifest system (hardcoded GUIDs, business rules) | EXCLUDE |
| `pmsLookup`, `submitPmsAction`, `listPmsCapabilities` tools in `donna.ts` | PMS domain tools | EXCLUDE |
| `chrome-extension/src/api/pmsAuth.ts`, `pmsSession.ts` | Chrome-tab-based OIDC token extraction + tab-group session anchoring | EXCLUDE |
| `chrome-extension/src/pms/**` | Client-side PMS manifest interpreter | EXCLUDE |
| `chrome-extension/src/components/PmsSessionGate.tsx` | PMS-login gating screen | EXCLUDE — Caddie needs its own auth gate later, built from scratch |
| `chrome-extension/src/api/clientTools.ts` → `executePageContext` | Reads active browser tab via `chrome.scripting` | EXCLUDE (no "current tab" concept in a standalone web app) |
| `lib/http/cors.ts` (wildcard, no origin check) | Necessary only because client was a different origin (`chrome-extension://…`) with no fixed identity | EXCLUDE — Caddie's UI and API are confirmed same-origin with no other origin planned; no CORS module, `OPTIONS` handlers, or `corsHeaders()`/`getAllowedOrigin()` calls are needed anywhere. Skip this concept entirely rather than "rewriting" it. |
| No authentication anywhere in `workupdate` backend | Documented, intentional dev-phase gap | Caddie **must** add real auth before any non-local deployment — this is a hard requirement, not optional cleanup |
| `chrome-extension/src/api/chatStorage.ts` (chrome.storage.local) | Only persistence layer that exists; no server-side conversation store at all | ADAPT client-side (localStorage) now; design a real DB-backed conversation store in a later phase — reuse the `StoredChat`/`StoredChatStore` *shape* as the reference schema |
| `chrome-extension/src/api/backend.ts` | Runtime-configurable, cross-origin backend URL (dev-only escape hatch, driving the permissive CORS/manifest `host_permissions`) | EXCLUDE — same-origin app has a fixed backend |

**Extension points for future work** (see §9) replace all of the above: a pluggable tool registry, a pluggable auth/session provider, and a pluggable conversation-storage interface.

---

## 6. Recommended target folder structure

```
caddie/
├── app/
│   ├── layout.tsx                     # root layout: theme provider, fonts
│   ├── page.tsx                       # renders <ChatLayout /> (single-page chat app)
│   ├── globals.css                    # base.css + design-system.css merged/imported
│   └── api/
│       ├── chat/
│       │   ├── route.ts               # POST /api/chat (NDJSON stream)
│       │   └── resume/route.ts        # POST /api/chat/resume
│       ├── conversations/
│       │   ├── route.ts               # DELETE /api/conversations
│       │   └── title/route.ts         # POST /api/conversations/title
│       └── transcriptions/route.ts    # POST /api/transcriptions
├── components/
│   ├── chat/
│   │   ├── ChatLayout.tsx
│   │   ├── MessageList.tsx
│   │   ├── Composer.tsx
│   │   ├── Greeting.tsx
│   │   └── Sidebar.tsx
│   └── voice/                         # dormant/optional, behind a feature flag
│       ├── VoiceScreen.tsx
│       └── VoiceTranscript.tsx
├── lib/
│   ├── agents/
│   │   ├── caddie-agent.ts            # Agent definition + instructions (Caddie persona)
│   │   ├── stream-run.ts              # Agents SDK run → NDJSON event translator
│   │   ├── protocol.ts                # ChatStreamEvent union — SINGLE canonical copy
│   │   ├── pending-runs.ts            # approval pending-run store (in-memory now)
│   │   └── tools/
│   │       ├── server-time.ts         # generic reusable example tool
│   │       └── index.ts               # tool registry — extension point (see §9)
│   ├── api/
│   │   ├── chat-client.ts             # fetch/stream client (was chrome-extension/src/api/chat.ts)
│   │   └── transcriptions-client.ts
│   ├── chat-storage.ts                # client-side persistence (localStorage now)
│   ├── chat-search.ts                 # MiniSearch wrapper
│   └── theme.ts                       # localStorage-based theme persistence
├── styles/
│   └── design-system.css              # CSS custom properties (design tokens)
├── public/
│   ├── audio/                         # stream-start.ogg, stream-end.ogg (if voice kept)
│   └── icons/
├── docs/                              # EXISTING — preserved untouched
├── scripts/                           # EXISTING — preserved untouched (Oracle tools)
└── AGENTS.md, CLAUDE.md               # EXISTING — preserved untouched
```

No files under `docs/` or `scripts/` are touched by this migration; the new app code lives entirely under `app/`, `components/`, `lib/`, `styles/`, `public/`.

---

## 7. Required packages and environment variables

### Packages to add

```
openai              (^6.x — official SDK; Conversations, Responses, audio.transcriptions)
@openai/agents      (^0.13.x — Agent, tool, run, RunState)
zod                 (^4.x — tool parameter schemas, request validation)
react-markdown      (^10.x)
remark-gfm
remark-math
rehype-katex
rehype-raw
rehype-sanitize
katex
mermaid             (^11.x, dynamically imported)
minisearch          (^7.x)
@hugeicons/react
@hugeicons/core-free-icons
```

Tailwind v4 is already present in `caddie` — the migrated UI uses hand-written CSS + CSS custom properties, not Tailwind classes, so both can coexist without conflict (Tailwind for any new Caddie-specific UI, the ported design-system CSS for chat components).

### Environment variables (names only — no values/secrets copied)

| Variable | Purpose | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Server-only OpenAI credential | Required; never exposed to client |
| `OPENAI_MODEL` | Main chat/agent model | Confirm real model name at implementation time — `workupdate`'s fallback (`gpt-5.6`) should be validated, not blindly copied |
| `OPENAI_TITLE_MODEL` | Cheaper/faster title-generation model | Same caveat as above |
Not carried forward: `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE` (realtime voice out of scope). Also not carried forward: `NEXT_PUBLIC_API_BASE_URL`/`ALLOWED_ORIGINS`-style variables — Caddie's UI and API are confirmed same-origin only, so there is no configurable backend URL and no CORS allowlist to configure (see §5, §9).

---

## 8. Ordered migration phases with validation criteria

### Phase 0 — Scaffolding & shared protocol
- Add required packages to `caddie/package.json`.
- Create `lib/agents/protocol.ts` as the single canonical `ChatStreamEvent`/`ToolApprovalRequest`/`AssistantPhase` type module.
- **Validation:** `tsc --noEmit` passes with the new types; no runtime behavior yet.

### Phase 1 — Backend core (agent, streaming, resume)
- Port `stream-run.ts`, `pending-runs.ts`, `server-time.ts` tool, and a stripped-down `caddie-agent.ts` (generic instructions, no PMS tools, `server_time` tool only as a placeholder).
- Port `app/api/chat/route.ts`, `app/api/chat/resume/route.ts`, `app/api/conversations/route.ts`, `app/api/conversations/title/route.ts`, dropping all `getAllowedOrigin`/`corsHeaders`/`OPTIONS` handling — same-origin requests need none of it.
- **Validation:** Using `curl`/Postman against `/api/chat` returns a valid NDJSON stream of `ChatStreamEvent`s for a simple prompt with no tool calls; a forced approval-required tool call correctly pauses (`response.paused`) and resumes via `/api/chat/resume`.

### Phase 2 — UI shell (chat experience)
- Port `MessageList`, `Composer`, `Greeting`, `Sidebar`, `ChatLayout` into `components/chat/`, replacing `chrome.storage.*` with `localStorage` in `lib/chat-storage.ts` and `lib/theme.ts`.
- Remove display-mode switching entirely; implement pure responsive CSS (single layout that adapts sidebar behavior at breakpoints instead of popup/sidepanel/popout).
- Wire `app/page.tsx` to render `ChatLayout`, calling the Phase 1 API routes via `lib/api/chat-client.ts` (same-origin relative fetches, no configurable backend URL).
- **Validation:** Manually exercise the app in a browser — send a message, see streamed tokens render, see Markdown/KaTeX/Mermaid render correctly, resize the window and confirm responsive behavior, toggle theme and confirm persistence across reload, confirm approval card renders and resumes correctly for a test tool.

### Phase 3 — Transcription & polish
- Port `app/api/transcriptions/route.ts` and the Composer's `MediaRecorder`/waveform dictation flow.
- Port `chatSearch.ts` for sidebar search.
- Decide on voice UI: keep `VoiceScreen`/`VoiceTranscript` components dormant behind a feature flag (no Realtime wiring) or omit entirely — **decision needed, see §11**.
- **Validation:** Mic permission prompt appears, recording produces a transcribed message in the composer; sidebar search filters conversations correctly.

### Phase 4 — Extension points for future work
- Define the tool-registry interface (`lib/agents/tools/index.ts`) so future Caddie tools plug in without touching `stream-run.ts`.
- Define an auth middleware seam in the API routes (currently a no-op) so a real auth provider can be dropped in later.
- Define a storage interface (`ConversationStore`) so `chat-storage.ts` can be swapped from `localStorage` to a server-backed DB without UI changes.
- **Validation:** Add one trivial dummy tool and one dummy storage backend purely to prove the seams work end-to-end, then remove them (or keep as documented examples).

Each phase should be validated before starting the next; Phase 1 and Phase 2 can proceed in parallel once Phase 0 is done, since the protocol module decouples them.

---

## 9. Clean extension points for future tools, auth, and storage

- **Tools:** `lib/agents/tools/index.ts` exports an array consumed by `caddie-agent.ts`'s `tools:` field. Adding a Caddie-specific tool means adding one file + one array entry — no changes to `stream-run.ts`, `protocol.ts`, or UI rendering (which already generically renders any `tool.started`/`tool.completed`/`tool_approval.request` event by tool name/description, not by hardcoded PMS knowledge, per the workupdate inventory of `MessageList.tsx`'s `AgentWorkLogView`).
- **Auth:** Introduce a single `getCurrentUser(request)` seam called from each route handler. Phase 1–3 implement it as a no-op/anonymous stub; a later phase swaps in real session/auth logic (cookie-based, OAuth, etc.) without touching the streaming/resume/tool logic. Since Caddie is same-origin only, this seam can read cookies/headers directly with no CORS layer involved.
- **Storage:** Define a `ConversationStore` interface (create/list/rename/pin/delete/get-messages) implemented first by a `localStorage`-backed class, later by a DB-backed class — `Sidebar.tsx`/`ChatLayout.tsx` depend only on the interface.
- **Pending-run store:** `pending-runs.ts`'s `Map`-based implementation should be wrapped behind a small interface (`get`/`set`/`delete` by `runId`) from day one, so swapping to Redis/DB later (needed for any multi-instance deployment) doesn't touch the route handlers.

---

## 10. Risks and unresolved decisions

- **In-memory pending-run store** does not survive server restarts or multiple instances; fine for a single-instance POC, a real blocker for production/serverless. Flagged in §9 as an interface to design around now even though the in-memory implementation ships first.
- **No conversation metadata persistence server-side** exists anywhere in `workupdate` — titles/pins/history live only in the browser. If Caddie needs cross-device history, a server-side store is new work, not a port.
- **Model name fallbacks** (`gpt-5.6`, `gpt-5.6-luna` in workupdate) should be verified against real, currently-available OpenAI model names before use — they may be internal placeholders or environment-specific; do not copy them assuming correctness.
- **No authentication today** — this is a documented, intentional gap in workupdate for dev convenience. Caddie must decide its auth approach before any shared/non-local deployment; this migration only prepares the seam, it does not implement auth.
- **Hand-duplicated protocol types** in workupdate (`api/protocol.ts` vs `lib/agents/protocol.ts`, similarly `pms/types.ts`) are resolved for free in Caddie by having UI and API in one project — no decision needed, just confirm the single canonical file is actually imported from both sides rather than re-copied out of habit.
- **Voice/dictation scope**: transcription (Whisper-style, via Composer) is a from-workupdate feature that's *not* the excluded "realtime voice" — confirm this distinction is understood before Phase 3, since the two are easy to conflate (see §11 decision).
- **Design token reuse**: `design-system.css` uses `data-theme="light"` toggling; confirm this doesn't collide with Tailwind v4's own dark-mode conventions already scaffolded in `caddie`.
- **No cross-origin/CORS support** — confirmed as a non-goal (Caddie's UI and API are same-origin only, no other origin planned). `lib/http/cors.ts` and all per-route `OPTIONS` handlers are excluded outright, not rewritten. If this assumption ever changes (e.g. a separate frontend deployment), CORS handling would need to be added back from scratch — flag this as a real architectural change, not a config toggle, if it comes up later.

---

## 11. Decisions needed before migration starts

1. **Voice UI scope:** Keep `VoiceScreen`/`VoiceTranscript` components ported-but-dormant (cheap, ~2 files) for future realtime work, or omit entirely until actually needed? (Transcription/dictation in the Composer is in scope regardless — this question is only about the full voice-mode overlay.)
2. **Model names:** What are the actual OpenAI model identifiers Caddie should target for chat and title generation? (Do not default to workupdate's fallback strings without verification.)
3. **Conversation persistence:** Is client-only (`localStorage`) persistence acceptable for the initial Caddie release, or does Phase 1 need to include a minimal server-side conversation-metadata store (even a simple one) from the start?
4. **Auth approach:** What authentication mechanism will Caddie use, and when — Phase 1 (blocking same-origin deploy) or deferred to a later milestone with the app running local-only/behind a private network in the meantime?

~~5. CORS/multi-origin need~~ — **Resolved:** confirmed same-origin only, no other origin planned. No CORS module, allowlist, or `ALLOWED_ORIGINS` variable is included anywhere in this plan.

---

## 12. Final checklist — reuse / adapt / rewrite / exclude

### REUSE (port with only naming/import-path changes)
- `chrome-extension/src/components/MessageList.tsx` + `.css`
- `chrome-extension/src/components/Composer.tsx` + `.css`
- `chrome-extension/src/components/Greeting.tsx` + `.css`
- `chrome-extension/src/components/VoiceScreen.tsx`, `VoiceTranscript.tsx` + `.css` (pending §11 decision)
- `chrome-extension/src/api/protocol.ts` → `lib/agents/protocol.ts` (canonical)
- `chrome-extension/src/api/chat.ts` → `lib/api/chat-client.ts`
- `chrome-extension/src/api/transcriptions.ts`
- `chrome-extension/src/api/chatSearch.ts`
- `chrome-extension/src/design-system.css`, `base.css`
- `public/audio/*`, `public/icons/*` (pending §11 voice decision)
- `lib/agents/stream-run.ts`
- `lib/agents/protocol.ts` (backend copy — becomes canonical)
- `lib/agents/server-time.ts`
- `app/api/conversations/route.ts`
- `app/api/conversations/title/route.ts`
- `app/api/transcriptions/route.ts`
- Non-PMS, non-Chrome npm dependencies (see §7)

### ADAPT (small, scoped changes)
- `chrome-extension/src/components/Sidebar.tsx` + `.css` — storage/theme calls
- `chrome-extension/src/components/ChatLayout.tsx` + `.css` — strip mode-switching + PMS user lookup
- `chrome-extension/src/api/chatStorage.ts` — swap `chrome.storage` for `localStorage`
- `chrome-extension/src/theme.ts` — swap `chrome.storage.sync` for `localStorage`
- `lib/agents/donna.ts` → `lib/agents/caddie-agent.ts` — strip PMS tools/instructions, rename persona
- `lib/agents/pending-runs.ts` — wrap in an interface (keep in-memory impl for now)
- `app/api/chat/route.ts`, `app/api/chat/resume/route.ts` — strip PMS references, new CORS/auth seam

### REWRITE (concept kept, implementation replaced)
- `chrome-extension/src/App.tsx` — outer auth-gating shell (new auth, not PMS)
- `chrome-extension/src/api/backend.ts` → same-origin relative fetches (no configurable backend URL at all, since no other origin is planned)

### EXCLUDE (do not migrate)
- `chrome-extension/manifest.config.ts`, `vite.config.ts`, `background.ts`, `mode.ts`
- `chrome-extension/src/popup.html/.tsx`, `sidepanel.html/.tsx`, `popout.html/.tsx`
- `chrome-extension/src/components/PmsSessionGate.tsx` + `.css`
- `chrome-extension/src/api/pmsAuth.ts`, `pmsSession.ts`, `clientTools.ts`
- `chrome-extension/src/pms/**` (all 5 files)
- `chrome-extension/src/realtime/**` (unless §11 decision changes this)
- `lib/pms/**`, `app/api/pms/manifests/route.ts`
- PMS tool definitions inside `lib/agents/donna.ts`
- `app/api/realtime/session/route.ts`, `app/api/realtime/tools/route.ts`
- `@crxjs/vite-plugin`, `@types/chrome` devDependencies
- `lib/http/cors.ts` and all per-route `OPTIONS`/`getAllowedOrigin`/`corsHeaders` handling — no cross-origin access is planned, so this concept is dropped entirely rather than ported in any form
- `.git`, `.next`, `node_modules`, `dist/`, all lockfiles, `.env.local` from workupdate

---

## Recommended architecture (summary)

A single Next.js 16 App Router project (this `caddie` repo) hosting both the chat UI and the Agents-SDK backend at the same origin. No cross-origin access is planned, so unlike workupdate there is **no CORS layer at all** — no `lib/http/cors.ts`, no per-route `OPTIONS` handlers, no allowlist env var. The UI is a straight port of the chrome-extension's chat components (message list, composer, sidebar, greeting) with all `chrome.*` calls replaced by `localStorage` and standard browser APIs, and all Chrome "display modes" collapsed into one responsive layout. The backend is a straight port of the Agents-SDK streaming/approval/conversation-title pattern with all PMS tools and instructions stripped out, leaving a clean `tools: []` seam, a stubbed auth seam, and an interface-wrapped pending-run store and conversation-storage layer — all designed so Caddie's real tools, authentication, and persistence can be dropped in later without touching the ported core.

## Decisions needed before implementation begins

See §11 in full; in short: (1) voice UI scope, (2) real OpenAI model names, (3) client-only vs. server-side conversation persistence for v1, (4) auth mechanism and timing. (Cross-origin/CORS support is resolved: not needed — same-origin only.)
