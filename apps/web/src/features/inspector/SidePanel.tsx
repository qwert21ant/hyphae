import { useMemo } from 'react';
import { useStore } from '@/state/store';
import { buildFocusView } from '@/core/focusView';
import { partitionConnections } from '@/core/connections';
import { ConnectionList } from './ConnectionList';
import { Row, ListRow, NodeLink, FieldRow } from './FieldRows';
import { fieldLayout } from './fieldLayout';
import { nodeFields, connectionFields, c4Backend, type Connection } from '@hyphae/schema';

/** The inspector: a read-only detail view of whatever is selected. The model is authored by agents
 *  over MCP (and by editing the JSON file), so nothing in the browser writes — refs and the parent
 *  stay navigable, which is the only interaction left here. */
export function SidePanel() {
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const connection = useStore((s) => s.model.connections.find((c) => c.id === s.selectedId));
  const nodes = useStore((s) => s.model.nodes);
  const revealNode = useStore((s) => s.revealNode);
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
    const fields = nodeFields(c4Backend, node.type);
    // summary and technology are the two the canvas draws, so they lead — the same split the panel
    // made when it had "On diagram" / "Detail" headings to justify it.
    const onDiagram = (def: { key: string }) => def.key === 'summary' || def.key === 'technology';
    const { outgoing, incoming } = partitionConnections(model, node.id);
    const total = outgoing.length + incoming.length;
    return (
      <aside className="panel">
        <div className="panel__name">{node.name}</div>
        <div className="panel__chips">
          <span className="chip">{node.type}</span>
          {node.role && <span className="chip" title="Shape archetype, overriding this node kind's default.">{node.role}</span>}
          {node.foundational && (
            <span className="chip" title="Foundational: this node's edges are not drawn when it appears outside the container being focused — it sits on the shelf with a count instead. Every connection is still listed below.">
              foundational
            </span>
          )}
        </div>
        {fields.filter(onDiagram).map((def) => (
          <FieldRow key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {node.description && (
          <Row label="description" layout={fieldLayout('core', node.description)}>{node.description}</Row>
        )}
        {node.root && (
          <Row label="root" layout="grid" title='Directory Ref anchoring this subtree on disk, e.g. "endpoints/media_gateway/". Descendants resolve their refs against it.'>
            {node.root}
          </Row>
        )}
        <ListRow label="codeRefs" title="Refs relative to the nearest ancestor root." items={node.codeRefs} />
        <ListRow label="docRefs" title="Refs or URLs." items={node.docRefs} />
        {fields.filter((def) => !onDiagram(def)).map((def) => (
          <FieldRow key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {node.parentId && (
          <Row label="parent" layout="grid">
            <NodeLink id={node.parentId} nodes={nodes} onNavigate={revealNode} />
          </Row>
        )}
        {total > 0 && (
          <>
            <div className="panel__section hy-micro">connections · {total}</div>
            {outgoing.length > 0 && (
              <>
                <div className="panel__subsection hy-micro">outgoing · {outgoing.length}</div>
                <ConnectionList connections={outgoing} />
              </>
            )}
            {incoming.length > 0 && (
              <>
                <div className="panel__subsection hy-micro">incoming · {incoming.length}</div>
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
    const realizedChildren = conn.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <div className="panel__name">Connection</div>
        <div className="panel__chips">
          <span className="chip">{nameOf(conn.from)} → {nameOf(conn.to)}</span>
        </div>
        <Row label="label" layout="grid" title="What this edge says. The only text drawn on the diagram.">{conn.label}</Row>
        <Row label="direction" layout="grid">{conn.direction}</Row>
        {conn.description && (
          <Row label="description" layout={fieldLayout('core', conn.description)}>{conn.description}</Row>
        )}
        {connectionFields(c4Backend).map((def) => (
          <FieldRow key={def.key} def={def} value={conn.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {realizedChildren.length > 0 && (
          <>
            <div className="panel__section hy-micro">realized by · {realizedChildren.length}</div>
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
        <div className="panel__name">Rolled-up connection</div>
        <div className="panel__chips">
          <span className="chip">{nameOf(rollup.from)} → {nameOf(rollup.to)}</span>
        </div>
        <div className="panel__section hy-micro">{conns.length} connection{conns.length === 1 ? '' : 's'}</div>
        <ConnectionList connections={conns} />
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
