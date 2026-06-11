import { describe, it, expect } from 'vitest';
import { NodeSchema } from '../src/node';

describe('NodeSchema', () => {
  it('fills defaults for a minimal node', () => {
    const parsed = NodeSchema.parse({
      id: 'n1',
      name: 'Orders',
      type: 'Component',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.description).toBe('');
    expect(parsed.responsibilities).toEqual([]);
    expect(parsed.invariants).toEqual([]);
    expect(parsed.status).toBe('Active');
    expect(parsed.parentId).toBeNull();
  });

  it('rejects a node missing required name', () => {
    expect(() =>
      NodeSchema.parse({ id: 'n1', type: 'Component', createdAt: 'x', updatedAt: 'x' }),
    ).toThrow();
  });
});
