import { useMemo } from 'octane';
import type * as v from 'valibot';
import {
	type FormSchema,
	getFieldBool,
	getFieldStore,
	INTERNAL,
	type InternalArrayStore,
	type RequiredPath,
	type ValidArrayPath,
} from '../../core/index.ts';
import { splitSlot, subSlot } from '../../internal.ts';
import type { FieldArrayStore, FormStore } from '../../types/index.ts';
import { useSignals } from '../useSignals/useSignals.ts';

export interface UseFieldArrayConfig<
	TSchema extends FormSchema = FormSchema,
	TFieldArrayPath extends RequiredPath = RequiredPath,
> {
	readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
}

export function useFieldArray<TSchema extends FormSchema, TFieldArrayPath extends RequiredPath>(
	form: FormStore<TSchema>,
	config: UseFieldArrayConfig<TSchema, TFieldArrayPath>,
): FieldArrayStore<TSchema, TFieldArrayPath>;

export function useFieldArray(
	form: FormStore,
	config: { readonly path: any },
	...rest: [slot?: symbol]
): any {
	const [, slot] = splitSlot(rest);
	useSignals(subSlot(slot, 'signals'));
	const internalFormStore = form[INTERNAL];
	const internalFieldStore = getFieldStore(internalFormStore, config.path) as InternalArrayStore;

	return useMemo(
		() => ({
			path: config.path,
			get items() {
				return internalFieldStore.items.value;
			},
			get errors() {
				return internalFieldStore.errors.value;
			},
			get isTouched() {
				return getFieldBool(internalFieldStore, 'isTouched');
			},
			get isEdited() {
				return getFieldBool(internalFieldStore, 'isEdited');
			},
			get isDirty() {
				return getFieldBool(internalFieldStore, 'isDirty');
			},
			get isValid() {
				return !getFieldBool(internalFieldStore, 'errors');
			},
		}),
		[internalFormStore, internalFieldStore],
		subSlot(slot, 'public-store'),
	);
}
