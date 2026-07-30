# Hyphae — Specification

> A visual **viewer** for a **business-legible** model of software architecture, and a knowledge
> base for LLM agents — one artifact for both. The long-term goal is bidirectional sync
> between the model and the code.

> The model concept (axes, first-class entities, profiles) lives in a separate document:
> **[MODEL.md](./MODEL.md)**. The repositioning that shaped this version is recorded in
> **[docs/superpowers/specs/2026-07-18-business-legible-rethink-design.md](./superpowers/specs/2026-07-18-business-legible-rethink-design.md)**.
> This file is about the product, scope, and implementation.

---

## 1. Vision

Hyphae turns a software system's architecture from stale documentation into a **living
diagram a person understands at a glance** — what users do to the system, how components
collaborate, and how data moves and is processed — backed by the same graph an LLM queries and
edits over MCP. The diagram is primary; the diagram and the knowledge graph are one artifact,
not two copies.

Two north stars, in order:
1. **Human-diagram-first.** A reader learns the architecture from the picture: node roles
   (shapes/icons), connections labeled with a **business action + object** ("reads camera
   list", "stores clip"), numbered **Flows** for scenarios, and **Patterns** (pipeline,
   middleware, state machine, …) that show internal shape without a class graph.
2. **LLM still core.** The model humans read is the model the LLM reads and writes. Structured
   fields, stable ids, and MCP make it queryable and verifiable; the end goal is the reverse
   flow — the user edits the top-level model → the AI cascades a rebuild of the lower levels →
   the AI rewrites the code to match.

The core premise stays: the model must describe **any** type of project — a server, a
frontend, a CLI, a desktop app — not only a C4 backend. This is achieved through a small set
of **orthogonal axes** (structure, dependencies, behavior, data, intent, presentation) over
universal mechanisms. The project type changes only the **profile vocabulary** (node types,
roles, verbs, pattern kinds); the engine is shared. Details in [MODEL.md](./MODEL.md).

The metaphor in the name: hyphae are the threads of a mycelium — the invisible fabric
connecting code, architectural knowledge, and AI agents.

---

## 2. Goals

- A visual viewer whose **diagrams are legible on their own**: node roles as shapes/icons,
  connections labeled with a business verb + object, detail in the side panel.
- **Flows** bound to the model — numbered step-sequences overlaid on the diagram for scenarios
  ("user views live feed").
- **Patterns** — a profile-driven overlay entity that renders architectural motifs
  (pipeline / middleware / state-machine / layered / event-bus) instead of a class graph.
- A **real Data axis** — named data entities that connections carry and nodes own/store, with
  an ERD-style projection.
- A single structured model (JSON) — the single source of truth for all views.
- A format and metadata optimized for LLM consumption; MCP read + write.
- Local execution without a cloud or accounts.

## 3. Non-goals (for now)

Explicitly deferred to keep scope focused:

- **Code-as-nodes.** Individual classes/interfaces are **not** modeled as diagram nodes; code
  is `codeRefs` + Patterns. (This is a removal, not a deferral — see §6.7.)
- **Requirements / Decisions (Intent axis).** Schema-reserved; no MCP tools and nothing rendered yet.
- **Auto-parsing code** (tree-sitter/AST) to populate the model — `codeRefs` are authored/AI-set.
- **Real-time collaboration** (CRDT, multi-cursor).
- **Deployment / infra views.**
- **Drift detection, metrics, hotspots dashboards.**
- **Team workspace** (comments, drafts, accounts). Storage is a Git-friendly JSON file, so
  git-diff collaboration works from day one.

---

## 4. Target user

A solo developer + an AI agent as a co-user. Scenarios:

- The developer's model is built and maintained by an AI agent over MCP; the developer **reads
  the architecture off the diagram** and reviews the agent's edits.
- An AI agent (Claude Code or similar) reads the model as context before changing code, and
  (in later phases) proposes model edits the human reviews.

Team scenarios are out of scope for now, but `hyphae.json` is Git-compatible, so basic
collaboration via git diff/merge is possible from day one.

---

## 5. System architecture (high-level)

A local web application on the Structurizr Lite model:

- One process — a local Node server, the single source of truth.
- Frontend — an SPA opened in a browser at `localhost`.
- Backend — serves a granular, validated API + the built bundle; persists a single JSON file
  atomically (debounced) and broadcasts changes over SSE.
