import { resolveProfile, validateModel } from '@hyphae/schema';
import type { HyphaeApi } from '../api';
import { runCreate, runVoid } from './shared';

export function buildFlowTools(api: HyphaeApi) {
  return {
    list_flows: async (_: Record<string, never>) => {
      const model = await api.getModel();
      const issues = validateModel(model, resolveProfile(model));
      const invalid = new Set(issues.filter((i) => i.kind.startsWith('bad-flow-')).map((i) => i.ref));
      return model.flows.map((f) => ({ id: f.id, name: f.name, scope: f.scope, steps: f.steps.length, valid: !invalid.has(f.id) }));
    },
    get_flow: async ({ id }: { id: string }) =>
      (await api.getModel()).flows.find((f) => f.id === id) ?? { error: `flow ${id} not found` },
    create_flows: async ({ flows }: { flows: Record<string, unknown>[] }) => runCreate(flows, api.createFlow, 'flow'),
    update_flows: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateFlow(id, patch); })),
    delete_flows: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteFlow(id))),
  };
}
