import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from './store';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  file = join(dir, 'hyphae.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ModelStore', () => {
  it('returns an empty model when file is absent', () => {
    const store = new ModelStore(file);
    expect(store.get().nodes).toEqual([]);
  });

  it('persists atomically and reloads', async () => {
    const store = new ModelStore(file);
    const m = store.get();
    m.metadata.name = 'Persisted';
    store.set(m);
    await store.flush();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file + '.tmp')).toBe(false);
    const fromDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(fromDisk.metadata.name).toBe('Persisted');
    expect(new ModelStore(file).get().metadata.name).toBe('Persisted');
  });

  it('rejects an invalid model on set', () => {
    const store = new ModelStore(file);
    expect(() => store.set({ nope: true } as never)).toThrow();
  });
});
