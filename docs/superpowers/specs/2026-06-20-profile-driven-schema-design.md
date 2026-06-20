# Design: profile-driven schema (custom, self-documenting node & connection kinds)

> Make the Profile the meta-schema for the model: it declares the node kinds, connection kinds, and
> their custom fields (each field and each enum value documented for LLMs). Core Node/Connection
> schemas shrink to the engine essentials; everything domain-specific moves into a profile-validated
> `fields` bag. Date: 2026-06-20. Status: approved design, ready for implementation planning.

---

## 1. Motivation

Today the core `Node`/`Connection` Zod schemas hardcode a fixed, C4-flavoured field set
(`technology`, `responsibilities`, `transport`, `relationCategory`, …). This has two problems:

1. **Not general.** A different domain (frontend, CLI, data pipeline) wants different node/connection
   types and fields, but the engine bakes C4's vocabulary into the core schema.
2. **Not self-documenting.** An LLM (or the editor) has no machine-readable description of what each
   field means or what an enum value implies; that knowledge lives only in prose/tool descriptions.

The fix: the **Profile** declares the vocabulary — node kinds, connection kinds, and their custom
fields, with a `description` on every field and every enum value. Core schemas keep only what the
engine and views genuinely need. Domain values live in a `fields` bag, validated against the active
profile.

---

## 2. Profile as meta-schema

```ts
type FieldType = 'text' | 'number' | 'boolean' | 'list' | 'enum' | 'ref';

type EnumValue = { value: string; description: string };

type FieldDef = {
  key: string;                  // e.g. "technology"
  label?: string;               // UI label; defaults from key
  type: FieldType;
  description: string;          // for the LLM + editor tooltip (required)
  required?: boolean;           // default false
  values?: EnumValue[];         // enum only — each allowed value documented
  refKind?: string;             // ref only — which node kind the id targets
};

type NodeKind = {
  id: string;                   // the node `type` value
  category: 'Structure' | 'Behavior' | 'Data' | 'Intent' | 'Actor';
  layer: string;
  allowedParents: string[];
  allowedChildren: string[];
  fields: FieldDef[];           // NEW — custom fields for this node type
};

type ConnectionKind = {
  id: string;                   // the connection `type` value (e.g. "Dependency")
  description: string;          // what this kind of connection means
  allowedFrom?: string[];       // optional: node types allowed as `from`
  allowedTo?: string[];         // optional: node types allowed as `to`
  fields: FieldDef[];           // NEW — custom fields for this connection type
};

type Profile = {
  id: string;
  layers: string[];                  // ordered top -> bottom
  nodeKinds: NodeKind[];
  connectionKinds: ConnectionKind[]; // NEW
  commonNodeFields: FieldDef[];      // NEW — applied to every node kind
  commonConnectionFields: FieldDef[];// NEW — applied to every connection kind
};
```

**Effective fields** for a kind = its profile's `common*Fields` ++ the kind's own `fields`. A helper
`effectiveFields(profile, kind, 'node'|'connection')` returns this merged list (keys are unique;
a per-kind field with the same key as a common field overrides it).

`FieldType` semantics:
- `text` → string; `number` → number; `boolean` → boolean.
- `list` → string[] (free-form list of strings, e.g. responsibilities).
- `enum` → string that must be one of `values[].value`.
- `ref` → string id of an existing node; if `refKind` is set, that node must be of that kind.

---

## 3. Lean core schemas

`fields` is a `Record<string, unknown>` bag, validated against the profile in `validate.ts`
(the bag keeps the core Zod schema static while values stay profile-driven).

```ts
NodeSchema = {
  id: string;
  name: string;                 // min 1; NOT unique
  type: string;                 // a NodeKind id (validated against profile)
  parentId: string | null;      // the only containment mechanism
  description: string;          // default ''
  codeRefs: string[];           // default []
  docRefs: string[];            // default []
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;  // default {}
}

ConnectionSchema = {
  id: string;
  from: string;
  to: string;
  type: string;                 // a ConnectionKind id (was relationCategory)
  description: string;          // default ''
  direction: 'Unidirectional' | 'Bidirectional';  // default Unidirectional
  realizes: string[];           // default [] — lower-level connection ids
  codeRefs: string[];           // default []
  fields: Record<string, unknown>;  // default {}
}
```

**Why these stay core (engine/view consumers, not domain vocabulary):**
- `direction` — rendered by the canvas (arrow style) and `getContext` (`->` vs `<->`).
- `realizes` — the cross-layer realization concept consumed by rollup/engine logic.
- `codeRefs`/`docRefs` — link primitives; kept core to avoid special-casing, even though not every
  kind uses them.

**Removed from core** (relocated to profile fields, or dropped entirely):
- Node: `purpose` (dropped — redundant with description), `technology` (→ field), `responsibilities`
  (→ common field), `invariants` (→ common field), `assumptions` (dropped), `failureModes` (dropped),
  `tags` (dropped), `owner` (dropped), `status` (dropped).
- Connection: `relationCategory` (→ `type`), `transport` (→ common field), `intent` (→ common field),
  `protocol` (dropped), `frequency` (dropped), `latencyBudgetMs` (dropped), `security` (dropped),
  `dataTypeRef` (→ field on DataFlow). Node `docRefs` stays core; connections have no `docRefs` today
  and none is added.

Dropped fields are not lost forever — any profile may re-introduce them as documented fields later.

---

## 4. `c4-backend` re-expressed

