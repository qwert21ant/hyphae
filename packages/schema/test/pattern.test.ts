import { describe, it, expect } from 'vitest';
import { PatternSchema } from '../src/pattern';

describe('PatternSchema', () => {
  it('parses a minimal pattern and defaults description/anchor/members/transitions', () => {
    const p = PatternSchema.parse({ id: 'p1', name: 'Ingest', kind: 'pipeline' });
    expect(p).toMatchObject({ id: 'p1', name: 'Ingest', kind: 'pipeline', description: '', anchor: null, members: [], transitions: [] });
  });

  it('defaults a member description and keeps a nodeId or a ref', () => {
    const p = PatternSchema.parse({ id: 'p', name: 'P', kind: 'pipeline', members: [
      { name: 'Decode', ref: 'src/decode.ts' },
      { name: 'Sink', nodeId: 'n1' },
      { name: 'Idle' },
    ] });
    expect(p.members[0]).toMatchObject({ name: 'Decode', ref: 'src/decode.ts', description: '' });
    expect(p.members[1]).toMatchObject({ name: 'Sink', nodeId: 'n1' });
    expect(p.members[2].nodeId).toBeUndefined();
    expect(p.members[2].ref).toBeUndefined();
  });

  it('keeps transitions and defaults their trigger/description', () => {
    const p = PatternSchema.parse({ id: 'p', name: 'P', kind: 'state-machine',
      members: [{ name: 'Idle' }, { name: 'Recording' }],
      transitions: [{ from: 'Idle', to: 'Recording' }] });
    expect(p.transitions[0]).toMatchObject({ from: 'Idle', to: 'Recording', trigger: '', description: '' });
  });

  it('rejects a pattern with an empty name', () => {
    expect(() => PatternSchema.parse({ id: 'p', name: '', kind: 'pipeline' })).toThrow();
  });

  it('rejects a member with an empty name', () => {
    expect(() => PatternSchema.parse({ id: 'p', name: 'P', kind: 'pipeline', members: [{ name: '' }] })).toThrow();
  });
});
