import { describe, it, expect } from 'vitest';
import { NodeSchema } from '../src/node';

describe('NodeSchema', () => {
  it('applies defaults for the lean core shape', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n).toMatchObject({ description: '', parentId: null, codeRefs: [], docRefs: [], fields: {} });
  });
  it('keeps an arbitrary fields bag', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't', fields: { technology: 'Go', responsibilities: ['x'] } });
    expect(n.fields).toEqual({ technology: 'Go', responsibilities: ['x'] });
  });
  it('rejects an empty name', () => {
    expect(() => NodeSchema.parse({ id: 'a', name: '', type: 'Component', createdAt: 't', updatedAt: 't' })).toThrow();
  });
});
