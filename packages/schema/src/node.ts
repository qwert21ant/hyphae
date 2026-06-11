import { z } from 'zod';

export const StatusSchema = z.enum(['Planned', 'Active', 'Deprecated']);

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  description: z.string().default(''),
  purpose: z.string().optional(),
  technology: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  invariants: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  failureModes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  owner: z.string().optional(),
  status: StatusSchema.default('Active'),
  parentId: z.string().nullable().default(null),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Node = z.infer<typeof NodeSchema>;
