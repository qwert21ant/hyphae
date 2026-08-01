import { useStore } from '@/state/store';
import { VERB_CLASS_COLOR } from '@/core/verbColors';
import type { HubBadge } from '@/core/hubs';

/** Badges shown on a node before the row overflows into a "+N" count. */
export const MAX_BADGES = 2;
const NAME_CAP = 14;

const clip = (s: string) => (s.length > NAME_CAP ? `${s.slice(0, NAME_CAP)}…` : s);

const chip = {
  fontSize: 9,
  lineHeight: '12px',
  background: 'var(--chip)',
  borderRadius: 3,
  padding: '0 4px',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis' as const,
};

/**
 * A quieted hub's edges, re-encoded on the node at the other end. The badge IS the edge, so it
 * keeps the hue the line carried — but as a SWATCH, not as the text colour. `contrast.test.ts`
 * measures 33 foreground/background pairs at 4.5:1, and a coloured 9px label would need its own
 * pair for every verb class; a swatch is not text, so it needs none. FilterPanel's `.filter__swatch`
 * already establishes the idiom.
 */
export function HubBadges({ badges }: { badges?: HubBadge[] }) {
  if (!badges?.length) return null;
  const shown = badges.slice(0, MAX_BADGES);
  const extra = badges.length - shown.length;
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', maxWidth: '100%', overflow: 'hidden' }}>
      {shown.map((b) => (
        <span key={`${b.hubId}\0${b.verb}`} style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${b.verb} — ${b.hubName}`}>
          <span
            data-verb-class={b.verbClass}
            style={{ width: 3, height: 8, borderRadius: 1, background: VERB_CLASS_COLOR[b.verbClass], flex: 'none' }}
          />
          <span style={{ color: 'var(--tx-2)' }}>{`↳ ${clip(b.hubName)}`}</span>
        </span>
      ))}
      {extra > 0 && <span style={{ ...chip, color: 'var(--tx-3)' }}>{`+${extra}`}</span>}
    </div>
  );
}

/** The chip on a quieted node itself: what it is standing in for, and the way back. */
export function HubChip({ id, degree }: { id: string; degree: number }) {
  const setHubOverride = useStore((s) => s.setHubOverride);
  return (
    <button
      // The box owns the click and would drill on it — anything inside that does something else
      // has to stop the bubble. GhostNode's expand button is the same case.
      onClick={(ev) => { ev.stopPropagation(); setHubOverride(id, false); }}
      title="Show this node's connections again"
      style={{ ...chip, position: 'relative', color: 'var(--tx-3)', border: '1px solid var(--rule)', cursor: 'pointer', fontStyle: 'normal', alignSelf: 'center' }}
    >
      {`hub ×${degree}`}
    </button>
  );
}
