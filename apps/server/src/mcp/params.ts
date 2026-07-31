import { z } from 'zod';
import { c4Backend, nodeFields, connectionFields, type FieldDef } from '@hyphae/schema';

export const flowStepSchema = z.object({
  order: z.number().describe('1-based position of this step in the sequence.'),
  from: z.string().describe('Node id the step originates at.'),
  to: z.string().describe('Node id the step targets.'),
  via: z.string().optional().describe('Optional id of the connection this step traverses (adds traceability and disambiguates parallel edges). A Return or implied hop may omit it.'),
  message: z.string().optional().describe('Short caption shown on the step, e.g. "request stream".'),
  kind: z.enum(['Sync', 'Async', 'Return']).optional().describe('Sync = blocking call, Async = fire-and-forget, Return = a response back to the caller (drawn dashed). Default Sync.'),
  control: z.object({
    type: z.enum(['alt', 'opt', 'loop', 'par']).describe('alt = alternative branch, opt = optional, loop = repeated, par = parallel.'),
    condition: z.string().optional().describe('The guard/condition for the fragment.'),
  }).optional().describe('Optional sequence-fragment wrapping this step.'),
});
export const flowItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  scope: z.string().nullable().optional().describe('Optional layer this flow is authored at (Context/Container/Component). Advisory — used only to group flows in the picker.'),
  steps: z.array(flowStepSchema).default([]),
});
export const patternMemberSchema = z.object({
  name: z.string().describe('Human label for this member/stage/state.'),
  nodeId: z.string().optional().describe('Id of the node this member is — use for a higher-altitude member (a Component, a Container). Set nodeId OR ref, never both.'),
  ref: z.string().optional().describe('A code Ref for a member with no node (a code stage), relative to the pattern anchor\'s root, e.g. "decode.ts" or "src/pipeline/#normalize". Set ref OR nodeId, never both.'),
  description: z.string().optional(),
});
export const patternTransitionSchema = z.object({
  from: z.string().describe('The source member name (state).'),
  to: z.string().describe('The target member name (state).'),
  trigger: z.string().optional().describe('What causes the transition, e.g. "start", "error".'),
  description: z.string().optional(),
});
export const patternItemSchema = z.object({
  name: z.string(),
  kind: z.string().describe('A pattern kind id from describe_profile.patternKinds: pipeline, middleware, state-machine, layered, event-bus.'),
  description: z.string().optional(),
  anchor: z.string().nullable().optional().describe('Optional id of the node this pattern describes (the Component a code pipeline lives in). Required when any member uses a relative ref, since a ref resolves against the anchor\'s root.'),
  members: z.array(patternMemberSchema).default([]).describe('The members, in order. For an ordered kind (pipeline, middleware) the array order IS the stage order.'),
  transitions: z.array(patternTransitionSchema).default([]).describe('For state-machine: directed transitions between members, referenced by member name.'),
});

export function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function fieldDesc(d: FieldDef): string {
  const vals = d.values?.length ? ` Allowed: ${d.values.map((v) => `${v.value} (${v.description})`).join('; ')}.` : '';
  return `${d.description}${vals}${d.required ? ' (required)' : ''}`;
}
function fieldToZod(d: FieldDef) {
  const base =
    d.type === 'number' ? z.number()
    : d.type === 'boolean' ? z.boolean()
    : d.type === 'list' ? z.array(z.string())
    : d.type === 'enum' ? z.enum((d.values ?? []).map((v) => v.value) as [string, ...string[]])
    : z.string();
  return base.optional().describe(fieldDesc(d));
}
export function fieldsShape(scope: 'node' | 'connection'): Record<string, z.ZodTypeAny> {
  const defs = scope === 'node'
    ? c4Backend.nodeKinds.flatMap((k) => nodeFields(c4Backend, k.id))
    : connectionFields(c4Backend);
  const byKey = new Map<string, FieldDef>();
  for (const f of defs) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of byKey) shape[key] = fieldToZod(def);
  return shape;
}
