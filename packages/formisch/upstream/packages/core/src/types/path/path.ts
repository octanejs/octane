import type { IsAny, IsNever } from '../utils/index.ts';

/**
 * Path key type.
 */
export type PathKey = string | number;

/**
 * Path type.
 */
export type Path = readonly PathKey[];

/**
 * Required path type.
 */
export type RequiredPath = readonly [PathKey, ...Path];

/**
 * Extracts the exact keys of a tuple, array or object. Tuples return their
 * literal numeric indices, dynamic arrays return `number`, objects return
 * their `keyof` keys, and any other input returns `never`.
 */
export type ExactKeysOf<TValue> =
  IsAny<TValue> extends true
    ? never
    : TValue extends readonly unknown[]
      ? number extends TValue['length']
        ? number
        : {
            [TKey in keyof TValue]: TKey extends `${infer TIndex extends number}`
              ? TIndex
              : never;
          }[number]
      : TValue extends Record<PropertyKey, unknown>
        ? keyof TValue & PathKey
        : never;

/**
 * Returns the flat object of all indexable properties of `TValue`. For object
 * unions, properties from every member are merged so that any single property
 * is accessible. For primitives and other non-indexable types, the result is
 * `{}`.
 *
 * Hint: This is necessary to make properties accessible across union members.
 * By default, properties that do not exist in all union options are not
 * accessible and result in "any" when accessed.
 */
export type PropertiesOf<TValue> = {
  [TKey in ExactKeysOf<TValue>]: TValue extends Record<TKey, infer TItem>
    ? TItem
    : never;
};

/**
 * Lazily evaluates only the first valid path segment based on the given value.
 */
type LazyPath<
  TValue,
  TPathToCheck extends Path,
  TValidPath extends Path = readonly [],
> =
  // If path to check is empty, return last valid path
  TPathToCheck extends readonly []
    ? TValidPath
    : // If first key of path to check is valid, continue with next key
      TPathToCheck extends readonly [
          infer TFirstKey extends ExactKeysOf<TValue>,
          ...infer TPathRest extends Path,
        ]
      ? LazyPath<
          Required<PropertiesOf<TValue>[TFirstKey]>,
          TPathRest,
          readonly [...TValidPath, TFirstKey]
        >
      : // If current value has valid keys, return them
        IsNever<ExactKeysOf<TValue>> extends false
        ? readonly [...TValidPath, ExactKeysOf<TValue>]
        : // Otherwise, return only last valid path
          TValidPath;

/**
 * Returns the path if valid, otherwise the first possible valid path based on
 * the given value.
 */
export type ValidPath<TValue, TPath extends RequiredPath> =
  TPath extends LazyPath<Required<TValue>, TPath>
    ? TPath
    : LazyPath<Required<TValue>, TPath>;

/**
 * Detects whether the consuming project is configured with
 * `exactOptionalPropertyTypes: true`.
 *
 * Hint: If `false` the built-in `Required<T>` strips `| undefined` from
 * optional properties, so `Required<{ key?: undefined }>['key']` collapses
 * to `never` — under strict mode the same expression yields `undefined`.
 */
type IsExactOptionalProps = Required<{ key?: undefined }>['key'] extends never
  ? false
  : true;

/**
 * Like the built-in `Required<T>`, but preserves `| undefined` in two
 * places where `Required<T>` strips it:
 *
 * 1. Optional property values under `exactOptionalPropertyTypes: false`
 *    — without this, input typings for `v.optional`/`v.nullish` schemas
 *    narrow incorrectly (issue #15).
 * 2. Array/tuple element types — e.g. `(string | undefined)[]` stays
 *    `(string | undefined)[]` instead of becoming `string[]`. Arrays
 *    fall through unchanged because they only have a numeric index
 *    signature and don't structurally extend `Record<PropertyKey,
 *    unknown>` (which requires string keys).
 */
