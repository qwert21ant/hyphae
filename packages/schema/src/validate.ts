import type { HyphaeModel } from './model';
import type { Profile, FieldDef } from './profile';
import { allowedParentTypes, c4Backend } from './profiles/c4-backend';
import { effectiveFields } from './profile';
import type { Node } from './node';
import { isDirectoryRef, resolveRoot } from './ref';

export type Issue = {
  kind:
    | 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint'
    | 'unknown-connection-kind' | 'bad-endpoint'
    | 'unknown-field' | 'bad-field-type' | 'bad-enum-value' | 'missing-required-field' | 'bad-ref'
    | 'unanchored-ref' | 'bad-root';
  ref: string;       // id of the offending node/connection
  message: string;
};

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function validateFields(fields: Record<string, unknown>, defs: FieldDef[], nodeById: Map<string, Node>, ref: string): Issue[] {
  const issues: Issue[] = [];
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  for (const key of Object.keys(fields)) {
    if (!defByKey.has(key)) issues.push({ kind: 'unknown-field', ref, message: `Unknown field "${key}"` });
  }

  for (const d of defs) {
    const v = fields[d.key];
    if (!isFilled(v)) {
      if (d.required) issues.push({ kind: 'missing-required-field', ref, message: `Missing required field "${d.key}"` });
      continue;
    }
    const typeOk =
      d.type === 'number' ? typeof v === 'number'
      : d.type === 'boolean' ? typeof v === 'boolean'
      : d.type === 'list' ? Array.isArray(v) && v.every((x) => typeof x === 'string')
      : typeof v === 'string'; // text, enum, ref
    if (!typeOk) {
      issues.push({ kind: 'bad-field-type', ref, message: `Field "${d.key}" expects ${d.type}` });
      continue;
    }
    if (d.type === 'enum' && !(d.values ?? []).some((e) => e.value === v)) {
      issues.push({ kind: 'bad-enum-value', ref, message: `Field "${d.key}" value "${String(v)}" is not an allowed value` });
    }
    if (d.type === 'ref') {
      const target = nodeById.get(v as string);
      if (!target) issues.push({ kind: 'bad-ref', ref, message: `Field "${d.key}" references missing node "${String(v)}"` });
      else if (d.refKind && target.type !== d.refKind) issues.push({ kind: 'bad-ref', ref, message: `Field "${d.key}" must reference a ${d.refKind}` });
    }
  }
  return issues;
}

/**
 * Ref anchoring for one node. `codeRefs` are relative by convention and must resolve
 * against the nearest ancestor `root`; an absolute ref is self-anchoring and exempt.
 * `docRefs` are skipped — they may be URLs, which no root applies to.
 * Reported once per node: thirty unanchored refs are one authoring mistake, not thirty.
 */
function validateRefs(node: Node, nodes: Node[]): Issue[] {
  const issues: Issue[] = [];

  if (node.root !== null && !isDirectoryRef(node.root)) {
    issues.push({
      kind: 'bad-root', ref: node.id,
      message: `root "${node.root}" is not a directory Ref (it must end with "/" and contain no "*" or "#")`,
    });
  }

  const relative = node.codeRefs.filter((r) => !r.startsWith('/'));
  if (relative.length > 0 && resolveRoot(nodes, node.id) === null) {
    issues.push({
      kind: 'unanchored-ref', ref: node.id,
      message: `${relative.length} codeRef(s) cannot be resolved: no ancestor declares a root (e.g. "${relative[0]}")`,
    });
  }

  return issues;
}

export function validateModel(model: HyphaeModel, profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const knownTypes = new Set(profile.nodeKinds.map((k) => k.id));
  const connKindById = new Map(profile.connectionKinds.map((k) => [k.id, k]));

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
    issues.push(...validateFields(n.fields, effectiveFields(profile, n.type, 'node'), nodeById, n.id));
    issues.push(...validateRefs(n, model.nodes));
  }

  for (const c of model.connections) {
    if (!nodeById.has(c.from) || !nodeById.has(c.to)) {
      issues.push({ kind: 'dangling-endpoint', ref: c.id, message: `Connection references missing node` });
    }
    const kind = connKindById.get(c.type);
    if (!kind) {
      issues.push({ kind: 'unknown-connection-kind', ref: c.id, message: `Unknown connection type "${c.type}"` });
      continue;
    }
    const fromNode = nodeById.get(c.from);
    const toNode = nodeById.get(c.to);
    if (kind.allowedFrom && fromNode && !kind.allowedFrom.includes(fromNode.type)) {
      issues.push({ kind: 'bad-endpoint', ref: c.id, message: `${c.type} cannot start at ${fromNode.type}` });
    }
    if (kind.allowedTo && toNode && !kind.allowedTo.includes(toNode.type)) {
      issues.push({ kind: 'bad-endpoint', ref: c.id, message: `${c.type} cannot end at ${toNode.type}` });
    }
    issues.push(...validateFields(c.fields, effectiveFields(profile, c.type, 'connection'), nodeById, c.id));
  }
  return issues;
}

const issueKey = (i: Issue) => `${i.kind}:${i.ref}:${i.message}`;

/** Issues present in `next` but not already in `prev` (identity = kind+ref+message). */
export function newIssues(prev: HyphaeModel, next: HyphaeModel, profile: Profile): Issue[] {
  const before = new Set(validateModel(prev, profile).map(issueKey));
  return validateModel(next, profile).filter((i) => !before.has(issueKey(i)));
}

/** The Profile for a model's activeProfile. Only c4-backend exists today. */
export function resolveProfile(model: HyphaeModel): Profile {
  if (model.activeProfile === c4Backend.id) return c4Backend;
  throw new Error(`Unknown profile: ${model.activeProfile}`);
}
