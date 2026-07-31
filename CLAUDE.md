# Hyphae — working notes

Local visual **viewer** for a C4-style architecture model, written by LLM agents over MCP.
pnpm workspaces: `apps/web` (Vite/React/@xyflow), `apps/server` (Hono API + SSE + MCP),
`packages/schema` (Zod — the single source of truth for types, the API, and the MCP tool params).

## Where the documentation lives

| Read this | For |
|---|---|
| `README.md` | how to run it, the viewer's behaviour, the HTTP API, the full MCP tool list |
| `docs/MODEL.md` | the model *concept* — axes, first-class entities, Refs/roots, profiles |
| `docs/SPEC.md` | the *product* — scope, data model per entity, UX principles, phased roadmap |
| `skills/building-architecture-models/SKILL.md` | how a model gets built from a repo (phases + gates) |
| `docs/superpowers/{plans,specs,reviews}/` | **historical records, dated.** Read for context; do not rewrite them |

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and the skill are the **living** docs — when behaviour
changes, they change in the same branch. Keep the schema, the docs, and the skill consistent: the Zod
schema in `packages/schema` wins any disagreement.

## Commands

    pnpm dev            # server (:5173) + web (:3000) in parallel
    pnpm server         # API + SSE on :5173, owns ./hyphae.json (override with HYPHAE_FILE)
    pnpm web            # viewer on :3000, proxies the API
    pnpm mcp            # MCP server — an HTTP client of the above, so the server must be running
    pnpm -r test        # baseline 662 green: schema 147, server 107, web 408
    pnpm -r build

## Testing gotchas

These cost real time when rediscovered:

