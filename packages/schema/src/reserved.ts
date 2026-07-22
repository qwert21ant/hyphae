import { z } from 'zod';

// Reserved axes (SPEC.md §6.6). Present in the schema as opaque arrays so the model file
// shape is stable; editors arrive in later phases.
export const DataTypeSchema = z.unknown();
export const RequirementSchema = z.unknown();
export const DecisionSchema = z.unknown();
