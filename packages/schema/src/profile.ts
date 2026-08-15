import { z } from 'zod';

export const CategorySchema = z.enum(['Structure', 'Behavior', 'Data', 'Intent', 'Actor']);

export const FieldTypeSchema = z.enum(['text', 'number', 'boolean', 'list', 'enum', 'ref']);

export const EnumValueSchema = z.object({
  value: z.string(),
  description: z.string(),
});

/** How a role draws. The profile names the shape; the renderer owns the geometry. */
export const ShapeSchema = z.enum([
  'rectangle',         // default service box
  'person',            // an actor
  'cylinder',          // a datastore
  'bar',               // a queue — open-ended bar
  'hexagon',           // an external system
  'titled-rectangle',  // a UI surface — box with a title bar
]);

export const RoleDefSchema = z.object({
  id: z.string(),
  description: z.string(),
  shape: ShapeSchema,
});

/** Which built-in renderer draws a pattern kind. The profile names it; the code owns the geometry. */
export const PatternRendererSchema = z.enum([
  'pipeline', 'middleware', 'state-machine', 'layered', 'event-bus',
]);

export const PatternKindDefSchema = z.object({
  id: z.string(),
  description: z.string(),
  renderer: PatternRendererSchema,
  ordered: z.boolean().default(false),
});

export const FieldDefSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  type: FieldTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
  values: z.array(EnumValueSchema).optional(), // enum only
  refKind: z.string().optional(),              // ref only
});

export const NodeKindSchema = z.object({
  id: z.string(),            // the node `type` value
  category: CategorySchema,
  layer: z.string(),
  role: z.string(),          // this kind's default role id (a node may override)
  allowedParents: z.array(z.string()).default([]),
  allowedChildren: z.array(z.string()).default([]),
  fields: z.array(FieldDefSchema).default([]),
});

export const ProfileSchema = z.object({
  id: z.string(),
  layers: z.array(z.string()),       // ordered, top -> bottom
  nodeKinds: z.array(NodeKindSchema),
  roles: z.array(RoleDefSchema).default([]),
  patternKinds: z.array(PatternKindDefSchema).default([]),
  commonNodeFields: z.array(FieldDefSchema).default([]),
  commonConnectionFields: z.array(FieldDefSchema).default([]),
});

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type EnumValue = z.infer<typeof EnumValueSchema>;
export type FieldDef = z.infer<typeof FieldDefSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type RoleDef = z.infer<typeof RoleDefSchema>;
export type PatternRenderer = z.infer<typeof PatternRendererSchema>;
export type PatternKindDef = z.infer<typeof PatternKindDefSchema>;

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const roleDefOf = (profile: Profile, roleId: string): RoleDef | undefined =>
  profile.roles.find((r) => r.id === roleId);

export const patternKindDefOf = (profile: Profile, kindId: string): PatternKindDef | undefined =>
  profile.patternKinds.find((k) => k.id === kindId);

/**
 * The role that decides a node's shape: its own override, else its kind's default,
 * else 'service'. The final fallback keeps an unknown node type renderable rather
 * than blank — validateModel is what reports the unknown type.
 */
export const roleOfNode = (profile: Profile, node: { type: string; role: string | null }): string =>
  node.role ?? profile.nodeKinds.find((k) => k.id === node.type)?.role ?? 'service';

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const allowedChildTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedChildren ?? [];

export const topLevelTypes = (profile: Profile): string[] =>
  profile.nodeKinds.filter((k) => (k.allowedParents ?? []).length === 0).map((k) => k.id);

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);

/** True when `type`'s layer is at or above (index <=) `maxLayer` in the profile's ordered
 *  layers. An unknown `type` (no layer) or unknown `maxLayer` returns false. */
export function nodeAtOrAboveLayer(profile: Profile, type: string, maxLayer: string): boolean {
  const layer = layerOfType(profile, type);
  if (layer === undefined) return false;
  const li = profile.layers.indexOf(layer);
  const mi = profile.layers.indexOf(maxLayer);
  return li !== -1 && mi !== -1 && li <= mi;
}

/** Common node fields then the kind's own; common wins on key collision. */
export function nodeFields(profile: Profile, type: string): FieldDef[] {
  const common = profile.commonNodeFields;
  const own = profile.nodeKinds.find((k) => k.id === type)?.fields ?? [];
  const seen = new Set(common.map((f) => f.key));
  return [...common, ...own.filter((f) => !seen.has(f.key))];
}

/** Connections have no kinds, so their fields are exactly the profile's common ones. */
export function connectionFields(profile: Profile): FieldDef[] {
  return profile.commonConnectionFields;
}