- **Never run bare `pnpm vitest run` from the repo root.** There is no root vitest config, so web
  tests run without jsdom and report dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web`
  first (jsdom lives in `apps/web/vitest.config.ts`).
- **React Flow renders zero edges in jsdom** (nodes are never measured), and edge labels portal into
  `.react-flow__edgelabel-renderer`. You cannot assert edge or label DOM. Assert the **generated
  highlight CSS** instead — see the `hlCss(container)` pattern in `apps/web/test/Canvas.test.tsx` —
  or test the pure function underneath.
- A component rendering React Flow `Handle`s needs a `ReactFlowProvider` wrapper in tests
  (`NodeBox.test.tsx`, `PatternMemberNode.test.tsx`).
- **The resizable panels need jsdom stubs.** `react-resizable-panels` calls `ResizeObserver`,
  `matchMedia` and `setPointerCapture`, none of which jsdom implements; `apps/web/test/setup.ts`
  provides them. Elements are never measured, so panel *sizes* are untestable — assert the
  `role="separator"` structure (`aria-orientation` is perpendicular to its group) instead.
- **jsdom loads no external stylesheet**, so nothing in `src/styles/` is observable in the DOM, and
  nothing is ever measured. To pin a CSS invariant, read the file and assert the rule — see the
  `rule(css, selector)` helper in `TreePanel.test.tsx`. **Anchor such a regex to the start of a
  line** (`^\.tree-label\s*\{`): unanchored, `.tree-label {` also matches inside
  `.tree-row:hover .tree-label {`, so the assertion silently reads a different block. Assert the
  rule was found at all, too — a renamed selector otherwise passes as an empty string.
- `import.meta.url` is an **http** URL under jsdom — resolve fixture paths from `process.cwd()`.
- Roughly 80 `act(...)` warnings in the web suite are **pre-existing noise**, not your change.
- The store is a module-level singleton: reset the slice you touch in `beforeEach`, and let the
  initial `loadModel()` settle (`await new Promise(r => setTimeout(r, 0))`) before seeding a model in
  a test that renders `<App />`, or the async load overwrites it.

## Styling — the rules the suite enforces

The viewer has one design rule: **luminance is state, hue is meaning.** Altitude, selection and focus
are light levels with no hue; the five `--verb-*` tokens own the whole chromatic budget; violet means
only "rolled-up edge", `--accent` only interaction, `--warn` only an invalid flow/pattern. Giving a
structural distinction a hue, or a semantic one only a luminance step, is a design bug — reach for a
difference in **form** instead (this is why a pattern's kind is a chip, not a colour). `docs/SPEC.md`
§9 states the rule; `apps/web/src/styles/tokens.css` is the authoritative value for every colour,
type step and space step.

Four of these are tests, not preferences (`tokens.test.ts`, `contrast.test.ts`):

- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`.
- **Every token declared in `:root` must be referenced somewhere**, and every `var()` must resolve.
  Both directions fail the suite, so moving a rule's last use of a token kills the token.
- **Every colour token must exist in both themes.**
- **33 foreground/background pairs are measured at 4.5:1, in both themes.** When one fails, retune
  the token — **never** loosen the threshold.

Conventions the suite does *not* enforce: `base.css` is the reset layer and may use element/ID/pseudo
selectors; `chrome.css` and `canvas.css` use **class and attribute selectors only** — no element
types. A modifier must be declared *after* the class it narrows (`.tree-kind` sits with `.chip`, not
with the tree rules) — equal specificity means source order is the only thing deciding.

## Invariants that bite

- **Focus-view pipeline:** `buildFocusView` → `layoutFocusView` (on the *collapsed, unfiltered* base
  view) → `resolveViewPositions` → `focusViewToFlow`. Base positions are memoized on
  `[model, focusId]` only, so the connection filter, the audience toggle, and expanding an external
  never reflow the graph.
- A node with **no base slot gets no position** and renders at the origin, on top of everything else.
  If nodes stack up in a corner, look here first.
- **`expandedExternals` is for nodes OUTSIDE the focus.** Expanded groups are laid out in the
  external columns, so expanding a node that is drawn *inside* the view stacks a group box over the
  cluster. `stepReveal` guards this.
- **Pattern member React Flow nodes are keyed by member NAME, not a node id.** Never use one as a
  focus id; navigate via the member's `nodeId` (`Canvas.drill()` checks ids against `model.nodes`).
- **URL routes are fully prefixed:** `#node/<id>`, `#flow/<id>`, `#pattern/<id>`. A bare `#<id>` is
  not a route — it rewrites to root. Precedence is pattern > flow > focus.
- The server rejects a bad write with **422 + the specific issues**; there is no whole-model write
  endpoint. This is the MCP tools' contract for a bad write — the issues come back specific enough
  to fix and retry; the browser has no write path of its own left to resync.
- **`TreePanel` is controlled by `App`.** `onResize` → `isCollapsed()` is the only authority on
  `outlineCollapsed`; reintroducing local collapse state in `TreePanel` silently breaks drag-collapse,
  since a drag past the edge never calls the lifted toggle.
- **React Flow paints its edge layer BELOW its node layer** (`GraphView` renders `EdgeRenderer` ahead
  of `NodeRenderer`), and both default to z-index 0 — so any opaque node covers any edge. The two
  containment boxes are opaque and span the whole cluster, so they carry `zIndex: -1`
  (`BOUNDARY_Z` in `reactflow.ts`). Drop that and every edge inside a region disappears.
- **A node's DOM must not outgrow its React Flow wrapper.** `.react-flow__node` is `border-box` and
  sized from the inline width/height; a child at `width:100%` *with a border* under the default
  content-box renders wider and taller than it, overflowing right and bottom. `.region` and `NodeBox`
  both set `box-sizing: border-box` for this reason.
- **The selection/hover ring is a `box-shadow` on React Flow's own node wrapper**, injected as a
  generated stylesheet by `Canvas.tsx`. It traces the *wrapper's* box and is clipped by the
  *wrapper's* radius, so that radius lives permanently in `canvas.css` per node type — put it in the
  highlight rule and it snaps back to 0 while the shadow is still fading out.
- **The row is the item, in the outline and the altimeter.** The row/band owns the click, the hover
  and the cursor; the label inside stays a `<button>` only so it is keyboard-reachable, and its click
  bubbles. A `:hover` on an inner element makes one item light up in pieces. Anything inside that
  navigates *elsewhere* (a pattern's anchor, the twisty) must `stopPropagation`.

## Working with a built model

`apps/server/hyphae-baritone.json` is a **real model** built from the Baritone repo. It is
**permanently untracked — never `git add` it** (same for any other `*.json` model). Verify with
`git status --short` before every commit.

The server owns exactly one model file at a time, so **which model the MCP answers about is decided
by how the server was started**:

    HYPHAE_FILE=/abs/path/hyphae-baritone.json pnpm server

Under Claude Code you do **not** run `pnpm mcp` yourself — `.mcp.json` launches it (with
`HYPHAE_SERVER=http://localhost:5173`) at project scope; check `/mcp` if the tools are missing. But
the MCP is only an HTTP client, so the Hyphae **server must be running** or every tool call fails.
Run `pnpm mcp` by hand only for a standalone, non-Claude-Code client.

**To answer a question about a built model, query the MCP — do not grep the JSON.** The tools are
listed in full in `README.md`; the ones that answer most questions:

- `model_overview`, `list_nodes` (`parentId` / `type` / `query` / `maxLayer` filters), `get_node`
- `list_connections` (`nodeId`, `containerId`, `crossingBoundary`, `involvingExternal`),
  `rollup_connections`, `get_subgraph`
- `list_flows` / `get_flow`, `list_patterns` / `get_pattern`, `resolve_refs`
- `validate_model` (structure/fields) and `model_gaps` (coverage: orphans, thin descriptions)

Ids are UUIDs and **component names repeat across containers** — `list_nodes` with a `query` returns
the parent name for disambiguation. Flow steps reference nodes by id (`from`/`to`) and a connection
by `via` (often absent); pattern members bind `nodeId` or `ref` or neither.

**To check rendering/behaviour against real data**, drive the pure functions over the real model in a
throwaway test file, print what you need, then delete the file. This is how the flow-step focus bug
was found — synthetic fixtures agreed with the buggy code, the real model did not:

    // apps/web/test/zz-probe.test.ts — read hyphae-baritone.json, run stepReveal/buildFocusView/
    // layout/computeFlowOverlay over every flow step, console.log the outcome. Delete when done.

## Superpowers skills — when

- **`superpowers:brainstorming`** — before designing any feature or new UI surface. Comes *before* planning.
- **`superpowers:writing-plans`** — turn an agreed design into `docs/superpowers/plans/YYYY-MM-DD-<name>.md`
  with checkboxed tasks. Plans are tracked in git; tick the boxes as you implement.
- **`superpowers:subagent-driven-development`** — the default way to implement a written plan: a fresh
  subagent per task, reviewed between tasks. Confirm any "open design decisions" section with the user
  *before* writing code.
- **`superpowers:executing-plans`** — implement a plan inline instead, when the tasks are too coupled to
  hand off one at a time.
- **`superpowers:test-driven-development`** — red first, especially for the pure functions (`focusView`,
  `hashRoute`, `flowOverlay`, `layout`, `patternView`) and for every bugfix.
- **`superpowers:systematic-debugging`** — for **any** bug or test failure, before proposing a fix. Find the root
  cause; symptom fixes are failures. Prefer verifying the hypothesis against the real model.
- **`superpowers:verification-before-completion`** — run `pnpm -r test` and show the output before claiming
  anything is done.
- **`superpowers:requesting-code-review`** / **`superpowers:receiving-code-review`** — on a substantial feature.
- **`superpowers:finishing-a-development-branch`** — when a branch is complete and needs integrating.

Spawn subagents freely — no need to ask first. Plan execution is subagent-driven by default.

**Run the chain without check-ins.** Once the design is agreed and the open questions are answered,
go brainstorm → spec → plan → implementation straight through: write the spec, commit it, write the
plan, commit it, then implement it subagent-driven **without asking which mode to use or whether to
proceed**. Stop mid-chain only for a question that genuinely needs the user's decision — one where
different answers produce materially different work, and no sensible default exists. Reporting
progress between tasks is fine; asking permission to continue is not.

## Git conventions

- **Every new feature gets its own branch off `master`** (`feat/…`, `fix/…`), cut *before* the first
  commit of the work — the spec commit included. One commit per coherent cluster, merged when green.
  Isolated doc/config fixes still go straight to `master`.
- **The spec and the plan are always committed**, each on its own commit as it is finished: the spec
  (`docs/superpowers/specs/…`) before the plan is written, the plan
  (`docs/superpowers/plans/…`) before implementation starts. They are the branch's first two commits.
- Conventional commits with a scope: `feat(web):`, `fix(web):`, `docs:`, `chore:`. Explain *why* in
  the body, not just what.
- **On a feature branch, commit without asking** — the spec, the plan, and each task's commit as the
  plan specifies. **Ask before pushing, before merging to `master`, and before committing directly to
  `master`.** Stage explicit paths — never `git add -A`.
- End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
