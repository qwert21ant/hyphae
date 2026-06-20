import { useStore } from './store';
import type { ConnFilter } from './store';

const CATEGORIES = ['Dependency', 'DataFlow', 'Realization', 'Trace'];
const TRANSPORTS = ['Sync', 'Async', 'InProcess', 'None'];

function Group({ title, kind, options }: { title: string; kind: keyof ConnFilter; options: string[] }) {
  const selected = useStore((s) => s.connFilter[kind]);
  const toggle = useStore((s) => s.toggleConnFilter);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>{title}</div>
      {options.map((o) => (
        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(kind, o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

/** Overlay panel to filter which connections render, by relationCategory and/or transport. */
export function FilterPanel() {
  const filter = useStore((s) => s.connFilter);
  const clear = useStore((s) => s.clearConnFilter);
  const active = filter.relationCategories.length + filter.transports.length;

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '8px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>Connections</strong>
        {active > 0 && (
          <button onClick={clear} style={{ fontSize: 11, cursor: 'pointer' }}>clear</button>
        )}
      </div>
      <Group title="Relation" kind="relationCategories" options={CATEGORIES} />
      <Group title="Transport" kind="transports" options={TRANSPORTS} />
    </div>
  );
}