- No external services, no cloud, no authentication.

---

## 6. Data model

> The full concept (axes, categories, profiles, anti-redundancy) is in [MODEL.md](./MODEL.md).
> Below is the operational slice: what is stored and edited.

### 6.1 Profiles and layers

A node's layer is a derivative of the **profile** + the node's category. A profile is a
declarative vocabulary: node types (each with a `role`/archetype), containment rules,
the **verb** vocabulary, and **pattern** kinds. There is no separate connection kind — a
connection's meaning is its `verb` + `object` alone.

The primary profile is `c4-backend`:

| Layer | Description | In scope |
|-------|-------------|----------|
| Landscape | Multiple systems in an ecosystem | Later |
| Context | A system + external actors and systems | Yes |
| Container | Deployable units inside a system | Yes |
| Component | Logical building blocks inside a container | Yes |
| ~~Code~~ | ~~Classes / functions~~ | **Removed** — code = `codeRefs` + Patterns |

A fixed-but-profiled vocabulary is kept for LLM-friendliness. Future profiles
(frontend / cli / desktop) define their own layers, roles, verbs, and pattern kinds without
touching the core.

### 6.2 Nodes

**Core (same for all profiles):** `id`, `name`, `type` (profile node kind), **`role`**
(archetype → shape/icon), `description`, `parentId` (the sole carrier of "what it is made of"),
**`root`** (optional directory Ref anchoring this subtree on disk — §6.10), `codeRefs` /
`docRefs`, `createdAt` / `updatedAt`, and a `fields` bag. `layer` / `category` are derived from
`type`, not stored.

**`fields` (profile domain fields):** e.g. in `c4-backend` `responsibilities` (list),
`invariants` (list) on all; `technology` (text) on Container/Component. Every field and enum
value is described; values are strictly validated.

On the diagram a node renders as its **role shape + name + a one-line purpose (+ tech chip)**;
the rest is side-panel detail.

### 6.3 Connections (edges)

A first-class entity and the main carrier of on-diagram meaning.

**Core:** `id`, `from`, `to`, **`verb`** (profile business action), **`object`** (short noun or a
`DataEntity` ref), `description`, `direction`, `realizedBy` (cross-layer aggregation),
`codeRefs`, and a `fields` bag. There is no separate connection kind — verb and object alone
carry an edge's meaning.

- **`verb`** is shown on the edge and colored by class — *data access* (reads / writes /
  stores / modifies / aggregates …), *messaging* (publishes / subscribes / notifies …),
  *control* (invokes / triggers / requests), *user* (views / submits / navigates),
  *traceability* (implements / satisfies — §6.8). It replaces the former low-signal `intent`,
  and the connection `type` (kind) and `transport` field it once overlapped with — both retired.
- **`object`** links the action to a `DataEntity` when relevant ("reads → Camera").

> `Composition` is removed — containment is only `parentId`.

### 6.4 Flows

A Flow is an ordered sequence of steps over existing nodes and connections — an overlay, not a
standalone diagram.

**Structure:** `id`, `name`, `description`, `scope` (which layer it unfolds on), and ordered
`steps` — each `{ order, from, to, via? (connection id), message, kind: Sync|Async|Return,
control?: { type: alt|opt|loop|par, condition } }`.

**Invariant:** every `from`/`to`/`via` must exist; deleting a referenced node/connection marks
the flow `invalid` and highlights it. On the diagram a selected flow lights its steps in order
with per-step captions.

### 6.5 Patterns

A Pattern is a first-class **overlay** that annotates a set of members with a recognized
architectural shape and renders it specially.

**Structure:** `id`, `name`, `kind` (profile pattern kind: `pipeline` | `middleware` |
`state-machine` | `layered` | `event-bus` | …), `description`, **`anchor`** (the node this pattern
describes, nullable), `members`, and `transitions` — `{ from, to, trigger, description }`, where
`from`/`to` are **member names**, used by the `state-machine` renderer. There is no separate order
field: **member array order is the stage order** for ordered kinds.

