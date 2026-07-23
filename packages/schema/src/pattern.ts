import { z } from 'zod';

/** A pattern member: a named element that may bind to a node (`nodeId`) OR a code Ref
 *  (`ref`) — at most one. A member with neither is a pure name (e.g. a state). */
export const PatternMemberSchema = z.object({
  name: z.string().min(1),
  nodeId: z.string().optional(),
  ref: z.string().optional(),
  description: z.string().default(''),
});

/** A directed transition between two members, referenced by member name (state-machine detail). */
export const PatternTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: z.string().default(''),
  description: z.string().default(''),
});

/** A recognized architectural shape over a set of members (the Structure overlay).
 *  Member array order is the stage order for ordered kinds. `anchor` is the node this
 *  pattern describes; a ref member resolves against the anchor's root. */
export const PatternSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.string(),
  description: z.string().default(''),
  anchor: z.string().nullable().default(null),
  members: z.array(PatternMemberSchema).default([]),
  transitions: z.array(PatternTransitionSchema).default([]),
});

export type PatternMember = z.infer<typeof PatternMemberSchema>;
export type PatternTransition = z.infer<typeof PatternTransitionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
