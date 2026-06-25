import type { HyphaeModel } from './model';
import { c4Backend, layerOfType } from './profiles/c4-backend';

/** A small, size-independent orientation view: counts + the System/Container map. */
export function modelOverview(model: HyphaeModel): string {
  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);

  const byLayer = new Map<string, number>();
  const byKind = new Map<string, number>();
  for (const n of model.nodes) {
    const layer = layerOfType(c4Backend, n.type) ?? '(unknown)';
    byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
    byKind.set(n.type, (byKind.get(n.type) ?? 0) + 1);
  }

  out.push('', `Nodes: ${model.nodes.length}  Connections: ${model.connections.length}`);
  out.push('Per layer: ' + c4Backend.layers.map((l) => `${l}=${byLayer.get(l) ?? 0}`).join('  '));
  out.push('Per kind: ' + [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}=${c}`).join('  '));

  const top = model.nodes.filter((n) => n.type === 'System' || n.type === 'Container');
  if (top.length) {
    const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
    out.push('', '# Systems & Containers');
    for (const n of top) {
      const parent = n.parentId ? ` (in ${nameById.get(n.parentId) ?? n.parentId})` : '';
      const desc = n.description ? ' — ' + n.description.split('\n')[0].trim().slice(0, 120) : '';
      out.push(`- ${n.name} [${n.type}] [id: ${n.id}]${parent}${desc}`);
    }
  }
  return out.join('\n');
}
