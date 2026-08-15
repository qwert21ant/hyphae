import { useState } from 'react';
import { c4Backend } from '@hyphae/schema';
import { LAYER_COLOR } from '@/core/layerColors';
import { SHAPE_LABEL } from '@/features/canvas/shapes';
import { NodeShape } from '@/features/canvas/nodes/NodeShape';

// Swatch box. Wide-ish rather than square so a hexagon or cylinder reads at a glance; the geometry
// comes from the same generator the canvas uses, so the two agree whatever size this is.
const SWATCH_W = 20;
const SWATCH_H = 14;

// Per-item data — LAYER_COLOR already resolves to var(...) references, so these
// stay inline, exactly like the connection dot's per-item colour.
const swatch = (bg: string, border: string) => ({ background: bg, borderColor: border });

/** A small always-on key: what the node tints (C4 layers/altitude), edge styles, and roles mean. */
export function Legend() {
  const [open, setOpen] = useState(false);
  const layers = c4Backend.layers.filter((l) => LAYER_COLOR[l]);
  return (
    <div className="float">
      <button className="float__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Legend
      </button>
      {open && (
        <div className="float__body">
          <div className="legend__group">Altitude</div>
          <div className="legend__note">brighter is deeper — Context to Component</div>
          {layers.map((l) => (
            <div className="legend__row" key={l}>
              <span className="legend__box" style={swatch(LAYER_COLOR[l].bg, LAYER_COLOR[l].border)} />
              {l}
            </div>
          ))}
          <div className="legend__group">Edges</div>
          <div className="legend__row"><span className="legend__line" />solid — one authored connection (label = what it does)</div>
          <div className="legend__row"><span className="legend__line legend__line--dashed" />dashed purple — derived rollup (label = count)</div>
          <div className="legend__row"><span className="legend__line legend__line--mixed" />no arrowhead — mixed directions</div>
          <div className="legend__group">Roles</div>
          {c4Backend.roles.map((r) => (
            <div className="legend__row" key={r.id} title={r.description}>
              <span className="legend__shape">
                <NodeShape shape={r.shape} w={SWATCH_W} h={SWATCH_H} bg="var(--surface-1)" border="var(--tx-3)" />
              </span>
              {SHAPE_LABEL[r.shape]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
