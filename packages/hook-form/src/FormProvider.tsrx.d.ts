// Type declaration for the .tsrx component (resolved by relative path).
import type { FieldValues, FormProviderProps } from './types';

export declare const FormProvider: <
	TFieldValues extends FieldValues,
	TContext = any,
	TTransformedValues = TFieldValues,
>(
	props: FormProviderProps<TFieldValues, TContext, TTransformedValues>,
) => unknown;
