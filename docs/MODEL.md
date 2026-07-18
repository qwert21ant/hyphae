# Hyphae — Model Concept

> How Hyphae describes **any** project with a small set of entities — no excess, no
> duplication — so that a single artifact is **legible as a diagram for a human** and
> **queryable/writable as a graph for an LLM**. This document is the model (the meta level).
> The product, scope, and implementation are in [SPEC.md](./SPEC.md). The repositioning that
> shaped this version is recorded in
> [docs/superpowers/specs/2026-07-18-business-legible-rethink-design.md](./superpowers/specs/2026-07-18-business-legible-rethink-design.md).

---

## 1. Problem and premise

C4 describes 2 things: static structure (what is made of what) and static dependencies (who
knows whom). That is not enough to describe an arbitrary project: there is no behavior over
time, no data domain, no "why" (requirements and decisions). And a bare box-and-arrow diagram
is not **legible on its own** — you learn what anything does only by opening a panel.

The temptation is a dedicated diagram per case (ERD, state chart, component tree,
user-journey, …) and a box-per-class. That leads to a zoo of entities, duplication, and
diagrams no one can read at a glance.

**Hyphae's premise:**

1. **One artifact, two readers.** The same model is a diagram a person understands at a glance
   and a graph an LLM queries and edits. The diagram is primary; it is a projection of the
   graph, not a second copy.
2. **The diagram carries meaning; the panel carries detail.** A node shows its role and a
   one-line purpose; a connection shows an **action verb + object** ("reads camera list",
   "stores clip"). Everything deeper lives in the side panel.
3. **A small set of orthogonal axes.** A diagram is a projection of one or two axes, not a
   separate entity.
4. **Mechanisms are universal; the type vocabulary is profiled.** Node, connection, verb,
   flow, pattern, data entity, and view work the same for a server, a frontend, a CLI. Only
   the profile vocabulary changes.
5. **Anti-redundancy as a rule.** A new first-class entity is introduced only if it needs to
   be addressed/linked independently. Otherwise it is a field.

---

## 2. Six description axes

The axes are orthogonal — each answers its own question. A project is a slice across several
axes at once.

| Axis | Question | Carriers in the model | Projections (diagrams) |
|------|----------|-----------------------|------------------------|
| **Structure** | what it is made of | node `parentId`, node `role` | containment map, UI-tree, module-tree |
| **Dependencies / Collaboration** | who does what to whom | connections `type` + **verb** + object | dependency graph, collaboration diagram |
| **Behavior** | what happens over time | `flows`, state-machine `patterns` | numbered flow overlay, sequence, state chart |
| **Data** | what data it operates on | `dataEntities` + connection `carries` | ERD, data-flow |
| **Intent** | why, which requirements/decisions | `requirements`, `decisions` + `Trace` connections | traceability matrix, decision map |
| **Presentation** | how to view it | `views` | layouts, filters, saved views |

The key idea: **many diagrams, few axes.** A numbered flow and a state chart are both the
Behavior axis. An ERD is a projection of the Data axis. You do not need N entity types for N
diagrams.

A seventh concept, **Pattern**, is not an axis but a first-class *overlay* that gives Structure
a recognized *shape* (pipeline, middleware chain, layered, event-bus, state machine). See §3.4.

---

## 3. Universal mechanisms (the core)

Profile-independent. Always the same.

### 3.1 Node
Any addressable entity in the model. **The node core is lightweight and profile-independent:**
`id` / `name` / `type` / `role` / `description` / `parentId` (structure) / `root` / `codeRefs` /
`docRefs` / `createdAt` / `updatedAt` and a `fields` bag (domain values). `root` is an optional
directory **Ref** (§3.7) that anchors this node's subtree on disk; refs below it resolve
against it. `role` selects the
node's **archetype** — the shape/icon it draws with (actor, service, datastore, queue,
external, UI surface …) — from the profile. Everything domain-specific
(`responsibilities`, `invariants`, `technology`, …) is a **profile field**, stored in `fields`
and validated against the active profile. The concrete node **types** come from the profile;
`layer` / `category` are derived from `type`.

