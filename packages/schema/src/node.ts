import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  parentId: z.string().nullable().default(null),
  description: z.string().default(''),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Node = z.infer<typeof NodeSchema>;
