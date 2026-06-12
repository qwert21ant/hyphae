import type { HyphaeModel } from './model';
import type { Profile } from './profile';
import { allowedParentTypes, c4Backend } from './profiles/c4-backend';

export type Issue = {
  kind: 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint';
  ref: string;       // id of the offending node/connection
  message: string;
};

export function validateModel(model: HyphaeModel, profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const knownTypes = new Set(profile.nodeKinds.map((k) => k.id));

  for (const n of model.nodes) {
    if (!knownTypes.has(n.type)) {
      issues.push({ kind: 'unknown-type', ref: n.id, message: `Unknown type "${n.type}"` });
      continue;
    }
    if (n.parentId !== null) {
      const parent = nodeById.get(n.parentId);
      if (!parent) {
        issues.push({ kind: 'missing-parent', ref: n.id, message: `parentId "${n.parentId}" not found` });
      } else if (!allowedParentTypes(profile, n.type).includes(parent.type)) {
        issues.push({ kind: 'bad-parent', ref: n.id, message: `${n.type} cannot be child of ${parent.type}` });
      }
    }
  }

  for (const c of model.connections) {
    if (!nodeById.has(c.from) || !nodeById.has(c.to)) {
      issues.push({ kind: 'dangling-endpoint', ref: c.id, message: `Connection references missing node` });
    }
  }
  return issues;
}

const issueKey = (i: Issue) => `${i.kind}:${i.ref}`;

/** Issues present in `next` but not already in `prev` (identity = kind+ref). */
export function newIssues(prev: HyphaeModel, next: HyphaeModel, profile: Profile): Issue[] {
  const before = new Set(validateModel(prev, profile).map(issueKey));
  return validateModel(next, profile).filter((i) => !before.has(issueKey(i)));
}

/** The Profile for a model's activeProfile. Only c4-backend exists today. */
export function resolveProfile(model: HyphaeModel): Profile {
  if (model.activeProfile === c4Backend.id) return c4Backend;
  throw new Error(`Unknown profile: ${model.activeProfile}`);
}
