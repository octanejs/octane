// Vendored from react-hook-form@7.81.0 src/formStateSubscribe.tsx (octane port).
// FormStateSubscribe component — render-prop subscription to form state.
// Authored as .tsrx (full compile) so the useFormState call is slot-wrapped
// (see controller.tsrx note).
import { useFormState } from './useFormState.ts';
import type { OctaneNode } from 'octane';
import type { FieldValues, UseFormStateProps, UseFormStateReturn } from './types';

export type FormStateSubscribeProps<
	TFieldValues extends FieldValues,
	TTransformedValues = TFieldValues,
> =
	UseFormStateProps<TFieldValues, TTransformedValues> & {
		render: (values: UseFormStateReturn<TFieldValues>) => OctaneNode;
	};

export const FormStateSubscribe = <
	TFieldValues extends FieldValues,
	TTransformedValues = TFieldValues,
>(props: FormStateSubscribeProps<TFieldValues, TTransformedValues>) => {
	const { control, disabled, exact, name, render } = props;
	return render(useFormState({ control, name, disabled, exact }));
};
