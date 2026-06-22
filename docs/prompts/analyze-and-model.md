# Prompt: analyze this repo and build its C4 model via the Hyphae MCP server

> **Legacy / quick one-shot.** For anything beyond a small repo prefer the `building-architecture-models`
> skill. Also note the schema is now profile-driven: a connection's kind is `type` (not
> `relationCategory`), and domain values (`transport`, `intent`, a node's `technology`/`responsibilities`/
> `invariants`) go in a `fields` bag. Call `describe_profile` first to see the available kinds and
> fields. The endpoint-ordering guidance below still applies.

**Prerequisites:** the Hyphae HTTP server is running (`pnpm --filter @hyphae/server dev`, :5173)
and the `hyphae` MCP server is connected in Claude Code (see `.mcp.json`). Optionally open the
web editor (`pnpm --filter @hyphae/web dev`, http://localhost:3000) to watch it build live.

Paste everything below the line into Claude Code.

---

Use the **hyphae** MCP tools to model THIS repository as a C4 architecture. Work in this order so
every write passes the server's strict validation (parents and connection endpoints must already
exist, and containment rules are enforced: a Container's parent is a System, a Component's parent
is a Container).

1. Call `get_text_context` first to see the current (empty) model.

2. Create the System node **Hyphae** (`type: "System"`). Give it a `description`, a couple of
   `responsibilities`, and an `invariant` (e.g. "the HTTP server is the single owner of hyphae.json").
   Remember its returned `id`.

3. Create one `Container` per package, each with `parentId` set to the Hyphae System id:
   - **@hyphae/schema** — Zod schemas → types → JSON Schema, `getContext()` renderer, referential
     validation. invariant: "pure — no HTTP or React imports".
   - **@hyphae/server** — Hono HTTP API + atomic model store + read/write MCP server.
   - **@hyphae/web** — Vite + React + Zustand editor; React Flow canvas; layer = dropdown filter.
   Fill `responsibilities` and `invariants` for each. Remember each returned id.

4. Create `Component` nodes for the key modules, each with `parentId` = its Container id:
   - under server: **ModelStore** (versioned, validated mutations, debounced atomic save),
     **routes** (granular validated endpoints + SSE /events), **mcp tools** (read-through + write).
   - under web: **store** (non-optimistic Zustand store, syncs on SSE), **Canvas** (layer-filtered
     React Flow), **SidePanel** (edits all node fields incl. LLM semantics).
   - under schema: **validate** (referential checks + newIssues), **context** (getContext renderer).
   Fill `responsibilities`/`invariants`/`assumptions` where you know them.

5. Wire the dependencies with `create_connection` (both endpoints must exist first):
   - web store → server routes: `type: "Dependency"` (with `transport` in `fields`), `transport: "Sync"` (HTTP).
   - server routes → ModelStore: `type: "Dependency"` (with `transport` in `fields`), `transport: "InProcess"`.
   - mcp tools → server routes: `type: "Dependency"` (with `transport` in `fields`), `transport: "Sync"` (HTTP).
   - server / web / mcp → schema: `type: "Dependency"` (with `transport` in `fields`), `transport: "InProcess"`.

If any write is rejected, the tool result contains the specific `issues` — read them and correct
the input (usually a missing/wrong `parentId` or an endpoint id that doesn't exist yet) before
moving on. When done, call `get_text_context` again and summarize the model you built.
