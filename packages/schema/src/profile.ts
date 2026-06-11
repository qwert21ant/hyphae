import { z } from 'zod';

export const CategorySchema = z.enum(['Structure', 'Behavior', 'Data', 'Intent', 'Actor']);

export const NodeKindSchema = z.object({
  id: z.string(),            // the node `type` value
  category: CategorySchema,
  layer: z.string(),
  allowedParents: z.array(z.string()).default([]),
  allowedChildren: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  id: z.string(),
  layers: z.array(z.string()),       // ordered, top -> bottom
  nodeKinds: z.array(NodeKindSchema),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
