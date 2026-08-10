import {
	Errors,
	ErrorValue,
	FormDataErrors,
	FormDataKeys,
	FormDataValues,
	Progress,
	UrlMethodPair,
	UseFormTransformCallback,
	UseFormUtils,
	UseFormWithPrecognitionArguments,
} from '@inertiajs/core';
import { cloneDeep, isEqual } from 'es-toolkit';
import { get, has, set } from 'es-toolkit/compat';
import {
	createValidator,
	NamedInputEvent,
	resolveName,
	toSimpleValidationErrors,
	ValidationConfig,
	Validator,
} from 'laravel-precognition';
import { useCallback, useEffect, useRef, useState } from 'octane';
import { config } from '.';

type StateSetter<Value> = (value: Value | ((previousValue: Value) => Value)) => void;
type MutableRefObject<Value> = { current: Value };
const slots = Object.fromEntries(
	[
		'isMounted',
		'precognitionEndpoint',
		'defaults',
		'data',
		'errors',
		'processing',
		'progress',
		'wasSuccessful',
		'recentlySuccessful',
		'recentlySuccessfulTimeout',
		'transform',
		'defaultsCalledInOnSuccess',
		'validator',
		'validating',
		'touchedFields',
		'validFields',
		'withAllErrors',
		'dataRef',
		'syncDataRef',
		'mountedEffect',
		'commitData',
		'setData',
		'setDefaults',
		'reset',
		'setError',
		'clearErrors',
		'resetAndClearErrors',
		'markAsSuccessful',
		'resetBeforeSubmit',
		'finishProcessing',
		'transformFunction',
		'valid',
		'invalid',
		'touched',
	].map((name) => [name, Symbol(`Inertia.useFormState.${name}`)]),
) as Record<string, symbol>;

export type SetDataByObject<TForm> = (data: Partial<TForm>) => void;
export type SetDataByMethod<TForm> = (data: (previousData: TForm) => TForm) => void;
export type SetDataByKeyValuePair<TForm> = <K extends FormDataKeys<TForm>>(
	key: K,
	value: FormDataValues<TForm, K>,
) => void;
export type SetDataAction<TForm extends Record<any, any>> = SetDataByObject<TForm> &
	SetDataByMethod<TForm> &
	SetDataByKeyValuePair<TForm>;

type PrecognitionValidationConfig<TKeys> = ValidationConfig & {
	only?: TKeys[] | Iterable<TKeys> | ArrayLike<TKeys>;
};

export interface FormStateProps<TForm extends object> {
	data: TForm;
	isDirty: boolean;
	errors: FormDataErrors<TForm>;
	hasErrors: boolean;
	processing: boolean;
	progress: Progress | null;
	wasSuccessful: boolean;
	recentlySuccessful: boolean;
	setData: SetDataAction<TForm>;
	transform: (callback: UseFormTransformCallback<TForm>) => void;
	setDefaults: {
		(): void;
		<T extends FormDataKeys<TForm>>(field: T, value: FormDataValues<TForm, T>): void;
		(fields: Partial<TForm>): void;
	};
	reset: <K extends FormDataKeys<TForm>>(...fields: K[]) => void;
	clearErrors: <K extends FormDataKeys<TForm>>(...fields: K[]) => void;
	resetAndClearErrors: <K extends FormDataKeys<TForm>>(...fields: K[]) => void;
	setError: {
		<K extends FormDataKeys<TForm>>(field: K, value: ErrorValue): void;
		(errors: FormDataErrors<TForm>): void;
	};
	withPrecognition: (...args: UseFormWithPrecognitionArguments) => FormStateWithPrecognition<TForm>;
}

export interface FormStateValidationProps<TForm extends object> {
	invalid: <K extends FormDataKeys<TForm>>(field: K) => boolean;
	setValidationTimeout: (duration: number) => FormStateWithPrecognition<TForm>;
	touch: <K extends FormDataKeys<TForm>>(
		field: K | NamedInputEvent | Array<K>,
		...fields: K[]
	) => FormStateWithPrecognition<TForm>;
	touched: <K extends FormDataKeys<TForm>>(field?: K) => boolean;
	valid: <K extends FormDataKeys<TForm>>(field: K) => boolean;
	validate: <K extends FormDataKeys<TForm>>(
		field?: K | NamedInputEvent | PrecognitionValidationConfig<K>,
		config?: PrecognitionValidationConfig<K>,
	) => FormStateWithPrecognition<TForm>;
	validateFiles: () => FormStateWithPrecognition<TForm>;
	validating: boolean;
	validator: () => Validator;
	withAllErrors: () => FormStateWithPrecognition<TForm>;
	withoutFileValidation: () => FormStateWithPrecognition<TForm>;
	setErrors: (errors: FormDataErrors<TForm>) => FormStateWithPrecognition<TForm>;
	forgetError: <K extends FormDataKeys<TForm> | NamedInputEvent>(
		field: K,
	) => FormStateWithPrecognition<TForm>;
}

