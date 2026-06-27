import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '../src/Canvas';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

// React Flow needs layout/resize APIs jsdom lacks; stub the heavy parts and capture handlers.
let captured: any = {};
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => { captured = props; return null; },
  Background: () => null,
  Controls: () => null,
  Panel: ({ children }: any) => children,
  Handle: () => null,
  useNodesState: (init: any) => [init, () => {}, () => {}],
  ConnectionMode: { Loose: 'loose' },
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
}));

const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
  );
  useStore.setState({ model: m, focusId: 'ca', selectedId: null });
});

describe('Canvas navigation', () => {
  it('double-clicking a child that has children focuses it', () => {
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'a1', type: 'node' });
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('double-clicking a leaf only selects (focus unchanged)', () => {
    useStore.setState({ focusId: 'a1' });
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'k1', type: 'node' });
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('double-clicking an external ghost focuses it', () => {
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'somewhere', type: 'ghost' });
    expect(useStore.getState().focusId).toBe('somewhere');
  });
});
