import type { HyphaeModel } from './model';
import type { Node } from './node';
import { c4Backend, layerOfType } from './profiles/c4-backend';

export type ContextScope = { layer?: string };

function nodeBlock(n: Node, nameById: Map<string, string>): string {
  const lines: string[] = [`## ${n.name} (${n.type})  [id: ${n.id}]`];
  if (n.purpose) lines.push(`purpose: ${n.purpose}`);
  if (n.description) lines.push(n.description);
  if (n.technology) lines.push(`tech: ${n.technology}`);
  if (n.parentId) lines.push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
  const list = (label: string, items: string[]) => {
    if (items.length) lines.push(`${label}: ${items.map((i) => `- ${i}`).join(' ')}`);
  };
  list('responsibilities', n.responsibilities);
  list('invariants', n.invariants);
  list('assumptions', n.assumptions);
  list('failureModes', n.failureModes);
  return lines.join('\n');
}

export function getContext(model: HyphaeModel, scope: ContextScope = {}): string {
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
  const nodes = scope.layer
    ? model.nodes.filter((n) => layerOfType(c4Backend, n.type) === scope.layer)
    : model.nodes;
  const visible = new Set(nodes.map((n) => n.id));

  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);
  out.push('', '# Nodes', ...nodes.map((n) => nodeBlock(n, nameById)));

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
