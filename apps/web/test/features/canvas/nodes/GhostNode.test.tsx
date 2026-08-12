import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { GhostNode } from '@/features/canvas/nodes/GhostNode';

/**
 * GhostNode renders React Flow Handles, which need the provider's store context.
 *
 * The props are cast through `NodeProps` rather than through `never` (the pattern the older node
 * tests use): spreading a `never` is a TS2698 error, and those are exactly the pre-existing typecheck
 * errors this suite is trying not to add to.
 */
function renderGhost(data: Record<string, unknown>) {
  return render(
    <ReactFlowProvider>
      <GhostNode {...({ id: 'n1', data } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  );
}

describe('GhostNode', () => {
  it('shows a count chip for a shelved node', () => {
    renderGhost({ name: 'Settings', shelfCount: 16 });
    expect(screen.getByText(/◂\s*16/)).toBeTruthy();
  });

  it('shows no chip for an ordinary external', () => {
    renderGhost({ name: 'Beta' });
    expect(screen.queryByText(/◂/)).toBeNull();
  });

  it('shows a zero count rather than swallowing it', () => {
    // A shelved node whose every edge was filtered out still states its weight — `0` is information,
    // and a truthiness check would drop it.
    renderGhost({ name: 'Settings', shelfCount: 0 });
    expect(screen.getByText(/◂\s*0/)).toBeTruthy();
  });

  it('keeps the count upright inside the italic ghost box', () => {
    renderGhost({ name: 'Settings', shelfCount: 4 });
    expect((screen.getByText(/◂\s*4/) as HTMLElement).style.fontStyle).toBe('normal');
  });
});
