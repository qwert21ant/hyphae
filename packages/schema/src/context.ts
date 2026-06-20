import type { HyphaeModel } from './model';
import type { Node } from './node';
import type { Connection } from './connection';
import { c4Backend, layerOfType } from './profiles/c4-backend';
import { effectiveFields } from './profile';

export type ContextScope = {
  mode?: 'summary' | 'full';
  layer?: string;
  root?: string;
  fields?: string[];
};

function fieldLine(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.length ? `${label}: ${value.map((i) => `- ${i}`).join(' ')}` : undefined;
  return `${label}: ${String(value)}`;
}

function summaryLine(n: Node): string | undefined {
  if (!n.description) return undefined;
  const first = n.description.split('\n')[0].trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

function nodeBlock(n: Node, nameById: Map<string, string>, mode: 'summary' | 'full', only?: string[]): string {
  const lines = [`## ${n.name} (${n.type})  [id: ${n.id}]`];
  const push = (s: string | undefined) => { if (s) lines.push(s); };

  if (only?.length) {
    for (const key of only) push(fieldLine(key, n.fields[key]));
    return lines.join('\n');
  }
  if (mode === 'summary') {
    push(summaryLine(n));
    if (n.parentId) push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
    return lines.join('\n');
  }
  // full
  if (n.description) push(n.description);
  if (n.parentId) push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
  for (const def of effectiveFields(c4Backend, n.type, 'node')) push(fieldLine(def.label ?? def.key, n.fields[def.key]));
  if (n.codeRefs.length) push(fieldLine('codeRefs', n.codeRefs));
  return lines.join('\n');
}

function connectionLine(c: Connection, nameById: Map<string, string>): string {
  const arrow = c.direction === 'Bidirectional' ? '<->' : '->';
  const desc = c.description ? ` — ${c.description}` : '';
  return `${nameById.get(c.from) ?? c.from} ${arrow} ${nameById.get(c.to) ?? c.to} [${c.type}]${desc}`;
}

function descendants(model: HyphaeModel, root: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (!n.parentId) continue;
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n.id); else childrenByParent.set(n.parentId, [n.id]);
  }
  const set = new Set<string>([root]);
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of childrenByParent.get(id) ?? []) if (!set.has(child)) { set.add(child); stack.push(child); }
  }
  return set;
}

export function getContext(model: HyphaeModel, scope: ContextScope = {}): string {
  const { layer, root, fields } = scope;
  const mode = scope.mode ?? (root ? 'full' : 'summary');
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));

  let nodes = model.nodes;
  if (layer) nodes = nodes.filter((n) => layerOfType(c4Backend, n.type) === layer);
  if (root) { const sub = descendants(model, root); nodes = nodes.filter((n) => sub.has(n.id)); }
  const visible = new Set(nodes.map((n) => n.id));

  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);
  out.push('', '# Nodes', ...nodes.map((n) => nodeBlock(n, nameById, mode, fields)));

  const conns = model.connections.filter((c) => visible.has(c.from) && visible.has(c.to));
  if (conns.length) {
    out.push('', '# Connections');
    for (const c of conns) out.push(connectionLine(c, nameById));
  }
  return out.join('\n');
}
