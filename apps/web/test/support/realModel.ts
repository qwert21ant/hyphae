import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HyphaeModel } from '@hyphae/schema';

// process.cwd() is the PACKAGE root (apps/web), which is what makes the mirrored test tree safe —
// a test can sit at any depth without its paths changing. import.meta.url is an http URL under
// jsdom, so it must not be used here.
const MODEL_PATH = resolve(process.cwd(), '../server/hyphae-baritone.json');

/** The real Baritone model, or null when the (permanently untracked) file is not present. */
export function loadRealModel(): HyphaeModel | null {
  if (!existsSync(MODEL_PATH)) return null;
  return JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as HyphaeModel;
}

/** The four reference focuses the spec measures against, by node NAME (ids are UUIDs). */
export const REAL_FOCUS_NAMES = [
  'Baritone API',
  'Process Layer',
  'Utilities & Schematics',
  'Command System',
];

/** Resolve those names to ids in a given model, skipping any that are absent. */
export function realFocusIds(model: HyphaeModel): { name: string; id: string }[] {
  return REAL_FOCUS_NAMES
    .map((name) => ({ name, id: model.nodes.find((n) => n.name === name)?.id ?? '' }))
    .filter((f) => f.id !== '');
}
