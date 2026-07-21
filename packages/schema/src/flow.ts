import { z } from 'zod';

/** Universal sequence mechanics — core enums like `direction`, NOT profile vocabulary. */
export const FlowStepKindSchema = z.enum(['Sync', 'Async', 'Return']);
export const FlowControlTypeSchema = z.enum(['alt', 'opt', 'loop', 'par']);

export const FlowControlSchema = z.object({
  type: FlowControlTypeSchema,
  condition: z.string().default(''),
});

export const FlowStepSchema = z.object({
  order: z.number(),
  from: z.string(),                 // node id (required)
  to: z.string(),                   // node id (required)
  via: z.string().optional(),       // connection id (optional) — traceability + parallel-edge disambiguation
  message: z.string().default(''),  // the step caption
  kind: FlowStepKindSchema.default('Sync'),
  control: FlowControlSchema.optional(),
});

/** A named scenario overlaid on nodes/connections (the Behavior axis). */
export const FlowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  scope: z.string().nullable().default(null),   // optional layer hint (advisory)
  steps: z.array(FlowStepSchema).default([]),
});

export type FlowStepKind = z.infer<typeof FlowStepKindSchema>;
export type FlowControlType = z.infer<typeof FlowControlTypeSchema>;
export type FlowControl = z.infer<typeof FlowControlSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type Flow = z.infer<typeof FlowSchema>;
