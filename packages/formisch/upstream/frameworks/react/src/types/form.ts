import type { BaseFormStore, FormSchema } from '@formisch/core/react';

/**
 * Form store interface.
 */
export interface FormStore<TSchema extends FormSchema = FormSchema>
  extends BaseFormStore<TSchema> {
  /**
   * Whether the form is currently submitting.
   */
  readonly isSubmitting: boolean;
  /**
   * Whether the form has been submitted.
   */
  readonly isSubmitted: boolean;
  /**
   * Whether the form is currently validating.
   */
  readonly isValidating: boolean;
  /**
   * Whether any field in the form has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether any field in the form has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether any field in the form differs from its initial value.
   */
  readonly isDirty: boolean;
  /**
   * Whether the form is valid according to the schema.
   */
  readonly isValid: boolean;
  /**
   * The current error messages of the form.
   *
   * Hint: This property only contains validation errors at the root level
   * of the form. To get all errors from all fields, use `getDeepErrors`.
   */
  readonly errors: [string, ...string[]] | null;
}
