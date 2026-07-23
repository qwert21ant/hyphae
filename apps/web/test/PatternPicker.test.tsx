import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PatternPicker } from '../src/PatternPicker';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

function modelWithPattern() {
  const m = emptyModel();
  m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
    members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
    transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
  return m;
}

beforeEach(() => useStore.setState({ model: modelWithPattern(), selectedPatternId: null, selectedFlowId: null }));

describe('PatternPicker', () => {
  it('lists patterns and selects one on click', () => {
    const { getByText } = render(<PatternPicker />);
    fireEvent.click(getByText('Recorder'));
    expect(useStore.getState().selectedPatternId).toBe('p1');
  });

  it('shows the selected pattern members', () => {
    useStore.setState({ selectedPatternId: 'p1' });
    const { getByText } = render(<PatternPicker />);
    expect(getByText('Idle')).toBeTruthy();
    expect(getByText('Recording')).toBeTruthy();
  });

  it('flags an invalid pattern with a warning marker', () => {
    const m = modelWithPattern();
    m.patterns[0].kind = 'octopus';   // unknown kind -> pattern-unknown-kind
    useStore.setState({ model: m });
    const { getByText } = render(<PatternPicker />);
    expect(getByText(/Recorder ⚠/)).toBeTruthy();
  });

  it('renders nothing when there are no patterns', () => {
    useStore.setState({ model: emptyModel() });
    const { container } = render(<PatternPicker />);
    expect(container.firstChild).toBeNull();
  });
});
