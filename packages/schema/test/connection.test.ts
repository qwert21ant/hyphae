import { describe, it, expect } from 'vitest';
import { ConnectionSchema } from '../src/connection';

describe('ConnectionSchema', () => {
  it('defaults realizedBy to an empty array', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency' });
    expect(c.realizedBy).toEqual([]);
  });

  it('accepts realizedBy ids and no longer exposes realizes', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency', realizedBy: ['x1', 'x2'] });
    expect(c.realizedBy).toEqual(['x1', 'x2']);
    expect('realizes' in c).toBe(false);
  });
});

describe('ConnectionSchema verb/object', () => {
  const base = { id: 'c', from: 'a', to: 'b', type: 'Dependency' };

  it('defaults verb to uses so an old file needs no migration', () => {
    const c = ConnectionSchema.parse(base);
    expect(c.verb).toBe('uses');
  });

  it('defaults object to empty', () => {
    expect(ConnectionSchema.parse(base).object).toBe('');
  });

  it('keeps an explicit verb and object', () => {
    const c = ConnectionSchema.parse({ ...base, verb: 'reads', object: 'camera list' });
    expect(c).toMatchObject({ verb: 'reads', object: 'camera list' });
  });
});
