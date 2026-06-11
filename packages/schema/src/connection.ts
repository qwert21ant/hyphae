import { z } from 'zod';

export const RelationCategorySchema = z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']);
export const TransportSchema = z.enum(['Sync', 'Async', 'InProcess', 'None']);
export const IntentSchema = z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']);
export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);
export const FrequencySchema = z.enum(['Rare', 'Occasional', 'Frequent', 'Continuous']);

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relationCategory: RelationCategorySchema,
  transport: TransportSchema.default('None'),
  intent: IntentSchema.optional(),
  description: z.string().default(''),
  protocol: z.string().optional(),
  direction: DirectionSchema.default('Unidirectional'),
  // reserved-for-later fields: present in schema, not surfaced in MVP editor UI
  frequency: FrequencySchema.optional(),
  latencyBudgetMs: z.number().optional(),
  security: z.object({ authRequired: z.boolean(), encryption: z.boolean() }).optional(),
  dataTypeRef: z.string().optional(),
  realizes: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
});

export type Connection = z.infer<typeof ConnectionSchema>;
