# Phase A — Visual language (design)

> Date: 2026-07-19. Records the decisions for Phase A of the business-legible rethink.
> Parent program plan: [2026-07-18-business-legible-rethink.md](../plans/2026-07-18-business-legible-rethink.md).
> Parent design: [2026-07-18-business-legible-rethink-design.md](2026-07-18-business-legible-rethink-design.md) (D1, D2, §3, §4.1–4.2).
> Builds on the shipped Phase A0 (refs and roots).

---

## 1. Goal

Make the diagram legible without opening the side panel. Today a node is a rectangle
containing `name\n(type)` and an edge is an arrow labeled with its connection kind
(`Dependency`, 471 of 567 times). Neither tells a reader what anything *does*.

After this phase a node shows **role shape + name + one-line purpose + tech chip**, and a
connection shows **verb + object** colored by verb class.

## 2. Fixed constraints for this phase

- **No model-file migration, at all.** No migration script, no rewriting
  `hyphae-cctv-new.json`. Existing files must still *load*; they are allowed to report
  validation issues.
- Zod schemas in `packages/schema/src` stay the single source of truth.
- `schemaVersion` stays `1` — every schema change here is additive-with-default or a
  profile-vocabulary change, so no on-disk shape breaks.
- New vocabulary is profile-declared, never hardcoded in the renderer.
- `pnpm -r test` passes, and all three packages type-check (`pnpm -r test` does **not**
  type-check — vitest strips types via esbuild).

## 3. Measured facts behind the decisions

Measured on `apps/server/hyphae-cctv-new.json` (404 nodes / 567 connections):

| Fact | Value | Consequence |
|---|---|---|
| `intent` distribution | `Use` 416, Read 59, Write 24, Trigger 13, Notify 5, unset 50 | 73% generic — retired, replaced by `verb` |
| `direction` | Unidirectional 563, Bidirectional 4 | near-constant, but the 4 are real — **kept** |
| connection `type` | Dependency 471, Realization 61, DataFlow 35 | a poor edge label; verb replaces it |
| `technology` | 92/92 filled | high signal — earns a place on the node |
| descriptions, Component-and-above | 105 nodes, **0 empty**; first sentence p50 55 / p90 140 / max 405 chars | too long and too variable to be the on-diagram purpose line |

## 4. Decisions

### D-A1 — `role` is a per-kind default with a per-node override

`docs/MODEL.md` §3.1 lists `role` as a node core field; the program plan puts it on
`NodeKindSchema`. These contradict, and the difference is load-bearing: 81 of 404 nodes are
`Component`, so a kind-only role draws every Component identically and the Component level —
where most reading happens — gains nothing.

**Resolved in favor of both.** The profile declares the role vocabulary *and* a default role
per node kind; a node may override it. `Actor` and `ExternalSystem` get their shapes for free;
a Component that is really a datastore or a queue can say so.

### D-A2 — `verb` is a core connection field with a default

`verb: z.string().default('uses')`, exactly as `direction` already defaults. This dissolves
the "is verb required?" question the program plan left open: a defaulted field is always
present after parse, so an old file gains a verb at load time and **no** connection can ever
report `missing-required-field`. It is required in effect without requiring a migration.

`object` is `z.string().default('')` — free text this phase. Phase D turns it into a
`DataEntity` reference.

### D-A3 — `intent` is retired outright

Removed from the profile. `fields` is strictly validated, so this makes the 517 connections
carrying `intent` report `unknown-field` on the existing model. **Accepted** — the user chose
the clean schema over compatibility with a file they are not migrating.

### D-A4 — the purpose line is a dedicated `summary` field, not derived

Considered deriving it from the first sentence of `description` (attractive because 0 of 105
nodes have an empty description). **Rejected:** the first sentence runs 140+ chars at p90 and
405 at worst, and a derived line cannot be corrected when it summarizes badly.

`summary` is a profile field, `required: true` on exactly the five non-Code kinds —
`System`, `Actor`, `ExternalSystem`, `Container`, `Component` (13 + 11 + 81 = 105 nodes in the
fixture) — and **absent from the Code kinds** (`Class`, `Interface`, `Module`, `UIComponent`,
`Function`), so a forgetful agent is caught by `validate_model` without dragging 299 Code nodes
into the requirement. `description` is preserved untouched and becomes
side-panel-only. The modeling skill instructs agents to always fill `summary`.

