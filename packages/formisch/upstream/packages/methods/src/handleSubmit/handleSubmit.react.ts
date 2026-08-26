import {
  type BaseFormStore,
  type FormSchema,
  type SubmitEventHandler,
  type SubmitHandler,
} from '@formisch/core/react';
import type { FormEvent } from 'react';
import { handleSubmit as baseHandleSubmit } from './handleSubmit.ts';

/**
 * Creates a submit event handler for the form that validates the form input,
 * and calls the provided handler if validation succeeds. This is designed to
 * be used with the form's onsubmit event.
 *
 * @param form The form store to handle submission for.
 * @param handler The submit handler function called with validated output if validation succeeds.
 *
 * @returns A submit event handler function to attach to the form element.
 */
export function handleSubmit<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>,
  handler: SubmitHandler<TSchema>
): () => Promise<void>;

/**
 * Creates a submit event handler for the form that prevents default browser
 * submission, validates the form input, and calls the provided handler if
 * validation succeeds. This is designed to be used with the form's onsubmit event.
 *
 * @param form The form store to handle submission for.
 * @param handler The submit handler function called with validated output if validation succeeds.
 *
 * @returns A submit event handler function to attach to the form element.
 */
export function handleSubmit<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>,
  handler: SubmitEventHandler<TSchema>
): (event: FormEvent<HTMLFormElement>) => Promise<void>;

// @__NO_SIDE_EFFECTS__
export function handleSubmit(
  form: BaseFormStore,
  handler: SubmitHandler<FormSchema> | SubmitEventHandler<FormSchema>
): (event?: FormEvent<HTMLFormElement>) => Promise<void> {
  // @ts-expect-error: SubmitHandler uses FormEvent but base uses SubmitEvent
  return baseHandleSubmit(form, handler);
}
