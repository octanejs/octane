import type { Path } from '../path/index.ts';
import type { Schema } from '../schema/index.ts';
import type { Signal } from '../signal/index.ts';

/**
 * Field element type.
 */
export type FieldElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

/**
 * Internal base store interface.
 */
export interface InternalBaseStore {
  /**
   * The kind of field store.
   */
  kind: 'array' | 'object' | 'value';
  /**
   * The name of the field.
   */
  name: string;
  /**
   * The path to the field.
   */
  path: Path;
  /**
   * The schema of the field.
   */
  schema: Schema;
  /**
   * Whether the schema is wrapped in a nullish schema.
   *
   * Hint: This indicates whether a missing input should be represented as the
   * nullish value (`null`/`undefined`) instead of a present empty fallback
   * (`true` for arrays and objects, or the empty input for values). It keeps
   * resetting consistent with the initial state.
   */
  isNullish: boolean;
  /**
   * The initial elements of the field.
   *
   * Hint: This may look unused, but do not remove it. `copyItemState` and
   * `swapItemState` move the `elements` reference between field stores when
   * array items are inserted, moved, removed or swapped, and `reset` restores
   * each field's original element via `elements = initialElements`. Without it,
   * focus and file reset target the wrong element after a reorder followed by a
   * reset.
   */
  initialElements: FieldElement[];
  /**
   * The elements of the field.
   */
  elements: FieldElement[];
  /**
   * The errors of the field.
   */
  errors: Signal<[string, ...string[]] | null>;
  /**
   * The touched state of the field.
   */
  isTouched: Signal<boolean>;
  /**
   * The edited state of the field.
   *
   * Hint: Unlike `isTouched`, which is also set when a field is focused, this
   * is only set when the field's value is changed. Unlike `isDirty`, it stays
   * `true` even if the value is changed back to its initial value. It is only
   * reset when the field is reset.
   */
  isEdited: Signal<boolean>;
  /**
   * The dirty state of the field.
   */
  isDirty: Signal<boolean>;
}

/**
 * Internal array store interface.
 */
export interface InternalArrayStore extends InternalBaseStore {
  /**
   * The kind of field store.
   */
  kind: 'array';

  /**
   * The children of the array field.
   */
  children: InternalFieldStore[];

  /**
   * The initial input of the array field.
   *
   * Hint: The initial input is used for resetting and may only be changed
   * during this process. It does not move when a field is moved.
   */
  initialInput: Signal<true | null | undefined>;
  /**
   * The start input of the array field.
   *
   * Hint: The start input is used to determine whether the field is dirty
   * and moves with it.
   */
  startInput: Signal<true | null | undefined>;
  /**
   * The input of the array field.
   *
   * Hint: The input indicates whether it is `null`, `undefined`, or found in
   * the children.
   */
  input: Signal<true | null | undefined>;

  /**
   * The initial items of the array field.
   *
   * Hint: The initial items are used for resetting and may only be changed
   * during this process. It does not move when a field is moved.
   */
  initialItems: Signal<string[]>;
  /**
   * The start items of the array field.
   *
   * Hint: The start items are used to determine whether the field is dirty
   * and moves with it.
   */
  startItems: Signal<string[]>;
  /**
   * The items of the array field.
   */
  items: Signal<string[]>;
}

/**
 * Internal object store interface.
 */
export interface InternalObjectStore extends InternalBaseStore {
  /**
   * The kind of field store.
   */
  kind: 'object';
  /**
   * The children of the object field.
   */
  children: Record<string, InternalFieldStore>;

  /**
   * The initial input of the object field.
   *
   * Hint: The initial input is used for resetting and may only be changed
   * during this process. It does not move when a field is moved.
   */
  initialInput: Signal<true | null | undefined>;
  /**
   * The start input of the object field.
   *
   * Hint: The start input is used to determine whether the field is dirty
   * and moves with it.
   */
  startInput: Signal<true | null | undefined>;
  /**
   * The input of the object field.
   *
   * Hint: The input indicates whether it is `null`, `undefined`, or found in
   * the children.
   */
  input: Signal<true | null | undefined>;
}

/**
 * Internal value store interface.
 */
export interface InternalValueStore extends InternalBaseStore {
  /**
   * The kind of field store.
   */
  kind: 'value';

  /**
   * The initial input of the value field.
   *
   * Hint: The initial input is used for resetting and may only be changed
   * during this process. It does not move when a field is moved.
   */
  initialInput: Signal<unknown>;
  /**
   * The start input of the value field.
   *
   * Hint: The start input is used to determine whether the field is dirty
   * and moves with it.
   */
  startInput: Signal<unknown>;
  /**
   * The input of the value field.
   */
  input: Signal<unknown>;
}

/**
 * Internal field store type.
 */
export type InternalFieldStore =
  | InternalArrayStore
  | InternalObjectStore
  | InternalValueStore;
