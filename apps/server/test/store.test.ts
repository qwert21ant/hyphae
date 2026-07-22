import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { ValidationError, NotFoundError } from '../src/errors';
import { validateModel, resolveProfile } from '@hyphae/schema';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  file = join(dir, 'hyphae.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ModelStore', () => {
  it('returns an empty model when the file is absent', () => {
    expect(new ModelStore(file).get().nodes).toEqual([]);
  });

  it('addNode persists atomically and reloads', async () => {
    const store = new ModelStore(file);
    const node = store.addNode({ name: 'API', type: 'Container', fields: { summary: 'x' } });
    expect(node.id).toBeTruthy();
    expect(store.version).toBe(1);
    await store.flush();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file + '.tmp')).toBe(false);
    expect(new ModelStore(file).get().nodes.map((n) => n.name)).toEqual(['API']);
  });

  it('rejects a mutation that introduces an issue, leaving state unchanged', () => {
    const store = new ModelStore(file);
    expect(() => store.addNode({ name: 'X', type: 'Bogus' })).toThrow(ValidationError);
    expect(store.get().nodes).toEqual([]);
    expect(store.version).toBe(0);
  });

  it('updateNode throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updateNode('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deleteNode cascades its connections', () => {
    const store = new ModelStore(file);
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    store.deleteNode(a.id);
    expect(store.get().nodes.map((n) => n.id)).toEqual([b.id]);
    expect(store.get().connections).toEqual([]);
  });

  it('notifies subscribers with the new version on each change', () => {
    const store = new ModelStore(file);
    const seen: number[] = [];
    const unsub = store.subscribe((v) => seen.push(v));
    store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    unsub();
    store.addNode({ name: 'C', type: 'Component', fields: { summary: 'x' } });
    expect(seen).toEqual([1, 2]);
  });

  it('updateConnection updates a field', () => {
    const store = new ModelStore(file);
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    const conn = store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    const updated = store.updateConnection(conn.id, { fields: { transport: 'Sync' }, description: 'calls' });
    expect(updated).toMatchObject({ id: conn.id, fields: { transport: 'Sync' }, description: 'calls' });
    expect(store.get().connections[0].fields.transport).toBe('Sync');
  });

  it('updateConnection throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updateConnection('nope', { fields: { transport: 'Sync' } })).toThrow(NotFoundError);
  });

  it('persists realizedBy on a connection', () => {
    const store = new ModelStore(file);
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    const conn = store.addConnection({ from: a.id, to: b.id, type: 'Dependency', realizedBy: ['x1'] });
    expect(conn.realizedBy).toEqual(['x1']);
    expect(store.get().connections.at(-1)!.realizedBy).toEqual(['x1']);
  });

  it('stores a node position in the layer view', () => {
    const store = new ModelStore(file);
    const n = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    store.setNodePosition('Component', n.id, { x: 10, y: 20 });
    expect(store.get().views.find((v) => v.layer === 'Component')?.nodePositions[n.id]).toEqual({ x: 10, y: 20 });
  });
});

describe('ModelStore flows', () => {
  function seed(store: ModelStore) {
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    const c = store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    return { a, b, c };
  }

  it('addFlow persists a valid flow', () => {
    const store = new ModelStore(file);
    const { a, b, c } = seed(store);
    const flow = store.addFlow({ name: 'Views feed', steps: [{ order: 1, from: a.id, to: b.id, via: c.id, message: 'go', kind: 'Sync' }] });
    expect(flow.id).toBeTruthy();
    expect(store.get().flows).toHaveLength(1);
  });

  it('rejects a flow whose step references a missing node', () => {
    const store = new ModelStore(file);
    seed(store);
    expect(() => store.addFlow({ name: 'Bad', steps: [{ order: 1, from: 'ghost', to: 'ghost', message: '', kind: 'Sync' }] })).toThrow(ValidationError);
    expect(store.get().flows).toEqual([]);
  });

  it('updateFlow throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updateFlow('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deleteFlow removes the flow', () => {
    const store = new ModelStore(file);
    const { a, b } = seed(store);
    const flow = store.addFlow({ name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: '', kind: 'Sync' }] });
    store.deleteFlow(flow.id);
    expect(store.get().flows).toEqual([]);
  });

  it('allows deleting a node used by a flow, leaving the flow invalid (flagged, not blocked)', () => {
    const store = new ModelStore(file);
    const { a, b } = seed(store);
    const flow = store.addFlow({ name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: '', kind: 'Sync' }] });
    store.deleteNode(b.id);                                   // not rejected
    expect(store.get().flows.map((f) => f.id)).toEqual([flow.id]);   // flow survives
    const issues = validateModel(store.get(), resolveProfile(store.get()));
    expect(issues.some((i) => i.kind === 'bad-flow-endpoint' && i.ref === flow.id)).toBe(true);
  });
});

describe('ModelStore patterns', () => {
  function seed(store: ModelStore) {
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    const c = store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    return { a, b, c };
  }

  it('addPattern persists a valid pattern', () => {
    const store = new ModelStore(file);
    seed(store);
    const p = store.addPattern({ name: 'Recorder', kind: 'state-machine',
      members: [{ name: 'Idle' }, { name: 'Recording' }],
      transitions: [{ from: 'Idle', to: 'Recording' }] });
    expect(p.id).toBeTruthy();
    expect(store.get().patterns).toHaveLength(1);
    expect(store.get().patterns[0]).toEqual(p);
  });

  it('addPattern rejects a pattern with an unknown kind', () => {
    const store = new ModelStore(file);
    seed(store);
    expect(() => store.addPattern({ name: 'Bad', kind: 'octopus' })).toThrow(ValidationError);
    expect(store.get().patterns).toEqual([]);
  });

  it('updatePattern throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updatePattern('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deletePattern removes the pattern', () => {
    const store = new ModelStore(file);
    seed(store);
    const p = store.addPattern({ name: 'P', kind: 'pipeline', members: [{ name: 'S' }] });
    store.deletePattern(p.id);
    expect(store.get().patterns).toEqual([]);
  });

  it('allows deleting a node used by a pattern, leaving the pattern invalid (flagged, not blocked)', () => {
    const store = new ModelStore(file);
    const { a } = seed(store);
    const pattern = store.addPattern({ name: 'P', kind: 'pipeline', members: [{ name: 'S', nodeId: a.id }] });
    store.deleteNode(a.id);                                          // not rejected
    expect(store.get().patterns.map((p) => p.id)).toEqual([pattern.id]);   // pattern survives
    const issues = validateModel(store.get(), resolveProfile(store.get()));
    expect(issues.some((i) => i.kind === 'pattern-member-bad-node' && i.ref === pattern.id)).toBe(true);
  });
});
