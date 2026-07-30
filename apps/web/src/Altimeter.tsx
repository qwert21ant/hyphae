import { c4Backend, layerOfType } from '@hyphae/schema';
import { useStore } from './store';
import { breadcrumbPath } from './focusView';

/**
 * The breadcrumb as an altimeter — the design's signature element.
 *
 * A C4 model's one inarguable property is altitude, and navigating it means descending. Each crumb
 * is drawn inside a band tinted with its own layer's altitude step, so how deep you are is readable
 * without reading the names; only the deepest band is lit. `data-layer` carries the layer name and
 * the CSS maps it to a step, which keeps the ramp in one place (styles/chrome.css) rather than
 * duplicating LAYER_COLOR here.
 */
export function Altimeter() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const crumbs = breadcrumbPath(model, focusId);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  return (
    <nav className="altimeter" aria-label="breadcrumbs">
      {crumbs.map((c, i) => {
        const node = c.id ? byId.get(c.id) : undefined;
        const layer = node ? layerOfType(c4Backend, node.type) : undefined;
        const current = i === crumbs.length - 1;
        return (
          <span
            key={c.id ?? '__root__'}
            className={`altimeter__band${current ? ' altimeter__band--current' : ''}`}
            data-layer={layer ?? ''}
          >
            {layer && <span className="hy-micro altimeter__layer">{layer.slice(0, 3)}</span>}
            <button className="altimeter__crumb" onClick={() => setFocus(c.id)}>{c.name}</button>
          </span>
        );
      })}
    </nav>
  );
}
