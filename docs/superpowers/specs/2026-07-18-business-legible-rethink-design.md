# Hyphae rethink — a business-legible architecture model

> Date: 2026-07-18. This design records a deliberate repositioning of Hyphae toward
> IcePanel-style, human-legible diagrams that stay meaningful in business-domain terms,
> while keeping the model first-class-readable and writable by LLM agents over MCP.
> It supersedes the framing (not the mechanisms) of the earlier
> [MODEL.md](../../MODEL.md) / [SPEC.md](../../SPEC.md), which are rewritten to match.

---

## 1. Why rethink

Hyphae today is an LLM-first C4 knowledge graph that happens to render. Two problems
surface in real use (measured on `apps/server/hyphae-cctv-new.json`, 404 nodes / 567 conns):

1. **Diagrams are not legible on their own.** A node is a box with a name; a connection is
   an arrow. To learn what anything *does* you open the side panel. The picture does not
   convey the architecture — it indexes it.
2. **The Code layer drowns everything.** 74% of nodes and 60% of edges are class/interface
   plumbing. The value lives in the ~92 Container/Component summaries; the rest is noise a
   human never browses and an LLM pages through.

The goal of the rethink: a diagram a person understands *at a glance* — what users do to the
system, how components collaborate, what data moves and how it is processed — backed by the
same graph an AI can query and edit. **Diagram-first, but the diagram and the knowledge graph
are one artifact.**

## 2. Decisions (this design's fixed points)

These were settled explicitly during brainstorming:

| # | Decision |
|---|----------|
| D1 | **North star: human-diagram-first, LLM still core.** The diagram becomes the product; the model humans read is the model the LLM reads/writes. |
| D2 | **Meaning lives in both rich edges and Flows.** Every connection is self-describing on the diagram (verb + object); named Flows overlay numbered step-sequences for scenarios. |
| D3 | **Drop code-as-nodes.** Stop modeling individual classes/interfaces as diagram nodes. Code presence = `codeRefs` on components + a Pattern describing internal structure. |
| D4 | **Patterns are a new profile-driven overlay entity.** A universal `Pattern` mechanism with a per-profile kind vocabulary (pipeline / middleware / state-machine / layered / event-bus …) and specialized renderers. `StateMachine` folds in as one kind. |
| D5 | **The Data axis becomes real.** Named `DataEntity` objects that connections *carry* and nodes *own/store*, plus an ERD-style projection. Business-verb vocabulary on connections shows data access. |
| D6 | **This session's deliverable is docs only.** Rewrite MODEL.md + SPEC.md around this design and add this dated doc. No implementation plan yet. |
| D7 | **One general `Ref` (a string), anchored by an inherited `root`.** Refs cover dir / file / symbol / line-range / glob with kind inferred from syntax. Any node may declare `root`; a ref resolves against the nearest ancestor that declares one. See §9. |

## 3. Design principles (IcePanel-inspired)

1. **Diagram carries meaning; panel carries detail.** On the canvas a node shows name +
   role icon + a one-line purpose (+ tech chip); a connection shows an **action verb +
   object** ("reads camera list", "stores clip"). Full description, responsibilities,
   invariants, all `fields`, `codeRefs`, and incoming/outgoing lists live in the side panel.
2. **Model once, project many.** A node appears in many views/diagrams; a diagram is a
   projection, not a source of truth. (Kept from today.)
3. **Legibility budget.** A diagram stays readable by construction: cap what is shown at
   rest; push depth into drill-down, Flows, Patterns, and the panel.
4. **Few axes, many projections.** A new diagram is a projection of existing axes, not a new
   data type. (Kept from today.)
5. **Mechanism universal, vocabulary profiled.** Node, connection, verb, flow, pattern, data
   entity, view work the same for a server, a frontend, a CLI. Only the profile vocabulary
   changes. (Kept and extended.)

## 4. The visual language (the heart of the change)

Beyond plain nodes + edges, the canvas gains:

### 4.1 Node roles / archetypes
Distinct shapes/icons — actor (person), datastore (cylinder), queue, external system,
service, UI surface — **declared by the profile**, chosen from a node's `role`. A person
reads shape before text; today every node is the same rectangle.

### 4.2 Verb-labeled connections
Each edge shows a **business verb + object**, styled/colored by verb-class. This replaces the
low-signal `intent` field (80% the generic "Use" today). The verb vocabulary is
profile-declared; suggested classes for `c4-backend`:

