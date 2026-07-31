import type { HyphaeApi } from '../api';
import { buildNodeTools } from './nodes';
import { buildConnectionTools } from './connections';
import { buildFlowTools } from './flows';
import { buildPatternTools } from './patterns';
import { buildQueryTools } from './query';
import { buildValidateTools } from './validate';

/** Pure tool handlers over an injected API client (re-reads the model per call). */
export function buildTools(api: HyphaeApi) {
  return {
    ...buildQueryTools(api),
    ...buildNodeTools(api),
    ...buildConnectionTools(api),
    ...buildValidateTools(api),
    ...buildFlowTools(api),
    ...buildPatternTools(api),
  };
}
