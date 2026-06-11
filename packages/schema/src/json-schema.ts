import { zodToJsonSchema } from 'zod-to-json-schema';
import { HyphaeModelSchema } from './model';

// Note: the `name` option wraps output under `definitions/<name>` (even with
// $refStrategy 'none'), hiding top-level `properties`. We emit a flat inline
// schema instead so consumers read model fields directly off `properties`.
export const hyphaeJsonSchema = () =>
  zodToJsonSchema(HyphaeModelSchema, { $refStrategy: 'none' });