export type ExactRequired<TValue> =
  TValue extends Record<PropertyKey, unknown>
    ? IsExactOptionalProps extends true
      ? // Under `exactOptionalPropertyTypes: true`, `Required<T>` already
        // preserves the exact value of optional properties — delegate to it
        // so `v.exactOptional` keeps "must be `T`, never `undefined`".
        Required<TValue>
      : // Under loose mode, `Required<T>` strips `| undefined`. Re-derive
        // it via indexed access: `TValue[TKey]` on an optional key gives
        // `T | undefined` regardless of mode. Iterating `keyof Required<T>`
        // remains homomorphic over `TValue`, so `readonly` is preserved.
        { [TKey in keyof Required<TValue>]: TValue[TKey] }
    : TValue;

/**
 * Extracts the value type at the given path.
 */
export type PathValue<TValue, TPath extends Path> = TPath extends readonly [
  infer TKey,
  ...infer TRest extends Path,
]
  ? TKey extends ExactKeysOf<ExactRequired<TValue>>
    ? PathValue<PropertiesOf<ExactRequired<TValue>>[TKey], TRest>
    : unknown
  : TValue;

/**
 * Checks whether a value is a dynamic array or contains one anywhere in its
 * shape. A fixed-length tuple is not itself a dynamic array, but it counts when
 * it contains one, so paths can still navigate through tuples to reach nested
 * arrays.
 *
 * Hint: The inner conditionals (`TValue extends readonly unknown[]` and
 * `TValue extends Record<PropertyKey, unknown>`) distribute over union members,
 * so the inner expression returns the union of each member's result (e.g.
 * `true | false` when some members contain arrays and others don't).
 * Downstream code uses `IsOrHasArray<T> extends true`, but
 * `boolean extends true` is `false` — so we collapse the result via
 * `true extends ...`, which is `true` whenever at least one union member
 * contributed `true`.
 */
type IsOrHasArray<TValue> = true extends (
  IsAny<TValue> extends true
    ? false
    : TValue extends readonly unknown[]
      ? // A dynamic array counts directly; a tuple only if an element is or
        // contains a dynamic array
        number extends TValue['length']
        ? true
        : IsOrHasArray<TValue[number]>
      : TValue extends Record<PropertyKey, unknown>
        ? {
            [TKey in keyof TValue]: IsOrHasArray<TValue[TKey]>;
          }[keyof TValue]
        : false
)
  ? true
  : false;

/**
 * Extracts the exact keys of a tuple, array or object that contain arrays.
 */
export type ExactKeysOfArrayPath<TValue> =
  IsAny<TValue> extends true
    ? never
    : TValue extends readonly (infer TItem)[]
      ? number extends TValue['length']
        ? IsOrHasArray<TItem> extends true
          ? number
          : never
        : {
            [TKey in keyof TValue]: TKey extends `${infer TIndex extends number}`
              ? IsOrHasArray<NonNullable<TValue[TKey]>> extends true
                ? TIndex
                : never
              : never;
          }[number]
      : TValue extends Record<PropertyKey, unknown>
        ? {
            [TKey in keyof TValue]: IsOrHasArray<
              NonNullable<TValue[TKey]>
            > extends true
              ? TKey
              : never;
          }[keyof TValue] &
            PathKey
        : never;

/**
 * Returns the flat object of indexable properties of `TValue` whose values
 * are or contain arrays. Mirrors `PropertiesOf` but keyed by
 * `ExactKeysOfArrayPath` so the lookup is provably valid for array-path
 * navigation in `LazyArrayPath`.
 */
export type PropertiesOfArrayPath<TValue> = {
  [TKey in ExactKeysOfArrayPath<TValue>]: TValue extends Record<
    TKey,
    infer TItem
  >
    ? TItem
    : never;
};

/**
 * Lazily evaluates only the first valid array path segment based on the given value.
 */
type LazyArrayPath<
  TValue,
  TPathToCheck extends Path,
  TValidPath extends Path = readonly [],
