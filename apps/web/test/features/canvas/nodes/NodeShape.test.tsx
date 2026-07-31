import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NodeShape } from '@/features/canvas/nodes/NodeShape';
import { shapeGeometry } from '@/features/canvas/shapes';

const paths = (c: HTMLElement) => [...c.querySelectorAll('path')];

describe('NodeShape', () => {
  it('fills the box it is given and never intercepts clicks', () => {
    const { container } = render(<NodeShape shape="hexagon" w={220} h={92} bg="#fff" border="#000" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('220');
    expect(svg.getAttribute('height')).toBe('92');
    expect(svg.getAttribute('viewBox')).toBe('0 0 220 92');   // 1:1 with pixels — strokes never distort
    expect(svg.style.pointerEvents).toBe('none');             // the node div owns the click stream
  });

  it('strokes the outline in the border colour and fills it with the background', () => {
    const { container } = render(<NodeShape shape="hexagon" w={220} h={92} bg="#eef" border="#123456" />);
    const outline = paths(container)[0];
    expect(outline.getAttribute('d')).toBe(shapeGeometry('hexagon', 220, 92, 1).outline);
    expect(outline.getAttribute('stroke')).toBe('#123456');
    expect(outline.getAttribute('fill')).toBe('#eef');
  });

  it('renders detail strokes unfilled, so a cylinder rim is a line and not a blob', () => {
    const { container } = render(<NodeShape shape="cylinder" w={220} h={92} bg="#fff" border="#000" />);
    const detail = paths(container).at(-1)!;
    expect(detail.getAttribute('fill')).toBe('none');
    expect(detail.getAttribute('stroke')).toBe('#000');
  });

  it('fills the title band in the border colour', () => {
    const { container } = render(<NodeShape shape="titled-rectangle" w={220} h={92} bg="#fff" border="#0891b2" />);
    const band = paths(container).find((p) => p.getAttribute('d') === shapeGeometry('titled-rectangle', 220, 92, 1).band)!;
    expect(band).toBeTruthy();
    expect(band.getAttribute('fill')).toBe('#0891b2');
  });

  it('dashes the whole outline for a ghost — including a hexagon\'s diagonals', () => {
    // The old CSS clip-path cut the dashed border off the diagonal edges, which is why GhostNode
    // needed a background hatch to stay legible. A stroked path dashes the entire outline.
    const { container } = render(<NodeShape shape="hexagon" w={220} h={92} bg="#fff" border="#000" dashed />);
    expect(paths(container)[0].getAttribute('stroke-dasharray')).toMatch(/\d/);
  });

  it('is undashed by default', () => {
    const { container } = render(<NodeShape shape="rectangle" w={220} h={92} bg="#fff" border="#000" />);
    expect(paths(container)[0].getAttribute('stroke-dasharray')).toBeNull();
  });

  it('tags itself with the shape so canvas and legend can be compared', () => {
    const { container } = render(<NodeShape shape="cylinder" w={16} h={14} bg="#fff" border="#000" />);
    expect(container.querySelector('svg')!.getAttribute('data-shape')).toBe('cylinder');
  });
});
