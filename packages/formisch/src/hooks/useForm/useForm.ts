import { useLayoutEffect, useMemo } from 'octane';
import * as v from 'valibot';
import {
	createFormStore,
	type FormConfig,
	type FormSchema,
	getFieldBool,
	INTERNAL,
	validateFormInput,
} from '../../core/index.ts';
import { splitSlot, subSlot } from '../../internal.ts';
import type { FormStore } from '../../types/index.ts';
import { useSignals } from '../useSignals/useSignals.ts';

export function useForm<TSchema extends FormSchema>(
	config: FormConfig<TSchema>,
): FormStore<TSchema>;

export function useForm(config: FormConfig, ...rest: [slot?: symbol]): FormStore {
	const [, slot] = splitSlot(rest);
	useSignals(subSlot(slot, 'signals'));

	const internalFormStore = useMemo(
		() => createFormStore(config, (input) => v.safeParseAsync(config.schema, input)),
		[],
		subSlot(slot, 'store'),
	);

	useLayoutEffect(
		() => {
			if (config.validate === 'initial') void validateFormInput(internalFormStore);
		},
		[],
		subSlot(slot, 'initial-validation'),
	);

	return useMemo(
		() => ({
			[INTERNAL]: internalFormStore,
			get isSubmitting() {
				return internalFormStore.isSubmitting.value;
			},
			get isSubmitted() {
				return internalFormStore.isSubmitted.value;
			},
			get isValidating() {
				return internalFormStore.isValidating.value;
			},
			get isTouched() {
				return getFieldBool(internalFormStore, 'isTouched');
			},
			get isEdited() {
				return getFieldBool(internalFormStore, 'isEdited');
			},
			get isDirty() {
				return getFieldBool(internalFormStore, 'isDirty');
			},
			get isValid() {
				return !getFieldBool(internalFormStore, 'errors');
			},
			get errors() {
				return internalFormStore.errors.value;
			},
		}),
		[internalFormStore],
		subSlot(slot, 'public-store'),
	);
}
