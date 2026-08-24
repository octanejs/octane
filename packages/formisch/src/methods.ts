import type { InferInput } from 'valibot';
import {
	arrayIds,
	cloneValue,
	deepEqual,
	deepErrorEntries,
	dirtyAt,
	emit,
	errorsAt,
	getAtPath,
	internal,
	pathKey,
	setAtPath,
	setFieldValue,
	validAt,
	validateStore,
} from './store.js';
import type {
	DeepErrorEntry,
	ErrorList,
	FocusFieldConfig,
	FormSchema,
	FormStore,
	InsertConfig,
	MoveConfig,
	Path,
	PickDirtyConfig,
	RemoveConfig,
	ReplaceConfig,
	ResetFieldConfig,
	ResetFormConfig,
	SetFieldErrorsConfig,
	SetFieldInputConfig,
	SetFormErrorsConfig,
	SetFormInputConfig,
	SubmitEventHandler,
	SubmitHandler,
	SwapConfig,
	ValidateFormConfig,
} from './types.js';

function configPath(config?: { path?: Path }): Path {
	return config?.path ?? [];
}

export function getInput<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): unknown {
	return getAtPath(internal(form).input, configPath(config));
}

export function setInput<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: SetFormInputConfig<InferInput<TSchema>> | SetFieldInputConfig,
): void {
	const path = 'path' in config ? config.path : [];
	setFieldValue(form, path, config.input);
}

export function getErrors<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): ErrorList {
	return errorsAt(form, configPath(config));
}

export function setErrors<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: SetFormErrorsConfig | SetFieldErrorsConfig,
): void {
	const state = internal(form);
	const key = pathKey('path' in config ? config.path : []);
	if (config.errors) state.errors.set(key, [...config.errors] as [string, ...string[]]);
	else state.errors.delete(key);
	emit(state as never);
}

export function getDeepErrorEntries<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): DeepErrorEntry[] {
	return deepErrorEntries(form, configPath(config));
}

export function getDeepErrors<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): string[] {
	return getDeepErrorEntries(form, config).flatMap((entry) => entry.errors);
}

export function getDeepErrorEntry<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): DeepErrorEntry | null {
	return getDeepErrorEntries(form, config)[0] ?? null;
}

export function getDeepError<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): string | null {
	return getDeepErrorEntry(form, config)?.errors[0] ?? null;
}

function collectDirty(input: unknown, initial: unknown, path: Path, result: Path[]): void {
	if (deepEqual(input, initial)) return;
	if (
		input &&
		initial &&
		typeof input === 'object' &&
		typeof initial === 'object' &&
		!(input instanceof Date) &&
		!(initial instanceof Date)
	) {
		const keys = new Set([...Reflect.ownKeys(input), ...Reflect.ownKeys(initial)]);
		for (const key of keys) {
			if (typeof key !== 'string') continue;
			const normalized = Array.isArray(input) || Array.isArray(initial) ? Number(key) : key;
			collectDirty(
				(input as Record<string, unknown>)[key],
				(initial as Record<string, unknown>)[key],
				[...path, normalized],
				result,
			);
		}
		return;
	}
	result.push(path);
}

export function getDirtyPaths<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): Path[] {
	const state = internal(form);
	const path = configPath(config);
	const output: Path[] = [];
	collectDirty(getAtPath(state.input, path), getAtPath(state.initialInput, path), path, output);
	return output;
}

function dirtySubset(input: unknown, initial: unknown): unknown {
	if (deepEqual(input, initial)) return undefined;
	if (Array.isArray(input)) {
		const output = input.map((item, index) => dirtySubset(item, (initial as unknown[])?.[index]));
		return output.some((item) => item !== undefined) ? output : undefined;
	}
	if (input && typeof input === 'object' && !(input instanceof Date)) {
		const output: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(input)) {
			const child = dirtySubset(value, (initial as Record<string, unknown> | null)?.[key]);
			if (child !== undefined) output[key] = child;
		}
		return Object.keys(output).length > 0 ? output : undefined;
	}
	return cloneValue(input);
}

export function getDirtyInput<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): unknown {
	const state = internal(form);
	const path = configPath(config);
	return dirtySubset(getAtPath(state.input, path), getAtPath(state.initialInput, path));
}

export function pickDirty<TSchema extends FormSchema, TValue>(
	form: FormStore<TSchema>,
	config: PickDirtyConfig<TValue>,
): unknown {
	const dirtyPaths = getDirtyPaths(form);
	if (dirtyPaths.length === 0) return undefined;
	let output: unknown = Array.isArray(config.input) ? [] : {};
	for (const path of dirtyPaths) {
		output = setAtPath(output, path, getAtPath(config.input, path));
	}
	return output;
}

export function isDirty<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): boolean {
	return dirtyAt(form, configPath(config));
}

