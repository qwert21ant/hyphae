import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  parentId: z.string().nullable().default(null),
  // Optional directory Ref anchoring this node's subtree on disk. Refs below it resolve
  // against it; roots chain down the containment tree. See ref.ts.
  root: z.string().nullable().default(null),
  // Archetype override selecting this node's shape (a role id from the profile).
  // null = fall back to the node kind's default role. See profile.ts roleOfNode.
  role: z.string().nullable().default(null),
  // Author's mark: this node is infrastructure the rest of the model naturally leans on (a
  // composition root, a settings store). The viewer stops drawing its edges when it appears OUTSIDE
  // the focused container and parks it on the shelf with a count instead — see the shelf in
  // features/canvas/layout.ts. Never derived from a degree threshold: guessing at a threshold is
  // exactly what made the removed hub-quieting feature wrong. Structural, like `root` — not a
  // profile field, and not `role` (which picks the drawn shape).
  foundational: z.boolean().default(false),
  description: z.string().default(''),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Node = z.infer<typeof NodeSchema>;
