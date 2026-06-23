import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { ValidationError, NotFoundError } from '../src/errors';

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
    const node = store.addNode({ name: 'API', type: 'Container' });
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
    const a = store.addNode({ name: 'A', type: 'Component' });
    const b = store.addNode({ name: 'B', type: 'Component' });
    store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    store.deleteNode(a.id);
    expect(store.get().nodes.map((n) => n.id)).toEqual([b.id]);
    expect(store.get().connections).toEqual([]);
  });

  it('notifies subscribers with the new version on each change', () => {
    const store = new ModelStore(file);
    const seen: number[] = [];
    const unsub = store.subscribe((v) => seen.push(v));
    store.addNode({ name: 'A', type: 'Component' });
    store.addNode({ name: 'B', type: 'Component' });
    unsub();
    store.addNode({ name: 'C', type: 'Component' });
    expect(seen).toEqual([1, 2]);
  });

  it('updateConnection updates a field', () => {
    const store = new ModelStore(file);
    const a = store.addNode({ name: 'A', type: 'Component' });
    const b = store.addNode({ name: 'B', type: 'Component' });
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
    const a = store.addNode({ name: 'A', type: 'Component' });
    const b = store.addNode({ name: 'B', type: 'Component' });
    const conn = store.addConnection({ from: a.id, to: b.id, type: 'Dependency', realizedBy: ['x1'] });
    expect(conn.realizedBy).toEqual(['x1']);
    expect(store.get().connections.at(-1)!.realizedBy).toEqual(['x1']);
  });

  it('stores a node position in the layer view', () => {
    const store = new ModelStore(file);
    const n = store.addNode({ name: 'A', type: 'Component' });
    store.setNodePosition('Component', n.id, { x: 10, y: 20 });
    expect(store.get().views.find((v) => v.layer === 'Component')?.nodePositions[n.id]).toEqual({ x: 10, y: 20 });
  });
});
