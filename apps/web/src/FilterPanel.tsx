import { useStore } from './store';
import { c4Backend, connectionKindIds, type FieldDef } from '@hyphae/schema';

function KindGroup() {
  const selected = useStore((s) => s.connFilter.kinds);
  const toggle = useStore((s) => s.toggleConnKind);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>Kind</div>
      {connectionKindIds(c4Backend).map((k) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} /> {k}
        </label>
      ))}
    </div>
  );
}

function FieldGroup({ def }: { def: FieldDef }) {
  const selected = useStore((s) => s.connFilter.fields[def.key] ?? []);
  const toggle = useStore((s) => s.toggleConnField);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>{def.label ?? def.key}</div>
      {(def.values ?? []).map((v) => (
        <label key={v.value} title={v.description} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(v.value)} onChange={() => toggle(def.key, v.value)} /> {v.value}
        </label>
      ))}
    </div>
  );
}

export function FilterPanel() {
  const filter = useStore((s) => s.connFilter);
  const clear = useStore((s) => s.clearConnFilter);
  const active = filter.kinds.length + Object.values(filter.fields).reduce((a, v) => a + v.length, 0);
  const enumFields = c4Backend.commonConnectionFields.filter((f) => f.type === 'enum');
  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '8px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>Connections</strong>
        {active > 0 && <button onClick={clear} style={{ fontSize: 11, cursor: 'pointer' }}>clear</button>}
      </div>
      <KindGroup />
      {enumFields.map((f) => <FieldGroup key={f.key} def={f} />)}
    </div>
  );
}
