# Hyphae — Specification

> A visual editor for a multi-dimensional model of code architecture, and a knowledge base for LLM agents. The long-term goal is bidirectional sync between the model and the code.

> The model concept (axes, first-class entities, profiles) lives in a separate document: **[MODEL.md](./MODEL.md)**. This file is about the product, scope, and implementation.

---

## 1. Vision

Hyphae turns a software system's architecture from stale documentation into a living model, accessible to a human (visual editor) and an LLM (structured format + MCP) at the same time. The end goal is the reverse flow: the user edits the top-level model → the AI cascades a rebuild of the lower levels → the AI rewrites the code to match the new structure.

The core premise: the model must describe **any** type of project — a server application, a frontend (views, components, store), a CLI, a desktop app — not only a C4-style backend. This is achieved not through a zoo of diagrams, but through a small set of **orthogonal description axes** (structure, dependencies, behavior, data, intent, presentation) over universal mechanisms. The project type changes only the **node type vocabulary** (the profile); the engine — edges, flows, state machines, traceability, views — is shared. Details in [MODEL.md](./MODEL.md).

The metaphor in the name: hyphae are the threads of a mycelium. The invisible fabric connecting code, architectural knowledge, and AI agents.

---

## 2. MVP goals

- A visual editor for multi-level diagrams with a flexible drag-and-drop UX (the `c4-backend` profile first).
- Flow diagrams bound to the model (sequence-like scenarios over existing nodes and connections).
- A single structured model (JSON) — the single source of truth for all views.
- A schema laid down for the multi-axis model and profiles **from day one** (even if a single profile is active), so as not to pay for a migration later.
- A format and metadata optimized for LLM consumption.
- Local execution without a cloud or accounts.

## 3. MVP non-goals

Explicitly deferred to avoid bloating the scope. Important: some of these are **full model axes** (see MODEL.md); they are reserved in the schema as empty collections, but the editor/visualization for them arrive later.

- Code binding — auto-parsing code (tree-sitter, AST), linking nodes to symbols.
- LLM-driven editing — writing to the model via AI. In the MVP the LLM only reads.
- Real-time collaboration (CRDT, multi-cursor).
- State machines (the Behavior axis) — schema reserved, editor later.
- Domain/Data model (the Data axis, ERD projection) — schema reserved, editor later.
- Requirements / Decisions (the Intent axis, traceability) — schema reserved, editor later.
- Profiles other than `c4-backend` (frontend / cli / desktop) — the model supports them, the ready-made profiles land later.
- Deployment / infra views.
- Code-level visualization as a class graph.
- Drift detection, metrics, hotspots.

---

## 4. Target user

A solo developer + an AI agent as a co-user. Scenarios:

- The developer maintains their project's model by hand through the visual editor.
- An AI agent (Claude Code or similar) reads the model as context before changing code.
- In later phases the AI edits the model, and the human reviews the changes.

Team scenarios (shared workspace, comments, drafts) are out of scope for the MVP, but the storage (a JSON file) is Git-compatible, so basic collaboration via git diff/merge is possible from day one.

---

## 5. System architecture (high-level)

A local web application on the Structurizr Lite model:

- One process — a local Node server.
- Frontend — an SPA, opened in a browser at `localhost`.
- Backend — serves the API and delivers the built bundle.
- Persistence — a single JSON file on disk.
- No external services, no cloud, no authentication in the MVP.

---

## 6. Data model

> The full concept (axes, categories, profiles, anti-redundancy) is in [MODEL.md](./MODEL.md). Below is the operational slice: what is stored and what is edited in the MVP.

### 6.1 Profiles and layers

A node's layer is not a global hardcoded enum, but a derivative of the **profile** + the node's category. A profile is a declarative vocabulary: which node types exist, who is whose parent (containment rules), and a node's category (Structure / Behavior / Data / Intent / Actor).

The MVP activates a single profile — `c4-backend`:

