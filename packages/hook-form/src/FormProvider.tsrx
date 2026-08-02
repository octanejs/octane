// Vendored from react-hook-form@7.81.0 src/useFormContext.tsx (octane port) —
// the FormProvider component half of upstream's file. Propagates the useForm
// methods to all children via context; the memoized value keeps context
// identity stable across parent re-renders (same deps as upstream).
import { useMemo } from 'octane';
import type { Control, FieldValues, FormProviderProps, UseFormReturn } from './types';
import { HookFormContext, HookFormControlContext } from './useFormControlContext.ts';

export function FormProvider<
	TFieldValues extends FieldValues,
	TContext = any,
	TTransformedValues = TFieldValues,
>(props: FormProviderProps<TFieldValues, TContext, TTransformedValues>) @{
	const {
		children,
		watch,
		getValues,
		getFieldState,
		setError,
		clearErrors,
		setValue,
		setValues,
		trigger,
		formState,
		resetField,
		reset,
		resetDefaultValues,
		handleSubmit,
		unregister,
		control,
		register,
		setFocus,
		subscribe,
	} = props;

	const memoizedValue = useMemo(
		() => ({
			watch,
			getValues,
			getFieldState,
			setError,
			clearErrors,
			setValue,
			setValues,
			trigger,
			formState,
			resetField,
			reset,
			resetDefaultValues,
			handleSubmit,
			unregister,
			control,
			register,
			setFocus,
			subscribe,
		}),
		[
			clearErrors,
			control,
			formState,
			getFieldState,
			getValues,
			handleSubmit,
			register,
			reset,
			resetDefaultValues,
			resetField,
			setError,
			setFocus,
			setValue,
			setValues,
			subscribe,
			trigger,
			unregister,
			watch,
		],
	);

	<HookFormContext.Provider value={memoizedValue as unknown as UseFormReturn}>
		<HookFormControlContext.Provider
			value={memoizedValue.control as Control}
		>{children}</HookFormControlContext.Provider>
	</HookFormContext.Provider>
}