### 3.2 Connection
A first-class edge, and the main carrier of on-diagram meaning. Core:
`id` / `from` / `to` / `type` / **`verb`** / **`object`** / `description` / `direction` /
`realizedBy` (cross-layer) / `codeRefs` and a `fields` bag.

- **`type`** is the connection kind (ConnectionKind) from the profile
  (`Dependency` | `DataFlow` | `Realization` | `Trace` in `c4-backend`).
- **`verb`** is a profile-declared business action shown on the edge, grouped into
  colored classes — *data access* (reads / writes / stores / modifies / aggregates …),
  *messaging* (publishes / subscribes / notifies …), *control* (invokes / triggers /
  requests), *user* (views / submits / navigates). It replaces the former low-signal
  `intent` field.
- **`object`** is what the action acts on: a short noun, or a reference to a `DataEntity`
  (§3.5), linking the edge into the data model ("reads → Camera").

The former transport axis becomes a **profile field** in `fields`
(`transport`: `Sync` / `Async` / `InProcess` / `None`).

> `Composition` was once a separate kind — removed; structure lives only in `parentId`.

### 3.3 Flow
An ordered scenario laid over nodes and connections — an overlay, not a separate diagram.
Numbered steps light up along the edges with per-step captions; `control` (alt/opt/loop/par)
handles branching. The Behavior axis, "horizontal" time. Flows are **built**, not reserved.

### 3.4 Pattern
A first-class **overlay** that annotates a set of members with a recognized *architectural
shape* and draws it specially. A `Pattern` has a `kind` (from the profile —
`pipeline` / `middleware` / `state-machine` / `layered` / `event-bus` …), a set of **members**,
and an optional ordering; each kind has a dedicated renderer.

A member is `{ name, nodeId? | ref?, description? }` — it points at **either a node id or a
code Ref** (§3.7). This matters: with code no longer modeled as nodes, a code-level pipeline's
stages have no nodes to reference, so they are named members carrying a `ref` into the source.
At higher altitudes members are node ids as usual.

Pattern is how code-level structure survives **without** modeling classes as nodes: a
Component annotated with a `pipeline` Pattern shows its stages, not thirty class boxes. The
old `StateMachine` entity folds in as the `state-machine` kind (states + transitions).

Pattern vs Flow: **Pattern is a static arrangement; Flow is a temporal traversal.** A pipeline
Pattern shows the stages; a Flow animates one request through them.

