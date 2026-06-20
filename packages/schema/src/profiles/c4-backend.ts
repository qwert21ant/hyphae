import type { Profile, FieldDef } from '../profile';

const technology: FieldDef = { key: 'technology', type: 'text', description: 'Implementation stack / technology used by this node.' };

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component'],
  commonNodeFields: [
    { key: 'responsibilities', type: 'list', description: 'What this node is responsible for (one item per line).' },
    { key: 'invariants', type: 'list', description: 'Conditions that always hold true for this node.' },
  ],
  commonConnectionFields: [
    {
      key: 'transport', type: 'enum', description: 'The runtime mechanism of this connection.',
      values: [
        { value: 'Sync', description: 'Blocking request/response — the caller waits for a reply.' },
        { value: 'Async', description: 'Fire-and-forget or queued — the caller does not wait.' },
        { value: 'InProcess', description: 'Same process — a direct in-memory call, not over a network.' },
        { value: 'None', description: 'No runtime transport (e.g. a build-time or structural dependency).' },
      ],
    },
    {
      key: 'intent', type: 'enum', description: 'The intent of this connection (optional).',
      values: [
        { value: 'Read', description: 'Reads data from the target.' },
        { value: 'Write', description: 'Writes or persists data to the target.' },
        { value: 'Trigger', description: 'Triggers an action or behavior on the target.' },
        { value: 'Notify', description: 'Sends a notification or event to the target.' },
        { value: 'Use', description: "General use of the target's capabilities." },
      ],
    },
  ],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: ['Container'], fields: [] },
    { id: 'Actor', category: 'Actor', layer: 'Context', allowedParents: [], allowedChildren: [], fields: [] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: [], fields: [] },
    { id: 'Container', category: 'Structure', layer: 'Container', allowedParents: ['System'], allowedChildren: ['Component'], fields: [technology] },
    { id: 'Component', category: 'Structure', layer: 'Component', allowedParents: ['Container'], allowedChildren: [], fields: [technology] },
  ],
  connectionKinds: [
    { id: 'Dependency', description: 'A depends on / uses B.', fields: [] },
    { id: 'DataFlow', description: 'Data flows from A to B.', fields: [] },
    { id: 'Realization', description: 'A realizes/implements an interface defined by B.', fields: [] },
    { id: 'Trace', description: 'Traceability link (e.g. a requirement traced to its implementation).', fields: [] },
  ],
};

export { layerOfType, allowedParentTypes, typesForLayer } from '../profile';
