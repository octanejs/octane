import {
  type BaseFormStore,
  type DirtyPath,
  type FormSchema,
  getFieldBool,
  getFieldStore,
  INTERNAL,
  type InternalFieldStore,
  type RequiredPath,
  type ValidPath,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Get form dirty paths config interface.
 */
export interface GetFormDirtyPathsConfig {
  /**
   * The path to a field. Leave undefined to inspect the entire form.
   */
  readonly path?: undefined;
}

/**
 * Get field dirty paths config interface.
 */
export interface GetFieldDirtyPathsConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to inspect.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Returns a list of paths to the dirty fields of a specific field or the
 * entire form. Arrays are treated as atomic and contribute only their own
 * path if any item is dirty, while object branches are recursed into. Returns
 * an empty list if no field in the inspected subtree is dirty.
 *
 * @param form The form store to inspect.
 *
 * @returns The list of paths to the dirty fields.
 */
export function getDirtyPaths<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): DirtyPath<v.InferInput<TSchema>>[];

/**
 * Returns a list of paths to the dirty fields of a specific field or the
 * entire form. Arrays are treated as atomic and contribute only their own
 * path if any item is dirty, while object branches are recursed into. Returns
 * an empty list if no field in the inspected subtree is dirty.
 *
 * @param form The form store to inspect.
 * @param config The get dirty paths configuration.
 *
 * @returns The list of paths to the dirty fields.
 */
export function getDirtyPaths<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? GetFieldDirtyPathsConfig<TSchema, TFieldPath>
    : GetFormDirtyPathsConfig
): DirtyPath<v.InferInput<TSchema>>[];

// @__NO_SIDE_EFFECTS__
export function getDirtyPaths(
  form: BaseFormStore,
  config?:
    | GetFormDirtyPathsConfig
    | GetFieldDirtyPathsConfig<FormSchema, RequiredPath>
): RequiredPath[] {
  // Collect paths of dirty fields via a single recursive walk, reading each
  // field's own path instead of reconstructing it during the walk
  const paths: RequiredPath[] = [];
  collectDirtyPaths(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    paths
  );

  // Return collected paths
  return paths;
}

// @__NO_SIDE_EFFECTS__
function collectDirtyPaths(
  internalFieldStore: InternalFieldStore,
  paths: RequiredPath[]
): void {
  // If field store is object with non-nullish input, recurse into children
  if (internalFieldStore.kind === 'object' && internalFieldStore.input.value) {
    // Hint: We skip a per-child `getFieldBool` pre-check because the
    // recursion already prunes clean subtrees. Pre-checking would walk
    // every dirty subtree twice.
    const lengthBefore = paths.length;
    for (const key in internalFieldStore.children) {
      collectDirtyPaths(internalFieldStore.children[key], paths);
    }

    // If no descendant emitted a path but the object itself flipped dirty
    // (e.g. transitioned from nullish to a non-nullish object), emit the
    // object's own path so the change isn't silently dropped.
    if (
      paths.length === lengthBefore &&
      internalFieldStore.isDirty.value &&
      internalFieldStore.path.length > 0
    ) {
      paths.push([...internalFieldStore.path] as unknown as RequiredPath);
    }

    // Otherwise, if field store is a value, emit its path if dirty
  } else if (internalFieldStore.kind === 'value') {
    if (
      internalFieldStore.isDirty.value &&
      internalFieldStore.path.length > 0
    ) {
      paths.push([...internalFieldStore.path] as unknown as RequiredPath);
    }

    // Otherwise, field is atomic (array or cleared object) — emit its path
    // if any dirty content exists
  } else if (
    getFieldBool(internalFieldStore, 'isDirty') &&
    internalFieldStore.path.length > 0
  ) {
    paths.push([...internalFieldStore.path] as unknown as RequiredPath);
  }
}
