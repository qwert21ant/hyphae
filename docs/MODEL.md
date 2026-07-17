# Hyphae — Model Concept

> How Hyphae describes **any** project with a small set of entities — no excess, no duplication — conveniently for both humans and LLMs. This document is about the model (the meta level). The product, scope, and implementation are in [SPEC.md](./SPEC.md).

---

## 1. Problem and premise

C4 describes 2 things: static structure (what is made of what) and static dependencies (who knows whom). That is not enough to describe an arbitrary project: there is no behavior over time, no data domain, no "why" (requirements and decisions). And frontend / CLI / desktop map poorly onto the System/Container/Component vocabulary.

The temptation is to add a dedicated diagram for each case (ERD, state chart, component tree, user-journey, …). That leads to a zoo of entities and duplication (the same thing expressed in different ways).

**Hyphae's premise:**

1. Any project is described by a **small set of orthogonal axes**. A diagram is a projection of one or two axes, not a separate entity.
2. **Mechanisms are universal; the type vocabulary is profiled.** Node, edge, flow, state machine, traceability, and view work the same for a server, a frontend, a CLI. Only the vocabulary of node types (the profile) changes.
3. **Anti-redundancy as a rule:** a new first-class entity is introduced only if it needs to be addressed/linked independently. Otherwise it is a field.

---

## 2. Six description axes

The axes are orthogonal — each answers its own question. A project is a slice across several axes at once.

| Axis | Question | Carriers in the model | Projections (diagrams) |
|------|----------|-----------------------|------------------------|
| **Structure** | what it is made of | node `parentId` | C4 containment, UI-tree, module-tree |
| **Dependencies** | who knows/uses whom | connections `type: Dependency` | dependency graph |
| **Behavior** | what happens over time | `flows`, `stateMachines` | sequence, state chart, activity |
| **Data** | what entities it operates on | `dataTypes` + DataFlow connections | ERD, data-flow |
| **Intent** | why, which requirements/decisions | `requirements`, `decisions` + `Trace` connections | traceability matrix, decision map |
| **Presentation** | how to view it | `views` | layouts, filters |

The key idea: **many diagrams, few axes.** Sequence and state chart are both the Behavior axis. ERD is a projection of the Data axis. A traceability matrix is a projection of the Intent axis. You do not need N entity types for N diagrams.

---

## 3. Universal mechanisms (the core)

Profile-independent. Always the same.

### 3.1 Node
Any addressable entity in the model. **The node core is lightweight and profile-independent:**
`id`/`name`/`type`/`description`/`parentId` (structure)/`codeRefs`/`docRefs`/`createdAt`/`updatedAt` and
a `fields` bag (domain values). Everything domain-specific (`responsibilities`, `invariants`,
`technology`, …) is a **profile field**, stored in `fields` and validated against the active profile.
The concrete node **types** come from the profile; `layer`/`category` are derived from `type`.

### 3.2 Connection
A first-class edge. Core: `id`/`from`/`to`/`type`/`description`/`direction`/`realizedBy` (cross-layer)/`codeRefs`
and a `fields` bag. **`type` is the connection kind (ConnectionKind) from the profile** (`Dependency` | `DataFlow` |
`Realization` | `Trace` in `c4-backend`); it replaced the former `relationCategory`.

The former orthogonal connection axes became **profile fields** in `fields` (each value described for the
LLM): `transport` (`Sync`/`Async`/`InProcess`/`None`) and `intent` (`Read`/`Write`/`Trigger`/`Notify`/`Use`).
A profile may also define other fields on a specific connection kind (e.g. `dataTypeRef` on `DataFlow`).

> `Composition` was once a separate kind — removed; structure lives only in `parentId`.

### 3.3 Flow
An ordered scenario laid over nodes and connections. An overlay, not a separate diagram. Steps with `control` (alt/opt/loop/par) for branching. The Behavior axis, "horizontal" time.

### 3.4 StateMachine
Attached to a node. states + transitions {from, to, trigger, guard, effect}. The Behavior axis, "lifecycle." Covers protocols, domain (order status), UI modes.

### 3.5 View
A saved viewing configuration: layer, filter, manual layout. The Presentation axis. Truth is the structure; a view is presentation.

> These five mechanisms + profiles describe everything. A new project type = a new profile, not a new mechanism.

---

## 4. First-class entities

An entity is first-class if it is referenced independently (by `id`). The full list:

| Entity | Axis | Why first-class |
|--------|------|-----------------|
| **Node** | Structure / Dependencies | the base addressable block |
| **Connection** | Dependencies / Data / Intent | a connection carries semantics, not just an arrow |
| **Flow** | Behavior | a scenario reuses nodes/connections |
| **StateMachine** | Behavior | a lifecycle is addressed separately from a node |
| **DataType** | Data | a type is reused by many nodes/connections |
| **Requirement** | Intent | a requirement traces to many nodes |
| **Decision (ADR)** | Intent | a decision affects many nodes |
| **View** | Presentation | a named saved view |

**What is NOT first-class (profile fields, not entities):**
- `responsibilities`, local `invariants`, `technology`, `transport`, `intent`, etc. — **profile fields**
  in the node/connection `fields` bag, not separate entities. (A cross-cutting invariant → becomes a
  Requirement.)
- containment — `parentId`, not a connection entity.
- node positions — inside a View.

The boundary is simple: **"does this need to be referenced from elsewhere?"** Yes → an entity. No → a field.

---

## 5. Profiles (the type vocabulary)

A profile is a declarative vocabulary of node types and rules for a specific class of projects. It changes the vocabulary, not the mechanisms.

