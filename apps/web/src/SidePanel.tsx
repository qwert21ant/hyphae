import { useStore } from './store';
import {
  DirectionSchema, allowedParentTypes, connectionKindIds, effectiveFields, c4Backend,
  type Node, type Connection, type FieldDef,
} from '@hyphae/schema';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function FieldInput({ def, value, onChange, nodes }: {
  def: FieldDef; value: unknown; onChange: (v: unknown) => void;
  nodes: Node[];
}) {
  const common = { 'aria-label': def.key } as const;
  let control;
  if (def.type === 'list') {
    control = <textarea {...common} value={Array.isArray(value) ? value.join('\n') : ''} onChange={(e) => onChange(lines(e.target.value))} />;
  } else if (def.type === 'boolean') {
    control = <input {...common} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  } else if (def.type === 'number') {
    control = <input {...common} type="number" value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  } else if (def.type === 'enum') {
    control = (
      <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(none)</option>
        {(def.values ?? []).map((v) => <option key={v.value} value={v.value} title={v.description}>{v.value}</option>)}
      </select>
    );
  } else if (def.type === 'ref') {
    control = (
      <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(none)</option>
        {nodes.filter((n) => !def.refKind || n.type === def.refKind).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    );
  } else {
    control = <input {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return <label className="field" title={def.description}><span>{def.label ?? def.key}{def.required ? ' *' : ''}</span>{control}</label>;
}

export function SidePanel() {
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const connection = useStore((s) => s.model.connections.find((c) => c.id === s.selectedId));
  const nodes = useStore((s) => s.model.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const reparent = useStore((s) => s.reparent);
  const deleteNode = useStore((s) => s.deleteNode);
  const updateConnection = useStore((s) => s.updateConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  if (node) {
    const parentTypes = allowedParentTypes(c4Backend, node.type);
    const parentOptions = nodes.filter((p) => parentTypes.includes(p.type) && p.id !== node.id);
    const setField = (key: string, v: unknown) => updateNode(node.id, { fields: { ...node.fields, [key]: v } });
    return (
      <aside className="panel">
        <h2>{node.type}</h2>
        <label className="field"><span>name</span>
          <input aria-label="name" value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} /></label>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={node.description} onChange={(e) => updateNode(node.id, { description: e.target.value })} /></label>
        {effectiveFields(c4Backend, node.type, 'node').map((def) => (
          <FieldInput key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
        ))}
        {parentTypes.length > 0 && (
          <label className="field"><span>parent</span>
            <select aria-label="parent" value={node.parentId ?? ''} onChange={(e) => reparent(node.id, e.target.value || null)}>
              <option value="">(none)</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select></label>
        )}
        <button onClick={() => deleteNode(node.id)}>Delete node</button>
      </aside>
    );
  }

  if (connection) {
    const conn = connection;
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const setField = (key: string, v: unknown) => updateConnection(conn.id, { fields: { ...conn.fields, [key]: v } });
    return (
      <aside className="panel">
        <h2>Connection</h2>
        <p className="field"><strong>{nameOf(conn.from)} → {nameOf(conn.to)}</strong></p>
        <label className="field"><span>type</span>
          <select aria-label="type" value={conn.type} onChange={(e) => updateConnection(conn.id, { type: e.target.value })}>
            {connectionKindIds(c4Backend).map((k) => <option key={k} value={k}>{k}</option>)}
          </select></label>
        <label className="field"><span>direction</span>
          <select aria-label="direction" value={conn.direction} onChange={(e) => updateConnection(conn.id, { direction: e.target.value as Connection['direction'] })}>
            {DirectionSchema.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={conn.description} onChange={(e) => updateConnection(conn.id, { description: e.target.value })} /></label>
        {effectiveFields(c4Backend, conn.type, 'connection').map((def) => (
          <FieldInput key={def.key} def={def} value={conn.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
        ))}
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
