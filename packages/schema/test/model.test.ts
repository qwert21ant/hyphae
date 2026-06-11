import { describe, it, expect } from 'vitest';
import { HyphaeModelSchema, emptyModel } from '../src/model';

describe('HyphaeModel', () => {
  it('emptyModel parses and has reserved collections', () => {
    const m = emptyModel();
    expect(() => HyphaeModelSchema.parse(m)).not.toThrow();
    expect(m.nodes).toEqual([]);
    expect(m.connections).toEqual([]);
    expect(m.flows).toEqual([]);
    expect(m.stateMachines).toEqual([]);
    expect(m.dataTypes).toEqual([]);
    expect(m.requirements).toEqual([]);
    expect(m.decisions).toEqual([]);
    expect(m.activeProfile).toBe('c4-backend');
    expect(m.schemaVersion).toBe(1);
  });

  it('keeps deterministic top-level key order', () => {
    expect(Object.keys(emptyModel())).toEqual([
      'schemaVersion', 'metadata', 'activeProfile',
      'nodes', 'connections', 'flows', 'stateMachines',
      'dataTypes', 'requirements', 'decisions', 'views',
    ]);
  });
});
