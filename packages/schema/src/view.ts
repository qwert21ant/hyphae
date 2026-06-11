import { z } from 'zod';

export const PositionSchema = z.object({ x: z.number(), y: z.number() });

export const ViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  layer: z.string(),
  nodePositions: z.record(z.string(), PositionSchema).default({}),
});

export type View = z.infer<typeof ViewSchema>;
export type Position = z.infer<typeof PositionSchema>;
