import { type BaseFormStore, INTERNAL } from '@formisch/core';

/**
 * Programmatically requests form submission by calling the native
 * `requestSubmit()` method on the underlying form element.
 *
 * @param form The form store to submit.
 */
export function submit(form: BaseFormStore): void {
  form[INTERNAL].element?.requestSubmit();
}
