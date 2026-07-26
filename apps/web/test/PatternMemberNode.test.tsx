import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { PatternMemberNode } from '../src/PatternMemberNode';
import type { PatternMemberData } from '../src/patternView';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base } as never,
    { id: 'a1', name: 'Ingest', type: 'Component', parentId: 'ca', ...base } as never,
  );
  return m;
}

/** PatternMemberNode renders React Flow Handles, which need the provider's store context. */
function renderMember(data: PatternMemberData) {
  return render(
    <ReactFlowProvider>
      <PatternMemberNode {...({ data } as never)} />
    </ReactFlowProvider>,
  );
}

beforeEach(() => {
  useStore.setState({ model: model(), focusId: null, selectedId: null, selectedPatternId: 'p1', selectedFlowId: null });
});

describe('PatternMemberNode', () => {
  it('navigates to the bound node on click, leaving the pattern view', () => {
    const { getByRole } = renderMember({ name: 'Persist', binding: 'node', detail: 'Ingest', description: '', nodeId: 'a1' });
    fireEvent.click(getByRole('button'));
    const s = useStore.getState();
    expect(s.focusId).toBe('ca');          // the node's parent, so the node shows as a child box
    expect(s.selectedId).toBe('a1');
    expect(s.selectedPatternId).toBeNull();
  });

  it('navigates from the keyboard too', () => {
    const { getByRole } = renderMember({ name: 'Persist', binding: 'node', detail: 'Ingest', description: '', nodeId: 'a1' });
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });
    expect(useStore.getState().selectedId).toBe('a1');
  });

  it('leaves a ref member static', () => {
    const { queryByRole, getByText } = renderMember({ name: 'Decode', binding: 'ref', detail: 'd.ts', description: '' });
    expect(queryByRole('button')).toBeNull();
    expect(getByText('Decode')).toBeTruthy();
  });

  it('leaves a name-only member static', () => {
    const { queryByRole } = renderMember({ name: 'Idle', binding: 'none', detail: '', description: '' });
    expect(queryByRole('button')).toBeNull();
  });

  it('leaves a member whose bound node no longer exists static', () => {
    // patternView omits nodeId when the id does not resolve, so the box renders but does not navigate.
    const { queryByRole } = renderMember({ name: 'Gone', binding: 'node', detail: 'ghost-id', description: '' });
    expect(queryByRole('button')).toBeNull();
  });
});
