import { safeParseAsync, type InferInput } from 'valibot';
import type {
	DeepErrorEntry,
	EmptyInput,
	ErrorList,
	FieldElement,
	FormConfig,
	FormSchema,
	FormStore,
	Path,
	PathKey,
	ValidationMode,
} from './types.js';

export interface InternalState<TSchema extends FormSchema> {
	config: FormConfig<TSchema>;
	input: unknown;
	initialInput: unknown;
	errors: Map<string, [string, ...string[]]>;
	touched: Set<string>;
	edited: Set<string>;
	validated: boolean;
	isSubmitting: boolean;
	isSubmitted: boolean;
	isValidating: boolean;
	version: number;
	listeners: Set<() => void>;
	elements: Map<string, FieldElement>;
	arrayIds: Map<string, string[]>;
	nextId: number;
}

export const FORMISCH_INTERNAL: unique symbol = Symbol('formisch.internal');
export type InternalFormStore<TSchema extends FormSchema = FormSchema> = FormStore<TSchema> & {
	readonly [FORMISCH_INTERNAL]: InternalState<TSchema>;
};

export function pathKey(path: Path = []): string {
	return JSON.stringify(path);
}

export function pathName(path: Path): string {
	return path.map(String).join('.');
}

export function cloneValue<TValue>(value: TValue): TValue {
	if (value instanceof Date) return new Date(value) as TValue;
	if (Array.isArray(value)) return value.map(cloneValue) as TValue;
	if (value && typeof value === 'object') {
		const output: Record<PropertyKey, unknown> = {};
		for (const key of Reflect.ownKeys(value)) {
			output[key] = cloneValue((value as Record<PropertyKey, unknown>)[key]);
		}
		return output as TValue;
	}
	return value;
}

export function getAtPath(value: unknown, path: Path): unknown {
	let current = value;
	for (const key of path) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<PathKey, unknown>)[key];
	}
	return current;
}

export function setAtPath(value: unknown, path: Path, nextValue: unknown): unknown {
	if (path.length === 0) return cloneValue(nextValue);
	const root = cloneValue(value ?? (typeof path[0] === 'number' ? [] : {}));
	let current = root as Record<PathKey, unknown>;
	for (let index = 0; index < path.length - 1; index += 1) {
		const key = path[index]!;
		const following = path[index + 1]!;
		const child = current[key];
		current[key] = cloneValue(child ?? (typeof following === 'number' ? [] : {}));
		current = current[key] as Record<PathKey, unknown>;
	}
	current[path[path.length - 1]!] = cloneValue(nextValue);
	return root;
}

export function deepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	const leftKeys = Reflect.ownKeys(left);
	const rightKeys = Reflect.ownKeys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every(
		(key) =>
			Reflect.has(right, key) &&
			deepEqual(
				(left as Record<PropertyKey, unknown>)[key],
				(right as Record<PropertyKey, unknown>)[key],
			),
	);
}

function schemaDefaults(schema: unknown, empty: EmptyInput): unknown {
	if (!schema || typeof schema !== 'object') return undefined;
	const candidate = schema as Record<string, unknown>;
	const type = candidate.type;
	if (type === 'optional' || type === 'nullable' || type === 'nullish') return undefined;
	if (type === 'object' && candidate.entries && typeof candidate.entries === 'object') {
		const output: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(candidate.entries)) {
			const value = schemaDefaults(entry, empty);
			if (value !== undefined) output[key] = value;
		}
		return output;
	}
	if (type === 'array') return [];
	if (type === 'tuple') return [];
	if (type === 'string') return empty.string;
	if (type === 'number') return empty.number;
	if (type === 'boolean') return empty.boolean;
	if (type === 'date') return empty.date;
	if ('wrapped' in candidate) return schemaDefaults(candidate.wrapped, empty);
	return undefined;
}

function mergeValues(defaults: unknown, provided: unknown): unknown {
	if (provided === undefined) return cloneValue(defaults);
	if (
		defaults &&
		provided &&
		typeof defaults === 'object' &&
		typeof provided === 'object' &&
		!Array.isArray(defaults) &&
		!Array.isArray(provided) &&
		!(defaults instanceof Date) &&
		!(provided instanceof Date)
	) {
		const output = cloneValue(defaults) as Record<string, unknown>;
		for (const [key, value] of Object.entries(provided)) {
			output[key] = mergeValues(output[key], value);
		}
		return output;
	}
	return cloneValue(provided);
}

export function internal<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
): InternalState<TSchema> {
	return (store as InternalFormStore<TSchema>)[FORMISCH_INTERNAL];
}

export function emit(state: InternalState<FormSchema>): void {
	state.version += 1;
	for (const listener of state.listeners) listener();
}

export function subscribe<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	listener: () => void,
): () => void {
	const state = internal(store);
	state.listeners.add(listener);
	return () => state.listeners.delete(listener);
}

export function snapshot<TSchema extends FormSchema>(store: FormStore<TSchema>): number {
	return internal(store).version;
}

function keysBelow(state: InternalState<FormSchema>, path: Path): string[] {
	const prefix = path;
	return [...state.errors.keys()].filter((key) => {
		const parsed = JSON.parse(key) as Path;
		return prefix.every((part, index) => parsed[index] === part);
	});
}

export function errorsAt<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path = [],
): ErrorList {
	return internal(store).errors.get(pathKey(path)) ?? null;
}

export function deepErrorEntries<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path = [],
): DeepErrorEntry[] {
	const state = internal(store);
	return keysBelow(state as InternalState<FormSchema>, path).map((key) => ({
		path: JSON.parse(key) as Path,
		errors: state.errors.get(key)!,
	}));
}