A member is `{ name, nodeId? | ref?, description? }` — it binds to **at most one** of a node id or a
code Ref (§6.10), or to **neither** (a pure name, e.g. a state in a state-machine). Code-level
patterns need the `ref` form: with classes no longer modeled as nodes, a pipeline's stages are named
members pointing into the source. Higher-altitude patterns use `nodeId`.

Patterns are how a Component's internal shape appears **without** code-as-nodes. The former
standalone `StateMachine` is the `state-machine` pattern kind.

### 6.6 Data entities

A DataEntity is a named data object (Entity | Value | Event | DTO) with optional fields. Nodes
**own/store** entities; connections **carry** them (via `object`/`carries`). An ERD is a
projection of ownership + carriage.

**Status: not built yet.** The collection exists in the schema as `dataTypes` (an empty array) with
no MCP tools and nothing rendered — a connection's `object` is free text today. This is Phase D
(§11); Flows and Patterns shipped first.

### 6.7 Code layer removal

Individual classes/interfaces are no longer diagram nodes. A Component's code is expressed by:
- `codeRefs` — pointers to real files/symbols, and
- an optional **Pattern** describing internal structure (pipeline, middleware, state machine).

`realizedBy` on connections still aggregates finer edges between the surviving altitudes.
Phase E retires the Code kinds from the profile; it ships **no migration** of existing models —
a model built under the old Code layer is recreated from scratch rather than folded, and
`schemaVersion` deliberately stays `1` (there is no `1→2` migration path to mark). Directory and
glob Refs (§6.10) matter for the recreated model: one `src/views/cctv/**` replaces what would
otherwise be dozens of individual file refs. Code structure worth naming individually is
authored as **Pattern members** carrying a `ref`, not as a ref list.

### 6.8 Reserved axes (schema present, tools and rendering later)

- `requirements` — **Intent axis.** Requirement nodes (Functional | Quality | Constraint),
  traced from nodes/flows via the `traceability` verb class (`implements` / `satisfies`).
- `decisions` — **Intent axis.** ADR nodes (context / choice / consequences / status).

### 6.9 Views

A View is a named saved viewing configuration: which layer, which nodes/connections to show
(filters), and manual-layout coordinates. Truth is the structure; views are presentation.

### 6.10 Refs and roots

A **Ref** is a plain string pointing at an artifact outside the model. Kind is inferred from
syntax — no extra fields to fill:

| Syntax | Kind | Example |
|--------|------|---------|
| trailing `/` | directory | `src/views/cctv/` |
| plain path | file | `src/main.ts` |
| `path#Symbol` | code symbol | `src/main.ts#getRouter` |
| `path#Lstart-Lend` | line range | `src/main.ts#L10-L40` |
| contains `*` | glob | `src/views/**/*.vue` |

The same concept serves `root` (directories only), `codeRefs` on nodes and connections,
`docRefs` (a file Ref or a URL), and Pattern member `ref`s. Existing refs already use the
`path` and `path#Symbol` forms, so this is a formalization, not a migration.

**Resolution.** A Ref resolves against the `root` of the **nearest ancestor node that declares
one**, found by walking `parentId`. A node's own `root` resolves the same way, so roots chain
down the containment tree. Conventionally the System declares the project root, each Container
declares its subtree, and Components inherit.

```
System    root: .
  Container "Media Gateway"  root: endpoints/media_gateway/backend
    Component "Web API"      codeRefs: [ WebApi/Controllers/, WebApi/Hubs/BrowserAPIHub.cs#BrowserAPIHub ]
  Container "Full Client"    root: clients/full
    Component "App Shell"    codeRefs: [ src/main.ts, src/plugins/**/*.ts ]
```

**Why this is required, not optional.** In the current cctv model no node declares a root, and
refs drift across at least four different implied bases (repo-root-relative, container-relative,
app-relative). 16 refs are genuinely ambiguous — `src/main.ts` names a file in both Full Client
and Streaming Client; `WebService/Program.cs#Program` names one in both Stream Keeper and Layout
Manager. Declared roots make that class of ambiguity structurally impossible.

**Validation** (surfaced via `validate_model` / `model_gaps`):
- a ref with no anchoring root in any ancestor,
- a ref that resolves to more than one location,
- a ref that does not exist on disk (drift detection — a file was moved or deleted),
- a `root` that is not a directory Ref.

---

## 7. Storage format

