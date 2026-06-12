# LLM-Authored Model Edits via MCP — Design

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-06-12
**Supersedes the read-only MCP slice:** extends `apps/server/src/mcp.ts` (currently 4 read-only tools) with write capability, and makes the HTTP server the single source of truth for all edits.

## Goal

Let an LLM agent (any MCP client — Claude Code, etc.) create and edit the architecture model — nodes and connections — through the Hyphae MCP server, while a human can have the web editor open at the same time and watch the agent's changes appear live. Guidance for the agent is carried entirely by MCP tool descriptions (no separate skill/prompt files in this slice).

Hyphae does **not** call the Claude API. The LLM lives in the MCP client; Hyphae only exposes MCP tools.

## Decisions (from brainstorming)

1. **Concurrency:** the web editor and the MCP client run together; changes must be live and must not clobber each other.
2. **Write surface:** granular CRUD tools (one operation per tool), not batch or whole-model replace.
3. **Validation:** strict — a write that would make the model *worse* (introduce a new validation issue) is rejected with the specific issues; the model stays as-valid-as-it-was.
4. **Guidance:** MCP tool descriptions only. Each description is prescriptive about *when* to call the tool and the profile/containment rules, since recent models reach for tools conservatively.

## Architecture (Approach A — server is the sole owner)

The HTTP server is the only process that touches `hyphae.json`. It holds the in-memory model plus a monotonic `version` (starts at 0), bumped on every successful mutation. Both writers — the web editor and the LLM via MCP — go through the same granular, validated endpoints. The MCP process is an HTTP client of the server (no file access).

```
  MCP client (LLM) ──stdio──> mcp.ts ──HTTP──┐
                                              ├─> HTTP server (single owner)
  Web editor (browser) ──HTTP + SSE──────────┘     - in-memory model + version
                                                    - validateModel (strict)
                                                    - atomic debounced save  -> hyphae.json
                                                    - SSE broadcast on change
```

### Responsibility boundaries (unchanged in spirit)

- `schema`: HTTP/React-free. Gains one pure helper (`newIssues`) and one lookup (`resolveProfile`).
- `server`: knows schema + filesystem + transport; owns the model, version, validation, and SSE.
- `mcp`: knows the schema types + the server's HTTP API. No file access.
- `web`: knows schema types + the HTTP API + SSE.

## Server

### `schema` additions (pure, unit-tested)

- `newIssues(prev: HyphaeModel, next: HyphaeModel, profile: Profile): Issue[]` — runs `validateModel` on both; returns issues present in `next` but not in `prev`, identity = `kind`+`ref`. This encodes the "never make it worse" rule: pre-existing issues in a loaded file don't block unrelated edits, but no op may add an issue.
- `resolveProfile(model: HyphaeModel): Profile` — returns the profile for `model.activeProfile` (`c4-backend` today; throws on unknown).

### `ModelStore` (gains version, mutations, subscriptions)

- `version: number` (starts 0), returned with reads and on every change.
- Private `commit(next)`: computes `newIssues(this.model, next, profile)`; if non-empty → `throw new ValidationError(issues)` (no state change); else replace model, `version++`, schedule debounced save, `notify()`.
- Mutation methods, each building `next` immutably then `commit`:
  - `addNode(input)` — id from input or `newId()`; `createdAt/updatedAt` set; defaults via `NodeSchema.parse`; appended.
  - `updateNode(id, patch)` — `NotFoundError` if absent; merge patch + `updatedAt`.
  - `deleteNode(id)` — removes node **and cascades** its connections.
  - `addConnection(input)` / `deleteConnection(id)` — analogous; `relationCategory` required; endpoints checked by `validateModel`'s dangling rule.
- `subscribe(listener): () => void` + `notify()` — in-memory fan-out for SSE, no external deps.
- Existing `flush()` / atomic write / SIGINT behavior unchanged.

### Routes (`routes.ts`)

Granular endpoints translate HTTP ↔ store and map errors:
- `POST /nodes`, `PATCH /nodes/:id`, `DELETE /nodes/:id`
- `POST /connections`, `DELETE /connections/:id`
- `ValidationError → 422 {issues}`, `NotFoundError → 404`, Zod parse error → `400`.
- Success returns the created/updated entity **plus** `version`.
- `GET /events` — Hono `streamSSE`; on connect emit `hello {version}`, then one `changed {version}` per `notify()`; unsubscribe on disconnect.
- `GET /model` — returns the model; exposes version via `X-Hyphae-Version` header (body stays a clean `HyphaeModel`).
- `PUT /model` — kept for whole-model import only (validated, bumps version, broadcasts); not used for per-edit anymore.