This is the one decision that manufactures new validation noise (~105
`missing-required-field`) rather than inheriting it. Accepted deliberately: the requirement is
what makes agents fill the field that the whole phase depends on.

### D-A5 — `direction` survives

At 563/567 constant it is a candidate for removal, but it is already core, arrowhead rendering
reads it, and the 4 `Bidirectional` edges are genuine. Removing it is churn against the
"do not churn" list in the parent design §7.

### D-A6 — verb class colors avoid violet

`#7c3aed` violet already means "derived rollup edge" in `flow.ts` and the legend. The `user`
verb class uses rose instead, so no color carries two meanings.

## 5. Schema changes

```
Node        + role: z.string().nullable().default(null)      // override; null = use kind default
Connection  + verb: z.string().default('uses')               // profile verb id
            + object: z.string().default('')                 // short noun, free text this phase
            - (intent leaves the profile, not the schema — it lived in `fields`)

ProfileSchema     + roles: [{ id, description, shape }]
                  + verbs: [{ id, class, description }]
NodeKindSchema    + role: string                             // this kind's default role
```

`summary` is added as a `FieldDef` on the relevant node kinds — not a core column, since it is
domain vocabulary and belongs in the `fields` bag like `technology`.

## 6. Profile vocabulary (`c4-backend`)

**Roles** — mechanism is universal, this vocabulary is profiled:

| Role | Shape | Default for |
|---|---|---|
| `actor` | person | `Actor` |
| `service` | rectangle | `System`, `Container`, `Component`, `Class`, `Interface`, `Module`, `Function` |
| `datastore` | cylinder | — (override only) |
| `queue` | open-ended bar | — (override only) |
| `external` | dashed rectangle | `ExternalSystem` |
| `ui` | rectangle with title bar | `UIComponent` |

**Verbs** — closed, described, grouped into colored classes:

| Class | Verbs | Color |
|---|---|---|
| `dataAccess` | reads · writes · stores · modifies · aggregates · deletes · queries | blue `#0369a1` |
| `messaging` | publishes · subscribes · sends · notifies | amber `#b45309` |
| `control` | invokes · triggers · requests · **uses** | slate `#475569` |
| `user` | views · submits · navigates | rose `#be185d` |

`uses` is the neutral default from D-A2 and sits in `control`.

## 7. Rendering

- **Node**: box grows from 160×44 to ~190×64 for three lines — **name** (bold), **purpose**
  (`summary`, capped ~70 chars with an ellipsis), **tech chip** (`fields.technology`). The
  role drives the shape; the existing C4 layer tint stays as the fill, so altitude and
  archetype are both readable.
- **Edge**: label becomes `verb + object` ("reads camera list"); stroke and label colored by
  verb class. An empty `object` degrades to the verb alone. Derived rollup edges keep their
  purple dashed treatment and count label, unchanged.
- **Legend**: gains a role-shape key and a verb-class color key beside the existing layer and
  edge sections.
- **Side panel**: splits into **On diagram** (name, role, summary, technology, verb, object)
  and **Detail** (description, responsibilities, invariants, refs, connection lists). A
  reorganization of existing controls plus the new fields — not a rewrite.

Label density on a high-degree node is a known risk. Mitigate with the existing dim/highlight
behavior and the length cap; measure before adding new hiding machinery.

## 8. Skill changes

`describe_profile` exposes roles and verbs automatically once they are on the profile, so the
LLM can discover them. `plugins/hyphae-modeling/` needs:

- always fill `summary` on every Context/Container/Component node;
- choose a `verb` per connection from the profile vocabulary, and set a short `object`;
- set `role` when a Component is really a datastore or a queue;
- stop writing `intent`.

## 9. Consequences on the existing model

Loading `hyphae-cctv-new.json` after this phase:

| Issue | Count | Source |
|---|---|---|
| `unknown-field` | 517 | retired `intent` (D-A3) |
| `missing-required-field` | ~105 | `summary` now required (D-A4) |
| `unanchored-ref` | 328 | pre-existing from Phase A0 |

The file still parses and loads. This is accepted, not a defect: the model is not being
migrated, and these counts are the cost of the clean schema.

## 10. Out of scope

Flows (Phase B), Patterns (Phase C), `DataEntity` and `object`-as-reference (Phase D),
retiring the Code node layer (Phase E), any migration script, and any rewrite of the
focus-view / floating-edge / layout machinery.
