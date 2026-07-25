import type { HyphaeModel } from './model';
import type { Profile, FieldDef } from './profile';
import { allowedParentTypes, c4Backend } from './profiles/c4-backend';
import { effectiveFields, roleDefOf, verbDefOf } from './profile';
import type { Node } from './node';
import { isDirectoryRef, resolveRoot, resolveRef } from './ref';

export type Issue = {
  kind:
    | 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint'
    | 'unknown-connection-kind' | 'bad-endpoint'
    | 'unknown-field' | 'bad-field-type' | 'bad-enum-value' | 'missing-required-field' | 'bad-ref'
    | 'unanchored-ref' | 'bad-root'
    | 'unknown-role' | 'unknown-verb'
    | 'bad-flow-endpoint' | 'bad-flow-via' | 'bad-flow-scope'
    | 'pattern-unknown-kind' | 'pattern-member-double-bind' | 'pattern-member-bad-node'
    | 'pattern-bad-anchor' | 'pattern-unanchored-ref' | 'pattern-bad-transition'
    | 'pattern-duplicate-member-name';
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
    } else {
      // A null parent is legitimate only for a top-level kind (empty allowedParents).
      // A Container/Component with no parent is an orphan, not a root — flag it.
      const allowed = allowedParentTypes(profile, n.type);
      if (allowed.length > 0) {
        issues.push({ kind: 'missing-parent', ref: n.id, message: `${n.type} must be a child of ${allowed.join(' or ')} but has no parent` });
      }
    }
    issues.push(...validateFields(n.fields, effectiveFields(profile, n.type, 'node'), nodeById, n.id));
    issues.push(...validateRefs(n, model.nodes));
    if (n.role !== null && !roleDefOf(profile, n.role)) {
      issues.push({ kind: 'unknown-role', ref: n.id, message: `Unknown role "${n.role}"` });
    }
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
    if (!verbDefOf(profile, c.verb)) {
      issues.push({ kind: 'unknown-verb', ref: c.id, message: `Unknown verb "${c.verb}"` });
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

  const connIds = new Set(model.connections.map((c) => c.id));
  const layers = new Set(profile.layers);
  for (const f of model.flows) {
    if (f.scope !== null && !layers.has(f.scope)) {
      issues.push({ kind: 'bad-flow-scope', ref: f.id, message: `Flow scope "${f.scope}" is not a profile layer` });
    }
    for (const s of f.steps) {
      if (!nodeById.has(s.from) || !nodeById.has(s.to)) {
        issues.push({ kind: 'bad-flow-endpoint', ref: f.id, message: `Step ${s.order} references a missing node (${s.from} → ${s.to})` });
      }
      if (s.via !== undefined && !connIds.has(s.via)) {
        issues.push({ kind: 'bad-flow-via', ref: f.id, message: `Step ${s.order} via references a missing connection "${s.via}"` });
      }
    }
  }

  const patternKinds = new Set(profile.patternKinds.map((k) => k.id));
  for (const p of model.patterns) {
    if (!patternKinds.has(p.kind)) {
      issues.push({ kind: 'pattern-unknown-kind', ref: p.id, message: `Unknown pattern kind "${p.kind}"` });
    }
    if (p.anchor !== null && !nodeById.has(p.anchor)) {
      issues.push({ kind: 'pattern-bad-anchor', ref: p.id, message: `anchor "${p.anchor}" is not a node` });
    }
    const names = new Set<string>();
    for (const m of p.members) {
      if (m.nodeId !== undefined && m.ref !== undefined) {
        issues.push({ kind: 'pattern-member-double-bind', ref: p.id, message: `Member "${m.name}" has both a nodeId and a ref` });
      }
      if (m.nodeId !== undefined && !nodeById.has(m.nodeId)) {
        issues.push({ kind: 'pattern-member-bad-node', ref: p.id, message: `Member "${m.name}" nodeId "${m.nodeId}" is not a node` });
      }
      if (m.ref !== undefined && !m.ref.startsWith('/')) {
        const resolved = p.anchor !== null ? resolveRef(model.nodes, p.anchor, m.ref) : null;
        if (resolved === null) {
          issues.push({ kind: 'pattern-unanchored-ref', ref: p.id, message: `Member "${m.name}" ref "${m.ref}" cannot be resolved: no anchoring root (set the pattern's anchor to a node whose root chain covers it)` });
        }
      }
      if (names.has(m.name)) {
        issues.push({ kind: 'pattern-duplicate-member-name', ref: p.id, message: `Duplicate member name "${m.name}"` });
      }
      names.add(m.name);
    }
    for (const t of p.transitions) {
      if (!names.has(t.from) || !names.has(t.to)) {
        issues.push({ kind: 'pattern-bad-transition', ref: p.id, message: `Transition ${t.from} → ${t.to} references a name that is not a member` });
      }
    }
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