export type FormState<TForm extends object> = FormStateProps<TForm>;
export type FormStateWithPrecognition<TForm extends object> = FormStateProps<TForm> &
	FormStateValidationProps<TForm>;

export interface UseFormStateOptions<TForm extends object> {
	data: TForm | (() => TForm);
	precognitionEndpoint?: (() => UrlMethodPair) | null;
	useDataState?: () => [TForm, StateSetter<TForm>];
	useErrorsState?: () => [FormDataErrors<TForm>, StateSetter<FormDataErrors<TForm>>];
}

export interface UseFormStateReturn<TForm extends object> {
	form: FormState<TForm>;
	setDefaultsState: StateSetter<TForm>;
	transformRef: MutableRefObject<UseFormTransformCallback<TForm>>;
	precognitionEndpointRef: MutableRefObject<(() => UrlMethodPair) | null>;
	dataRef: MutableRefObject<TForm>;
	isMounted: MutableRefObject<boolean>;
	setProcessing: StateSetter<boolean>;
	setProgress: StateSetter<Progress | null>;
	markAsSuccessful: () => void;
	clearErrors: (...fields: string[]) => void;
	setError: (
		fieldOrFields: FormDataKeys<TForm> | FormDataErrors<TForm>,
		maybeValue?: ErrorValue,
	) => void;
	defaultsCalledInOnSuccessRef: MutableRefObject<boolean>;
	resetBeforeSubmit: () => void;
	finishProcessing: () => void;
	withAllErrors: { enabled: () => boolean; enable: () => void };
}

