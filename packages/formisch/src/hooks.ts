import { useEffect, useRef, useSyncExternalStore } from 'octane';
import { arrayIds, getErrors, getInput, isDirty, isEdited, isTouched, isValid } from './methods.js';
import {
	createFormStore,
	elementValue,
	emit,
	internal,
	pathKey,
	pathName,
	setFieldValue,
	shouldValidate,
	snapshot,
	subscribe,
	validateStore,
} from './store.js';
import type {
	FieldArrayStore,
	FieldElement,
	FieldStore,
	FormConfig,
	FormSchema,
	FormStore,
	RequiredPath,
	UseFieldArrayConfig,
	UseFieldConfig,
} from './types.js';

function useFormVersion<TSchema extends FormSchema>(form: FormStore<TSchema>): void {
	useSyncExternalStore(
		(listener) => subscribe(form, listener),
		() => snapshot(form),
		() => snapshot(form),
	);
}

export function useForm<TSchema extends FormSchema>(
	config: FormConfig<TSchema>,
): FormStore<TSchema> {
	const storeRef = useRef<FormStore<TSchema> | null>(null);
	if (storeRef.current === null) storeRef.current = createFormStore(config);
	const store = storeRef.current;
	useFormVersion(store);
	useEffect(() => {
		if ((config.validate ?? 'submit') === 'initial') void validateStore(store, { focus: false });
	}, []);
	return store;
}

export function useField<TSchema extends FormSchema, TFieldPath extends RequiredPath>(
	form: FormStore<TSchema>,
	config: UseFieldConfig<TSchema, TFieldPath>,
): FieldStore<TSchema, TFieldPath> {
	useFormVersion(form);
	const path = config.path;
	const key = pathKey(path);
	const state = internal(form);
	const setElement = (element: FieldElement | null) => {
		if (element) state.elements.set(key, element);
		else state.elements.delete(key);
	};
	const updateFromEvent = (event: Event, mode: 'input' | 'change') => {
		setFieldValue(form, path, elementValue(event), mode);
	};
	return {
		path,
		input: getInput(form, { path }) as FieldStore<TSchema, TFieldPath>['input'],
		errors: getErrors(form, { path }),
		isTouched: isTouched(form, { path }),
		isEdited: isEdited(form, { path }),
		isDirty: isDirty(form, { path }),
		isValid: isValid(form, { path }),
		onChange: (value) => setFieldValue(form, path, value),
		props: {
			name: pathName(path),
			autoFocus: getErrors(form, { path }) != null,
			ref: setElement,
			onInput: (event) => updateFromEvent(event, 'input'),
			onChange: (event) => updateFromEvent(event, 'change'),
			onFocus: () => {
				state.touched.add(key);
				emit(state as never);
				if (shouldValidate(form, 'touch')) void validateStore(form, { focus: false });
			},
			onBlur: () => {
				if (shouldValidate(form, 'blur')) void validateStore(form, { focus: false });
			},
		},
	};
}

export function useFieldArray<TSchema extends FormSchema, TFieldArrayPath extends RequiredPath>(
	form: FormStore<TSchema>,
	config: UseFieldArrayConfig<TSchema, TFieldArrayPath>,
): FieldArrayStore<TSchema, TFieldArrayPath> {
	useFormVersion(form);
	const input = getInput(form, { path: config.path });
	return {
		path: config.path,
		items: arrayIds(form, config.path, Array.isArray(input) ? input.length : 0),
		errors: getErrors(form, { path: config.path }),
		isTouched: isTouched(form, { path: config.path }),
		isEdited: isEdited(form, { path: config.path }),
		isDirty: isDirty(form, { path: config.path }),
		isValid: isValid(form, { path: config.path }),
	};
}
