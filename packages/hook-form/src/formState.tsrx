// Adapted from react-hook-form@7.88.0 src/formState.tsx for Octane.
import type { OctaneNode } from 'octane';
import type {
	FieldValues,
	FormState as FormStateType,
	UseFormStateProps,
	UseFormStateReturn,
} from './types';
import { useFormState } from './useFormState';

export type FormStateProps<TFieldValues extends FieldValues, TTransformedValues = TFieldValues> =
	UseFormStateProps<TFieldValues, TTransformedValues> & {
		render: (values: UseFormStateReturn<TFieldValues>) => OctaneNode;
	};

export type FormState<TFieldValues extends FieldValues> = FormStateType<TFieldValues>;

export function FormState<TFieldValues extends FieldValues, TTransformedValues = TFieldValues>(
	props: FormStateProps<TFieldValues, TTransformedValues>,
): OctaneNode {
	const { control, disabled, exact, name, render } = props;
	return render(useFormState({ control, name, disabled, exact }));
}

/** @deprecated Use FormState instead. */
export const FormStateSubscribe = FormState;

/** @deprecated Use FormStateProps instead. */
export type FormStateSubscribeProps<
	TFieldValues extends FieldValues,
	TTransformedValues = TFieldValues,
> =
	FormStateProps<TFieldValues, TTransformedValues>;