**A single JSON file** — the single source of truth.

```
project-root/
  hyphae.json     # the whole model
```

- **Atomic write:** backend writes `hyphae.json.tmp` then `rename`; a debounce between saves.
- **Schema:** JSON Schema auto-generated from the Zod schemas via `zod-to-json-schema`;
  optionally referenced via `$schema`.
- **Git-friendly:** deterministic key order; the user decides whether to commit it.
- **Index (later):** load JSON into an in-memory graph on startup; optional SQLite cache for
  large models.

---

## 8. LLM-friendliness — design principles

Built into the core, and unchanged by the visual repositioning:

- **JSON Schema as the contract.** Zod schemas are the source of truth → viewer TS types, JSON
  Schema, the granular API, and the MCP tools.
- **Stable IDs on everything.** The LLM references a specific node/connection across messages.
- **Free text + structured fields.** `description` is semantics; `responsibilities` /
  `invariants` and the new `verb`/`object`/`carries` are addressable structure.
- **Closed, described vocabularies.** Node types, roles, verbs, and pattern kinds are finite
  and documented per profile — easy for an LLM to fill correctly and for the editor to tooltip.
- **Traceability as a graph.** Requirement ↔ Node ↔ Code and Connection ↔ DataEntity via the
  `traceability` verb class / `realizedBy` / `carries` / `codeRefs`. The LLM walks "requirement →
  component → code" and "flow → connections → data" to verify implementation and find gaps.
- **Text export.** Render the graph into compact plain text for a prompt.
- **MCP server (read + write).** Read: `describe_profile`, `model_overview`, `get_node`,
  `list_nodes`, `list_connections`, `rollup_connections`, `get_subgraph`, `list_flows`, `get_flow`,
  `list_patterns`, `get_pattern`, `resolve_refs`, `validate_model`, `model_gaps`. Write:
  `create/update/delete` for nodes, connections, flows, and patterns — creates are batched and echo
  `{id, name}` per item. Data entities follow when Phase D is built.

---

## 9. UX principles

- **Diagram-first, model-backed.** The user reads the architecture off the diagram; a node's
  position in a view is a hint, not the truth.
- **Meaning on the canvas, detail in the panel.** Node = role shape + name + one-line purpose;
  connection = verb + object. Full fields, invariants, codeRefs, and incoming/outgoing lists
  are side-panel.
- **Legibility budget.** Cap what is shown at rest; roll up dense fans; push depth into
  drill-down, Flows, Patterns, and the panel. A legend explains role shapes, verb-class colors,
  and solid-vs-derived edges.
- **Luminance is state, hue is meaning.** Altitude (Context → Container → Component), selection and
  focus are expressed as light level; the chromatic budget belongs to the five verb classes, which
  are the one thing on the canvas that needs colour to be told apart. Dark is the default; the light
  theme is warm paper rather than an inversion. Every value comes from
  `apps/web/src/styles/tokens.css`.
- **One tool call — one model operation.** An MCP write is atomic: reparenting a component is a
  `parentId` change; deleting a node cascades to remove its connections, and any flow step that
  referenced it is marked ↗ in the outline as undrawable.
- **Zoom navigation between altitudes.** Double-click to drill into any node; breadcrumbs on top;
  a left outline of the whole model for orientation. Layout is automatic and stable — filtering,
  the audience toggle, and expanding an external never reflow the graph. The current view lives in
  the URL hash (`#node/…`, `#flow/…`, `#pattern/…`), so it is shareable and Back-able.
- **Flow as an overlay; Pattern as a shape.** Select a Flow → it jumps to step 1 and lights the
  steps in order; each step is clickable and navigates to a view that shows it, and a step with no
  authored connection still draws (as an ephemeral edge). Select a Pattern → its internal shape
  renders in place of the canvas (stages / state chart / member stack), with its anchor and bound
  members linking back into the model.

---

## 10. Technology stack

### Frontend
- **Vite** + **React 18** + **TypeScript**
- **@xyflow/react** (React Flow) — node-based editor; custom nodes for role shapes, pattern
  renderers, and flow overlays
- **Zustand** — viewer state
- Plain CSS (`apps/web/src/styles.css`) + inline styles — no CSS framework
- **dagre** — auto-layout

