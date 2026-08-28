import type {
  FieldElement,
  FormSchema,
  PartialValues,
  PathValue,
  RequiredPath,
  ValidArrayPath,
  ValidPath,
} from '@formisch/core/react';
import type { ChangeEventHandler, FocusEventHandler } from 'react';
import type * as v from 'valibot';

/**
 * Field element props interface.
 */
export interface FieldElementProps {
  /**
   * The name attribute of the field element.
   */
  readonly name: string;
  /**
   * Whether to autofocus the field element when there are errors.
   */
  readonly autoFocus: boolean;
  /**
   * The ref callback to register the field element.
   */
  readonly ref: (element: FieldElement | null) => void;
  /**
   * The focus event handler of the field element.
   */
  readonly onFocus: FocusEventHandler<FieldElement>;
  /**
   * The change event handler of the field element.
   */
  readonly onChange: ChangeEventHandler<FieldElement>;
  /**
   * The blur event handler of the field element.
   */
  readonly onBlur: FocusEventHandler<FieldElement>;
}

/**
 * Field store interface.
 */
export interface FieldStore<
  TSchema extends FormSchema = FormSchema,
  TFieldPath extends RequiredPath = RequiredPath,
> {
  /**
   * The path to the field within the form.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
  /**
   * The current input value of the field.
   */
  readonly input: PartialValues<PathValue<v.InferInput<TSchema>, TFieldPath>>;
  /**
   * The current error messages of the field.
   */
  readonly errors: [string, ...string[]] | null;
  /**
   * Whether the field has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether the field value has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether the field input differs from its initial value.
   */
  readonly isDirty: boolean;
  /**
   * Whether the field is valid according to the schema.
   */
  readonly isValid: boolean;
  /**
   * Sets the field input value programmatically.
   */
  readonly onChange: (
    value: PartialValues<PathValue<v.InferInput<TSchema>, TFieldPath>>
  ) => void;
  /**
   * The props to spread onto the field element for integration.
   */
  readonly props: FieldElementProps;
}

/**
 * Field array store interface.
 */
export interface FieldArrayStore<
  TSchema extends FormSchema = FormSchema,
  TFieldArrayPath extends RequiredPath = RequiredPath,
> {
  /**
   * The path to the array field within the form.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The item IDs of the array field.
   */
  readonly items: string[];
  /**
   * The current error messages of the field array.
   */
  readonly errors: [string, ...string[]] | null;
  /**
   * Whether the field array has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether the field array value has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether the field array input differs from its initial value.
   */
  readonly isDirty: boolean;
  /**
   * Whether the field array is valid according to the schema.
   */
  readonly isValid: boolean;
}
