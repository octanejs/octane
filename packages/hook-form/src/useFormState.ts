// Adapted from react-hook-form@7.88.0 src/useFormState.ts for Octane.
import { useState, useRef, useEffect, useMemo } from 'octane';

import getProxyFormState from './logic/getProxyFormState';
import type { FieldValues, FormState, UseFormStateProps, UseFormStateReturn } from './types';
import { useFormControlContext } from './useFormControlContext';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';
import { useResyncOnReconnect } from './useResyncOnReconnect';

/**
 * Subscribes to form state with re-renders isolated to this hook.
 * Optionally scope to specific field names to minimize re-render surface.
 *
 * @see [API](https://react-hook-form.com/docs/useformstate)
 *
 * @example
 * ```tsx
 * const { errors, isDirty } = useFormState({ control, name: "email" });
 * ```
 */
export function useFormState<
	TFieldValues extends FieldValues = FieldValues,
	TTransformedValues = TFieldValues,
>(props?: UseFormStateProps<TFieldValues, TTransformedValues>): UseFormStateReturn<TFieldValues> {
	const formControl = useFormControlContext<TFieldValues, unknown, TTransformedValues>();
	const { control = formControl, disabled, name, exact } = props || {};

	const getCurrentFormState = () => ({
		...control._formState,
		defaultValues: control._defaultValues as FormState<TFieldValues>['defaultValues'],
	});

	const [formState, updateFormState] = useState<FormState<TFieldValues>>(getCurrentFormState);
	const _localProxyFormState = useRef({
		isDirty: false,
		isLoading: false,
		dirtyFields: false,
		touchedFields: false,
		validatingFields: false,
		isValidating: false,
		isValid: false,
		errors: false,
	});

	const { resyncIfNeeded, snapshot } =
		useResyncOnReconnect<FormState<TFieldValues>>(getCurrentFormState);

	useIsomorphicLayoutEffect(() => {
		resyncIfNeeded(!disabled, getCurrentFormState, updateFormState);

		const unsubscribe = control._subscribe({
			name,
			formState: _localProxyFormState.current,
			exact,
			callback: (formState) => {
				!disabled &&
					updateFormState({
						...control._formState,
						...formState,
						defaultValues: control._defaultValues as FormState<TFieldValues>['defaultValues'],
					});
			},
		});

		return () => {
			unsubscribe();
			snapshot(!disabled, getCurrentFormState);
		};
	}, [control, name, disabled, exact, resyncIfNeeded, snapshot]);

	useEffect(() => {
		_localProxyFormState.current.isValid && control._setValid(true);
	}, [control]);

	return useMemo(
		() => getProxyFormState(formState, control, _localProxyFormState.current, false),
		[formState, control],
	);
}