export default function useFormState<TForm extends object>(
	options: UseFormStateOptions<TForm>,
): UseFormStateReturn<TForm> {
	const { data: dataOption, useDataState, useErrorsState } = options;

	const isDataFunction = typeof dataOption === 'function';
	const resolveData = () => (isDataFunction ? (dataOption as () => TForm)() : dataOption);

	const initialData = cloneDeep(resolveData());

	const isMounted = useRef(false, slots.isMounted);
	const precognitionEndpointRef = useRef(
		options.precognitionEndpoint ?? null,
		slots.precognitionEndpoint,
	);

	const [defaults, setDefaultsState] = useState(cloneDeep(initialData), slots.defaults);

	const localDataState = useState(cloneDeep(initialData), slots.data);
	const localErrorsState = useState({} as FormDataErrors<TForm>, slots.errors);
	const [data, setData] = useDataState?.() ?? localDataState;
	const [errors, setErrors] = useErrorsState?.() ?? localErrorsState;
	const [processing, setProcessing] = useState(false, slots.processing);
	const [progress, setProgress] = useState<Progress | null>(null, slots.progress);
	const [wasSuccessful, setWasSuccessful] = useState(false, slots.wasSuccessful);
	const [recentlySuccessful, setRecentlySuccessful] = useState(false, slots.recentlySuccessful);

	const recentlySuccessfulTimeoutId = useRef<number | undefined>(
		undefined,
		slots.recentlySuccessfulTimeout,
	);
	const transformRef = useRef<UseFormTransformCallback<TForm>>((data) => data, slots.transform);
	const defaultsCalledInOnSuccessRef = useRef(false, slots.defaultsCalledInOnSuccess);

	const validatorRef = useRef<Validator | null>(null, slots.validator);
	const [validating, setValidating] = useState(false, slots.validating);
	const [touchedFields, setTouchedFields] = useState<string[]>([], slots.touchedFields);
	const [validFields, setValidFields] = useState<string[]>([], slots.validFields);
	const withAllErrorsRef = useRef<boolean | null>(null, slots.withAllErrors);
	const withAllErrorsEnabled = () => withAllErrorsRef.current ?? config.get('form.withAllErrors');

	const dataRef = useRef(data, slots.dataRef);

	useEffect(
		() => {
			dataRef.current = data;
		},
		undefined,
		slots.syncDataRef,
	);

	useEffect(
		() => {
			isMounted.current = true;
			return () => {
				isMounted.current = false;
			};
		},
		[],
		slots.mountedEffect,
	);

	const commitData = useCallback(
		(next: TForm) => {
			dataRef.current = next;
			setData(next);
		},
		[setData],
		slots.commitData,
	);

	const setDataFunction = useCallback(
		(keyOrData: FormDataKeys<TForm> | Function | Partial<TForm>, maybeValue?: any) => {
			if (typeof keyOrData === 'string') {
				commitData(set(cloneDeep(dataRef.current), keyOrData, maybeValue));
			} else if (typeof keyOrData === 'function') {
				commitData(keyOrData(dataRef.current));
			} else {
				commitData(keyOrData as TForm);
			}
		},
		[commitData],
		slots.setData,
	);

	const setDefaultsFunction = useCallback(
		(fieldOrFields?: FormDataKeys<TForm> | Partial<TForm>, maybeValue?: unknown) => {
			if (isDataFunction) {
				throw new Error(
					'You cannot call `defaults()` when using a function to define your form data.',
				);
			}

			defaultsCalledInOnSuccessRef.current = true;

			let newDefaults = {} as TForm;

			if (typeof fieldOrFields === 'undefined') {
				newDefaults = { ...dataRef.current };
				setDefaultsState(dataRef.current);
			} else {
				setDefaultsState((defaults) => {
					newDefaults =
						typeof fieldOrFields === 'string'
							? set(cloneDeep(defaults), fieldOrFields, maybeValue)
							: Object.assign(cloneDeep(defaults), fieldOrFields);

					return newDefaults as TForm;
				});
			}

			validatorRef.current?.defaults(newDefaults as Record<string, unknown>);
		},
		[setDefaultsState],
		slots.setDefaults,
	);

	const reset = useCallback(
		(...fields: string[]) => {
			const resolvedData = isDataFunction ? cloneDeep(resolveData()) : defaults;
			const clonedData = cloneDeep(resolvedData);

			if (fields.length === 0) {
				if (isDataFunction) {
					setDefaultsState(clonedData);
				}
				commitData(clonedData);
			} else {
				if (isDataFunction) {
					setDefaultsState((currentDefaults) => {
						const newDefaults = cloneDeep(currentDefaults);
						(fields as Array<FormDataKeys<TForm>>)
							.filter((key) => has(clonedData, key))
							.forEach((key) => {
								set(newDefaults, key, get(clonedData, key));
							});
						return newDefaults;
					});
				}

				const next = (fields as Array<FormDataKeys<TForm>>)
					.filter((key) => has(clonedData, key))
					.reduce(
						(carry, key) => {
							return set(carry, key, get(clonedData, key));
						},
						{ ...dataRef.current } as TForm,
					);
				commitData(next);
			}

			validatorRef.current?.reset(...fields);
		},
		[commitData, defaults],
		slots.reset,
	);

	const setError = useCallback(
		(fieldOrFields: FormDataKeys<TForm> | FormDataErrors<TForm>, maybeValue?: ErrorValue) => {
			setErrors((errors) => {
				const newErrors = {
					...errors,
					...(typeof fieldOrFields === 'string' ? { [fieldOrFields]: maybeValue } : fieldOrFields),
				};

				validatorRef.current?.setErrors(newErrors);

				return newErrors;
			});
		},
		[setErrors],
		slots.setError,
	);

	const clearErrors = useCallback(
		(...fields: string[]) => {
			setErrors((errors) => {
				const newErrors = Object.keys(errors).reduce(
					(carry, field) => ({
						...carry,
						...(fields.length > 0 && !fields.includes(field)
							? { [field]: (errors as Errors)[field] }
							: {}),
					}),
					{},
				);

				if (validatorRef.current) {
					if (fields.length === 0) {
						validatorRef.current.setErrors({});
					} else {
						fields.forEach(validatorRef.current.forgetError);
					}
				}

				return newErrors as FormDataErrors<TForm>;
			});
		},
		[setErrors],
		slots.clearErrors,
	);

	const resetAndClearErrors = useCallback(
		(...fields: string[]) => {
			reset(...fields);
			clearErrors(...fields);
		},
		[reset, clearErrors],
		slots.resetAndClearErrors,
	);

	const markAsSuccessful = useCallback(
		() => {
			clearErrors();
			setWasSuccessful(true);
			setRecentlySuccessful(true);

			recentlySuccessfulTimeoutId.current = window.setTimeout(() => {
				if (isMounted.current) {
					setRecentlySuccessful(false);
				}
			}, config.get('form.recentlySuccessfulDuration'));
		},
		[clearErrors, setWasSuccessful, setRecentlySuccessful],
		slots.markAsSuccessful,
	);

	const resetBeforeSubmit = useCallback(
		() => {
			setWasSuccessful(false);
			setRecentlySuccessful(false);
			clearTimeout(recentlySuccessfulTimeoutId.current);
		},
		[setWasSuccessful, setRecentlySuccessful],
		slots.resetBeforeSubmit,
	);

	const finishProcessing = useCallback(
		() => {
			setProcessing(false);
			setProgress(null);
		},
		[setProcessing, setProgress],
		slots.finishProcessing,
	);

	const transformFunction = useCallback(
		(callback: UseFormTransformCallback<TForm>) => {
			transformRef.current = callback;
		},
		[],
		slots.transformFunction,
	);

	const tap = <T>(value: T, callback: (value: T) => unknown): T => {
		callback(value);
		return value;
	};

	const valid = useCallback(
		<K extends FormDataKeys<TForm>>(field: K) => validFields.includes(field as string),
		[validFields],
		slots.valid,
	);

	const invalid = useCallback(
		<K extends FormDataKeys<TForm>>(field: K) => field in errors,
		[errors],
		slots.invalid,
	);

	const touched = useCallback(
		<K extends FormDataKeys<TForm>>(field?: K) =>
			typeof field === 'string'
				? touchedFields.includes(field as string)
				: touchedFields.length > 0,
		[touchedFields],
		slots.touched,
	);

	const form = {
		data,
		isDirty: !isEqual(data, defaults),
		errors,
		hasErrors: Object.keys(errors).length > 0,
		processing,
		progress,
		wasSuccessful,
		recentlySuccessful,
		setData: setDataFunction,
		transform: transformFunction,
		setDefaults: setDefaultsFunction,
		reset,
		setError,
		clearErrors,
		resetAndClearErrors,
	} as FormState<TForm>;

	const validate = (
		field?: string | NamedInputEvent | ValidationConfig,
		config?: ValidationConfig,
	) => {
		if (typeof field === 'object' && !('target' in field)) {
			config = field;
			field = undefined;
		}

		if (field === undefined) {
			validatorRef.current!.validate(config);
		} else {
			const fieldName = resolveName(field);
			const transformedData = transformRef.current(dataRef.current) as Record<string, unknown>;
			validatorRef.current!.validate(fieldName, get(transformedData, fieldName), config);
		}

		return form;
	};

	const withPrecognition = (
		...args: UseFormWithPrecognitionArguments
	): FormStateWithPrecognition<TForm> => {
		precognitionEndpointRef.current = UseFormUtils.createWayfinderCallback(...args);

		if (!validatorRef.current) {
			const validator = createValidator(
				(client) => {
					const { method, url } = precognitionEndpointRef.current!();
					const currentData = dataRef.current;
					const transformedData = transformRef.current(currentData) as Record<string, unknown>;
					return client[method](url, transformedData);
				},
				cloneDeep(defaults as Record<string, unknown>),
			);

			validatorRef.current = validator;

			validator
				.on('validatingChanged', () => {
					setValidating(validator.validating());
				})
				.on('validatedChanged', () => {
					setValidFields(validator.valid());
				})
				.on('touchedChanged', () => {
					setTouchedFields(validator.touched());
				})
				.on('errorsChanged', () => {
					const validationErrors = withAllErrorsEnabled()
						? validator.errors()
						: toSimpleValidationErrors(validator.errors());

					setErrors(validationErrors as FormDataErrors<TForm>);
					setValidFields(validator.valid());
				});
		}

		const precognitiveForm = Object.assign(form, {
			validating,
			validator: () => validatorRef.current!,
			valid,
			invalid,
			touched,
			withoutFileValidation: () =>
				tap(precognitiveForm, () => validatorRef.current?.withoutFileValidation()),
			touch: (
				field: FormDataKeys<TForm> | NamedInputEvent | Array<FormDataKeys<TForm>>,
				...fields: FormDataKeys<TForm>[]
			) => {
				if (Array.isArray(field)) {
					validatorRef.current?.touch(field);
				} else if (typeof field === 'string') {
					validatorRef.current?.touch([field, ...fields]);
				} else {
					validatorRef.current?.touch(field);
				}

				return precognitiveForm;
			},
			withAllErrors: () => tap(precognitiveForm, () => (withAllErrorsRef.current = true)),
			setValidationTimeout: (duration: number) =>
				tap(precognitiveForm, () => validatorRef.current?.setTimeout(duration)),
			validateFiles: () => tap(precognitiveForm, () => validatorRef.current?.validateFiles()),
			validate,
			setErrors: (errors: FormDataErrors<TForm>) =>
				tap(precognitiveForm, () => form.setError(errors)),
			forgetError: (field: FormDataKeys<TForm> | NamedInputEvent) =>
				tap(precognitiveForm, () =>
					form.clearErrors(resolveName(field as string | NamedInputEvent) as FormDataKeys<TForm>),
				),
		}) as FormStateWithPrecognition<TForm>;

		return precognitiveForm;
	};

	form.withPrecognition = withPrecognition;

	if (precognitionEndpointRef.current) {
		form.withPrecognition(precognitionEndpointRef.current);
	}

	return {
		form,
		setDefaultsState,
		transformRef,
		precognitionEndpointRef,
		dataRef,
		isMounted,
		setProcessing,
		setProgress,
		markAsSuccessful,
		clearErrors,
		setError,
		defaultsCalledInOnSuccessRef,
		resetBeforeSubmit,
		finishProcessing,
		withAllErrors: {
			enabled: withAllErrorsEnabled,
			enable: () => {
				withAllErrorsRef.current = true;
			},
		},
	};
}
