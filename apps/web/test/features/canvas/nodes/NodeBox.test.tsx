import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { NodeBox } from '@/features/canvas/nodes/NodeBox';
import { NODE_W, NODE_H, SUMMARY_LINES } from '@/features/canvas/layout';

const LONG = 'Serves the camera list and clip metadata to the operator console over HTTP';

/** NodeBox renders React Flow Handles, which need the provider's store context. */
function renderBox(data: Record<string, unknown>) {
  return render(
    <ReactFlowProvider>
      <NodeBox {...({ data } as never)} />
    </ReactFlowProvider>,
  );
}

describe('NodeBox', () => {
  it('clamps the summary to two lines instead of truncating it mid-word', () => {
    const { getByText } = renderBox({ name: 'API', summary: LONG });
    const el = getByText(LONG) as HTMLElement;
    expect(el.style.display).toBe('-webkit-box');
    expect(el.style.webkitLineClamp).toBe(String(SUMMARY_LINES));
    expect(el.style.overflow).toBe('hidden');
    // A wrapping clamp must NOT also force a single line.
    expect(el.style.whiteSpace).not.toBe('nowrap');
  });

  it('keeps the name on one line', () => {
    const { getByText } = renderBox({ name: 'Media Gateway Ingest Service', summary: 's' });
    const el = getByText('Media Gateway Ingest Service') as HTMLElement;
    expect(el.style.whiteSpace).toBe('nowrap');
    expect(el.style.textOverflow).toBe('ellipsis');
  });

  it('is big enough for a name, a two-line summary and the technology chip', () => {
    // NodeBox types at 12/10/9px with line-height 1.25, 6px vertical padding and 2px gaps.
    const line = (fontSize: number) => fontSize * 1.25;
    const needed = line(12) + SUMMARY_LINES * line(10) + line(9) + 2 * 2 + 2 * 6;
    expect(NODE_H).toBeGreaterThanOrEqual(needed);
    expect(NODE_W).toBeGreaterThanOrEqual(200); // a ~70-char summary needs the width to wrap in two
  });

  it('renders the box at the layout constants so floating edges anchor to the right area', () => {
    const { container } = renderBox({ name: 'API', summary: 's' });
    const box = container.querySelector('div') as HTMLElement;
    expect(box.style.width).toBe(`${NODE_W}px`);
    expect(box.style.height).toBe(`${NODE_H}px`);
  });

  it('sizes the box from data when a taller metric is passed', () => {
    const { container } = renderBox({ name: 'n', width: 300, height: 120 });
    const box = container.querySelector('div') as HTMLElement;
    expect(box.style.width).toBe('300px');
    expect(box.style.height).toBe('120px');
  });

  it('renders hub badges passed through data', () => {
    const { getByText } = renderBox({
      name: 'n',
      badges: [{ hubId: 'h', hubName: 'Settings', verb: 'reads', verbClass: 'dataAccess' }],
    });
    expect(getByText('↳ Settings')).toBeTruthy();
  });

  it('draws its role shape as SVG, not as CSS on the div', () => {
    const { container } = renderBox({ name: 'Store', summary: 's', shape: 'cylinder' });
    expect(container.querySelector('svg[data-shape="cylinder"]')).toBeTruthy();
    const box = container.querySelector('div') as HTMLElement;
    // The div must stay a plain rectangle: floating.ts anchors edges to its bounding box, and a
    // clip-path here would cut the border off any diagonal edge.
    expect(box.style.clipPath).toBe('');
    expect(box.style.border).toBe('');
  });

  it('keeps the box rectangular at NODE_W x NODE_H whatever the shape', () => {
    for (const shape of ['hexagon', 'person', 'bar', 'titled-rectangle'] as const) {
      const { container } = renderBox({ name: 'X', shape });
      const box = container.querySelector('div') as HTMLElement;
      expect(box.style.width, shape).toBe(`${NODE_W}px`);
      expect(box.style.height, shape).toBe(`${NODE_H}px`);
      expect(box.style.clipPath, shape).toBe('');
    }
  });

  it('pads text clear of a hexagon\'s notch', () => {
    const { container: plain } = renderBox({ name: 'X' });
    const { container: hex } = renderBox({ name: 'X', shape: 'hexagon' });
    const pad = (c: HTMLElement) => (c.querySelector('div') as HTMLElement).style.padding;
    expect(hex.querySelector('svg')).toBeTruthy();
    expect(pad(hex)).not.toBe(pad(plain));
  });
});
