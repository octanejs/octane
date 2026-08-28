import {
  type BaseFormStore,
  type FieldPath,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type Path,
  type RequiredPath,
  type ValidPath,
  walkFieldStore,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Deep error entry interface.
 */
export interface DeepErrorEntry<TValue = unknown> {
  /**
   * The path to the field with errors, or an empty path for form-level errors.
   */
  readonly path: unknown extends TValue
    ? Path
    : readonly [] | FieldPath<TValue>;
  /**
   * The error messages of the field.
   */
  readonly errors: [string, ...string[]];
}

/**
 * Get form deep error entries config interface.
 */
export interface GetFormDeepErrorEntriesConfig {
  /**
   * The path to a field. Leave undefined to get the entries of the entire form.
   */
  readonly path?: undefined;
}

/**
 * Get field deep error entries config interface.
 */
export interface GetFieldDeepErrorEntriesConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to retrieve the entries from.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Retrieves the errors of a specific field or the entire form as a list of
 * entries, each pairing the path to a field with its error messages. This is
 * useful for building custom error summaries that link each message back to
 * its field. Form-level errors are included with an empty path.
 *
 * @param form The form store to retrieve error entries from.
 *
 * @returns A list of path and error message entries.
 */
export function getDeepErrorEntries<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): DeepErrorEntry<v.InferInput<TSchema>>[];

/**
 * Retrieves the errors of a specific field or the entire form as a list of
 * entries, each pairing the path to a field with its error messages. This is
 * useful for building custom error summaries that link each message back to
 * its field. Form-level errors are included with an empty path.
 *
 * @param form The form store to retrieve error entries from.
 * @param config The get deep error entries configuration.
 *
 * @returns A list of path and error message entries.
 */
export function getDeepErrorEntries<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? GetFieldDeepErrorEntriesConfig<TSchema, TFieldPath>
    : GetFormDeepErrorEntriesConfig
): DeepErrorEntry<v.InferInput<TSchema>>[];

// @__NO_SIDE_EFFECTS__
export function getDeepErrorEntries(
  form: BaseFormStore,
  config?:
    | GetFormDeepErrorEntriesConfig
    | GetFieldDeepErrorEntriesConfig<FormSchema, RequiredPath>
): DeepErrorEntry[] {
  // Collect entries of errored fields by walking the field store tree, reading
  // each field's own path instead of reconstructing it during the walk
  const entries: DeepErrorEntry[] = [];
  walkFieldStore(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    (internalFieldStore) => {
      // Emit an entry if field has errors; form-level errors are emitted
      const errors = internalFieldStore.errors.value;
      if (errors) {
        entries.push({
          path: internalFieldStore.path,
          errors,
        });
      }
    }
  );
  return entries;
}
