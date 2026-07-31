import { c4Backend, modelGaps, resolveProfile, validateModel } from '@hyphae/schema';
import type { HyphaeApi } from '../api';

export function buildValidateTools(api: HyphaeApi) {
  return {
    validate_model: async (_: Record<string, never>) => {
      const model = await api.getModel();
      return validateModel(model, resolveProfile(model));
    },
    model_gaps: async (_: Record<string, never>) => {
      const model = await api.getModel();
      return modelGaps(model, resolveProfile(model));
    },
    describe_profile: async (_: Record<string, never>) => c4Backend,
  };
}
