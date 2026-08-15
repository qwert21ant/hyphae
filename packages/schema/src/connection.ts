import { z } from 'zod';

export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);

const ConnectionShape = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  // The whole point of the edge, in the author's own words. The ONLY thing drawn on the diagram.
  // An edge earns its place by saying something a reader cannot infer from the two node names —
  // see docs/superpowers/specs/2026-08-12-model-legibility-design.md.
  label: z.string().default(''),
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizedBy: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

/** A model written before `label` existed carries `verb` + `object` instead. They are no longer
 *  fields, but they are still READ off the raw input here and composed into the label — otherwise
 *  Zod would strip them and blank every edge in the file on load. An explicit non-empty `label`
 *  always wins, so `store.updateConnection` — which re-parses `{...existing, ...patch}` — never
 *  regresses a label the author already wrote. */
export const ConnectionSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  if (typeof r.label === 'string' && r.label.trim()) return r;
  const legacy = [r.verb, r.object]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');
  return legacy ? { ...r, label: legacy } : r;
}, ConnectionShape);

export type Connection = z.infer<typeof ConnectionShape>;