| Layer | Description | MVP |
|-------|-------------|-----|
| Landscape | Multiple systems in an ecosystem | No |
| Context | A system + external actors and systems | Yes |
| Container | Deployable units inside a system | Yes |
| Component | Logical building blocks inside a container | Yes |
| Code | Classes / functions — a proxy layer (references to code) | No (phase 5) |

A fixed vocabulary (rather than free-form layer declaration) is kept for the sake of LLM-friendliness — but it is now a property of the profile, not the engine. Future profiles (frontend / cli / desktop) define their own layers and types without touching the core.

> **Updated (profile-driven schema).** The Node/Connection core is now lightweight; everything
> domain-specific has moved into the `fields` bag, which the profile declares and validates. The full
> current schema is in `packages/schema/src`.

### 6.2 Nodes

**Core (the same for all profiles):**
- `id` — a stable UUID/slug.
- `name` — a human-readable name (not unique).
- `type` — the node kind from the active profile (in `c4-backend`: System | Container | Component | Actor | ExternalSystem).
- `description` — the main description (free text).
- `parentId` — the parent per the profile's containment rules. The **sole** carrier of "what it is made of."
- `codeRefs` / `docRefs` — references to code / documents (plain strings).
- `createdAt` / `updatedAt`.
- `fields` — a bag of domain values (see below).
- `layer` / `category` — **not stored**, derived from `type` per the profile.