> =
  // If path to check is empty, return possible array paths
  TPathToCheck extends readonly []
    ? TValue extends readonly unknown[]
      ? // Only accept dynamic arrays; tuples have a fixed arity, so navigate
        // into their indices instead of accepting the tuple as a field array
        number extends TValue['length']
        ? TValidPath
        : IsNever<ExactKeysOfArrayPath<TValue>> extends false
          ? readonly [...TValidPath, ExactKeysOfArrayPath<TValue>]
          : never
      : readonly [...TValidPath, ExactKeysOfArrayPath<TValue>]
    : // If first key of path to check is valid, continue with next key
      TPathToCheck extends readonly [
          infer TFirstKey extends ExactKeysOfArrayPath<TValue>,
          ...infer TPathRest extends Path,
        ]
      ? LazyArrayPath<
          Required<PropertiesOfArrayPath<TValue>[TFirstKey]>,
          TPathRest,
          readonly [...TValidPath, TFirstKey]
        >
      : // If current value has valid array keys, return them
        IsNever<ExactKeysOfArrayPath<TValue>> extends false
        ? readonly [...TValidPath, ExactKeysOfArrayPath<TValue>]
        : // Otherwise, no valid array keys exist
          never;

/**
 * Returns the path if valid, otherwise the first possible valid array path
 * based on the given value.
 */
export type ValidArrayPath<TValue, TPath extends RequiredPath> =
  TPath extends LazyArrayPath<Required<TValue>, TPath>
    ? TPath
    : LazyArrayPath<Required<TValue>, TPath>;

/**
 * Recursive helper for `DirtyPath` that prepends `TKey` to each deeper path,
 * or falls through to `never` when the child is not an object.
 */
type DeepDirtyPath<TChild, TKey extends PathKey, TDepth extends 0[]> =
  TChild extends Record<PropertyKey, unknown>
    ? readonly [TKey, ...DirtyPath<TChild, [...TDepth, 0]>]
    : never;

/**
 * Returns the union of all `RequiredPath`s that `getDirtyPaths` can emit
 * for a given input type. Object fields contribute their own path and the
 * paths of their descendants; arrays and tuples are atomic and contribute
 * only their own path, because dirty arrays are returned as complete units.
 *
 * Narrowing is exact for the first 5 levels of nesting; deeper paths fall
 * back to `RequiredPath` to keep the result a complete superset of any
 * path the runtime can address.
 *
 * Hint: Arrays and tuples are atomic because they don't structurally
 * extend `Record<PropertyKey, unknown>` and so fall through to `never`
 * via `DeepDirtyPath` — no explicit array check is needed. `TDepth` is
 * a tuple-length counter capped at 5 to bound TypeScript instantiation
 * cost.
 */
export type DirtyPath<
  TValue,
  TDepth extends 0[] = [],
> = TDepth['length'] extends 5
  ? RequiredPath
  : TValue extends Record<PropertyKey, unknown>
    ? {
        [TKey in ExactKeysOf<TValue>]:
          | readonly [TKey]
          | DeepDirtyPath<
              NonNullable<PropertiesOf<TValue>[TKey]>,
              TKey,
              TDepth
            >;
      }[ExactKeysOf<TValue>]
    : never;

/**
 * Recursive helper for `FieldPath` that prepends `TKey` to each deeper field
 * path, or falls through to `never` when the child is a leaf value.
 */
type DeepFieldPath<
  TChild,
  TKey extends PathKey,
  TDepth extends 0[],
> = TChild extends readonly unknown[] | Record<PropertyKey, unknown>
  ? readonly [TKey, ...FieldPath<TChild, [...TDepth, 0]>]
  : never;

/**
 * Returns the union of all `RequiredPath`s that address a field within the
 * given input type. Object and array fields contribute their own path and the
 * paths of their descendants; unlike `DirtyPath`, arrays are recursed into so
 * that fields at any depth, including array items, can be addressed. Leaf
 * values contribute only their own path (emitted by their parent).
 *
 * Narrowing is exact for the first 5 levels of nesting; deeper paths fall
 * back to `RequiredPath` to keep the result a complete superset of any path
 * the runtime can address. `TDepth` is a tuple-length counter capped at 5 to
 * bound TypeScript instantiation cost.
 */
export type FieldPath<
  TValue,
  TDepth extends 0[] = [],
> = TDepth['length'] extends 5
  ? RequiredPath
  : TValue extends readonly unknown[] | Record<PropertyKey, unknown>
    ? {
        [TKey in ExactKeysOf<TValue>]:
          | readonly [TKey]
          | DeepFieldPath<
              NonNullable<PropertiesOf<TValue>[TKey]>,
              TKey,
              TDepth
            >;
      }[ExactKeysOf<TValue>]
    : never;