### 3.5 DataEntity
A named data object (Clip, Camera, User) — the Data axis, now real. Nodes **own / store** data
entities; connections **carry** them (via the connection's `object`/`carries`). An ERD is a
projection of ownership + carriage. A data type is first-class because it is reused by many
nodes and connections.

### 3.6 View
A saved viewing configuration: layer, filter, manual layout. The Presentation axis. Truth is
the structure; a view is presentation.

### 3.7 Ref
A **pointer to an artifact** — the single, general way the model addresses anything outside
itself. A Ref is a **plain string**; its kind is inferred from syntax:

| Syntax | Kind | Example |
|--------|------|---------|
| trailing `/` | directory | `src/views/cctv/` |
| plain path | file | `src/main.ts` |
| `path#Symbol` | code symbol | `src/main.ts#getRouter` |
| `path#Lstart-Lend` | line range | `src/main.ts#L10-L40` |
| contains `*` | glob | `src/views/**/*.vue` |

One concept, used everywhere: a node's `root` (directory Refs only), `codeRefs` on nodes and
connections, `docRefs` (a file Ref or a URL), and Pattern member `ref`s.

**Resolution — refs are relative, anchored by containment.** A Ref resolves against the
`root` of the **nearest ancestor that declares one**, found by walking `parentId`. A node's own
`root` resolves against its nearest ancestor's root in the same way, so roots chain down the
containment tree. Typically the System declares the project root, a Container declares its
subtree (`endpoints/media_gateway`, or a frontend app's directory), and Components inherit and
stay pleasantly short.

This reuses containment instead of inventing a mechanism, and it is what makes a relative ref
*resolvable*: without a declared root, `src/main.ts` is genuinely ambiguous when two containers
both have a `src/`. Refs are therefore **validatable** — the model can report a ref with no
anchoring root, a ref that resolves to two places, or a ref that does not exist on disk.

> Glob and directory Refs are what keep a Component's ref list short once code is no longer
> modeled as nodes: one `src/views/cctv/**` replaces thirty class refs.

> These mechanisms + profiles describe everything. A new project type = a new profile, not a
> new mechanism.

---

## 4. First-class entities

An entity is first-class if it is referenced independently (by `id`). The full list:

| Entity | Axis / role | Why first-class |
|--------|-------------|-----------------|
| **Node** | Structure / Dependencies | the base addressable block |
| **Connection** | Dependencies / Data / Intent | carries semantics (verb + object), not just an arrow |
| **Flow** | Behavior | a scenario reuses nodes/connections |
| **Pattern** | overlay on Structure/Behavior | a named shape addressed and rendered separately (absorbs StateMachine) |
| **DataEntity** | Data | a data object reused by many nodes/connections |
| **Requirement** | Intent | a requirement traces to many nodes *(reserved)* |
| **Decision (ADR)** | Intent | a decision affects many nodes *(reserved)* |
| **View** | Presentation | a named saved view |

**What is NOT first-class (profile fields, not entities):**
- `responsibilities`, local `invariants`, `technology`, `transport`, etc. — **profile
  fields** in the node/connection `fields` bag. (A cross-cutting invariant → a Requirement.)
- containment — `parentId`, not a connection entity.
- a connection's action — the `verb`/`object` **core fields**, not a separate entity.
- **a Ref** — a string value (§3.7), not an entity. It is never addressed by id; it is a
  pointer *out* of the model. Likewise a node's `root` is a field, not an entity.
- node positions — inside a View.

The boundary is simple: **"does this need to be referenced from elsewhere?"** Yes → an entity.
No → a field.

---

## 5. Profiles (the type vocabulary)

A profile is a declarative vocabulary of node types, roles, connection kinds, verbs, and
pattern kinds for a specific class of projects. It changes the vocabulary, not the mechanisms.

A profile is a **meta-schema**: it declares node kinds (with a `role`/archetype), connection
kinds, the **verb** vocabulary (with classes), **pattern** kinds, and their **fields** (with a
description of each field and each enum value — for the LLM and editor tooltips).

```
Profile {
  id
  layers: [...]                          // ordered profile layers
  nodeKinds: [
    { id, category: Structure|Behavior|Data|Intent|Actor,
      role,                              // archetype/shape (actor|service|datastore|queue|external|ui|…)
      layer, allowedParents:[...], allowedChildren:[...],
      fields: [FieldDef] }               // domain fields of this node kind
  ]
  connectionKinds: [
    { id, description, allowedFrom?:[...], allowedTo?:[...], fields:[FieldDef] }
  ]
  verbs: [
    { id, class: dataAccess|messaging|control|user, description }
  ]
  patternKinds: [
    { id, description, renderer,         // pipeline|middleware|state-machine|layered|event-bus|…
      ordered?: boolean }
  ]
  commonNodeFields:       [FieldDef]
  commonConnectionFields: [FieldDef]
}

FieldDef {
  key, label?,
  type: text|number|boolean|list|enum|ref,
  description,                           // required — for the LLM/editor
  required?,
  values?: [{ value, description }],     // for enum: each value is described
  refKind?                               // for ref: which node/entity kind it references
}
```

A kind's effective fields = `common*Fields`, then its own `fields`; **common wins** on a key
collision. A node's `layer`/`category` are **derived** from `type`. Field values are stored in
the `fields` bag and **strictly validated** against the profile (unknown key, wrong type,
disallowed enum, missing required, dangling ref — all rejected).

### Profile examples

| Profile | Layers / node types (roles) |
|---------|-----------------------------|
| **c4-backend** (primary) | Landscape · Context (System, Actor, ExternalSystem) · Container · Component. **No Code layer** — code lives in `codeRefs` + Patterns. |
| **frontend** | App · Route · View/Page · UIComponent · Store · Service |
| **cli** | Program · Command · Subcommand · Flag · Handler |
| **desktop** | App · Window · Panel · Menu · Action · Service |

All profiles use the same Connection / verb / Flow / Pattern / DataEntity / View. Frontend
navigation = a Flow over Route nodes; a screen's UI modes = a `state-machine` Pattern; a
request middleware = a `middleware` Pattern; a form ↔ DTO = a `carries` ref on a connection.
No special per-profile engine.

LLM-friendliness is preserved: node types, verbs, and pattern kinds are still a **closed,
finite, described** vocabulary — declarative rather than hardcoded.

---

## 6. Traceability — why it matters most for the LLM

The axes are tied together by end-to-end traceability, turning the model from "pictures" into
a queryable, verifiable knowledge graph:

```
Requirement ──Trace──> Node ──codeRefs──> code
Decision    ──Trace──> Node                (why it is this way)
Flow.steps  ──via────> Connection          (scenario → connections)
Connection  ──verb/object──> DataEntity     (what data, what action)
Connection  ──realizedBy──> Connection     (upper layer → lower)
Pattern     ──members───> Node | Ref       (recognized shape over structure or code)
Node        ──parentId──> Node             (structure)
Node        ──root──────> directory Ref    (anchors all refs in its subtree)
```

What it gives an LLM agent:
- "Which requirements does component X implement, and where in the code" — `Trace` → `codeRefs`.
- "What data does this flow move, and who stores it" — connection `verb`/`object`/`carries` → `DataEntity` owners.
- "What is the internal shape of this component" — its `Pattern` (pipeline/middleware/…).
- "What breaks if I change connection A→B" — `realizedBy` downward + the flows that use it.

That is the point of a multi-axis model: not to draw it prettier only, but to make the
architecture **legible *and* queryable *and* verifiable** at once.

---

## 7. Anti-redundancy principles

Rules that keep the model from sprawling and duplicating:

1. **One truth per fact.** "What it is made of" — only `parentId`. A connection's action —
   only `verb`/`object`. A data schema — only a `DataEntity` ref, not an inline string.
2. **An entity only if it is addressable.** See §4. Otherwise — a field.
3. **A diagram ≠ an entity.** A new visualization is a projection of existing axes.
4. **Static shape vs temporal scenario are different.** `Pattern` = arrangement,
   `Flow` = traversal; do not express one as the other.
5. **A project type = a profile, not an engine.** Express new project types via the common
   mechanisms + a profile, never new entities.
6. **Local goes inline, global becomes a node.** A single node's invariant — a field;
   cross-cutting — a Requirement.
7. **Code is refs + shape, not nodes.** A Component's internals are `codeRefs` + an optional
   Pattern, never a class-per-node graph.
8. **One ref concept, one anchor.** Every pointer out of the model is a Ref (§3.7); every Ref
   is anchored by the nearest ancestor `root`. A base path is declared once on the containment
   tree, never repeated per ref.

---

## 8. The full model (top-level structure)

```
HyphaeModel {
  schemaVersion
  metadata { name, description, createdAt, updatedAt }
  activeProfile                 // profile id
  nodes:         [Node]         // Structure + Dependencies (role drives shape)
  connections:   [Connection]   // Dependencies / Data / Intent (verb + object)
  flows:         [Flow]         // Behavior (horizontal) — built
  patterns:      [Pattern]      // overlay shapes (absorbs state machines) — built
  dataEntities:  [DataEntity]   // Data — built
  requirements:  [Requirement]  // Intent                 — reserved
  decisions:     [Decision]     // Intent                 — reserved
  views:         [View]         // Presentation
}
```

"Reserved" = the collection exists in the schema (an empty array) but has no editor/reader
yet. `requirements`/`decisions` remain reserved in this rethink; `flows`/`patterns`/
`dataEntities` move from reserved to built. See the roadmap in [SPEC.md](./SPEC.md).

---

## 9. Axis-to-phase mapping

| Axis / concept | Entities | When in the editor |
|----------------|----------|--------------------|
| Structure | Node, parentId, role | Phase A |
| Dependencies / Collaboration | Connection, verb/object | Phase A |
| Behavior | Flow | Phase B |
| overlay shapes | Pattern (incl. state-machine) | Phase C |
| Data | DataEntity, carries/owns | Phase D |
| Intent | Requirement, Decision | reserved |
| Presentation | View | Phase A |
| (profiles) | frontend / cli / desktop | after core |
| Code layer removal | migrate to codeRefs + Patterns | Phase E |

---

*Concept version: 0.3 — the business-legible rethink. To be updated alongside the
`packages/schema` schema.*
