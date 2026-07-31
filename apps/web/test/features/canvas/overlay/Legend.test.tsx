import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Legend } from '@/features/canvas/overlay/Legend';
import { NodeBox } from '@/features/canvas/nodes/NodeBox';
import { c4Backend } from '@hyphae/schema';

function openLegend() {
  const r = render(<Legend />);
  fireEvent.click(r.getByText(/Legend/));
  return r;
}

describe('Legend role swatches', () => {
  it('draws every profile role with the shared SVG renderer', () => {
    const { container } = openLegend();
    const shapes = [...new Set(c4Backend.roles.map((r) => r.shape))];
    for (const s of shapes) {
      expect(container.querySelector(`svg[data-shape="${s}"]`), s).toBeTruthy();
    }
  });

  it('uses the SAME geometry as the canvas node, so the two cannot disagree', () => {
    // The old CSS used percentage border-radius, which resolves against the box: a 220x92 canvas
    // node and a ~square legend swatch drew visibly different shapes from one style object.
    // Sharing one path generator makes that class of mismatch impossible by construction.
    const { container: legend } = openLegend();
    const swatch = legend.querySelector('svg[data-shape="hexagon"]')!;
    const { container: canvas } = render(
      <ReactFlowProvider><NodeBox {...({ data: { name: 'X', shape: 'hexagon' } } as never)} /></ReactFlowProvider>,
    );
    const node = canvas.querySelector('svg[data-shape="hexagon"]')!;

    // Same normalized outline: identical topology, and each scaled to its own viewBox.
    const segs = (svg: Element) => (svg.querySelector('path')!.getAttribute('d')!.match(/[MLQAZ]/g) ?? []).join('');
    expect(segs(swatch)).toBe(segs(node));
    expect(swatch.getAttribute('viewBox')).toBe(`0 0 ${swatch.getAttribute('width')} ${swatch.getAttribute('height')}`);
  });

  it('still names each role', () => {
    const { getByText } = openLegend();
    expect(getByText(/external system/)).toBeTruthy();
    expect(getByText(/datastore/)).toBeTruthy();
  });
});

describe('Legend verb classes', () => {
  it('lists every verb class in the profile, derived not hardcoded', () => {
    const { getByText } = openLegend();
    for (const cls of new Set(c4Backend.verbs.map((v) => v.class))) {
      expect(getByText(new RegExp(cls)), cls).toBeTruthy();
    }
  });
});

describe('Legend altitude section', () => {
  // Brightness is now a deliberate encoding of depth (Context → Container → Component), not
  // incidental styling, so the key that explains the visual language has to say so explicitly.
  it('explains that brighter is deeper', () => {
    const { getByText } = openLegend();
    expect(getByText('Altitude')).toBeTruthy();
    expect(getByText(/brighter is deeper/)).toBeTruthy();
  });
});

describe('Legend edge line variants', () => {
  // The "no arrowhead" row means something different from the plain solid row above it. A luminance
  // step between them (the old --tx-2 vs --tx-3) measured 1.06:1 in the light theme — perceptually
  // identical — so the distinction has to be a FORM one instead: the plain row draws an arrowhead,
  // the mixed row does not, both at the same --tx-3. jsdom applies no external stylesheet, so this
  // reads the CSS rules directly rather than asserting on unobservable rendered pixels.
  it('gives the mixed-directions row its own modifier class', () => {
    const { container } = openLegend();
    expect(container.querySelector('.legend__line--mixed')).toBeTruthy();
    // Exactly one row carries the modifier — the plain solid row must not also pick it up.
    expect(container.querySelectorAll('.legend__line--mixed').length).toBe(1);
  });

  it('distinguishes the rows by an arrowhead, not by colour, and both sit at the same text step', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/canvas/canvas.css'), 'utf8');
    // Base row: an arrowhead drawn via ::after, coloured the same --tx-3 the line itself uses.
    expect(css).toMatch(/\.legend__line\s*\{[^}]*border-top:\s*2px solid var\(--tx-3\)/);
    expect(css).toMatch(/\.legend__line::after\s*\{[^}]*border-left:\s*6px solid var\(--tx-3\)/);
    // Mixed row: no colour override on the line itself, and the arrowhead is suppressed.
    expect(css).not.toMatch(/\.legend__line--mixed\s*\{[^}]*border-top-color/);
    expect(css).toMatch(/\.legend__line--mixed::after\s*\{[^}]*display:\s*none/);
  });
});
