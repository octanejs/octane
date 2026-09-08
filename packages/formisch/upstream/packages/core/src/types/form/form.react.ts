import type { FormEvent } from 'react';
import type * as v from 'valibot';
import type { FormSchema } from '../schema/index.ts';
import type { MaybePromise } from '../utils/index.ts';

// Re-export all other types from the base form module
export type {
  EmptyInput,
  ValidationMode,
  FormConfig,
  InternalFormStore,
  BaseFormStore,
} from './form.ts';

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
  event: FormEvent<HTMLFormElement>
) => MaybePromise<unknown>;