export function anyMarked(set: Set<string>, path: Path): boolean {
	if (path.length === 0) return set.size > 0;
	const exact = pathKey(path);
	if (set.has(exact)) return true;
	return [...set].some((key) => {
		const candidate = JSON.parse(key) as Path;
		return path.every((part, index) => candidate[index] === part);
	});
}

export function dirtyAt<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path,
): boolean {
	const state = internal(store);
	return !deepEqual(getAtPath(state.input, path), getAtPath(state.initialInput, path));
}

export function validAt<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path,
): boolean {
	return deepErrorEntries(store, path).length === 0;
}

function formErrors<TSchema extends FormSchema>(store: FormStore<TSchema>): ErrorList {
	return errorsAt(store, []);
}

export function createFormStore<TSchema extends FormSchema>(
	config: FormConfig<TSchema>,
): InternalFormStore<TSchema> {
	const defaults = schemaDefaults(config.schema, { string: '', ...config.emptyInput });
	const initialInput = mergeValues(defaults, config.initialInput);
	const state: InternalState<TSchema> = {
		config,
		input: cloneValue(initialInput),
		initialInput,
		errors: new Map(),
		touched: new Set(),
		edited: new Set(),
		validated: false,
		isSubmitting: false,
		isSubmitted: false,
		isValidating: false,
		version: 0,
		listeners: new Set(),
		elements: new Map(),
		arrayIds: new Map(),
		nextId: 0,
	};
	const store = {} as InternalFormStore<TSchema>;
	Object.defineProperty(store, FORMISCH_INTERNAL, { value: state });
	Object.defineProperties(store, {
		isSubmitting: { enumerable: true, get: () => state.isSubmitting },
		isSubmitted: { enumerable: true, get: () => state.isSubmitted },
		isValidating: { enumerable: true, get: () => state.isValidating },
		isTouched: { enumerable: true, get: () => state.touched.size > 0 },
		isEdited: { enumerable: true, get: () => state.edited.size > 0 },
		isDirty: { enumerable: true, get: () => !deepEqual(state.input, state.initialInput) },
		isValid: { enumerable: true, get: () => state.errors.size === 0 },
		errors: { enumerable: true, get: () => formErrors(store) },
	});
	return store;
}

function issuePath(issue: unknown): Path {
	if (!issue || typeof issue !== 'object') return [];
	const path = (issue as { path?: unknown }).path;
	if (!Array.isArray(path)) return [];
	return path.flatMap((item) => {
		if (!item || typeof item !== 'object' || !('key' in item)) return [];
		const key = (item as { key: unknown }).key;
		return typeof key === 'string' || typeof key === 'number' ? [key] : [];
	});
}

export async function validateStore<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	options: { focus?: boolean } = {},
) {
	const state = internal(store);
	state.isValidating = true;
	emit(state as InternalState<FormSchema>);
	const result = await safeParseAsync(state.config.schema, state.input);
	state.errors.clear();
	if (!result.success) {
		for (const issue of result.issues) {
			const key = pathKey(issuePath(issue));
			const current = state.errors.get(key);
			const message = String(issue.message);
			if (current) current.push(message);
			else state.errors.set(key, [message]);
		}
	}
	state.validated = true;
	state.isValidating = false;
	emit(state as InternalState<FormSchema>);
	if (!result.success && options.focus !== false) {
		const first = deepErrorEntries(store)[0];
		if (first) state.elements.get(pathKey(first.path))?.focus();
	}
	return result;
}

export function shouldValidate<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	mode: Exclude<ValidationMode, 'initial' | 'submit'>,
): boolean {
	const state = internal(store);
	const expected = state.validated
		? (state.config.revalidate ?? 'input')
		: (state.config.validate ?? 'submit');
	return expected === mode;
}

export function setFieldValue<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path,
	value: unknown,
	mode: 'input' | 'change' = 'input',
): void {
	const state = internal(store);
	state.input = setAtPath(state.input, path, value);
	state.edited.add(pathKey(path));
	emit(state as InternalState<FormSchema>);
	if (shouldValidate(store, mode)) void validateStore(store, { focus: false });
}

export function elementValue(event: Event): unknown {
	const target = event.currentTarget ?? event.target;
	if (!(
		target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement
	)) {
		return undefined;
	}
	if (target instanceof HTMLInputElement && target.type === 'checkbox') return target.checked;
	if (target instanceof HTMLInputElement && target.type === 'file') return target.files;
	if (target instanceof HTMLSelectElement && target.multiple) {
		return [...target.selectedOptions].map((option) => option.value);
	}
	return target.value;
}

export function arrayIds<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path,
	length: number,
): string[] {
	const state = internal(store);
	const key = pathKey(path);
	const ids = state.arrayIds.get(key) ?? [];
	while (ids.length < length) ids.push(`formisch-${state.nextId++}`);
	if (ids.length > length) ids.length = length;
	state.arrayIds.set(key, ids);
	return [...ids];
}

export function updateArrayIds<TSchema extends FormSchema>(
	store: FormStore<TSchema>,
	path: Path,
	update: (ids: string[], state: InternalState<TSchema>) => void,
): void {
	const state = internal(store);
	const key = pathKey(path);
	const input = getAtPath(state.input, path);
	const ids = arrayIds(store, path, Array.isArray(input) ? input.length : 0);
	update(ids, state);
	state.arrayIds.set(key, ids);
}

export type FormInput<TSchema extends FormSchema> = InferInput<TSchema>;
