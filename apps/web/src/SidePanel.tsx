import { useStore } from './store';
import {
  RelationCategorySchema, TransportSchema, DirectionSchema, IntentSchema,
  type Node, type Connection,
} from '@hyphae/schema';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function SidePanel() {
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const connection = useStore((s) => s.model.connections.find((c) => c.id === s.selectedId));
  const nodes = useStore((s) => s.model.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const updateConnection = useStore((s) => s.updateConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  if (node) {
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

  if (connection) {
    const conn = connection;
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const pick = (patch: Partial<Connection>) => updateConnection(conn.id, patch);

    const sel = (label: string, value: string, options: readonly string[], onPick: (v: string) => void) => (
      <label className="field">
        <span>{label}</span>
        <select aria-label={label} value={value} onChange={(e) => onPick(e.target.value)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );

    return (
      <aside className="panel">
        <h2>Connection</h2>
        <p className="field"><strong>{nameOf(conn.from)} → {nameOf(conn.to)}</strong></p>
        {sel('relationCategory', conn.relationCategory, RelationCategorySchema.options,
          (v) => pick({ relationCategory: v as Connection['relationCategory'] }))}
        {sel('transport', conn.transport, TransportSchema.options,
          (v) => pick({ transport: v as Connection['transport'] }))}
        {sel('direction', conn.direction, DirectionSchema.options,
          (v) => pick({ direction: v as Connection['direction'] }))}
        <label className="field">
          <span>intent</span>
          <select aria-label="intent" value={conn.intent ?? ''}
            onChange={(e) => { if (e.target.value) pick({ intent: e.target.value as Connection['intent'] }); }}>
            <option value="">(none)</option>
            {IntentSchema.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="field">
          <span>description</span>
          <textarea aria-label="description" value={conn.description}
            onChange={(e) => pick({ description: e.target.value })} />
        </label>
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
