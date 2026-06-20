import { z } from 'zod';

export const CategorySchema = z.enum(['Structure', 'Behavior', 'Data', 'Intent', 'Actor']);

export const FieldTypeSchema = z.enum(['text', 'number', 'boolean', 'list', 'enum', 'ref']);

export const EnumValueSchema = z.object({
  value: z.string(),
  description: z.string(),
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
  allowedParents: z.array(z.string()).default([]),
  allowedChildren: z.array(z.string()).default([]),
  fields: z.array(FieldDefSchema).default([]),
});

export const ConnectionKindSchema = z.object({
  id: z.string(),            // the connection `type` value
  description: z.string(),
  allowedFrom: z.array(z.string()).optional(),
  allowedTo: z.array(z.string()).optional(),
  fields: z.array(FieldDefSchema).default([]),
});

export const ProfileSchema = z.object({
  id: z.string(),
  layers: z.array(z.string()),       // ordered, top -> bottom
  nodeKinds: z.array(NodeKindSchema),
  connectionKinds: z.array(ConnectionKindSchema),
  commonNodeFields: z.array(FieldDefSchema).default([]),
  commonConnectionFields: z.array(FieldDefSchema).default([]),
});

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type EnumValue = z.infer<typeof EnumValueSchema>;
export type FieldDef = z.infer<typeof FieldDefSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>;

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);

export const connectionKindIds = (profile: Profile): string[] =>
  profile.connectionKinds.map((k) => k.id);

/** Common fields then the kind's own fields; common wins on key collision. */
export function effectiveFields(profile: Profile, kindId: string, scope: 'node' | 'connection'): FieldDef[] {
  const common = scope === 'node' ? profile.commonNodeFields : profile.commonConnectionFields;
  const kind = scope === 'node'
    ? profile.nodeKinds.find((k) => k.id === kindId)
    : profile.connectionKinds.find((k) => k.id === kindId);
  const own = kind?.fields ?? [];
  const seen = new Set(common.map((f) => f.key));
  return [...common, ...own.filter((f) => !seen.has(f.key))];
}
