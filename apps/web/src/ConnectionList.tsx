import { useStore } from './store';
import type { Connection } from '@hyphae/schema';

/** A read-only list of connections: each endpoint name focuses its node, and the row selects the
 *  connection (to inspect it / drill its own realizedBy). Reused by the rollup-edge and the
 *  connection "Realized by" panels. */
export function ConnectionList({ connections }: { connections: Connection[] }) {
  const nodes = useStore((s) => s.model.nodes);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const parentNameOf = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    const p = n?.parentId ? nodes.find((x) => x.id === n.parentId) : null;
    return p?.name;
  };

  return (
    <ul className="rollup-list">
      {connections.map((c) => (
        <li key={c.id} onClick={() => select(c.id)} style={{ cursor: 'pointer' }}>
          <button onClick={(ev) => { ev.stopPropagation(); setFocus(c.from); }}>{nameOf(c.from)}</button>
          {parentNameOf(c.from) && <small> ({parentNameOf(c.from)})</small>}
          {' → '}
          <button onClick={(ev) => { ev.stopPropagation(); setFocus(c.to); }}>{nameOf(c.to)}</button>
          {parentNameOf(c.to) && <small> ({parentNameOf(c.to)})</small>}
          {c.object && <small> · {c.object}</small>}
        </li>
      ))}
    </ul>
  );
}
