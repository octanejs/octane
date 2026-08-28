import type { FormSchema, RequiredPath, ValidArrayPath } from '../../core/index.ts';
import type { FieldArrayStore, FormStore } from '../../types/index.ts';
import { useFieldArray } from '../../hooks/useFieldArray/useFieldArray.ts';
import type { OctaneNode } from 'octane';
import type * as v from 'valibot';

export interface FieldArrayProps<
	TSchema extends FormSchema = FormSchema,
	TFieldArrayPath extends RequiredPath = RequiredPath,
> {
	readonly of: FormStore<TSchema>;
	readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
	readonly children: (store: FieldArrayStore<TSchema, TFieldArrayPath>) => OctaneNode;
}

export function FieldArray<TSchema extends FormSchema, TFieldArrayPath extends RequiredPath>({
	of,
	path,
	children,
}: FieldArrayProps<TSchema, TFieldArrayPath>): OctaneNode {
	return children(useFieldArray(of, { path }));
}