- **Data access** — reads · writes · stores · modifies · aggregates · deletes · queries
- **Messaging** — publishes · subscribes · sends · notifies
- **Control** — invokes · triggers · requests
- **User** — views · submits · navigates

The *object* is either a short free-text noun or a reference to a `DataEntity` (§4.5), so
"reads → Camera" links the edge to the data model.

### 4.3 Patterns (new overlay entity)
Profile-driven architectural motifs with dedicated renderers:

| Kind | Renderer | Typical altitude |
|------|----------|------------------|
| **pipeline** | ordered stages in a row, data flowing through | inside a Component (code) or across Components |
| **middleware / interceptor chain** | onion / stack a request passes through | inside a Component |
| **state-machine** | state chart (states + transitions) | attached to a node |
| **layered** | stacked bands (e.g. UI / domain / data) | across a Container |
| **event-bus / pub-sub** | hub with publishers/subscribers | across Components/Containers |

A `Pattern` references a set of members and an optional ordering; the renderer draws the
recognizable shape. `StateMachine` is folded in as the `state-machine` kind (no separate
entity). Patterns are how code-level structure survives **without** code-as-nodes: a
Component annotated with a `pipeline` Pattern shows its stages, not 30 class boxes.

A member is `{ name, nodeId? | ref?, description? }` — either a node id or a code Ref. Code-level
patterns need the `ref` form, since their stages no longer have nodes. See §9.3.

### 4.4 Flows (built, not reserved)
Select a scenario and its numbered steps light up along the edges with per-step captions:

> **User views live feed** → ① request stream ② authorize ③ open RTSP ④ stream frames

Flows are the temporal counterpart to Patterns' static shape: a `pipeline` Pattern shows the
stages; a Flow animates a specific request through them. Flows move from "schema-reserved" to
actually built (editor + numbered overlay + MCP).

### 4.5 Data entities (Data axis made real)
Named data objects (Clip, Camera, User) that connections **carry** and nodes **own / store**,
with an ERD-style data projection. This answers "what data moves where and who is responsible
for it," which verbs alone cannot.

## 5. The model (entities)

Universal mechanisms; vocabulary profiled. Changes from today are called out.

| Entity | Status | Change |
|--------|--------|--------|
| **Node** | core | `role`/archetype drives shape; core stays light; domain values in `fields`. |
| **Connection** | core | first-class **verb** + **object/carries** shown on the diagram; `transport` etc. demoted to `fields`; `intent` retired. |
| **Flow** | **now built** | ordered scenario overlay with numbered steps; MCP + editor + renderer. |
| **Pattern** | **NEW** | profile-driven overlay: `kind`, members (node id **or** code Ref — §9.3), optional ordering, specialized renderer. Absorbs `StateMachine`. |
| **DataEntity** | **now built** | named data type; owned by nodes, carried by connections; ERD projection. |
| **Requirement / Decision** | still reserved | out of scope for this rethink; left dormant to avoid sprawl. |
| **View** | core | saved projection. |

### 5.1 Code layer removal
The Code node layer is removed. Code presence is expressed by:
- `codeRefs` on a Component (pointers to real files/symbols), and
- an optional `Pattern` describing the Component's internal structure.

Profiles drop the Code node kinds (Class / Interface / Module / Function / UIComponent). The
"code altitude" becomes **"inside a Component: its pattern + its code refs,"** not a class
graph. `realizedBy` on connections (the genuine summarization mechanism today) still applies
between the surviving altitudes.

## 6. Axes (revised)

Structure (`parentId`) · Collaboration/Dependencies (connections + verbs) · **Behavior**
(Flows + state-machine Patterns) · **Data** (DataEntities + carries/owns) · Intent
(Requirements/Decisions, reserved) · Presentation (Views).

`Pattern` is a first-class overlay (like Flow) that gives Structure a recognized *shape*; a
Flow gives it a *traversal*. Anti-redundancy holds: Pattern = static arrangement,
Flow = temporal scenario, `parentId` = containment — no fact is expressed twice.

## 7. What stays (do not churn)

- Universal-mechanism / profiled-vocabulary split; anti-redundancy rules; traceability as a
  graph; single JSON source of truth; granular validated writes; MCP read/write surface.
- `technology`, `transport` (as a field), `realizedBy` + rollup, and the `Realization`
  connection kind — all measured as load-bearing.
