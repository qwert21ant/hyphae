import { useMemo } from 'react';
import { c4Backend, layerOfType } from '@hyphae/schema';
import { useStore } from '@/state/store';
import { breadcrumbPath } from '@/core/breadcrumb';

/** The root band stands for the whole model — the one crumb with no node, and so no type, behind
 *  it. It still gets a label: a band without one is a line shorter than its neighbours, which made
 *  the entire toolbar grow the moment you drilled in. */
const ROOT_LABEL = 'ALL';

/** A band's three-letter tag. This is the node's TYPE, not its layer: the layer names collapse under
 *  a three-letter slice (Context and Container both give "CON"), so the tag contradicted the tint it
 *  sat on. The profile's kinds stay distinct — SYS / ACT / EXT / CON / COM. */
const typeTag = (type: string) => type.slice(0, 3).toUpperCase();

/**
 * The breadcrumb as an altimeter — the design's signature element.
 *
 * A C4 model's one inarguable property is altitude, and navigating it means descending. Each crumb
 * is drawn inside a band tinted with its own layer's altitude step, so how deep you are is readable
 * without reading the names; only the deepest band is lit. `data-layer` carries the layer name and
 * the CSS maps it to a step, which keeps the ramp in one place (styles/chrome.css) rather than
 * duplicating LAYER_COLOR here — while the visible tag names the kind the reader actually navigates.
 */
export function Altimeter() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const crumbs = breadcrumbPath(model, focusId);
  const byId = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);

  return (
    <nav className="altimeter" aria-label="breadcrumbs">
      {crumbs.map((c, i) => {
        const node = c.id ? byId.get(c.id) : undefined;
        const layer = node ? layerOfType(c4Backend, node.type) : undefined;
        const current = i === crumbs.length - 1;
        return (
          // The BAND is the target, not the name inside it — its tag line, its padding and the
          // tinted fill that makes the altitude readable were all dead to the pointer. The crumb
          // stays a <button> so the band is still reachable and operable from the keyboard; its
          // click simply bubbles here, the same arrangement the outline rows use.
          <span
            key={c.id ?? '__root__'}
            className={`altimeter__band${current ? ' altimeter__band--current' : ''}`}
            data-layer={layer ?? ''}
            onClick={() => setFocus(c.id)}
          >
            <span className="hy-micro altimeter__layer" title={node ? node.type : 'the whole model'}>
              {node ? typeTag(node.type) : ROOT_LABEL}
            </span>
            <button className="altimeter__crumb">{c.name}</button>
          </span>
        );
      })}
    </nav>
  );
}
