import { z } from 'zod';
import { NodeSchema } from './node';
import { ConnectionSchema } from './connection';
import { ViewSchema } from './view';
import { FlowSchema } from './flow';
import {
  StateMachineSchema, DataTypeSchema,
  RequirementSchema, DecisionSchema,
} from './reserved';
import { now } from './ids';

export const MetadataSchema = z.object({
  name: z.string().default('Untitled'),
  description: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const HyphaeModelSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: MetadataSchema,
  activeProfile: z.string(),
  nodes: z.array(NodeSchema).default([]),
  connections: z.array(ConnectionSchema).default([]),
  flows: z.array(FlowSchema).default([]),
  stateMachines: z.array(StateMachineSchema).default([]),
  dataTypes: z.array(DataTypeSchema).default([]),
  requirements: z.array(RequirementSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  views: z.array(ViewSchema).default([]),
});

export type HyphaeModel = z.infer<typeof HyphaeModelSchema>;

export function emptyModel(): HyphaeModel {
  const ts = now();
  return {
    schemaVersion: 1,
    metadata: { name: 'Untitled', description: '', createdAt: ts, updatedAt: ts },
    activeProfile: 'c4-backend',
    nodes: [],
    connections: [],
    flows: [],
    stateMachines: [],
    dataTypes: [],
    requirements: [],
    decisions: [],
    views: [],
  };
}
