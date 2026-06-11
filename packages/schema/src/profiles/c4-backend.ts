import type { Profile } from '../profile';

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component'],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: ['Container'] },
    { id: 'Actor', category: 'Actor', layer: 'Context', allowedParents: [], allowedChildren: [] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: [] },
    { id: 'Container', category: 'Structure', layer: 'Container', allowedParents: ['System'], allowedChildren: ['Component'] },
    { id: 'Component', category: 'Structure', layer: 'Component', allowedParents: ['Container'], allowedChildren: [] },
  ],
};

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);
