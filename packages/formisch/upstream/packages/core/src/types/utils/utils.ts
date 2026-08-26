/**
 * Checks if a type is `any`.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Checks if a type is `never`.
 */
export type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Constructs a type that is maybe a promise.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Makes all properties deeply optional.
 */
export type DeepPartial<TValue> = TValue extends
  | Record<PropertyKey, unknown>
  | readonly unknown[]
  ? { [TKey in keyof TValue]?: DeepPartial<TValue[TKey]> | undefined }
  : TValue | undefined;

/**
 * Makes all value properties optional.
 *
 * Hint: For dynamic arrays, only plain objects and nested arrays have their
 * values made optional. Primitives and class instances are kept as-is to avoid
 * types like `(string | undefined)[]`.
 */
export type PartialValues<TValue> = TValue extends readonly (infer TItem)[]
  ? number extends TValue['length']
    ? // Hint: `infer TItem` is a naked type parameter that distributes the
      // conditional over each union member individually. `TValue[number]`
      // would not distribute, causing unions like `string | { id: number }`
      // to fail the object and array check as a whole and skip recursion
      // entirely, leaving object members like `{ id: number }` unchanged.
      (TItem extends Record<PropertyKey, unknown> | readonly unknown[]
        ? { [TKey in keyof TItem]: PartialValues<TItem[TKey]> }
        : TItem)[]
    : // For tuples, recurse into each position making values optional
      { [TKey in keyof TValue]: PartialValues<TValue[TKey]> }
  : // For objects, recurse into each property making values optional
    TValue extends Record<PropertyKey, unknown>
    ? { [TKey in keyof TValue]: PartialValues<TValue[TKey]> }
    : // For primitives, make the value itself optional
      TValue | undefined;
