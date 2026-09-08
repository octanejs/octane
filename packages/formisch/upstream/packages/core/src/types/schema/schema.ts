import type * as v from 'valibot';

/**
 * Schema type.
 */
export type Schema = v.GenericSchema | v.GenericSchemaAsync;

/**
 * Form schema type.
 *
 * Forms must have an object root, so this is constrained structurally to a
 * schema with an object output (sync or async) rather than to specific Valibot
 * schema types. Staying decoupled from concrete Valibot types lets this later
 * move to Standard Schema (e.g. to also support Zod or ArkType). Use
 * {@link Schema} for nested field schemas.
 */
export type FormSchema =
  | v.GenericSchema<Record<string, unknown>>
  | v.GenericSchemaAsync<Record<string, unknown>>;
