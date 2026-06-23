import { z } from 'zod';

export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.string().min(1), // a ConnectionKind id, validated against active profile
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizedBy: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Connection = z.infer<typeof ConnectionSchema>;
