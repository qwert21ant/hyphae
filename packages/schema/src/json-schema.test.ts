import { describe, it, expect } from 'vitest';
import { hyphaeJsonSchema } from './json-schema';

describe('hyphaeJsonSchema', () => {
  it('produces a JSON Schema object with model properties', () => {
    const schema = hyphaeJsonSchema() as Record<string, unknown>;
    expect(schema).toHaveProperty('$schema');
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    expect(props).toHaveProperty('nodes');
    expect(props).toHaveProperty('connections');
  });
});
