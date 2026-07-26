import { useState } from 'react';
import { c4Backend } from '@hyphae/schema';
import { LAYER_COLOR, VERB_CLASS_COLOR } from './reactflow';
import { SHAPE_LABEL } from './shapes';
import { NodeShape } from './NodeShape';

// Swatch box. Wide-ish rather than square so a hexagon or cylinder reads at a glance; the geometry
// comes from the same generator the canvas uses, so the two agree whatever size this is.
const SWATCH_W = 20;
const SWATCH_H = 14;

const box = (bg: string, border: string) => ({
  display: 'inline-block', width: 12, height: 12, background: bg,
  border: `1px solid ${border}`, borderRadius: 2, marginRight: 6, verticalAlign: 'middle',
});
const line = (dashed: boolean) => ({
  display: 'inline-block', width: 20, height: 0, marginRight: 6, verticalAlign: 'middle',
  borderTop: dashed ? '2px dashed #7c3aed' : '2px solid #64748b',
});

/** A small always-on key: what the node tints (C4 layers) and the edge styles mean. */
export function Legend() {
  const [open, setOpen] = useState(false);
  const layers = c4Backend.layers.filter((l) => LAYER_COLOR[l]);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#334155' }}
      >
        {open ? '▾' : '▸'} Legend
      </button>
      {open && (
        <div style={{ padding: '2px 10px 8px', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Layers</div>
          {layers.map((l) => (
            <div key={l}><span style={box(LAYER_COLOR[l].bg, LAYER_COLOR[l].border)} />{l}</div>
          ))}
          <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>Edges</div>
          <div><span style={line(false)} />solid — one authored connection (label = kind)</div>
          <div><span style={line(true)} />dashed purple — derived rollup (label = count)</div>
          <div><span style={{ ...line(false), borderColor: '#94a3b8' }} />no arrowhead — mixed directions</div>
          <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>Roles</div>
          {c4Backend.roles.map((r) => (
            <div key={r.id} title={r.description}>
              <span style={{ position: 'relative', display: 'inline-block', width: SWATCH_W, height: SWATCH_H, marginRight: 6, verticalAlign: 'middle' }}>
                <NodeShape shape={r.shape} w={SWATCH_W} h={SWATCH_H} bg="#f8fafc" border="#64748b" />
              </span>
              {SHAPE_LABEL[r.shape]}
            </div>
          ))}
          <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>Edge verbs</div>
          {(['dataAccess', 'messaging', 'control', 'user'] as const).map((cls) => {
            const verbs = c4Backend.verbs.filter((v) => v.class === cls).map((v) => v.id);
            return (
              <div key={cls}>
                <span style={{ ...line(false), borderColor: VERB_CLASS_COLOR[cls] }} />
                {cls} — {verbs.slice(0, 3).join(', ')}{verbs.length > 3 ? '…' : ''}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
