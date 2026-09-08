import {
  type FormSchema,
  type RequiredPath,
  type ValidPath,
} from '@formisch/core/react';
import type { ReactElement } from 'react';
import type * as v from 'valibot';
import { useField } from '../../hooks/index.ts';
import type { FieldStore, FormStore } from '../../types/index.ts';

/**
 * Field component props interface.
 */
export interface FieldProps<
  TSchema extends FormSchema = FormSchema,
  TFieldPath extends RequiredPath = RequiredPath,
> {
  /**
   * The form store to which the field belongs.
   */
  readonly of: FormStore<TSchema>;
  /**
   * The path to the field within the form schema.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
  /**
   * The render function that receives the field store and returns JSX.
   */
  readonly children: (store: FieldStore<TSchema, TFieldPath>) => ReactElement;
}

/**
 * Headless form field component that provides reactive properties and state.
 * The field component takes a form store, path to field, and a render function
 * that receives a field store to display field state and handle user interactions.
 *
 * @param props The field component props.
 *
 * @returns The UI of the field to be rendered.
 */
// @__NO_SIDE_EFFECTS__
export function Field<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
>({ of, path, children }: FieldProps<TSchema, TFieldPath>): ReactElement {
  const field = useField(of, { path });
  return children(field);
}