export function isEdited<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): boolean {
	const state = internal(form);
	const path = configPath(config);
	if (path.length === 0) return state.edited.size > 0;
	return [...state.edited].some((key) => {
		const candidate = JSON.parse(key) as Path;
		return path.every((part, index) => candidate[index] === part);
	});
}

export function isTouched<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): boolean {
	const state = internal(form);
	const path = configPath(config);
	if (path.length === 0) return state.touched.size > 0;
	return [...state.touched].some((key) => {
		const candidate = JSON.parse(key) as Path;
		return path.every((part, index) => candidate[index] === part);
	});
}

export function isValid<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: { path?: Path },
): boolean {
	return validAt(form, configPath(config));
}

export function focus<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: FocusFieldConfig = {},
): void {
	const state = internal(form);
	const path = config.path ?? getDeepErrorEntries(form)[0]?.path;
	if (path) state.elements.get(pathKey(path))?.focus();
}

export function reset<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: ResetFormConfig<InferInput<TSchema>> | ResetFieldConfig = {},
): void {
	const state = internal(form);
	if ('path' in config) {
		const initial = config.initialInput ?? getAtPath(state.initialInput, config.path);
		state.initialInput = setAtPath(state.initialInput, config.path, initial);
		state.input = setAtPath(state.input, config.path, initial);
		const key = pathKey(config.path);
		state.errors.delete(key);
		state.touched.delete(key);
		state.edited.delete(key);
	} else {
		if (config.initialInput !== undefined) state.initialInput = cloneValue(config.initialInput);
		state.input = cloneValue(state.initialInput);
		state.errors.clear();
		state.touched.clear();
		state.edited.clear();
		state.arrayIds.clear();
		state.isSubmitted = false;
		state.validated = false;
	}
	emit(state as never);
}

export function validate<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config?: ValidateFormConfig,
) {
	return validateStore(form, config);
}

export function handleSubmit<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	handler: SubmitHandler<TSchema> | SubmitEventHandler<TSchema>,
): (event?: SubmitEvent) => Promise<void> {
	return async (event?: SubmitEvent) => {
		event?.preventDefault();
		const state = internal(form);
		state.isSubmitting = true;
		state.isSubmitted = true;
		emit(state as never);
		try {
			const result = await validateStore(form);
			if (result.success) {
				await (handler as (output: unknown, event?: SubmitEvent) => void | Promise<void>)(
					result.output,
					event,
				);
			}
		} finally {
			state.isSubmitting = false;
			emit(state as never);
		}
	};
}

export async function submit<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	handler?: SubmitHandler<TSchema>,
): Promise<void> {
	await handleSubmit(form, handler ?? (() => undefined))();
}

function arrayAt<TSchema extends FormSchema>(form: FormStore<TSchema>, path: Path): unknown[] {
	const value = getAtPath(internal(form).input, path);
	return Array.isArray(value) ? [...value] : [];
}

export function insert<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: InsertConfig,
): void {
	const array = arrayAt(form, config.path);
	const index = config.index ?? array.length;
	const state = internal(form);
	const ids = arrayIds(form, config.path, array.length);
	array.splice(index, 0, config.input);
	ids.splice(index, 0, `formisch-${state.nextId++}`);
	state.arrayIds.set(pathKey(config.path), ids);
	setFieldValue(form, config.path, array);
}

export function remove<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: RemoveConfig,
): void {
	const array = arrayAt(form, config.path);
	const state = internal(form);
	const ids = arrayIds(form, config.path, array.length);
	array.splice(config.index, 1);
	ids.splice(config.index, 1);
	state.arrayIds.set(pathKey(config.path), ids);
	setFieldValue(form, config.path, array);
}

export function replace<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: ReplaceConfig,
): void {
	const array = arrayAt(form, config.path);
	array[config.index] = config.input;
	setFieldValue(form, config.path, array);
}

export function move<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: MoveConfig,
): void {
	const array = arrayAt(form, config.path);
	const state = internal(form);
	const ids = arrayIds(form, config.path, array.length);
	const [item] = array.splice(config.from, 1);
	if (item === undefined && config.from >= array.length + 1) return;
	const [id] = ids.splice(config.from, 1);
	array.splice(config.to, 0, item);
	if (id) ids.splice(config.to, 0, id);
	state.arrayIds.set(pathKey(config.path), ids);
	setFieldValue(form, config.path, array);
}

export function swap<TSchema extends FormSchema>(
	form: FormStore<TSchema>,
	config: SwapConfig,
): void {
	const array = arrayAt(form, config.path);
	const state = internal(form);
	const ids = arrayIds(form, config.path, array.length);
	[array[config.from], array[config.to]] = [array[config.to], array[config.from]];
	[ids[config.from], ids[config.to]] = [ids[config.to]!, ids[config.from]!];
	state.arrayIds.set(pathKey(config.path), ids);
	setFieldValue(form, config.path, array);
}

export { arrayIds };
