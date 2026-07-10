// Vendored from react-hook-form@7.81.0 src/useFormContext.tsx (octane port) —
// the FormProvider component half of upstream's file. Propagates the useForm
// methods to all children via context; the memoized value keeps context
// identity stable across parent re-renders (same deps as upstream).
import { useMemo } from 'octane';
import { HookFormContext, HookFormControlContext } from './useFormControlContext.ts';

export function FormProvider(props) @{
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

	<HookFormContext.Provider value={memoizedValue}>
		<HookFormControlContext.Provider
			value={memoizedValue.control}
		>{children}</HookFormControlContext.Provider>
	</HookFormContext.Provider>
}
