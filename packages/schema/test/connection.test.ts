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
