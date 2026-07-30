import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Legend } from '../src/Legend';
import { NodeBox } from '../src/NodeBox';
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
