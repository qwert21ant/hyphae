import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { c4Backend } from '@hyphae/schema';
import { flowItemSchema, flowStepSchema, patternItemSchema, patternMemberSchema, patternTransitionSchema, fieldsShape, text } from './params';
import type { buildTools } from './tools/index';

export function registerAll(server: McpServer, tools: ReturnType<typeof buildTools>) {
  server.registerTool(
    'model_overview',
    {
      description: 'Orientation read — call this FIRST. Returns a small, size-independent overview: model name, node counts per layer and per kind, total connections, and the System + Container nodes (id, name, one-line description). It never dumps Components. Drill deeper with list_nodes (by parentId or text query), get_subgraph, list_connections, get_node.',
      inputSchema: {},
    },
    async () => text(await tools.model_overview({})),
  );
  server.registerTool('get_node', { description: 'Get one node by id — its full body and `fields` only (no edges; use list_connections({nodeId}) or get_subgraph for wiring). Returns {error} if the id does not exist.', inputSchema: { id: z.string() } }, async (a) => text(await tools.get_node(a)));
  server.registerTool(
    'list_nodes',
    {
      description: 'List/find node summaries (id, name, type, parentId). Optional filters (AND-combined): `parentId` (e.g. the components of one container), `type`, and `query` — a case-insensitive substring matched across text fields (name, description, technology, responsibilities, invariants by default; narrow with `fields`). With `query`, rows also carry the parent name + description for disambiguation (component names repeat across containers) and default to a 25-row cap; plain enumeration stays lean and uncapped. `offset`/`limit` paginate (an explicit `limit` overrides the query cap). Reads default to Component-and-above; pass maxLayer to cap at a shallower layer (Container/Context). Prefer this (or get_subgraph) over model_overview on a large model.',
      inputSchema: {
        parentId: z.string().optional(),
        type: z.string().optional(),
        query: z.string().optional().describe('Case-insensitive substring; keep only nodes whose searched text fields contain it.'),
        fields: z.array(z.string()).optional().describe('Restrict which fields `query` searches (core fields or any documented `fields` key — see describe_profile). Default: name, description, technology, responsibilities, invariants.'),
        limit: z.number().optional(),
        offset: z.number().optional(),
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to include (default Component, the deepest layer). Nodes below it are omitted; pass a shallower layer (Container/Context) to cap.'),
      },
    },
    async (a) => text(await tools.list_nodes(a)),
  );
  server.registerTool(
    'list_connections',
    {
      description: 'Query raw connections across the model. Filters (all optional, AND-combined): nodeId (edges touching exactly this node — use to inspect one node\'s edges), containerId (edges touching that container or any of its descendants), crossingBoundary (true = endpoints in different owning containers — i.e. inter-container / external edges; false = intra-container only), involvingExternal (an endpoint is an ExternalSystem). Supports offset/limit. Each result is enriched with fromName/toName and fromContainer/toContainer. By default edges among Component-and-above nodes are returned; pass maxLayer to cap at a shallower layer. For DERIVED higher-level edges (component edges aggregated to Container/Context level) use rollup_connections.',
      inputSchema: {
        nodeId: z.string().optional().describe('A node id; keep only edges whose from or to is exactly this node.'),
        containerId: z.string().optional().describe('A container node id; keep only edges touching it or one of its descendants.'),
        crossingBoundary: z.boolean().optional().describe('true = only edges whose endpoints belong to different containers (inter-container/external); false = only intra-container edges.'),
        involvingExternal: z.boolean().optional().describe('true = only edges with an ExternalSystem endpoint; false = only edges between in-system nodes.'),
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to include (default Component, the deepest layer). An edge is dropped if either endpoint is below it.'),
        limit: z.number().optional(),
        offset: z.number().optional(),
      },
    },
    async (a) => text(await tools.list_connections(a)),
  );
  server.registerTool(
    'rollup_connections',
    {
      description: 'DERIVED higher-level edges: component connections lifted and aggregated to the given layer (intra-node edges dropped). Each result is a Container↔Container or Context-level edge enriched with fromName/toName, and lists its underlying connections inline as `realizedBy`. Supports offset/limit. Use list_connections for the raw, unaggregated edges.',
      inputSchema: {
        layer: z.enum(['Container', 'Context']).describe('The layer to lift connections to.'),
        limit: z.number().optional(),
        offset: z.number().optional(),
      },
    },
    async (a) => text(await tools.rollup_connections(a)),
  );
  server.registerTool(
    'get_subgraph',
    {
      description: 'Local subgraph around a node: BFS to `depth` hops (default 1). Traverses BOTH connection edges (`direction` out/in/both, default both) AND containment (`containment` down/up/both/none, default down). So get_subgraph on a Container returns its child Components (depth 1) and their wiring (depth 2). Traversal stops at Component-and-above by default; pass maxLayer to cap at a shallower layer. Returns the reached node summaries and every connection among them. Use this to explore around a node instead of dumping the whole model.',
      inputSchema: {
        nodeId: z.string(),
        depth: z.number().optional().describe('Max hops from the root, default 1. Containment and connection steps both count.'),
        direction: z.enum(['in', 'out', 'both']).optional().describe('Which connection edges to follow: out (from→to), in (to→from), or both (default).'),
        containment: z.enum(['down', 'up', 'both', 'none']).optional().describe('Follow parentId links: down = into children (default), up = to parents, both, or none. Default down means a Container returns its Components.'),
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to traverse/return (default Component, the deepest layer). Nodes below it are not visited.'),
      },
    },
    async (a) => text(await tools.get_subgraph(a)),
  );

  const coreNodeFields = {
    parentId: z.string().nullable().optional(),
    root: z.string().nullable().optional()
      .describe('Optional directory Ref (must end with "/") anchoring this node\'s subtree on disk, e.g. "endpoints/media_gateway/". Refs on this node and its descendants resolve against it, and roots chain down the containment tree — a System declares the repo root, a Container its subtree, and Components stay short and relative. A codeRef on a node with no anchoring root anywhere in its ancestors is a validation issue.'),
    role: z.string().nullable().optional()
      .describe('Archetype that decides this node\'s shape on the diagram — a role id from describe_profile (actor, service, datastore, queue, external, ui). Omit or null to use the node kind\'s default. Set it when a Component is really a database, cache, or queue: that is where the diagram gains meaning, since every Component defaults to a plain service box.'),
    foundational: z.boolean().optional()
      .describe('Mark this node as foundational: infrastructure the rest of the model naturally leans on (a composition root, a settings/config store, a shared logger). The viewer then stops drawing its edges when it appears OUTSIDE the container being focused and parks it on a shelf with a count of them instead, so one mark replaces a fan of near-identical lines. Set it by judgement, on a handful of nodes at most — it is not a degree threshold, and marking a genuine participant hides real structure. The connections themselves are unaffected and every query still returns them.'),
    description: z.string().optional(),
    codeRefs: z.array(z.string()).optional()
      .describe('Refs into the source, relative to the nearest ancestor root. Syntax decides the kind: "src/views/cctv/" directory, "src/main.ts" file, "src/main.ts#getRouter" symbol, "src/main.ts#L10-L40" line range, "src/views/**/*.vue" glob.'),
    docRefs: z.array(z.string()).optional(),
    fields: z.object(fieldsShape('node')).partial().optional(),
  };
  const nodeItem = z.object({ name: z.string(), type: z.enum(c4Backend.nodeKinds.map((k) => k.id) as [string, ...string[]]), ...coreNodeFields });
  server.registerTool('create_nodes', {
    description: "Create one OR MANY nodes in a single call. Pass an array (a single write is a one-element array). Call describe_profile first. Each item: name, type (a profile node kind), parentId, and domain values in `fields` — `fields.summary` is REQUIRED on System/Actor/ExternalSystem/Container/Component and is the one-line purpose shown on the diagram. Optionally set `role` to override the shape. Containment: Component→Container, Container→System. Component is the deepest structural layer (a Component's internal code lives in its codeRefs plus an optional Pattern, not child nodes). Best-effort: returns {created:[{id,name},...]} in input order if all succeed, else {results:[{id,name}|{issues}]} aligned to input order. The echoed name means you never need a follow-up list_nodes to map names to ids.",
    inputSchema: { nodes: z.array(nodeItem) },
  }, async (a) => text(await tools.create_nodes(a)));

  const coreConnFields = {
    description: z.string().optional(),
    direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
    label: z.string().optional()
      .describe('What this edge says, in your own words — the ONLY text drawn on the diagram. State something a reader cannot infer from the two node names ("constructs at startup and owns for the session"), not a restatement of the target ("uses the mine process"). Keep it under about 40 characters. An edge with nothing worth saying here should not be created.'),
    realizedBy: z.array(z.string()).optional()
      .describe('Ids of lower-layer connections this edge aggregates/describes (e.g. a Container↔Container edge realizedBy the Component↔Component edges that explain it). Bound edges are excluded from rollup.'),
    fields: z.object(fieldsShape('connection')).partial().optional(),
  };
  const connItem = z.object({ from: z.string(), to: z.string(), ...coreConnFields });
  server.registerTool('create_connections', {
    description: "Create one OR MANY connections in a single call (single write = one-element array). Each item: from, to (existing node ids), label (what the edge says — this is the diagram label), and optional realizedBy to bind lower-layer edges. Best-effort: {created:[{id,from,to},...]} in input order on full success, else {results:[{id,from,to}|{issues}]}. Use the echoed ids to fill `realizedBy` on a higher-layer edge without re-listing.",
    inputSchema: { connections: z.array(connItem) },
  }, async (a) => text(await tools.create_connections(a)));

  const nodeUpdate = z.object({ id: z.string(), name: z.string().optional(), type: z.string().optional(), ...coreNodeFields });
  server.registerTool('update_nodes', {
    description: 'Update one OR MANY nodes by id (single update = one-element array). Each item: id + the fields to change; domain values go in `fields`. Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(nodeUpdate) },
  }, async (a) => text(await tools.update_nodes(a)));

  const connUpdate = z.object({ id: z.string(), from: z.string().optional(), to: z.string().optional(), ...coreConnFields });
  server.registerTool('update_connections', {
    description: 'Update one OR MANY connections by id (single update = one-element array). Each item: id + fields to change (e.g. realizedBy to bind lower-layer edges). Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(connUpdate) },
  }, async (a) => text(await tools.update_connections(a)));

  server.registerTool('delete_nodes', {
    description: 'Delete one OR MANY nodes by id (single delete = one-element array). Their connections are removed too. Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_nodes(a)));

  server.registerTool('delete_connections', {
    description: 'Delete one OR MANY connections by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_connections(a)));

  server.registerTool('describe_profile', {
    description: 'The active profile: its layers, node kinds, roles, pattern kinds, and the documented custom fields (with enum values and descriptions) valid for each. Call this to learn what `type` and `role` values are available before creating nodes/connections.',
    inputSchema: {},
  }, async () => text(await tools.describe_profile({})));

  server.registerTool('validate_model', {
    description: 'Validate the whole model against the active profile and return the structural/field issues ({kind, ref, message}): bad containment, dangling/bad endpoints, unknown or missing-required fields, bad enum values, bad refs. Empty array means structurally clean. Use in the Verify phase instead of dumping the model and re-deriving validity in-context. Note: this checks structure/fields only — for semantic coverage gaps (orphan components, thin descriptions) use model_gaps.',
    inputSchema: {},
  }, async () => text(await tools.validate_model({})));

  server.registerTool('resolve_refs', {
    description: 'Resolve a node\'s codeRefs to full repo-relative paths through its inherited root, or reverse-look-up which nodes claim a given path. Pass nodeId to resolve that node\'s refs (and see its effective root); pass path to list every node whose refs point there — more than one owner means the path is genuinely shared. Use before editing code to find what models a file, and after writing refs to confirm they anchor where you expect.',
    inputSchema: {
      nodeId: z.string().optional().describe('Resolve this node\'s codeRefs and report its effective root.'),
      path: z.string().optional().describe('Repo-relative path to reverse-look-up, e.g. "endpoints/media_gateway/src/main.ts".'),
    },
  }, async (a) => text(await tools.resolve_refs(a)));

  server.registerTool('model_gaps', {
    description: 'Advisory coverage/quality read (read-only, whole-model). Returns three gap lists: orphanNodes (Component-layer nodes with zero connections), thinDescriptions (Component-and-above nodes whose description is empty or echoes the name, each with inbound/outbound degree so a thin hub is visible), and missingRefs (codeRefs that resolve to a path absent on disk — populated only when a disk check is requested; currently always empty, as no caller wires checkDisk yet). Flags candidates only — it never mutates or auto-fixes; a legitimately standalone component or a terse-but-fine node may appear. Complements validate_model, which checks structure/fields; this checks semantic coverage.',
    inputSchema: {},
  }, async () => text(await tools.model_gaps({})));

  server.registerTool('list_flows', {
    description: 'List behavior Flow summaries: id, name, scope, step count, and whether the flow currently validates (all step endpoints and via still resolve). Use get_flow for the full ordered steps.',
    inputSchema: {},
  }, async () => text(await tools.list_flows({})));

  server.registerTool('get_flow', {
    description: 'Get one behavior Flow by id with its full ordered steps. Returns {error} if the id does not exist.',
    inputSchema: { id: z.string() },
  }, async (a) => text(await tools.get_flow(a)));

  server.registerTool('create_flows', {
    description: "Create one OR MANY behavior Flows (numbered scenario overlays; single write = one-element array). Each flow: name, optional description/scope, and ordered steps. A step is { order, from, to (existing node ids), optional via (an existing connection id), message caption, kind (Sync|Async|Return), optional control fragment }. from/to must be existing nodes; via, when set, an existing connection. Best-effort: {created:[{id,name},...]} on full success, else {results:[{id,name}|{issues}]}.",
    inputSchema: { flows: z.array(flowItemSchema) },
  }, async (a) => text(await tools.create_flows(a)));

  const flowUpdate = z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), scope: z.string().nullable().optional(), steps: z.array(flowStepSchema).optional() });
  server.registerTool('update_flows', {
    description: 'Update one OR MANY flows by id (single update = one-element array). Each item: id + fields to change (name, description, scope, or the full replacement steps array). Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(flowUpdate) },
  }, async (a) => text(await tools.update_flows(a)));

  server.registerTool('delete_flows', {
    description: 'Delete one OR MANY flows by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_flows(a)));

  server.registerTool('list_patterns', {
    description: 'List Pattern summaries: id, name, kind, member count, anchor, and whether the pattern currently validates. Use get_pattern for full members + transitions.',
    inputSchema: {},
  }, async () => text(await tools.list_patterns({})));

  server.registerTool('get_pattern', {
    description: 'Get one Pattern by id with its full members and transitions. Returns {error} if the id does not exist.',
    inputSchema: { id: z.string() },
  }, async (a) => text(await tools.get_pattern(a)));

  server.registerTool('create_patterns', {
    description: "Create one OR MANY Patterns (architectural shapes; single write = one-element array). A Pattern has a name, a kind (from describe_profile.patternKinds), optional anchor (the node it describes), members, and — for state-machine — transitions. A member is { name, and either nodeId (a node) OR ref (a code Ref, resolved against the anchor's root) OR neither (a pure name, e.g. a state) }. For ordered kinds (pipeline, middleware) member array order is the stage order. Best-effort: {created:[{id,name},...]} on full success, else {results:[{id,name}|{issues}]}.",
    inputSchema: { patterns: z.array(patternItemSchema) },
  }, async (a) => text(await tools.create_patterns(a)));

  const patternUpdate = z.object({ id: z.string(), name: z.string().optional(), kind: z.string().optional(), description: z.string().optional(), anchor: z.string().nullable().optional(), members: z.array(patternMemberSchema).optional(), transitions: z.array(patternTransitionSchema).optional() });
  server.registerTool('update_patterns', {
    description: 'Update one OR MANY patterns by id (single update = one-element array). Each item: id + fields to change (name, kind, anchor, or the full replacement members/transitions arrays). Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(patternUpdate) },
  }, async (a) => text(await tools.update_patterns(a)));

  server.registerTool('delete_patterns', {
    description: 'Delete one OR MANY patterns by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_patterns(a)));
}