**`fields` (the profile's domain fields):** keys and types are declared by the profile (`commonNodeFields` +
the node kind's fields). In `c4-backend`: `responsibilities` (list), `invariants` (list) — on all;
`technology` (text) — on Container/Component. Every field and every enum value is described (for the
LLM/editor). Values are strictly validated against the profile.

### 6.3 Connections (Edges)

A connection is a first-class entity, not just an arrow.

**Core:**
- `id`, `from` (node id), `to` (node id).
- `type` — the **connection kind (ConnectionKind) from the profile** (in `c4-backend`: Dependency | DataFlow | Realization | Trace). It replaced the former `relationCategory`.
- `description` — what the connection does.
- `direction` — Unidirectional | Bidirectional.
- `realizedBy` — an array of lower-level connection ids (cross-layer realization); rollup excludes connections referenced by another edge's `realizedBy`.
- `codeRefs` — where it is realized.
- `fields` — a bag of the profile's domain fields.

**A connection's `fields` (profile fields):** in `c4-backend` — `transport` (Sync | Async | InProcess | None) and
`intent` (Read | Write | Trigger | Notify | Use, optional); a specific connection kind may add its own fields.
The former "three orthogonal axes" are conceptually preserved, but this is now `type` + profile fields, not a
hardcoded enum.

> `Composition` is removed — containment is expressed only by `parentId`. No "is made of" duplication.

### 6.4 Flows

A Flow is an ordered sequence of steps over existing nodes and connections. Not a standalone diagram, but an overlay.

**Structure:**
- `id`, `name`, `description`.
- `scope` — which layer it unfolds on (usually Container or Component).
- `steps` — an ordered array:
  - `order` — the step index.
  - `from` — a node id (or actor).
  - `to` — a node id.
  - `via` — a connection id (optional; if set, the step is bound to an existing connection).
  - `message` — a description of the message / call.
  - `kind` — Sync | Async | Return.
  - `control` — optional { type: alt | opt | loop | par, condition } for branching/loops/parallelism (sequence diagrams support this; a linear list is a special case).

**Invariant:** every `from`, `to`, `via` must exist in the model. When a node/connection is deleted, the affected flows are marked `invalid` and highlighted in the UI.

### 6.5 Cross-layer connections

Two mechanisms work at the same time:

**Containment (a node's `parentId`):** Component → Container → Context system. Reverse navigation: from a Container, get all its Components.

**Realization (a connection's `realizedBy`):** an upper-level connection A→B is realized by a set of lower-level connections within A and B; the upper connection lists their ids. Optional; if filled in, consistency is checked.

### 6.6 Reserved axes (schema from day 1, editor later)

These collections are present in the model as (possibly empty) arrays from the MVP — for the sake of future migrations without pain. Each one's concept is in [MODEL.md](./MODEL.md).

- `dataTypes` — **the Data axis.** Domain type nodes (Entity | Value | Event | DTO) with fields. An ERD = a projection of produces/consumes/persists connections.
- `stateMachines` — **the Behavior axis.** A state machine bound to a node (lifecycle, protocol, UI modes): states + transitions {from, to, trigger, guard, effect}.
- `requirements` — **the Intent axis.** Requirement nodes (Functional | Quality | Constraint). Traced from nodes/flows via `type: Trace` connections.
- `decisions` — **the Intent axis.** ADR nodes (context / choice / consequences / status), linked to the affected nodes.

### 6.7 Views

A View is a named saved "viewing configuration":
- Which layer.
- Which nodes and connections to show (filter by tags / containment).
- The manual-layout coordinates of each node.

Views are stored in the same model. Truth is the structure; views are presentation.

---

## 7. Storage format

**A single JSON file** — the single source of truth.

```
project-root/
  hyphae.json     # the whole model
```

**Atomic write:**
- The backend writes to `hyphae.json.tmp`, then `rename` → `hyphae.json`.
- A 500ms debounce between save requests (drag, etc.).

**Schema:**
- The JSON Schema is auto-generated from the Zod schemas via `zod-to-json-schema`.
- Optionally included in the file's `$schema` — for validation in editors.

**Git-friendly:**
- A deterministic key order.
- The user decides whether to commit it into the project repo.

**Index (phase 4+):**
- On startup the JSON is loaded into an in-memory graph for query load.
- Later — an optional SQLite cache for large models.

---

## 8. LLM-friendliness — design principles

Hyphae's distinguishing feature, built into the core:

- **JSON Schema as the contract.** The Zod schemas are the source of truth. From them: the editor's TS types, the JSON Schema for validation, OpenAPI for the API, the MCP tools.
- **Stable IDs on everything.** The LLM references a specific node across messages.
- **Free text + structured fields.** `description` is semantics; `responsibilities` / `invariants` / `assumptions` are addressable structure.
- **Traceability as a graph.** Requirement ↔ Node ↔ Code via `Trace`/`realizedBy`/`codeRefs` connections. The LLM walks "requirement → component → code" — to verify the implementation and find gaps. The main value of the multi-axis model for AI.
- **Text export.** `getContext(scope)` renders the graph into compact plain text for a prompt — read by the LLM better than JSON.
- **MCP server (phase 4).** Read-only at the start: `get_node`, `list_nodes`, `find_connections`, `describe_flow`, `get_text_context`. Write tools — phase 6.
- **Inline descriptions, not separate files.** The LLM works with a single document better than with a scattering of them.

---

## 9. UX principles

- **Model-first.** The user edits the structure; diagrams are views. A node's position in each view is a visual hint, not the truth.
- **One step — one model operation.** Dragging a component into another container = a `parentId` change. Deleting a node = invalidating the connections and flows, explicitly highlighted in the UI.
- **Zoom navigation between layers.** Double-click a container → the container's Component view. Breadcrumbs on top.
- **Flow as an overlay.** Turn on a flow → the connections are highlighted on the current view in step order.
- **All of a node's fields in the side panel** on selection. The semantic fields for the LLM (`invariants`, `assumptions`) are first-class, not "advanced."

---

## 10. Technology stack

### Frontend
- **Vite** + **React 18** + **TypeScript**
- **@xyflow/react** (React Flow) — a node-based editor
- **Zustand** — the editor state
- **Tailwind CSS** — optional, for styling speed
- **dagre** — optional auto-layout

### Backend
- **Node 22+** (or Bun)
- **Hono** — the web framework (Fastify as an alternative)
- **Zod** — validation and schema definition

### Shared
- The `@hyphae/schema` package with the Zod schemas as the source of truth.
- From it: TS types for frontend/backend, JSON Schema via `zod-to-json-schema`.

### Repo structure
```
hyphae/
  apps/
    web/        # Vite + React frontend
    server/     # Hono backend
  packages/
    schema/     # Zod schemas + types + JSON Schema + profiles
  hyphae.json   # the model (or lives next to the user's project)
```
The package manager is **pnpm workspaces**.

### Dev workflow
- `pnpm dev` starts both processes.
- In dev the frontend is on the Vite dev server, the backend proxies the API.
- In prod the backend serves the built SPA from `apps/web/dist`.

### Time-saving decisions
- Not Redux. Zustand/Jotai is simpler for a node editor.
- Do not write JSON Schema by hand. Zod → `zod-to-json-schema`.
- Do not write a custom layout engine. React Flow + manual + dagre.
- REST is enough for the MVP. WebSocket — once a background AI agent appears.

---

## 11. Phased roadmap

### Phase 1 — MVP editor (2–4 weeks)
- Zod schemas: nodes, connections, flows, profiles; reserved empty collections (dataTypes/stateMachines/requirements/decisions).
- Server: `GET/PUT /model` (atomic write).
- A React Flow editor for a single layer — Component.
- A side panel for all of a node's fields.
- Saving node positions in views.

### Phase 2 — Multi-level (2–3 weeks)
- The Context, Container, Component layers (the `c4-backend` profile).
- Zoom navigation (double-click drill-down, breadcrumbs).
- Containment (`parentId`).
- Cross-layer view: "all components of this container."

### Phase 3 — Flows (2–3 weeks)
- Creating flows: selecting nodes and connections, adding steps, control structures (alt/opt/loop/par).
- Visualization over the view (highlighting + step numbers).
- A sequence-style view (vertical diagram) as an alternative mode.

### Phase 4 — MCP server for the AI (read-only)
- Tools: `get_node`, `list_nodes`, `find_connections`, `describe_flow`, `get_text_context`.
- A local MCP server, connects to Claude Code / another MCP client.
- The first moment Hyphae becomes what it was started for — an AI-friendly knowledge base.

### Phase 5 — Code binding
- `codeRefs` are validated: does the file/symbol reference an existing point.
- A tree-sitter parser (`web-tree-sitter` in Node).
- A computed Code layer: auto-generating classes/functions from the code, bound to a Component.
- Drift detection: components without an implementation, classes not reflected in the model.

### Phase 6 — LLM editing (write tools in MCP)
- Write tools: `update_node`, `add_connection`, `add_flow`, `rebind_code`.
- The AI proposes a model change — the user reviews it as a PR-like diff.
- Reverse flow: the user edits the model → the AI generates a code-change plan → applies it.

### Phase 7+ — deferred
- Activating the Behavior / Data / Intent axes in the editor (the schema is already there from phase 1).
- The frontend / cli / desktop profiles.
- Multi-system landscape.
- Real-time collaboration (Yjs / CRDT).
- Deployment / infra views.
- Metrics, hotspots, drift dashboards.

---

## 12. Open questions

- **Code layer: nodes or a graph?** In phase 5, decide: do we draw Code as a full class graph, or keep Code nodes "attached" to Components without a separate view.
- **Flow granularity.** Is a step a method call or a logical action? Possibly both, with a level of detail as a parameter.
- **Profiles: built-in or plugins?** Will frontend/cli/desktop stay built-in vocabularies, or become loadable plugins with their own validators.
- **Multiple files vs single file.** When the model gets large — split it by systems/containers? Deferred until it becomes a problem.
- **In-file versioning.** `schemaVersion` in `hyphae.json` from day one — for migrations.
- **Git merge conflicts.** Two edits to the same node → a JSON conflict. The solution — a deterministic formatter + a clear structure +, in the long run, a schema-aware merge tool.

---

*The final Zod schemas are a separate artifact in `packages/schema`. The model concept is [MODEL.md](./MODEL.md).*

*Spec version: 0.2 — to be updated as decisions are made.*