### Backend
- **Node 22+** · **Hono** — web framework · **Zod** — validation and schema definition

### Shared
- The `@hyphae/schema` package with the Zod schemas as the source of truth → TS types + JSON
  Schema + profiles.

### Repo structure
```
hyphae/
  apps/
    web/        # Vite + React frontend
    server/     # Hono backend (owns hyphae.json, serves API + SSE + SPA)
  packages/
    schema/     # Zod schemas + types + JSON Schema + profiles
  hyphae.json   # the model (or lives next to the user's project)
```
Package manager: **pnpm workspaces**.

---

## 11. Phased roadmap

Each phase is a projection of the axes already laid down in the schema.

| Phase | | Status |
|-------|---|--------|
| A0 | Refs and roots | **shipped** |
| A | Visual language (roles/shapes, verb + object) | **shipped** |
| B | Flows | **shipped** |
| C | Patterns | **shipped** |
| E | Retire the Code node layer | **shipped** |
| D | Data axis | not started |

### Phase A0 — Refs and roots (foundation) — shipped
- Formalize the **Ref** string syntax (dir / file / symbol / lines / glob) + a shape validator.
- Add optional `root` to the node core; resolution by nearest ancestor via `parentId`.
- Report unanchored / ambiguous / missing-on-disk refs through `validate_model` + `model_gaps`;
  backfill roots on the existing model.
- Cheap, and a prerequisite for Phase C (Pattern member refs) and Phase E (Component `codeRefs`).

### Phase A — Visual language — shipped
- Node **roles** → shapes/icons (profile-declared); render name + one-line purpose + tech chip.
- Connection **verb + object** on the edge; color by verb class; retire `intent`.
- On-diagram-label vs side-panel-detail split; legend.
- Reuses the existing focus view, floating edges, containment regions, side panel.

### Phase B — Flows — shipped
- Build the Behavior axis: create flows (nodes + connections + ordered steps, control
  structures), numbered overlay on the view, an optional sequence-style mode. MCP tools + rendering.

### Phase C — Patterns — shipped
- The `Pattern` overlay entity + renderers: pipeline, middleware/interceptor, state-machine
  (absorbs the old StateMachine), layered, event-bus. Profile-driven `patternKinds`. MCP tools + rendering.

### Phase D — Data axis — not started
- `DataEntity` model; connection `carries`/`object` refs; node `owns/stores`; an ERD-style
  data projection. MCP tools + rendering.

### Phase E — Retire the Code node layer — shipped
- Drop Code kinds from profiles; a Component's code presence becomes `codeRefs` + an optional
  Pattern. Keep `realizedBy` aggregation between surviving altitudes. No migration ships —
  an existing model is recreated, not folded — and `schemaVersion` stays `1`.

### Ongoing — configurable profiles
- The verb, role, and pattern vocabularies are all profile-declared, so a new project type is a
  new profile, not a new engine. Ship frontend / cli / desktop profiles after the core.

### Later
- Intent axis (Requirements / Decisions) — MCP tools + rendering; multi-system Landscape; real-time
  collaboration; deployment/infra views; metrics/drift dashboards.

---

## 12. Open questions

- **Multi-repo roots.** A `root` is a path today. If a model ever spans several repositories,
  does the top-level root become a list, or does a Container carry a repo identifier/URL?
  Deferred until a real multi-repo model exists.
- **Ref drift policy.** When a ref stops resolving on disk, is that a validation error, a
  `model_gaps` warning, or an auto-repair attempt?
- **Verb vocabulary shape.** Closed profile-declared verb list vs a small closed core + free
  object text. Leaning: closed `verb`, free-or-ref `object`.
- **Pattern membership.** Can a node belong to two Patterns? How is pipeline ordering authored?
- **Data projection scope.** How much ERD (entity relationships, cardinality) in Phase D vs
  defer.
- **Legibility caps.** Concrete at-rest limits (max edges/nodes before rollup kicks in).
- **Profiles: built-in or plugins.** Do frontend/cli/desktop stay built-in vocabularies or
  become loadable plugins with their own validators.

---

*The final Zod schemas are a separate artifact in `packages/schema`. The model concept is
[MODEL.md](./MODEL.md).*

*Spec version: 0.3 — the business-legible rethink. To be updated as decisions are made.*
