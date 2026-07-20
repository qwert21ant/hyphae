import { describe, it, expect } from 'vitest';
import { FlowSchema } from '../src/flow';
import { HyphaeModelSchema, emptyModel } from '../src/model';

describe('FlowSchema', () => {
  it('parses a minimal flow and defaults description/scope/steps', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'Views feed' });
    expect(f).toMatchObject({ id: 'f1', name: 'Views feed', description: '', scope: null, steps: [] });
  });

  it('defaults a step kind to Sync and message to empty, with no via', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'F', steps: [{ order: 1, from: 'a', to: 'b' }] });
    expect(f.steps[0]).toMatchObject({ order: 1, from: 'a', to: 'b', kind: 'Sync', message: '' });
    expect(f.steps[0].via).toBeUndefined();
  });

  it('keeps via, an explicit kind, and a control fragment', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'F', steps: [
      { order: 1, from: 'a', to: 'b', via: 'c1', kind: 'Async', message: 'go', control: { type: 'alt', condition: 'authorized' } },
    ] });
    expect(f.steps[0]).toMatchObject({ via: 'c1', kind: 'Async', message: 'go', control: { type: 'alt', condition: 'authorized' } });
  });

  it('rejects an unknown step kind', () => {
    expect(() => FlowSchema.parse({ id: 'f', name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Telepathy' }] })).toThrow();
  });

  it('rejects a flow with an empty name', () => {
    expect(() => FlowSchema.parse({ id: 'f', name: '' })).toThrow();
  });
});

describe('HyphaeModel with populated flows', () => {
  it('parses a model carrying a flow, schemaVersion stays 1', () => {
    const m = { ...emptyModel(), flows: [{ id: 'f1', name: 'F', steps: [{ order: 1, from: 'a', to: 'b' }] }] };
    const parsed = HyphaeModelSchema.parse(m);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.flows[0].name).toBe('F');
    expect(parsed.flows[0].steps[0].kind).toBe('Sync');
  });

  it('still parses a legacy model with an empty flows array', () => {
    expect(HyphaeModelSchema.parse(emptyModel()).flows).toEqual([]);
  });
});
