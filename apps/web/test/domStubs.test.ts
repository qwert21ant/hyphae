import { describe, it, expect } from 'vitest';

// react-resizable-panels calls all three on mount or during a drag; jsdom 24 implements none of
// them. They come from test/setup.ts — without it every render of <App /> or <TreePanel /> throws.
describe('jsdom stubs for react-resizable-panels', () => {
  it('provides ResizeObserver, matchMedia and pointer capture', () => {
    expect(typeof globalThis.ResizeObserver).toBe('function');
    expect(window.matchMedia('(pointer:coarse)').matches).toBe(false);
    expect(typeof Element.prototype.setPointerCapture).toBe('function');
    expect(typeof Element.prototype.releasePointerCapture).toBe('function');
  });
});
