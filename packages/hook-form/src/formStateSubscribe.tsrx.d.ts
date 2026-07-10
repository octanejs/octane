// Type declaration for the .tsrx component (resolved by relative path).
import type { FieldValues, UseFormStateProps, UseFormStateReturn } from './types';

export type FormStateSubscribeProps<
	TFieldValues extends FieldValues,
	TTransformedValues = TFieldValues,
> = UseFormStateProps<TFieldValues, TTransformedValues> & {
	render: (values: UseFormStateReturn<TFieldValues>) => unknown;
};

export declare const FormStateSubscribe: <
	TFieldValues extends FieldValues,
	TTransformedValues = TFieldValues,
>(
	props: FormStateSubscribeProps<TFieldValues, TTransformedValues>,
) => unknown;
