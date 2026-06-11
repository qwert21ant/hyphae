import { useStore } from './store';
import type { Node } from '@hyphae/schema';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function SidePanel() {
  const selectedId = useStore((s) => s.selectedId);
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);

  if (!selectedId || !node) {
    return <aside className="panel"><p>No node selected.</p></aside>;
  }

  const text = (label: keyof Node, value: string) => (
    <label className="field">
      <span>{label}</span>
      <input aria-label={label} value={value}
        onChange={(e) => updateNode(node.id, { [label]: e.target.value } as Partial<Node>)} />
    </label>
  );

  const list = (label: 'responsibilities' | 'invariants' | 'assumptions' | 'failureModes') => (
    <label className="field">
      <span>{label}</span>
      <textarea aria-label={label} value={node[label].join('\n')}
        onChange={(e) => updateNode(node.id, { [label]: lines(e.target.value) })} />
    </label>
  );

  return (
    <aside className="panel">
      <h2>{node.type}</h2>
      {text('name', node.name)}
      {text('purpose', node.purpose ?? '')}
      {text('technology', node.technology ?? '')}
      <label className="field">
        <span>description</span>
        <textarea aria-label="description" value={node.description}
          onChange={(e) => updateNode(node.id, { description: e.target.value })} />
      </label>
      {list('responsibilities')}
      {list('invariants')}
      {list('assumptions')}
      {list('failureModes')}
      <button onClick={() => deleteNode(node.id)}>Delete node</button>
    </aside>
  );
}
