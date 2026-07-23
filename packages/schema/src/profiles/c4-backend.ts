import type { Profile, FieldDef } from '../profile';

const technology: FieldDef = { key: 'technology', type: 'text', description: 'Implementation stack / technology used by this node.' };

/** The one-line purpose shown on the diagram. Required above the Code layer: an unlabeled
 *  box is exactly what this phase exists to eliminate. `description` stays the long form. */
const summary: FieldDef = {
  key: 'summary', type: 'text', required: true,
  description: 'One-line purpose shown on the diagram (aim for under 70 characters). The full explanation belongs in `description`.',
};

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component'],
  roles: [
    { id: 'actor', shape: 'person', description: 'A human or external agent that uses the system.' },
    { id: 'service', shape: 'rectangle', description: 'Runs logic — the default for most structural nodes.' },
    { id: 'datastore', shape: 'cylinder', description: 'Persists data (database, cache, file store).' },
    { id: 'queue', shape: 'bar', description: 'Buffers messages between producers and consumers.' },
    { id: 'external', shape: 'hexagon', description: 'A system outside this model’s ownership.' },
    { id: 'ui', shape: 'titled-rectangle', description: 'A user-facing surface (screen, view, widget).' },
  ],
  verbs: [
    { id: 'reads', class: 'dataAccess', description: 'Reads data from the target without changing it.' },
    { id: 'writes', class: 'dataAccess', description: 'Writes data to the target.' },
    { id: 'stores', class: 'dataAccess', description: 'Persists data in the target for later retrieval.' },
    { id: 'modifies', class: 'dataAccess', description: 'Changes data that already exists in the target.' },
    { id: 'aggregates', class: 'dataAccess', description: 'Combines data from the target into a derived view.' },
    { id: 'deletes', class: 'dataAccess', description: 'Removes data from the target.' },
    { id: 'queries', class: 'dataAccess', description: 'Runs a search or filtered lookup against the target.' },
    { id: 'publishes', class: 'messaging', description: 'Emits an event or message to the target.' },
    { id: 'subscribes', class: 'messaging', description: 'Receives events or messages from the target.' },
    { id: 'sends', class: 'messaging', description: 'Sends a directed message to the target.' },
    { id: 'notifies', class: 'messaging', description: 'Informs the target that something happened.' },
    { id: 'invokes', class: 'control', description: 'Calls an operation on the target and uses the result.' },
    { id: 'triggers', class: 'control', description: 'Starts a process or job on the target.' },
    { id: 'requests', class: 'control', description: 'Asks the target for a service or resource.' },
    { id: 'uses', class: 'control', description: 'General dependency — the neutral default when nothing more specific fits.' },
    { id: 'views', class: 'user', description: 'A person looks at information presented by the target.' },
    { id: 'submits', class: 'user', description: 'A person sends input to the target.' },
    { id: 'navigates', class: 'user', description: 'A person moves to the target surface.' },
  ],
  patternKinds: [
    { id: 'pipeline', renderer: 'pipeline', ordered: true, description: 'Ordered stages data flows through in sequence (e.g. decode → normalize → persist). Members are the stages, in array order.' },
    { id: 'middleware', renderer: 'middleware', ordered: true, description: 'A request passes through an ordered chain of interceptors (e.g. auth → log → handler).' },
    { id: 'state-machine', renderer: 'state-machine', ordered: false, description: 'States and the transitions between them (e.g. Idle → Recording → Error). Members are states (pure names); transitions connect them by member name.' },
    { id: 'layered', renderer: 'layered', ordered: false, description: 'Stacked architectural bands (e.g. UI / domain / data).' },
    { id: 'event-bus', renderer: 'event-bus', ordered: false, description: 'A hub with publishers and subscribers around it.' },
  ],
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
  ],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', role: 'service', allowedParents: [], allowedChildren: ['Container'], fields: [summary] },
    { id: 'Actor', category: 'Actor', layer: 'Context', role: 'actor', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', role: 'external', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'Container', category: 'Structure', layer: 'Container', role: 'service', allowedParents: ['System'], allowedChildren: ['Component'], fields: [summary, technology] },
    { id: 'Component', category: 'Structure', layer: 'Component', role: 'service', allowedParents: ['Container'], allowedChildren: [], fields: [summary, technology] },
  ],
  connectionKinds: [
    { id: 'Dependency', description: 'A depends on / uses B.', fields: [] },
    { id: 'DataFlow', description: 'Data flows from A to B.', fields: [] },
    { id: 'Realization', description: 'A realizes/implements an interface defined by B.', fields: [] },
    { id: 'Trace', description: 'Traceability link (e.g. a requirement traced to its implementation).', fields: [] },
  ],
};

export { layerOfType, allowedParentTypes, allowedChildTypes, topLevelTypes, typesForLayer } from '../profile';
