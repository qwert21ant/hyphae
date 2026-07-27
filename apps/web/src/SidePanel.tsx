import { useMemo } from 'react';
import { useStore } from './store';
import { buildFocusView, partitionConnections } from './focusView';
import { ConnectionList } from './ConnectionList';
import {
  DirectionSchema, allowedParentTypes, nodeFields, connectionFields, c4Backend,
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
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const rollup = useMemo(() => {
    // Only derived (rollup) edges use the `agg:` id; skip the view recompute for any other selection.
    if (!selectedId?.startsWith('agg:')) return null;
    const v = buildFocusView(model, focusId, connFilter);
    return v.edges.find((edge) => edge.derived && edge.id === selectedId) ?? null;
  }, [model, focusId, connFilter, selectedId]);

  if (node) {
    const parentTypes = allowedParentTypes(c4Backend, node.type);
    const parentOptions = nodes.filter((p) => parentTypes.includes(p.type) && p.id !== node.id);
    const setField = (key: string, v: unknown) => updateNode(node.id, { fields: { ...node.fields, [key]: v } });
    const { outgoing, incoming } = partitionConnections(model, node.id);
    const total = outgoing.length + incoming.length;
    return (
      <aside className="panel">
        <h2>{node.type}</h2>
        <h3>On diagram</h3>
        <label className="field"><span>name</span>
          <input aria-label="name" value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} /></label>
        <label className="field" title="Shape archetype. Empty = this node kind's default.">
          <span>role</span>
          <select aria-label="role" value={node.role ?? ''}
            onChange={(e) => updateNode(node.id, { role: e.target.value || null })}>
            <option value="">(kind default)</option>
            {c4Backend.roles.map((r) => <option key={r.id} value={r.id} title={r.description}>{r.id}</option>)}
          </select></label>
        {nodeFields(c4Backend, node.type)
          .filter((def) => def.key === 'summary' || def.key === 'technology')
          .map((def) => (
            <FieldInput key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
          ))}
        <h3>Detail</h3>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={node.description} onChange={(e) => updateNode(node.id, { description: e.target.value })} /></label>
        <label className="field" title='Directory Ref anchoring this subtree on disk, e.g. "endpoints/media_gateway/". Descendants resolve their refs against it.'>
          <span>root</span>
          <input aria-label="root" value={node.root ?? ''}
            onChange={(e) => updateNode(node.id, { root: e.target.value || null })} /></label>
        <label className="field" title="One Ref per line, relative to the nearest ancestor root.">
          <span>codeRefs</span>
          <textarea aria-label="codeRefs" value={node.codeRefs.join('\n')}
            onChange={(e) => updateNode(node.id, { codeRefs: lines(e.target.value) })} /></label>
        <label className="field" title="One Ref or URL per line.">
          <span>docRefs</span>
          <textarea aria-label="docRefs" value={node.docRefs.join('\n')}
            onChange={(e) => updateNode(node.id, { docRefs: lines(e.target.value) })} /></label>
        {nodeFields(c4Backend, node.type)
          .filter((def) => def.key !== 'summary' && def.key !== 'technology')
          .map((def) => (
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
        {total > 0 && (
          <>
            <h3>Connections ({total})</h3>
            {outgoing.length > 0 && (
              <>
                <h4 className="conn-dir">Outgoing ({outgoing.length})</h4>
                <ConnectionList connections={outgoing} />
              </>
            )}
            {incoming.length > 0 && (
              <>
                <h4 className="conn-dir">Incoming ({incoming.length})</h4>
                <ConnectionList connections={incoming} />
              </>
            )}
          </>
        )}
      </aside>
    );
  }

  if (connection) {
    const conn = connection;
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const setField = (key: string, v: unknown) => updateConnection(conn.id, { fields: { ...conn.fields, [key]: v } });
    const realizedChildren = conn.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Connection</h2>
        <p className="field"><strong>{nameOf(conn.from)} → {nameOf(conn.to)}</strong></p>
        <h3>On diagram</h3>
        <label className="field" title="The business action shown on the edge.">
          <span>verb</span>
          <select aria-label="verb" value={conn.verb}
            onChange={(e) => updateConnection(conn.id, { verb: e.target.value })}>
            {c4Backend.verbs.map((v) => <option key={v.id} value={v.id} title={v.description}>{v.id}</option>)}
          </select></label>
        <label className="field" title='Short noun the action acts on, e.g. "camera list".'>
          <span>object</span>
          <input aria-label="object" value={conn.object}
            onChange={(e) => updateConnection(conn.id, { object: e.target.value })} /></label>
        <label className="field"><span>direction</span>
          <select aria-label="direction" value={conn.direction} onChange={(e) => updateConnection(conn.id, { direction: e.target.value as Connection['direction'] })}>
            {DirectionSchema.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        <h3>Detail</h3>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={conn.description} onChange={(e) => updateConnection(conn.id, { description: e.target.value })} /></label>
        {connectionFields(c4Backend).map((def) => (
          <FieldInput key={def.key} def={def} value={conn.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
        ))}
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
        {realizedChildren.length > 0 && (
          <>
            <h3>Realized by ({realizedChildren.length})</h3>
            <ConnectionList connections={realizedChildren} />
          </>
        )}
      </aside>
    );
  }

  if (rollup) {
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const conns = rollup.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Rolled-up connection</h2>
        <p className="field"><strong>{nameOf(rollup.from)} → {nameOf(rollup.to)}</strong></p>
        <p className="field">{conns.length} connection{conns.length === 1 ? '' : 's'}</p>
        <ConnectionList connections={conns} />
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