- The focus-view drill-down, floating edges, containment regions, and side panel — extended,
  not replaced.

## 8. Roadmap (folded into SPEC.md)

- **A — Visual language:** role shapes/icons, verb-labeled edges, on-diagram-label vs
  side-panel-detail split, legend. Reuses the existing focus view.
- **B — Flows:** build the reserved Behavior axis (editor + numbered overlay + MCP).
- **C — Patterns:** the overlay entity + renderers (pipeline, middleware, state-machine,
  layered, event-bus), profile-driven.
- **D — Data axis:** DataEntities, carries/owns, data/ERD projection.
- **E — Retire Code node layer:** migrate existing models (fold code nodes → codeRefs /
  Patterns), drop Code kinds from profiles.

Configurable per-project profiles (the standing goal) threads through B–D: the verb, pattern,
and role vocabularies are all profile-declared, so a new project type is a new profile, not a
new engine.

## 9. Refs and roots (D7)

Removing code-as-nodes promotes `codeRefs` from a convenience to **the sole carrier of "where
is this implemented."** That forced a look at how refs actually behave today.

### 9.1 Evidence from the current model

Measured over 399 distinct refs in `apps/server/hyphae-cctv-new.json`:

- **No anchor exists.** All 11 Containers, the System, and 52 Components have zero `codeRefs`.
  Nothing in the model records a root directory.
- **The convention has already drifted** across at least four implied bases:
  `endpoints/media_gateway/backend/WebService/Program.cs` (repo-relative),
  `WebService/Program.cs#Program` (container-relative), `src/main.ts` (app-relative),
  `Contracts/Types/Feed.cs` (project-relative).
- **16 refs are genuinely ambiguous** — the same string resolves to two containers:
  `src/main.ts` → Full Client *and* Streaming Client; `WebService/Program.cs#Program` →
  Stream Keeper *and* Layout Manager; `Contracts/Types/Feed.cs#Feed` → Camera Manager *and*
  Stream Keeper.

Relative-to-component-root is a good convention; it just has to be **declared and inherited**
rather than assumed, so it can be validated instead of drifting.

### 9.2 The design

- **Ref = a plain string**, kind inferred: `dir/` · `file.ts` · `file.ts#Symbol` ·
  `file.ts#L10-L40` · `glob/**/*.vue`. Chosen over a structured object because all 399 existing
  refs already fit `path` / `path#Symbol` (zero migration), it is cheap for an LLM to write, and
  it stays git-diff friendly. Validated by a shape checker rather than by field structure.
- **`root` is optional on any node**, resolved against the nearest ancestor that declares one
  (walking `parentId`). Roots chain: System → Container → Component. This reuses containment
  instead of inventing a mechanism (anti-redundancy rule 5) and handles the monorepo case
  visible in the data (`endpoints/media_gateway` alongside a frontend `src/`).
- **One concept everywhere:** `root`, `codeRefs`, `docRefs`, and Pattern member `ref`s.

### 9.3 Consequence — a correction to §4.3/§5

The design as first written said Pattern `members` are node ids. With code no longer modeled as
nodes, **a code-level pipeline's stages have no nodes to reference.** Corrected: a member is
`{ name, nodeId? | ref?, description? }`, carrying exactly one of `nodeId` or `ref`. Code-level
patterns use `ref`; higher-altitude patterns use `nodeId`.

This also resolves a scaling problem in the Code-layer removal: 328 refs currently on
Class/Interface/Module nodes fold up onto 81 Components. Flat lists of thirty refs would be
unusable — **directory and glob Refs** absorb the bulk (`src/views/cctv/**`), and the structure
worth naming individually survives as Pattern members.

## 10. Open questions (for the plan, not this doc)

- **Migration of the Code layer.** How to fold existing Code nodes into `codeRefs`/Patterns
  without losing described structure — automatic vs assisted.
- **Verb enum vs free text.** Closed profile-declared verb list (LLM-friendly) vs a small
  closed core + free object text. Leaning closed verb + free/ref object.
- **Pattern member ordering & overlap.** Can a node belong to two Patterns? How is ordering
  authored for pipelines?
- **Data projection scope.** How much ERD to build in D vs defer (relationships between
  entities, cardinality).
- **Legibility caps.** Concrete at-rest limits (max edges/nodes shown before rollup kicks in).
