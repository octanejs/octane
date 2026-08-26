import { useEffect, useMemo } from 'octane';
import type * as v from 'valibot';
import {
	type FieldElement,
	type FormSchema,
	getElementInput,
	getFieldBool,
	getFieldInput,
	getFieldStore,
	INTERNAL,
	type RequiredPath,
	setFieldBool,
	setFieldInput,
	validateIfRequired,
	type ValidPath,
} from '../../core/index.ts';
import { splitSlot, subSlot } from '../../internal.ts';
import type { FieldStore, FormStore } from '../../types/index.ts';
import { useSignals } from '../useSignals/useSignals.ts';

export interface UseFieldConfig<
	TSchema extends FormSchema = FormSchema,
	TFieldPath extends RequiredPath = RequiredPath,
> {
	readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

export function useField<TSchema extends FormSchema, TFieldPath extends RequiredPath>(
	form: FormStore<TSchema>,
	config: UseFieldConfig<TSchema, TFieldPath>,
): FieldStore<TSchema, TFieldPath>;

export function useField(
	form: FormStore,
	config: UseFieldConfig,
	...rest: [slot?: symbol]
): FieldStore {
	const [, slot] = splitSlot(rest);
	useSignals(subSlot(slot, 'signals'));

	const internalFormStore = form[INTERNAL];
	const internalFieldStore = getFieldStore(internalFormStore, config.path);

	useEffect(
		() => () => {
			const elements = internalFieldStore.elements.filter((element) => element.isConnected);
			if (internalFieldStore.elements === internalFieldStore.initialElements) {
				internalFieldStore.initialElements = elements;
			}
			internalFieldStore.elements = elements;
		},
		[internalFieldStore],
		subSlot(slot, 'cleanup'),
	);

	const updateFromElement = (element: FieldElement) => {
		setFieldInput(internalFormStore, config.path, getElementInput(element, internalFieldStore));
		void validateIfRequired(internalFormStore, internalFieldStore, 'input');
		void validateIfRequired(internalFormStore, internalFieldStore, 'change');
	};

	return useMemo(
		() => ({
			path: config.path,
			get input() {
				return getFieldInput(internalFieldStore);
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
			onChange(value: unknown) {
				setFieldInput(internalFormStore, config.path, value);
				void validateIfRequired(internalFormStore, internalFieldStore, 'input');
				void validateIfRequired(internalFormStore, internalFieldStore, 'change');
			},
			props: {
				name: internalFieldStore.name,
				autoFocus: !!internalFieldStore.errors.value,
				ref(element: FieldElement | null) {
					if (element && !internalFieldStore.elements.includes(element)) {
						internalFieldStore.elements.push(element);
					}
				},
				onFocus() {
					setFieldBool(internalFieldStore, 'isTouched', true);
					void validateIfRequired(internalFormStore, internalFieldStore, 'touch');
				},
				onInput(event: InputEvent) {
					updateFromElement(event.currentTarget as FieldElement);
				},
				onChange(event: Event) {
					updateFromElement(event.currentTarget as FieldElement);
				},
				onBlur() {
					void validateIfRequired(internalFormStore, internalFieldStore, 'blur');
				},
			},
		}),
		[internalFormStore, internalFieldStore],
		subSlot(slot, 'public-store'),
	);
}
