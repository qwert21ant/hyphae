import { useStore } from '@/state/store';
import { c4Backend, connectionFields, verbClasses, type FieldDef } from '@hyphae/schema';
import { VERB_CLASS_COLOR } from '@/core/verbColors';

function VerbClassGroup() {
  const selected = useStore((s) => s.connFilter.verbClasses);
  const toggle = useStore((s) => s.toggleConnVerbClass);
  const classes = verbClasses(c4Backend);
  return (
    <div className="filter__group">
      <div className="filter__label">Verb class</div>
      {classes.map((cls) => (
        <label className="filter__option" key={cls}>
          <input type="checkbox" checked={selected.includes(cls)} onChange={() => toggle(cls)} />
          <span className="filter__swatch" style={{ background: VERB_CLASS_COLOR[cls] }} />
          {cls}
        </label>
      ))}
    </div>
  );
}

function FieldGroup({ def }: { def: FieldDef }) {
  const selected = useStore((s) => s.connFilter.fields[def.key] ?? []);
  const toggle = useStore((s) => s.toggleConnField);
  return (
    <div className="filter__group">
      <div className="filter__label">{def.label ?? def.key}</div>
      {(def.values ?? []).map((v) => (
        <label className="filter__option" key={v.value} title={v.description}>
          <input type="checkbox" checked={selected.includes(v.value)} onChange={() => toggle(def.key, v.value)} /> {v.value}
        </label>
      ))}
    </div>
  );
}

/**
 * The Layout group is ALWAYS rendered, because the edge-style toggle lives here and is not
 * conditional. Only "reset layout" is — there is nothing to reset until something has been dragged.
 */
function LayoutGroup() {
  const dragged = useStore((s) => s.nodePositions);
  const resetNodePositions = useStore((s) => s.resetNodePositions);
  const edgeStyle = useStore((s) => s.edgeStyle);
  const setEdgeStyle = useStore((s) => s.setEdgeStyle);
  // The button names the style it switches TO, so it reads as an action rather than a status.
  const next = edgeStyle === 'squared' ? 'curved' : 'squared';
  return (
    <div className="filter__group">
      <div className="filter__label">Layout</div>
      <button className="filter__clear" onClick={() => setEdgeStyle(next)}>{next} edges</button>
      {!!Object.keys(dragged).length && (
        <button className="filter__clear" onClick={resetNodePositions}>reset layout</button>
      )}
    </div>
  );
}

export function FilterPanel() {
  const filter = useStore((s) => s.connFilter);
  const clear = useStore((s) => s.clearConnFilter);
  const active = filter.verbClasses.length + Object.values(filter.fields).reduce((a, v) => a + v.length, 0);
  const enumFields = connectionFields(c4Backend).filter((f) => f.type === 'enum');
  return (
    <div className="float filter">
      <div className="filter__head">
        <strong className="filter__title">Connections</strong>
        {active > 0 && <button className="filter__clear" onClick={clear}>clear</button>}
      </div>
      <VerbClassGroup />
      <LayoutGroup />
      {enumFields.map((f) => <FieldGroup key={f.key} def={f} />)}
    </div>
  );
}
