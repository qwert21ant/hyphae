import type { Profile, FieldDef } from '../profile';

const technology: FieldDef = {
  key: 'technology', type: 'text',
  description: 'One canonical technology name for this node, e.g. "Vue", "PostgreSQL", "Go". No version numbers and no dependency lists — the canvas ellipsizes a long value. Put the fuller stack detail in `description`.',
};

/** The one-line purpose shown on the diagram. Required on every structural kind: an unlabeled
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
  patternKinds: [
    { id: 'pipeline', renderer: 'pipeline', ordered: true, description: 'Ordered stages data flows through in sequence (e.g. decode → normalize → persist). Members are the stages, in array order.' },
    { id: 'middleware', renderer: 'middleware', ordered: true, description: 'A request passes through an ordered chain of interceptors (e.g. auth → log → handler).' },
    { id: 'state-machine', renderer: 'state-machine', ordered: false, description: 'States and the transitions between them (e.g. Idle → Recording → Error). Members are states (pure names); transitions connect them by member name.' },
    { id: 'layered', renderer: 'layered', ordered: false, description: 'Stacked architectural bands (e.g. UI / domain / data).' },
    { id: 'event-bus', renderer: 'event-bus', ordered: false, description: 'A hub with publishers and subscribers around it.' },
  ],
  commonNodeFields: [
    {
      key: 'responsibilities', type: 'list',
      description: 'What this node is accountable for in the system, in the language of the domain — one item per entry. Each item must pass: "The system relies on <name> to ___". Name the capability, not the mechanism: a method it calls, a lock it holds or a class it constructs is not a responsibility. Do not repeat these in `description` — the list is the scannable form, and the description is for what a list cannot carry. Supports **bold** and `code` (a code span is for a name that is part of the system\'s contract — a config key, an environment variable, a wire-protocol field — never an internal class or method).',
    },
    {
      key: 'rules', type: 'list',
      description: 'Conditions that always hold, stated as promises about the system\'s behaviour that a reader could not guess from the node\'s name — e.g. "Never hands out a path computed from a position the player has already left". Never a code-level precondition: not a lock protocol, not a call ordering, not a null check. If the statement stops being true when a method is renamed, it is a code comment and belongs in the code. Supports **bold** and `code` (contract names only, never an internal symbol).',
    },
  ],
  // Empty by design: the connection's label and description carry its meaning. The array stays
  // so a custom profile can define its own connection fields.
  commonConnectionFields: [],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', role: 'service', allowedParents: [], allowedChildren: ['Container'], fields: [summary] },
    { id: 'Actor', category: 'Actor', layer: 'Context', role: 'actor', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', role: 'external', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'Container', category: 'Structure', layer: 'Container', role: 'service', allowedParents: ['System'], allowedChildren: ['Component'], fields: [summary, technology] },
    { id: 'Component', category: 'Structure', layer: 'Component', role: 'service', allowedParents: ['Container'], allowedChildren: [], fields: [summary, technology] },
  ],
};

export { layerOfType, allowedParentTypes, allowedChildTypes, topLevelTypes, typesForLayer } from '../profile';
