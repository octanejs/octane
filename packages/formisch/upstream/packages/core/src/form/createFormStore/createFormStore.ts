import type * as v from 'valibot';
import { type FieldSchema, initializeFieldStore } from '../../field/index.ts';
import { createSignal } from '../../framework/index.ts';
import type {
  EmptyInput,
  FormConfig,
  FormSchema,
  InternalFormStore,
} from '../../types/index.ts';

/**
 * The default empty input of a form. Required string fields start as an empty
 * string, while every other type starts as `undefined`.
 */
export const DEFAULT_EMPTY_INPUT: EmptyInput = { string: '' };

/**
 * Creates a new internal form store from the provided configuration.
 * Initializes the field store hierarchy, sets validation modes, and
 * creates form state signals.
 *
 * @param config The form configuration.
 * @param parse The schema parse function.
 *
 * @returns The internal form store.
 */
// @__NO_SIDE_EFFECTS__
export function createFormStore(
  config: FormConfig,
  parse: (input: unknown) => Promise<v.SafeParseResult<FormSchema>>
): InternalFormStore {
  // Create partial store object
  const store: Partial<InternalFormStore> = {};

  // Merge configured empty input on top of the defaults before initializing so
  // the field stores can read it from the form store
  store.emptyInput = { ...DEFAULT_EMPTY_INPUT, ...config.emptyInput };

  // Set form config and validation
  store.validators = 0;
  store.validate = config.validate ?? 'submit';
  store.revalidate = config.revalidate ?? 'input';
  store.parse = parse;

  // Initialize form state signals
  store.isSubmitting = createSignal(false);
  store.isSubmitted = createSignal(false);
  store.isValidating = createSignal(false);

  // Initialize field store hierarchy from schema
  initializeFieldStore(
    store as InternalFormStore,
    store,
    config.schema as FieldSchema,
    config.initialInput,
    []
  );

  // Return initialized store
  return store as InternalFormStore;
}
