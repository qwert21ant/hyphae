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
  it('defaults root to null', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.root).toBe(null);
  });
  it('keeps a declared root', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Container', createdAt: 't', updatedAt: 't', root: 'endpoints/mg/' });
    expect(n.root).toBe('endpoints/mg/');
  });
  it('defaults role to null', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.role).toBe(null);
  });
  it('keeps an explicit role override', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't', role: 'datastore' });
    expect(n.role).toBe('datastore');
  });
  it('defaults foundational to false', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.foundational).toBe(false);
  });
  it('keeps an explicit foundational mark', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Container', createdAt: 't', updatedAt: 't', foundational: true });
    expect(n.foundational).toBe(true);
  });
});
