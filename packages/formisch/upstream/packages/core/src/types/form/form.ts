import type * as v from 'valibot';
import type { INTERNAL } from '../../values.ts';
import type { InternalObjectStore } from '../field/index.ts';
import type { FormSchema } from '../schema/index.ts';
import type { Signal } from '../signal/index.ts';
import type { DeepPartial, MaybePromise } from '../utils/index.ts';

/**
 * Validation mode type.
 */
export type ValidationMode =
  | 'initial'
  | 'touch'
  | 'input'
  | 'change'
  | 'blur'
  | 'submit';

/**
 * Empty input interface.
 *
 * Defines the value a required field of a given type starts at when no initial
 * input is provided. Optional and nullable fields are not affected, as they
 * accept `undefined`. Only required fields whose input is `undefined` fall back
 * to these values.
 */
export interface EmptyInput {
  /**
   * The empty input of a string field. Defaults to an empty string so that an
   * untouched field matches the DOM and validates with its own message instead
   * of a type mismatch. Set to `undefined` to opt out.
   */
  readonly string?: string | undefined;
  /**
   * The empty input of a number field. Defaults to `undefined`.
   */
  readonly number?: number | undefined;
  /**
   * The empty input of a boolean field. Defaults to `undefined`.
   */
  readonly boolean?: boolean | undefined;
  /**
   * The empty input of a date field. Defaults to `undefined`.
   */
  readonly date?: Date | undefined;
}

/**
 * Form config interface.
 */
export interface FormConfig<TSchema extends FormSchema = FormSchema> {
  /**
   * The schema of the form.
   */
  readonly schema: TSchema;
  /**
   * The initial input of the form.
   */
  readonly initialInput?: DeepPartial<v.InferInput<TSchema>> | undefined;
  /**
   * The empty input of the form, keyed by field type. Merged on top of the
   * defaults, so `{ string: '' }` stays in effect unless overridden.
   */
  readonly emptyInput?: EmptyInput | undefined;
  /**
   * The validation mode of the form.
   */
  readonly validate?: ValidationMode | undefined;
  /**
   * The revalidation mode of the form.
   */
  readonly revalidate?: Exclude<ValidationMode, 'initial'> | undefined;
}

/**
 * Internal form store interface.
 */
export interface InternalFormStore<TSchema extends FormSchema = FormSchema>
  extends InternalObjectStore {
  /**
   * The element of the form.
   */
  element?: HTMLFormElement | undefined;

  /**
   * The number of active validators.
   */
  validators: number;
  /**
   * The resolved empty input of the form, keyed by field type.
   */
  emptyInput: EmptyInput;
  /**
   * The validation mode of the form.
   */
  validate: ValidationMode;
  /**
   * The revalidation mode of the form.
   */
  revalidate: Exclude<ValidationMode, 'initial'>;
  /**
   * The parse function of the form.
   */
  parse: (input: unknown) => Promise<v.SafeParseResult<TSchema>>;

  /**
   * The submitting state of the form.
   */
  isSubmitting: Signal<boolean>;
  /**
   * The submitted state of the form.
   */
  isSubmitted: Signal<boolean>;
  /**
   * The validating state of the form.
   */
  isValidating: Signal<boolean>;
}

/**
 * Base form store interface.
 */
export interface BaseFormStore<TSchema extends FormSchema = FormSchema> {
  /**
   * The internal form store.
   *
   * @internal
   */
  readonly [INTERNAL]: InternalFormStore<TSchema>;
}

/**
 * Submit handler type.
 */
export type SubmitHandler<TSchema extends FormSchema> = (
  output: v.InferOutput<TSchema>
) => MaybePromise<unknown>;

/**
 * Submit event handler type.
 */
export type SubmitEventHandler<TSchema extends FormSchema> = (
  output: v.InferOutput<TSchema>,
  event: SubmitEvent
) => MaybePromise<unknown>;
