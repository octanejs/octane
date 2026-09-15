// Adapted from react-hook-form@7.88.0 src/fieldArray.tsx for Octane.
import type { OctaneNode } from 'octane';
import type {
	FieldArray as FieldArrayType,
	FieldArrayPath,
	FieldArrayProps,
	FieldValues,
} from './types';
import { useFieldArray } from './useFieldArray';

export type FieldArray<
	TFieldValues extends FieldValues = FieldValues,
	TFieldArrayName extends FieldArrayPath<TFieldValues> = FieldArrayPath<TFieldValues>,
> =
	FieldArrayType<TFieldValues, TFieldArrayName>;

export function FieldArray<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldArrayPath<TFieldValues> = FieldArrayPath<TFieldValues>,
	TKeyName extends string = 'id',
>(props: FieldArrayProps<TFieldValues, TName, TKeyName>): OctaneNode {
	return props.render(useFieldArray<TFieldValues, TName, TKeyName>(props));
}
