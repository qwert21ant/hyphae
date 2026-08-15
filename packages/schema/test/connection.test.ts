import { describe, it, expect } from 'vitest';
import { ConnectionSchema } from '../src/connection';

describe('ConnectionSchema', () => {
  it('defaults realizedBy to an empty array', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b' });
    expect(c.realizedBy).toEqual([]);
  });

  it('accepts realizedBy ids and no longer exposes realizes', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', realizedBy: ['x1', 'x2'] });
    expect(c.realizedBy).toEqual(['x1', 'x2']);
    expect('realizes' in c).toBe(false);
  });

  it('strips a legacy type so an old model file needs no migration', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency' });
    expect('type' in c).toBe(false);
  });
});

describe('legacy verb/object are dropped from the parsed connection', () => {
  const base = { id: 'c', from: 'a', to: 'b' };

  it('does not carry verb or object through', () => {
    const c = ConnectionSchema.parse({ ...base, verb: 'reads', object: 'settings' });
    expect(c).not.toHaveProperty('verb');
    expect(c).not.toHaveProperty('object');
  });

  it('still composes their meaning into the label on the way past', () => {
    expect(ConnectionSchema.parse({ ...base, verb: 'reads', object: 'settings' }).label)
      .toBe('reads settings');
  });
});

describe('label back-compat shim', () => {
  const base = { id: 'c1', from: 'a', to: 'b' };

  it('composes label from legacy verb + object when label is absent', () => {
    expect(ConnectionSchema.parse({ ...base, verb: 'reads', object: 'settings' }).label)
      .toBe('reads settings');
  });

  it('falls back to the verb alone when the object is empty', () => {
    expect(ConnectionSchema.parse({ ...base, verb: 'triggers', object: '' }).label)
      .toBe('triggers');
  });

  it('leaves an explicit label untouched even when verb and object are present', () => {
    expect(ConnectionSchema.parse({
      ...base, verb: 'reads', object: 'settings', label: 'reads the session settings',
    }).label).toBe('reads the session settings');
  });

  it('leaves label empty when there is no legacy verb or object either', () => {
    expect(ConnectionSchema.parse({ ...base }).label).toBe('');
  });
});
