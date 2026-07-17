import { z } from 'zod';

// Reserved axes (SPEC.md §6.6). Present in the schema from day 1 as opaque
// arrays so the model file shape is stable; editors arrive in later phases.
export const FlowSchema = z.unknown();
export const StateMachineSchema = z.unknown();
export const DataTypeSchema = z.unknown();
export const RequirementSchema = z.unknown();
export const DecisionSchema = z.unknown();
