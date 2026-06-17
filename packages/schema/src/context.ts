import type { HyphaeModel } from './model';
import type { Node } from './node';
import { c4Backend, layerOfType } from './profiles/c4-backend';

export type ContextScope = {
  /** summary = headline + one-line purpose + parent; full = all semantic fields. Default: summary, or full when `root` is set. */
  mode?: 'summary' | 'full';
  /** Restrict to one layer (Context | Container | Component). */
  layer?: string;
  /** A node id; render only that node and its descendants (by parentId). */
  root?: string;
  /** Explicit node fields to include; overrides `mode`. */
  fields?: string[];
};

const FULL_ORDER = ['purpose', 'description', 'technology', 'parent', 'responsibilities', 'invariants', 'assumptions', 'failureModes'];

function listLine(label: string, items: string[]): string | undefined {
  return items.length ? `${label}: ${items.map((i) => `- ${i}`).join(' ')}` : undefined;
}

function renderField(n: Node, field: string, nameById: Map<string, string>): string | undefined {
  switch (field) {
    case 'purpose': return n.purpose ? `purpose: ${n.purpose}` : undefined;
    case 'description': return n.description || undefined;
    case 'technology': return n.technology ? `tech: ${n.technology}` : undefined;
    case 'parent': return n.parentId ? `parent: ${nameById.get(n.parentId) ?? n.parentId}` : undefined;
    case 'responsibilities': return listLine('responsibilities', n.responsibilities);
    case 'invariants': return listLine('invariants', n.invariants);
    case 'assumptions': return listLine('assumptions', n.assumptions);
    case 'failureModes': return listLine('failureModes', n.failureModes);
    default: return undefined;
  }
}

/** One-line intent for summary mode: purpose, else the first line of description, truncated. */
function summaryLine(n: Node): string | undefined {
  const text = n.purpose || n.description;
  if (!text) return undefined;
  const first = text.split('\n')[0].trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

function nodeBlock(n: Node, nameById: Map<string, string>, mode: 'summary' | 'full', fields?: string[]): string {
  const lines = [`## ${n.name} (${n.type})  [id: ${n.id}]`];
  const push = (s: string | undefined) => { if (s) lines.push(s); };
  if (fields?.length) {
    for (const f of fields) push(renderField(n, f, nameById));
  } else if (mode === 'full') {
    for (const f of FULL_ORDER) push(renderField(n, f, nameById));
  } else {
    push(summaryLine(n));
    push(renderField(n, 'parent', nameById));
  }
  return lines.join('\n');
}

/** The node and all of its descendants by parentId. */
function descendants(model: HyphaeModel, root: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (!n.parentId) continue;
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n.id);
    else childrenByParent.set(n.parentId, [n.id]);
  }
  const set = new Set<string>([root]);
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of childrenByParent.get(id) ?? []) {
      if (!set.has(child)) {
        set.add(child);
        stack.push(child);
      }
    }
  }
  return set;
}

export function getContext(model: HyphaeModel, scope: ContextScope = {}): string {
  const { layer, root, fields } = scope;
  const mode = scope.mode ?? (root ? 'full' : 'summary');
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));

  let nodes = model.nodes;
  if (layer) nodes = nodes.filter((n) => layerOfType(c4Backend, n.type) === layer);
  if (root) {
    const sub = descendants(model, root);
    nodes = nodes.filter((n) => sub.has(n.id));
  }
  const visible = new Set(nodes.map((n) => n.id));

  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);
  out.push('', '# Nodes', ...nodes.map((n) => nodeBlock(n, nameById, mode, fields)));

  const conns = model.connections.filter((c) => visible.has(c.from) && visible.has(c.to));
  if (conns.length) {
    out.push('', '# Connections');
    for (const c of conns) {
      const arrow = c.direction === 'Bidirectional' ? '<->' : '->';
      const tag = `${c.relationCategory}/${c.transport}`;
      const desc = c.description ? ` — ${c.description}` : '';
      out.push(`${nameById.get(c.from)} ${arrow} ${nameById.get(c.to)} [${tag}]${desc}`);
    }
  }
  return out.join('\n');
}