A profile is now a **meta-schema**: it declares node kinds, connection kinds, and their **fields** (with a
description of each field and each enum value — mainly for the LLM and editor tooltips).

```
Profile {
  id
  layers: [...]                         // ordered profile layers
  nodeKinds: [
    { id, category: Structure|Behavior|Data|Intent|Actor,
      layer, allowedParents:[...], allowedChildren:[...],
      fields: [FieldDef] }              // domain fields of this node kind
  ]
  connectionKinds: [
    { id, description, allowedFrom?:[...], allowedTo?:[...], fields:[FieldDef] }
  ]
  commonNodeFields:       [FieldDef]    // apply to all node kinds
  commonConnectionFields: [FieldDef]    // apply to all connection kinds
}

FieldDef {
  key, label?,
  type: text|number|boolean|list|enum|ref,
  description,                          // required — for the LLM/editor
  required?,
  values?: [{ value, description }],    // for enum: each value is described
  refKind?                              // for ref: which node kind it references
}
```

A kind's effective fields = `common*Fields`, then its own `fields`; **common wins** on a key
collision (`effectiveFields(profile, kindId, scope)`). A node's `layer`/`category` are **derived**
from `type`. Field values are stored in the node/connection `fields` bag and **strictly validated**
against the profile (unknown key, wrong type, disallowed enum value, missing required, dangling
ref — all of these are rejected).

### Profile examples

| Profile | Layers / node types |
|---------|---------------------|
| **c4-backend** (MVP) | Landscape · Context (System, Actor, ExternalSystem) · Container · Component · Code |
| **frontend** | App · Route · View/Page · UIComponent · Store · Hook · Service |
| **cli** | Program · Command · Subcommand · Flag · Arg · Handler |
| **desktop** | App · Window · Panel · Menu · Action · Service |

All profiles use the same Connection / Flow / StateMachine / DataType / Requirement / View. For example, frontend navigation = a Flow over Route nodes; a screen's UI modes = a StateMachine; a form ↔ DTO = a `dataTypeRef` on a connection. No special frontend engine.

LLM-friendliness is preserved: the type vocabulary is still **closed and finite** — it is just declarative rather than hardcoded.

---

## 6. Traceability — why it matters most for the LLM

The axes are tied together by end-to-end traceability. This turns the model from "pictures" into a queryable, verifiable knowledge graph:

```
Requirement ──Trace──> Node ──codeRefs──> code
Decision    ──Trace──> Node                (why it is this way)
Flow.steps  ──via────> Connection          (scenario → connections)
Connection  ──realizedBy──> Connection     (upper layer → lower)
Node        ──parentId──> Node             (structure)
Connection  ──dataTypeRef──> DataType      (what is passed)
StateMachine ──attached to──> Node         (lifecycle)
```

What it gives an LLM agent:
- "Which requirements does component X implement, and where is that in the code" — traverse `Trace` → `codeRefs`.
- "Requirement Y is declared, but no node implements it" — a coverage gap.
- "Why is the component built this way" — the linked Decision nodes.
- "What breaks if I change connection A→B" — `realizedBy` downward + the flows that use it.

That is the point of a multi-axis model: not to draw it prettier, but to make the architecture **queryable and verifiable**.

---

## 7. Anti-redundancy principles

Rules that keep the model from sprawling and duplicating:

1. **One truth per fact.** "What it is made of" — only `parentId` (the Composition connection is removed). A connection's data schema — only `dataTypeRef` (not an inline string).
2. **An entity only if it is addressable.** See §4. Otherwise — a field.
3. **Split overloaded enums along orthogonal axes.** A connection: nature / transport / intent — three fields, not one.
4. **A diagram ≠ an entity.** A new visualization is a projection of existing axes, not a new data type.
5. **A project type = a profile, not an engine.** Do not add frontend-specific entities; express them via the common mechanisms + a profile.
6. **Local goes inline, global becomes a node.** A single node's invariant — a field; cross-cutting — a Requirement.

---

## 8. The full model (top-level structure)

```
HyphaeModel {
  schemaVersion
  metadata { name, description, createdAt, updatedAt }
  activeProfile                 // profile id
  nodes:         [Node]         // Structure + Dependencies
  connections:   [Connection]   // Dependencies / Data / Intent
  flows:         [Flow]         // Behavior (horizontal)
  stateMachines: [StateMachine] // Behavior (lifecycle)   — reserved in MVP
  dataTypes:     [DataType]     // Data                   — reserved in MVP
  requirements:  [Requirement]  // Intent                 — reserved in MVP
  decisions:     [Decision]     // Intent                 — reserved in MVP
  views:         [View]         // Presentation
}
```

"Reserved in MVP" = the collection exists in the schema from day one (an empty array); the editor/visualization arrive in phase 7+. This lays down the axes without a costly migration — see the roadmap in [SPEC.md](./SPEC.md).

---

## 9. Axis-to-phase mapping

| Axis | Entities | When in the editor |
|------|----------|--------------------|
| Structure | Node, parentId | Phase 1–2 |
| Dependencies | Connection | Phase 1 |
| Behavior | Flow | Phase 3 |
| Behavior | StateMachine | Phase 7+ |
| Data | DataType | Phase 7+ |
| Intent | Requirement, Decision | Phase 7+ |
| Presentation | View | Phase 1 |
| (profiles) | frontend / cli / desktop | Phase 7+ |

The schema for all axes is present from phase 1.

---

*Concept version: 0.1 — the starting document, to be updated alongside the `packages/schema` schema.*
