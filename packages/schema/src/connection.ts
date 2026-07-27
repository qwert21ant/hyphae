import { z } from 'zod';

export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  // The business action this edge performs, shown on the diagram. A verb id from the
  // profile. Defaults so a model written before verbs existed still parses — and so an
  // edge is never unlabeled.
  verb: z.string().default('uses'),
  // What the action acts on — a short noun ('camera list'). Free text this phase;
  // Phase D turns it into a DataEntity reference.
  object: z.string().default(''),
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizedBy: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Connection = z.infer<typeof ConnectionSchema>;
