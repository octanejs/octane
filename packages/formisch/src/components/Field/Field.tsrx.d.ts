import type { FormSchema, RequiredPath, ValidPath } from '../../core/index.ts';
import type { FieldStore, FormStore } from '../../types/index.ts';
import type { OctaneNode } from 'octane';
import type * as v from 'valibot';

export interface FieldProps<
	TSchema extends FormSchema = FormSchema,
	TFieldPath extends RequiredPath = RequiredPath,
> {
	readonly of: FormStore<TSchema>;
	readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
	readonly children: (store: FieldStore<TSchema, TFieldPath>) => OctaneNode;
}

export declare function Field<TSchema extends FormSchema, TFieldPath extends RequiredPath>(
	props: FieldProps<TSchema, TFieldPath>,
): OctaneNode;