### Entry / dev proxy

Ports unchanged. Vite dev proxy adds `/nodes`, `/connections`, `/events` (alongside `/model`). Store remains the single file owner.

## MCP (`mcp.ts`)

`buildTools` refactors from a sync `getModel` to an injected async `api` client (keeps handlers unit-testable against a fake). Server base URL from `HYPHAE_SERVER` env (default `http://localhost:5173`).

Read tools (now server-backed — fixes today's file-staleness): `get_text_context({layer?})`, `get_node({id})`, `list_nodes()`, `find_connections({nodeId})` fetch `GET /model` and reuse the existing pure functions.

Write tools (call granular endpoints):
- `create_node({name, type, description?, purpose?, technology?, responsibilities?, invariants?, assumptions?, failureModes?, parentId?, tags?, owner?, status?})`
- `update_node({id, ...patch})`
- `delete_node({id})`
- `create_connection({from, to, relationCategory, transport?, intent?, description?, direction?})`
- `delete_connection({id})`

Tool-description rules (prescriptive about *when* + the constraints), e.g. create_node: *"Call after `get_text_context` to add a node. `type` must be one of the active profile's kinds (System, Container, Component, Actor, ExternalSystem). A Component's `parentId` must reference a Container; a Container's a System. Fill responsibilities/invariants/assumptions — these are the value the model provides to other agents."*

Error handling: `422` → return the `Issue[]` verbatim so the agent self-corrects. Connection refused → return *"Hyphae server not reachable at <url> — start it with `pnpm --filter @hyphae/server dev`."* IDs/timestamps: server generates when the client omits them (MCP omits).

## Web editor

- `api.ts`: add `createNode/updateNode/deleteNode/createConnection/deleteConnection` (granular fetches), each returning `{entity, version}`. `loadModel` also returns the current `version` (read from the `X-Hyphae-Version` header) so the store can seed `ownVersion` on initial load — otherwise the first SSE `changed` event always exceeds `ownVersion (0)` and forces a redundant refetch.
- `store.ts`: actions apply the change **optimistically** to local state, then call the endpoint; on `422` they **revert** and surface the issue. The client generates the id for its own creates (server accepts a provided id), so the selected-node id stays stable. Each successful response carries the new `version`, stored as `ownVersion`.
- **SSE subscription:** on mount, open `EventSource('/events')`. On `changed {version}` with `version > ownVersion` (external/LLM edit) → refetch `GET /model` and `setModel`; events at/below `ownVersion` are the editor's own echoes → ignored.

## Testing

- **schema:** `newIssues` (only-new-issues semantics; pre-existing issues don't count); `resolveProfile` (returns c4Backend / throws).
- **server (via `app.request`):** each endpoint happy path (entity + version); `422` with exact issues for unknown type / bad parent / dangling endpoint; `404` for missing id; version increments on success, not on rejection; delete-node cascades connections. `ModelStore`: `commit` rejects on new issues without mutating; `subscribe/notify` fans out. SSE: broadcaster unit test + `GET /events` sets `text/event-stream` and emits `hello`. Full SSE streaming = manual smoke.
- **mcp:** `buildTools` against an injected in-memory fake `api` — `create_node` success + `422` surfacing; read tools unchanged. Stdio wiring untested (as today).
- **web:** store actions with mocked fetch — optimistic apply, revert + issue on `422`, `ownVersion` from response. SSE handler — refetch when `version > ownVersion`, ignore at/below. Canvas/SidePanel unchanged.

## Out of scope (this slice)

- Editing reserved axes (flows, state machines, data types, requirements, decisions).
- A Claude Code skill or MCP prompt for modeling guidance (tool descriptions only for now).
- Multi-profile support beyond `c4-backend` (the seam — `resolveProfile` — is in place).
- Whole-model conflict merge UI; the version/echo scheme prevents clobbering, and a stale whole-model `PUT` (import only) is last-write-wins.
