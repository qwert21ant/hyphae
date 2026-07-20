import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FlowPicker } from '../src/FlowPicker';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };

function modelWithFlow() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'a', name: 'A', type: 'Component', parentId: null, ...base } as never,
    { id: 'b', name: 'B', type: 'Component', parentId: null, ...base } as never,
  );
  m.flows.push({ id: 'f1', name: 'Views feed', description: '', scope: null, steps: [
    { order: 1, from: 'a', to: 'b', message: 'request stream', kind: 'Sync' },
  ] });
  return m;
}

beforeEach(() => useStore.setState({ model: modelWithFlow(), selectedFlowId: null }));

describe('FlowPicker', () => {
  it('lists flows and selects one on click', () => {
    const { getByText } = render(<FlowPicker />);
    fireEvent.click(getByText('Views feed'));
    expect(useStore.getState().selectedFlowId).toBe('f1');
  });

  it('shows the selected flow steps', () => {
    useStore.setState({ selectedFlowId: 'f1' });
    const { getByText } = render(<FlowPicker />);
    expect(getByText('request stream')).toBeTruthy();
  });

  it('flags an invalid flow with a warning marker', () => {
    const m = modelWithFlow();
    m.flows[0].steps[0].to = 'ghost';   // dangling -> bad-flow-endpoint
    useStore.setState({ model: m });
    const { getByText } = render(<FlowPicker />);
    expect(getByText(/Views feed ⚠/)).toBeTruthy();
  });

  it('renders nothing when there are no flows', () => {
    useStore.setState({ model: emptyModel() });
    const { container } = render(<FlowPicker />);
    expect(container.firstChild).toBeNull();
  });
});