```
layers: [Context, Container, Component]

commonNodeFields:
  - responsibilities (list)  "What this node is responsible for."
  - invariants (list)        "Conditions that always hold for this node."

nodeKinds:
  System         (Structure, Context,   parents [],          children [Container], fields [])
  Actor          (Actor,     Context,   parents [],          children [],          fields [])
  ExternalSystem (Structure, Context,   parents [],          children [],          fields [])
  Container      (Structure, Container, parents [System],    children [Component], fields [technology (text)])
  Component      (Structure, Component, parents [Container], children [],          fields [technology (text)])

commonConnectionFields:
  - transport (enum, values described):
      Sync      "Blocking request/response (caller waits)."
      Async     "Fire-and-forget or queued; caller does not wait."
      InProcess "Same process — a direct call, not over a network."
      None      "No runtime transport (e.g. a build/structural dependency)."
  - intent (enum, optional, values described):
      Read   "Reads data from the target."
      Write  "Writes/persists data to the target."
      Trigger"Triggers an action/behavior on the target."
      Notify "Sends a notification/event to the target."
      Use    "General use of the target's capabilities."

connectionKinds:
  Dependency  "A depends on / uses B."                      fields []
  DataFlow    "Data flows from A to B."                     fields [dataTypeRef (ref)]
  Realization "A realizes/implements an interface of B."    fields []
  Trace       "Traceability link (e.g. requirement -> impl)." fields []
```

`technology` is `text`, described "Implementation stack / technology." `dataTypeRef` is `ref`
(no `refKind` yet, since DataType nodes are a reserved axis), described "The data type this flow
carries."

---

## 5. Validation (extends `validate.ts`)

Keep the existing four issue kinds (`unknown-type`, `missing-parent`, `bad-parent`,
`dangling-endpoint`). Add, all gated by the existing `newIssues` diff (only newly-introduced issues
block a write):

- `unknown-connection-kind` — connection `type` not a ConnectionKind id.
- `unknown-field` — a `fields` key not in the kind's effective fields.
- `bad-field-type` — value's JS type doesn't match the FieldDef (`text`→string, `number`→number,
  `boolean`→boolean, `list`→string[], `enum`→string, `ref`→string).
- `bad-enum-value` — enum value not in `values[].value`.
- `missing-required-field` — a `required` field absent or empty.
- `bad-ref` — `ref` value is not an existing node id (and, if `refKind` set, not of that kind).
- `bad-endpoint` — connection violates the kind's `allowedFrom`/`allowedTo` (only checked when the
  kind declares them).

`validateModel` gains access to both node and connection kinds via the profile. The `Issue.kind`
union and the per-issue `message` strings are extended accordingly.

---

## 6. Consumers updated

### 6.1 `@hyphae/schema`
- `getContext` renders, per node/connection: `description`, `parent` (nodes), then the kind's
  effective fields generically as `label: value` (lists joined as today). Summary mode = headline +
  first line of `description` + parent. Connections render `from <arrow> to [type]` + description,
  with extra fields appended when present.
- `rollupConnections` is unaffected (it only uses `from`/`to`/ids).
- New helper `effectiveFields(profile, kindId, scope)`.

### 6.2 Server / MCP (`apps/server`)
- **Dynamic tool schemas.** At MCP startup, read the active profile and build the input schemas for
  `create_node`/`update_node`/`create_connection`/`update_connection` from core fields + the
  profile's FieldDefs (enums become Zod enums; each field's `.describe()` carries its description;
  enum value descriptions are folded into the param description). The agent thus sees typed,
  documented params.
- **`describe_profile` tool** (new, read-only): returns the active profile's node kinds, connection
  kinds, common fields, every FieldDef (key, type, description, required, enum values + their
  descriptions, refKind), and the layer order. The modeling skill calls this first.
- The store/routes still validate every write; rejected writes return the new issues.

### 6.3 Web (`apps/web`)
- **SidePanel** becomes a generic form: for the selected node/connection it renders an input per
  effective FieldDef — text→input, number→number input, boolean→checkbox, list→string-list editor,
  enum→dropdown (option labels show value, tooltip the description), ref→node picker. Core fields
  (name, description, direction, parent) keep dedicated controls.
- **FilterPanel** is generated: filter by connection **kind** (the `type`), plus one checkbox group
  per enum field in `commonConnectionFields` (so `transport` stays filterable, generically). Filter
  logic reads `connection.type` and `connection.fields[key]`.
- **Canvas** edge label = connection `type`; rollup/ghost/floating/highlight behavior unchanged.

---

## 7. Models & migration

Stay on `schemaVersion: 1` — no migration code. Rewrite existing model files to the new shape:
- the self-model `hyphae.json` (regenerate or hand-edit),
- the gccp-cctv model (the user's; rewrite or rebuild via the skill),
- all schema/server/web test fixtures.

Old files with the previous shape will simply fail validation/parse; that is acceptable per the
decision to not support migration.

---

## 8. Sequencing (keep build + tests green at each step)

1. **Schema + profile + validation** in `@hyphae/schema`: new Profile/FieldDef types, lean
   Node/Connection, `effectiveFields`, extended `validate.ts`, re-expressed `c4-backend`,
   `getContext`, regenerated JSON Schema. Update `@hyphae/schema` tests.
2. **Server / MCP**: dynamic tool schemas + `describe_profile`; update store/routes typing and tests.
3. **Web**: generic SidePanel, generated FilterPanel, Canvas edge label; update web tests.
4. **Self-model**: rewrite `hyphae.json` to the new shape.

---

## 9. Out of scope

- Reserved axes (`flows`, `stateMachines`, `dataTypes`, `requirements`, `decisions`) stay
  `z.unknown()`; this work does not give them real schemas.
- Multiple/loadable profiles beyond `c4-backend` — the engine becomes general, but only `c4-backend`
  ships. (`resolveProfile` still returns it.)
- Authoring/editing profiles in the UI — profiles remain code.
- The future "rollup-edge summary" skill step (tracked separately in the MCP tools roadmap).
