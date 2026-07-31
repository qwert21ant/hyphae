import { resolveProfile, validateModel } from '@hyphae/schema';
import type { HyphaeApi } from '../api';
import { runCreate, runVoid } from './shared';

export function buildPatternTools(api: HyphaeApi) {
  return {
    list_patterns: async (_: Record<string, never>) => {
      const model = await api.getModel();
      const issues = validateModel(model, resolveProfile(model));
      const invalid = new Set(issues.filter((i) => i.kind.startsWith('pattern-')).map((i) => i.ref));
      return model.patterns.map((p) => ({ id: p.id, name: p.name, kind: p.kind, members: p.members.length, anchor: p.anchor, valid: !invalid.has(p.id) }));
    },
    get_pattern: async ({ id }: { id: string }) =>
      (await api.getModel()).patterns.find((p) => p.id === id) ?? { error: `pattern ${id} not found` },
    create_patterns: async ({ patterns }: { patterns: Record<string, unknown>[] }) => runCreate(patterns, api.createPattern, 'pattern'),
    update_patterns: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updatePattern(id, patch); })),
    delete_patterns: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deletePattern(id))),
  };
}
