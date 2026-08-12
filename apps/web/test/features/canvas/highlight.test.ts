import { describe, it, expect } from 'vitest';
import { highlightCss } from '@/features/canvas/highlight';

type Args = Parameters<typeof highlightCss>[0];

const args = (over: Partial<Args> = {}): Args => ({
  hi: { nodes: new Set<string>(), edges: new Set<string>() },
  activeId: null,
  flowActive: false,
  patternActive: false,
  strong: false,
  accent: 'var(--accent-soft)',
  dimEdge: 0.4,
  dimNode: 0.65,
  ...over,
});

/** The `opacity:0` rule for one edge id, if the sheet has one. */
const hidesEdge = (css: string, id: string) =>
  new RegExp(`\\[data-id="${id}"\\][^{]*\\{opacity:0[;}]`).test(css);

describe('highlightCss — shelved edges', () => {
  it('hides a shelved edge when nothing is active', () => {
    const css = highlightCss(args({ shelvedEdges: new Set(['s1']) }));
    expect(css).toContain('.react-flow__edge[data-id="s1"]');
    expect(hidesEdge(css, 's1')).toBe(true);
  });

  it('hides the shelved edge\'s label too — it portals out of the edge\'s own <g>', () => {
    const css = highlightCss(args({ shelvedEdges: new Set(['s1']) }));
    expect(css).toContain('[data-edge-id="s1"]');
  });

  it('reveals a shelved edge that is in the highlight set', () => {
    const css = highlightCss(args({
      activeId: 'found',
      hi: { nodes: new Set(['found', 'a1']), edges: new Set(['s1']) },
      shelvedEdges: new Set(['s1']),
    }));
    expect(hidesEdge(css, 's1')).toBe(false);
    expect(css).toContain('[data-id="s1"]');
  });

  it('keeps a shelved edge hidden while some OTHER node is active', () => {
    // The generic dim rule (0,2,0) would otherwise fade it INTO view at dimEdge opacity.
    const css = highlightCss(args({
      activeId: 'a1',
      hi: { nodes: new Set(['a1']), edges: new Set(['i']) },
      shelvedEdges: new Set(['s1']),
    }));
    expect(hidesEdge(css, 's1')).toBe(true);
  });

  it('reveals a shelved edge a flow steps through', () => {
    const css = highlightCss(args({
      flowActive: true, strong: true, activeId: null,
      hi: { nodes: new Set(['found', 'a1']), edges: new Set(['s1']) },
      shelvedEdges: new Set(['s1']),
    }));
    expect(hidesEdge(css, 's1')).toBe(false);
  });

  it('emits nothing extra when no edge is shelved', () => {
    expect(highlightCss(args({ shelvedEdges: new Set() }))).toBe(highlightCss(args()));
  });

  it('escapes a quote in an edge id rather than breaking the selector', () => {
    const css = highlightCss(args({ shelvedEdges: new Set(['a"b']) }));
    expect(css).toContain('[data-id="a\\"b"]');
  });
});

describe('highlightCss — the shelf band', () => {
  it('leaves the band undimmed, like the region and ghost-group boxes', () => {
    const css = highlightCss(args({ activeId: 'a1', hi: { nodes: new Set(['a1']), edges: new Set() } }));
    expect(css).toContain(':not(.react-flow__node-shelf)');
  });
});
