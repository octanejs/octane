import {
  createFormStore,
  type FormConfig,
  type FormSchema,
  getFieldBool,
  INTERNAL,
  validateFormInput,
} from '@formisch/core/react';
import { useLayoutEffect, useMemo } from 'react';
import * as v from 'valibot';
import type { FormStore } from '../../types/index.ts';
import { useSignals } from '../useSignals/index.ts';

/**
 * Creates a reactive form store from a form configuration. The form store
 * manages form state and provides reactive properties.
 *
 * @param config The form configuration.
 *
 * @returns The form store with reactive properties.
 */
export function useForm<TSchema extends FormSchema>(
  config: FormConfig<TSchema>
): FormStore<TSchema>;

// @__NO_SIDE_EFFECTS__
export function useForm(config: FormConfig): FormStore {
  useSignals();

  const internalFormStore = useMemo(
    () =>
      createFormStore(config, (input) =>
        v.safeParseAsync(config.schema, input)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useLayoutEffect(() => {
    if (config.validate === 'initial') {
      validateFormInput(internalFormStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      [INTERNAL]: internalFormStore,
      get isSubmitting() {
        return internalFormStore.isSubmitting.value;
      },
      get isSubmitted() {
        return internalFormStore.isSubmitted.value;
      },
      get isValidating() {
        return internalFormStore.isValidating.value;
      },
      get isTouched() {
        return getFieldBool(internalFormStore, 'isTouched');
      },
      get isEdited() {
        return getFieldBool(internalFormStore, 'isEdited');
      },
      get isDirty() {
        return getFieldBool(internalFormStore, 'isDirty');
      },
      get isValid() {
        return !getFieldBool(internalFormStore, 'errors');
      },
      get errors() {
        return internalFormStore.errors.value;
      },
    }),
    [internalFormStore]
  );
}
