/**
 * Framework-neutral values shared by Octane's Lynx worklet compiler and the
 * two runtime layers. The wire shapes deliberately match the public Lynx
 * worklet envelope, while lifetime ownership remains Octane-controlled.
 */

export type LynxThreadFunctionKind = 'main-thread' | 'background';

export interface LynxThreadFunctionSource {
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
}

export type LynxThreadFunctionSourceLike = string | LynxThreadFunctionSource;

export interface LynxMainThreadWorkletDescriptor {
	readonly _wkltId: string;
	readonly _c?: LynxWorkletRecord;
	/** Main-local activation. The compiler never authors this field. */
	readonly _owlt?: number;
}

export interface LynxMainThreadRefDescriptor {
	readonly _wvid: string;
	/** Octane-only initializer. Activated descriptors strip it before reaching Element PAPI. */
	readonly _initValue?: LynxWorkletValue;
}

export interface LynxBackgroundFunctionDescriptor {
	readonly _jsFnId: string;
	/** Background-registry execution lifetime. */
	readonly _execId?: string;
	/** Isolated local capture payload. The registry owns the authoritative copy. */
	readonly _c?: LynxWorkletRecord;
}

export type LynxWorkletPrimitive = null | undefined | string | boolean | number | bigint;

export interface LynxWorkletRecord {
	readonly [name: string]: LynxWorkletValue;
}

export type LynxWorkletValue =
	| LynxWorkletPrimitive
	| LynxMainThreadWorkletDescriptor
	| LynxMainThreadRefDescriptor
	| LynxBackgroundFunctionDescriptor
	| LynxWorkletRecord
	| readonly LynxWorkletValue[];

export interface LynxMainThreadRefCell<T = unknown> {
	readonly _wvid: string;
	current: T;
}

export interface LynxActivatedMainThreadWorklet extends LynxMainThreadWorkletDescriptor {
	readonly _owlt: number;
}

export type LynxMainThreadWorkletImplementation = (
	this: LynxMainThreadWorkletDescriptor,
	...args: unknown[]
) => unknown;

export type LynxBackgroundFunctionImplementation = (
	this: LynxBackgroundFunctionDescriptor & { readonly _c?: LynxWorkletRecord },
	...args: unknown[]
) => unknown;

export type LynxCompiledThreadFunctionImplementation = (
	captures: readonly unknown[],
	receiver: unknown,
	args: readonly unknown[],
) => unknown;

interface MainDefinition {
	readonly implementation: LynxMainThreadWorkletImplementation;
	readonly revision: number;
	readonly source?: LynxThreadFunctionSourceLike;
}

interface BackgroundDefinition {
	readonly implementation: LynxBackgroundFunctionImplementation;
	readonly revision: number;
	readonly source?: LynxThreadFunctionSourceLike;
}

const mainDefinitions = new Map<string, MainDefinition>();
const backgroundDefinitions = new Map<string, BackgroundDefinition>();
const compiledMainDefinitions = new Map<string, LynxCompiledThreadFunctionImplementation>();
const compiledBackgroundDefinitions = new Map<string, LynxCompiledThreadFunctionImplementation>();
let nextDefinitionRevision = 1;

function fail(label: string, message: string): never {
	throw new TypeError(`Octane Lynx ${label}: ${message}`);
}

function own(value: object, name: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, name);
}

function assertId(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		fail(label, 'must be a non-empty string.');
	}
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		fail(label, 'must be a positive safe integer.');
	}
}

function sourceLabel(source: LynxThreadFunctionSourceLike | undefined): string {
	if (source === undefined) return '';
	if (typeof source === 'string') return source.length === 0 ? '' : ` at ${source}`;
	const file = source.file ?? '<unknown>';
	const line = source.line === undefined ? '' : `:${source.line}`;
	const column = source.column === undefined ? '' : `:${source.column}`;
	return ` at ${file}${line}${column}`;
}

function assertSource(source: LynxThreadFunctionSourceLike | undefined, label: string): void {
	if (source === undefined || typeof source === 'string') return;
	if (source === null || typeof source !== 'object' || Array.isArray(source)) {
		fail(label, 'must be a string or source location.');
	}
	for (const key of Object.keys(source)) {
		if (key !== 'file' && key !== 'line' && key !== 'column') {
			fail(label, `contains unknown field ${JSON.stringify(key)}.`);
		}
	}
	if (source.file !== undefined && (typeof source.file !== 'string' || source.file.length === 0)) {
		fail(`${label}.file`, 'must be a non-empty string.');
	}
	if (source.line !== undefined && (!Number.isSafeInteger(source.line) || source.line <= 0)) {
		fail(`${label}.line`, 'must be a positive safe integer.');
	}
	if (source.column !== undefined && (!Number.isSafeInteger(source.column) || source.column < 0)) {
		fail(`${label}.column`, 'must be a non-negative safe integer.');
	}
}

function ownEnumerableDataKeys(value: object, label: string): readonly string[] {
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		fail(label, 'contains symbol fields.');
	}
	const keys = Object.getOwnPropertyNames(value);
	for (const key of keys) {
		if (Array.isArray(value) && key === 'length') continue;
		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
		if (!descriptor.enumerable) fail(`${label}.${key}`, 'must be enumerable.');
		if (!own(descriptor, 'value')) fail(`${label}.${key}`, 'must not be an accessor.');
	}
	return keys;
}

function exactKeys(value: object, keys: readonly string[], label: string): void {
	const actual = ownEnumerableDataKeys(value, label);
	for (const key of actual) {
		if (!keys.includes(key)) fail(label, `contains unknown field ${JSON.stringify(key)}.`);
	}
}

function isPlainRecord(value: object): value is Record<string, unknown> {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function setOwnDataProperty<T extends object>(target: T, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

function sameCloneSafeValue(
	first: LynxWorkletValue,
	second: LynxWorkletValue,
	firstToSecond = new Map<object, object>(),
	secondToFirst = new Map<object, object>(),
): boolean {
	if (Object.is(first, second)) return true;
	if (
		first === null ||
		second === null ||
		typeof first !== 'object' ||
		typeof second !== 'object'
	) {
		return false;
	}
	const mappedSecond = firstToSecond.get(first);
	if (mappedSecond !== undefined) return mappedSecond === second;
	if (secondToFirst.has(second)) return false;
	if (Array.isArray(first) !== Array.isArray(second)) return false;
	if (Object.getPrototypeOf(first) !== Object.getPrototypeOf(second)) return false;
	firstToSecond.set(first, second);
	secondToFirst.set(second, first);
	if (Array.isArray(first) && Array.isArray(second)) {
		if (first.length !== second.length) return false;
		for (let index = 0; index < first.length; index++) {
			if (!sameCloneSafeValue(first[index]!, second[index]!, firstToSecond, secondToFirst)) {
				return false;
			}
		}
		return true;
	}
	const firstRecord = first as LynxWorkletRecord;
	const secondRecord = second as LynxWorkletRecord;
	const firstKeys = Object.keys(firstRecord);
	const secondKeys = Object.keys(secondRecord);
	if (firstKeys.length !== secondKeys.length) return false;
	for (const key of firstKeys) {
		if (
			!own(secondRecord, key) ||
			!sameCloneSafeValue(firstRecord[key], secondRecord[key], firstToSecond, secondToFirst)
		) {
			return false;
		}
	}
	return true;
}

function markerCount(value: object): number {
	return (
		Number(own(value, '_wkltId')) + Number(own(value, '_wvid')) + Number(own(value, '_jsFnId'))
	);
}

interface CloneState {
	readonly active: Set<object>;
	readonly clones: Map<object, LynxWorkletValue>;
}

function cloneValue(value: unknown, label: string, state: CloneState): LynxWorkletValue {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return value;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) fail(label, 'contains a non-finite number.');
		return value;
	}
	if (typeof value !== 'object') fail(label, 'contains a non-clone-safe value.');
	if (state.active.has(value)) fail(label, 'contains a cycle.');
	const existing = state.clones.get(value);
	if (existing !== undefined) return existing;

	state.active.add(value);
	try {
		if (Array.isArray(value)) {
			const keys = ownEnumerableDataKeys(value, label);
			if (keys.length !== value.length + 1)
				fail(label, 'must be a dense array without extra fields.');
			const clone: LynxWorkletValue[] = [];
			state.clones.set(value, clone);
			for (let index = 0; index < value.length; index++) {
				if (!own(value, String(index))) fail(`${label}[${index}]`, 'is a sparse array hole.');
				clone.push(cloneValue(value[index], `${label}[${index}]`, state));
			}
			return clone;
		}
		if (!isPlainRecord(value)) fail(label, 'requires arrays or plain objects.');
		if (markerCount(value) > 1) fail(label, 'mixes reserved worklet descriptor fields.');

		if (own(value, '_wkltId')) {
			exactKeys(value, ['_wkltId', '_c', '_owlt'], label);
			assertId(value._wkltId, `${label}._wkltId`);
			if (own(value, '_owlt')) assertPositiveInteger(value._owlt, `${label}._owlt`);
			const clone: {
				_wkltId: string;
				_c?: LynxWorkletRecord;
				_owlt?: number;
			} = { _wkltId: value._wkltId };
			state.clones.set(value, clone);
			if (own(value, '_c')) {
				if (value._c === null || typeof value._c !== 'object' || Array.isArray(value._c)) {
					fail(`${label}._c`, 'must be a plain object.');
				}
				clone._c = cloneValue(value._c, `${label}._c`, state) as LynxWorkletRecord;
			}
			if (own(value, '_owlt')) clone._owlt = value._owlt as number;
			return clone;
		}

		if (own(value, '_wvid')) {
			exactKeys(value, ['_wvid', '_initValue'], label);
			assertId(value._wvid, `${label}._wvid`);
			const clone: { _wvid: string; _initValue?: LynxWorkletValue } = { _wvid: value._wvid };
			state.clones.set(value, clone);
			if (own(value, '_initValue')) {
				clone._initValue = cloneValue(value._initValue, `${label}._initValue`, state);
			}
			return clone;
		}

		if (own(value, '_jsFnId')) {
			exactKeys(value, ['_jsFnId', '_execId', '_c'], label);
			assertId(value._jsFnId, `${label}._jsFnId`);
			if (own(value, '_execId')) assertId(value._execId, `${label}._execId`);
			if (own(value, '_c')) {
				if (value._c === null || typeof value._c !== 'object' || Array.isArray(value._c)) {
					fail(`${label}._c`, 'must be a plain object.');
				}
			}
			const clone: LynxBackgroundFunctionDescriptor = {
				_jsFnId: value._jsFnId,
				...(own(value, '_execId') ? { _execId: value._execId as string } : null),
				...(own(value, '_c')
					? { _c: cloneValue(value._c, `${label}._c`, state) as LynxWorkletRecord }
					: null),
			};
			state.clones.set(value, clone);
			return clone;
		}

		const clone: Record<string, LynxWorkletValue> =
			Object.getPrototypeOf(value) === null ? Object.create(null) : {};
		state.clones.set(value, clone);
		for (const key of ownEnumerableDataKeys(value, label)) {
			setOwnDataProperty(clone, key, cloneValue(value[key], `${label}.${key}`, state));
		}
		return clone;
	} finally {
		state.active.delete(value);
	}
}

/** Validate and copy a value at the thread-isolation boundary. */
export function isolateLynxWorkletValue<T extends LynxWorkletValue>(
	value: T,
	label = 'worklet value',
): T {
	return cloneValue(value, label, {
		active: new Set(),
		clones: new Map(),
	}) as T;
}

export function assertLynxWorkletValue(
	value: unknown,
	label = 'worklet value',
): asserts value is LynxWorkletValue {
	cloneValue(value, label, { active: new Set(), clones: new Map() });
}

export function isLynxMainThreadWorkletDescriptor(
	value: unknown,
): value is LynxMainThreadWorkletDescriptor {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!own(value, '_wkltId')
	) {
		return false;
	}
	try {
		cloneValue(value, 'main-thread worklet', { active: new Set(), clones: new Map() });
		return true;
	} catch {
		return false;
	}
}

export function isLynxMainThreadRefDescriptor(
	value: unknown,
): value is LynxMainThreadRefDescriptor {
	if (value === null || typeof value !== 'object' || Array.isArray(value) || !own(value, '_wvid')) {
		return false;
	}
	try {
		cloneValue(value, 'main-thread ref', { active: new Set(), clones: new Map() });
		return true;
	} catch {
		return false;
	}
}

export function isLynxBackgroundFunctionDescriptor(
	value: unknown,
): value is LynxBackgroundFunctionDescriptor {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		!own(value, '_jsFnId')
	) {
		return false;
	}
	try {
		cloneValue(value, 'background function', { active: new Set(), clones: new Map() });
		return true;
	} catch {
		return false;
	}
}

export function createLynxMainThreadRefDescriptor(
	id: string,
	initialValue?: unknown,
): LynxMainThreadRefDescriptor {
	assertId(id, 'main-thread ref id');
	return Object.freeze({
		_wvid: id,
		...(arguments.length < 2
			? null
			: {
					_initValue: isolateLynxWorkletValue(
						initialValue as LynxWorkletValue,
						'main-thread ref initial value',
					),
				}),
	});
}

export function registerMainThreadWorklet(
	id: string,
	captures: LynxWorkletRecord | undefined,
	implementation?: LynxMainThreadWorkletImplementation,
	source?: LynxThreadFunctionSourceLike,
): LynxMainThreadWorkletDescriptor {
	assertId(id, 'main-thread worklet id');
	assertSource(source, 'main-thread worklet source');
	if (implementation !== undefined && typeof implementation !== 'function') {
		fail('main-thread worklet implementation', 'must be a function.');
	}
	if (implementation !== undefined) {
		const current = mainDefinitions.get(id);
		if (current === undefined || current.implementation !== implementation) {
			mainDefinitions.set(id, {
				implementation,
				revision: nextDefinitionRevision++,
				...(source === undefined ? null : { source }),
			});
		}
	}
	const isolated =
		captures === undefined ? undefined : isolateLynxWorkletValue(captures, 'captures');
	return Object.freeze({
		_wkltId: id,
		...(isolated === undefined ? null : { _c: isolated }),
	});
}

export function unregisterMainThreadWorklet(id: string): void {
	assertId(id, 'main-thread worklet id');
	mainDefinitions.delete(id);
	compiledMainDefinitions.delete(id);
	nextDefinitionRevision++;
}

export function registerBackgroundFunction(
	id: string,
	implementation?: LynxBackgroundFunctionImplementation,
	source?: LynxThreadFunctionSourceLike,
): LynxBackgroundFunctionDescriptor {
	assertId(id, 'background function id');
	assertSource(source, 'background function source');
	if (implementation !== undefined && typeof implementation !== 'function') {
		fail('background function implementation', 'must be a function.');
	}
	if (implementation !== undefined) {
		const current = backgroundDefinitions.get(id);
		if (current === undefined || current.implementation !== implementation) {
			backgroundDefinitions.set(id, {
				implementation,
				revision: nextDefinitionRevision++,
				...(source === undefined ? null : { source }),
			});
		}
	}
	return Object.freeze({ _jsFnId: id });
}

export function unregisterBackgroundFunction(id: string): void {
	assertId(id, 'background function id');
	backgroundDefinitions.delete(id);
	compiledBackgroundDefinitions.delete(id);
	nextDefinitionRevision++;
}

interface MainActivation {
	readonly descriptor: LynxActivatedMainThreadWorklet;
	readonly revisions: ReadonlyMap<string, number>;
	readonly refIds: ReadonlySet<string>;
}

interface MainRefRecord {
	readonly cell: LynxMainThreadRefCell;
	hostRetains: number;
	ownerRetains: number;
	activationRetains: number;
	initialized: boolean;
}

export interface CreateLynxMainThreadWorkletRegistryOptions {
	readonly callBackground?: (
		handle: LynxBackgroundFunctionDescriptor,
		args: readonly LynxWorkletValue[],
	) => unknown;
}

export interface LynxMainThreadWorkletRegistry {
	activate(descriptor: LynxMainThreadWorkletDescriptor): LynxActivatedMainThreadWorklet;
	release(descriptorOrToken: LynxActivatedMainThreadWorklet | number): void;
	runWorklet(descriptor: LynxMainThreadWorkletDescriptor, params?: readonly unknown[]): unknown;
	beginRefOwnerPublication(): void;
	finishRefOwnerPublication(): void;
	retainRef<T>(descriptor: LynxMainThreadRefDescriptor, initialValue: T): LynxMainThreadRefCell<T>;
	updateRef<T>(descriptor: LynxMainThreadRefDescriptor, value: T): void;
	releaseRef(descriptor: LynxMainThreadRefDescriptor): void;
	retainOwner(descriptor: LynxMainThreadRefDescriptor): LynxMainThreadRefCell;
	releaseOwner(descriptor: LynxMainThreadRefDescriptor): void;
	releaseOwners(): void;
	isActive(descriptorOrToken: LynxActivatedMainThreadWorklet | number): boolean;
	close(): void;
}

export function createLynxMainThreadWorkletRegistry(
	options: CreateLynxMainThreadWorkletRegistryOptions = {},
): LynxMainThreadWorkletRegistry {
	const activations = new Map<number, MainActivation>();
	const refs = new Map<string, MainRefRecord>();
	const deferredRefCollection = new Set<string>();
	let nextActivation = 1;
	let refOwnerPublicationOpen = false;
	let closed = false;

	const requireOpen = () => {
		if (closed) throw new Error('Octane Lynx main-thread worklet registry is closed.');
	};

	const activationToken = (value: LynxActivatedMainThreadWorklet | number): number =>
		typeof value === 'number' ? value : value._owlt;

	const collectRefIfUnowned = (id: string, record: MainRefRecord): void => {
		if (record.hostRetains !== 0 || record.ownerRetains !== 0 || record.activationRetains !== 0) {
			deferredRefCollection.delete(id);
			return;
		}
		if (refOwnerPublicationOpen) {
			deferredRefCollection.add(id);
			return;
		}
		deferredRefCollection.delete(id);
		record.cell.current = null;
		refs.delete(id);
	};

	const collectMainDependencies = (
		value: LynxWorkletValue,
		revisions: Map<string, number>,
		refIds: Set<string>,
		refInitialValues: Map<string, LynxWorkletValue>,
		visited: Set<object>,
	): void => {
		if (Array.isArray(value)) {
			if (visited.has(value)) return;
			visited.add(value);
			for (const entry of value) {
				collectMainDependencies(entry, revisions, refIds, refInitialValues, visited);
			}
			return;
		}
		if (value === null || typeof value !== 'object') return;
		if (visited.has(value)) return;
		visited.add(value);
		if (isLynxMainThreadWorkletDescriptor(value)) {
			const definition = mainDefinitions.get(value._wkltId);
			if (definition === undefined) {
				throw new Error(`Octane Lynx main-thread worklet ${value._wkltId} is not registered.`);
			}
			revisions.set(value._wkltId, definition.revision);
			if (value._c !== undefined) {
				collectMainDependencies(value._c, revisions, refIds, refInitialValues, visited);
			}
			return;
		}
		if (isLynxMainThreadRefDescriptor(value)) {
			refIds.add(value._wvid);
			if (own(value, '_initValue')) {
				const initialValue = value._initValue as LynxWorkletValue;
				if (
					refInitialValues.has(value._wvid) &&
					!sameCloneSafeValue(refInitialValues.get(value._wvid)!, initialValue)
				) {
					throw new Error(
						`Octane Lynx main-thread ref ${value._wvid} has conflicting initial values.`,
					);
				}
				refInitialValues.set(value._wvid, initialValue);
			}
			return;
		}
		if (isLynxBackgroundFunctionDescriptor(value)) {
			return;
		}
		for (const entry of Object.values(value)) {
			collectMainDependencies(entry, revisions, refIds, refInitialValues, visited);
		}
	};

	const stripRefInitialValues = (value: LynxWorkletValue, visited: Set<object>): void => {
		if (value === null || typeof value !== 'object' || visited.has(value)) return;
		visited.add(value);
		if (isLynxMainThreadRefDescriptor(value)) {
			delete (value as { _initValue?: LynxWorkletValue })._initValue;
			return;
		}
		for (const entry of Object.values(value)) stripRefInitialValues(entry, visited);
	};

	const releaseActivationRefs = (refIds: ReadonlySet<string>): void => {
		for (const refId of refIds) {
			const record = refs.get(refId);
			if (record === undefined) continue;
			record.activationRetains--;
			collectRefIfUnowned(refId, record);
		}
	};

	const hydrate = (
		value: LynxWorkletValue,
		token: number,
		clones: Map<object, unknown>,
	): unknown => {
		if (value === null || typeof value !== 'object') return value;
		const existing = clones.get(value);
		if (existing !== undefined) return existing;
		if (Array.isArray(value)) {
			const clone: unknown[] = [];
			clones.set(value, clone);
			for (const entry of value) clone.push(hydrate(entry, token, clones));
			return clone;
		}
		if (isLynxMainThreadRefDescriptor(value)) {
			const cell = refs.get(value._wvid)?.cell;
			if (cell === undefined)
				throw new Error(`Octane Lynx main-thread ref ${value._wvid} is stale.`);
			clones.set(value, cell);
			return cell;
		}
		if (isLynxBackgroundFunctionDescriptor(value)) {
			if (options.callBackground === undefined) {
				throw new Error('Octane Lynx main-thread worklet has no background call bridge.');
			}
			const hydrated = (...args: unknown[]) => {
				const activation = activations.get(token);
				if (activation === undefined) {
					throw new Error('Octane Lynx main-thread worklet is stale.');
				}
				const owner = mainDefinitions.get(activation.descriptor._wkltId);
				if (
					owner === undefined ||
					activation.revisions.get(activation.descriptor._wkltId) !== owner.revision
				) {
					throw new Error(
						`Octane Lynx main-thread worklet ${activation.descriptor._wkltId} was reloaded.`,
					);
				}
				return options.callBackground!(
					value,
					isolateLynxWorkletValue(args as LynxWorkletValue[], 'background call arguments'),
				);
			};
			clones.set(value, hydrated);
			return hydrated;
		}
		if (isLynxMainThreadWorkletDescriptor(value)) {
			const hydrated = (...args: unknown[]) => execute(value, token, args);
			clones.set(value, hydrated);
			return hydrated;
		}
		const record = value as LynxWorkletRecord;
		const clone: Record<string, unknown> =
			Object.getPrototypeOf(record) === null ? Object.create(null) : {};
		clones.set(value, clone);
		for (const key of Object.keys(record)) {
			setOwnDataProperty(clone, key, hydrate(record[key], token, clones));
		}
		return clone;
	};

	const execute = (
		descriptor: LynxMainThreadWorkletDescriptor,
		token: number,
		params: readonly unknown[],
	): unknown => {
		const activation = activations.get(token);
		if (activation === undefined) throw new Error('Octane Lynx main-thread worklet is stale.');
		const definition = mainDefinitions.get(descriptor._wkltId);
		if (definition === undefined) {
			throw new Error(`Octane Lynx main-thread worklet ${descriptor._wkltId} is not registered.`);
		}
		const revision = activation.revisions.get(descriptor._wkltId);
		if (revision === undefined) {
			throw new Error(`Octane Lynx main-thread worklet ${descriptor._wkltId} is foreign.`);
		}
		if (definition.revision !== revision) {
			throw new Error(`Octane Lynx main-thread worklet ${descriptor._wkltId} was reloaded.`);
		}
		const captures =
			descriptor._c === undefined ? undefined : hydrate(descriptor._c, token, new Map());
		const receiver: LynxMainThreadWorkletDescriptor = {
			_wkltId: descriptor._wkltId,
			...(captures === undefined ? null : { _c: captures as LynxWorkletRecord }),
			_owlt: token,
		};
		const args = isolateLynxWorkletValue(params as LynxWorkletValue[], 'worklet arguments');
		return definition.implementation.apply(receiver, args);
	};

	return {
		beginRefOwnerPublication() {
			requireOpen();
			if (refOwnerPublicationOpen) {
				throw new Error('Octane Lynx main-thread ref owner publication is already open.');
			}
			refOwnerPublicationOpen = true;
		},
		finishRefOwnerPublication() {
			requireOpen();
			if (!refOwnerPublicationOpen) {
				throw new Error('Octane Lynx main-thread ref owner publication is not open.');
			}
			refOwnerPublicationOpen = false;
			for (const id of deferredRefCollection) {
				const record = refs.get(id);
				if (record !== undefined) collectRefIfUnowned(id, record);
			}
			deferredRefCollection.clear();
		},
		activate(descriptor) {
			requireOpen();
			const isolated = isolateLynxWorkletValue(descriptor, 'main-thread worklet');
			if (isolated._owlt !== undefined) {
				throw new Error('Octane Lynx cannot activate an already-active worklet descriptor.');
			}
			const definition = mainDefinitions.get(isolated._wkltId);
			if (definition === undefined) {
				throw new Error(`Octane Lynx main-thread worklet ${isolated._wkltId} is not registered.`);
			}
			if (!Number.isSafeInteger(nextActivation)) {
				throw new Error('Octane Lynx exhausted main-thread worklet activation IDs.');
			}
			const revisions = new Map<string, number>();
			const refIds = new Set<string>();
			const refInitialValues = new Map<string, LynxWorkletValue>();
			collectMainDependencies(isolated, revisions, refIds, refInitialValues, new Set());
			stripRefInitialValues(isolated, new Set());
			const active = Object.freeze({ ...isolated, _owlt: nextActivation++ });
			for (const refId of refIds) {
				const record = refs.get(refId);
				if (record === undefined) {
					const initialized = refInitialValues.has(refId);
					refs.set(refId, {
						cell: {
							_wvid: refId,
							current: initialized ? refInitialValues.get(refId) : null,
						},
						hostRetains: 0,
						ownerRetains: 0,
						activationRetains: 1,
						initialized,
					});
				} else {
					deferredRefCollection.delete(refId);
					if (!record.initialized && refInitialValues.has(refId)) {
						record.cell.current = refInitialValues.get(refId);
						record.initialized = true;
					}
					record.activationRetains++;
				}
			}
			activations.set(active._owlt, { descriptor: active, revisions, refIds });
			return active;
		},
		release(value) {
			const token = activationToken(value);
			assertPositiveInteger(token, 'main-thread worklet activation');
			const activation = activations.get(token);
			if (activation === undefined) return;
			activations.delete(token);
			releaseActivationRefs(activation.refIds);
		},
		runWorklet(descriptor, params = []) {
			requireOpen();
			if (!Array.isArray(params))
				throw new TypeError('Octane Lynx worklet params must be an array.');
			const isolated = isolateLynxWorkletValue(descriptor, 'active main-thread worklet');
			if (isolated._owlt === undefined) {
				throw new Error('Octane Lynx main-thread worklet is not active.');
			}
			const activation = activations.get(isolated._owlt);
			if (activation === undefined || activation.descriptor._wkltId !== isolated._wkltId) {
				throw new Error('Octane Lynx main-thread worklet is stale or foreign.');
			}
			return execute(activation.descriptor, isolated._owlt, params);
		},
		retainRef(descriptor, initialValue) {
			requireOpen();
			if (!isLynxMainThreadRefDescriptor(descriptor)) {
				throw new TypeError('Octane Lynx main-thread ref descriptor is invalid.');
			}
			const seededValue = own(descriptor, '_initValue')
				? (descriptor._initValue as LynxWorkletValue)
				: (initialValue as LynxWorkletValue);
			const existing = refs.get(descriptor._wvid);
			if (existing !== undefined) {
				deferredRefCollection.delete(descriptor._wvid);
				if (existing.hostRetains === 0) {
					existing.cell.current = isolateLynxWorkletValue(seededValue, 'main-thread ref value');
					existing.initialized = true;
				}
				existing.hostRetains++;
				return existing.cell as LynxMainThreadRefCell<typeof initialValue>;
			}
			const cell: LynxMainThreadRefCell = {
				_wvid: descriptor._wvid,
				current: isolateLynxWorkletValue(seededValue, 'main-thread ref value'),
			};
			refs.set(descriptor._wvid, {
				cell,
				hostRetains: 1,
				ownerRetains: 0,
				activationRetains: 0,
				initialized: true,
			});
			return cell as LynxMainThreadRefCell<typeof initialValue>;
		},
		updateRef(descriptor, value) {
			requireOpen();
			if (!isLynxMainThreadRefDescriptor(descriptor)) {
				throw new TypeError('Octane Lynx main-thread ref descriptor is invalid.');
			}
			const cell = refs.get(descriptor._wvid)?.cell;
			if (cell === undefined)
				throw new Error(`Octane Lynx main-thread ref ${descriptor._wvid} is stale.`);
			cell.current = value;
		},
		releaseRef(descriptor) {
			if (!isLynxMainThreadRefDescriptor(descriptor)) return;
			const record = refs.get(descriptor._wvid);
			if (record === undefined || record.hostRetains === 0) return;
			record.hostRetains--;
			if (record.hostRetains !== 0) return;
			record.cell.current = null;
			collectRefIfUnowned(descriptor._wvid, record);
		},
		retainOwner(descriptor) {
			requireOpen();
			if (!isLynxMainThreadRefDescriptor(descriptor)) {
				throw new TypeError('Octane Lynx main-thread ref descriptor is invalid.');
			}
			const initialized = own(descriptor, '_initValue');
			const existing = refs.get(descriptor._wvid);
			if (existing !== undefined) {
				deferredRefCollection.delete(descriptor._wvid);
				if (!existing.initialized && initialized) {
					existing.cell.current = isolateLynxWorkletValue(
						descriptor._initValue as LynxWorkletValue,
						'main-thread ref initial value',
					);
					existing.initialized = true;
				}
				existing.ownerRetains++;
				return existing.cell;
			}
			const cell: LynxMainThreadRefCell = {
				_wvid: descriptor._wvid,
				current: initialized
					? isolateLynxWorkletValue(
							descriptor._initValue as LynxWorkletValue,
							'main-thread ref initial value',
						)
					: undefined,
			};
			refs.set(descriptor._wvid, {
				cell,
				hostRetains: 0,
				ownerRetains: 1,
				activationRetains: 0,
				initialized,
			});
			return cell;
		},
		releaseOwner(descriptor) {
			if (!isLynxMainThreadRefDescriptor(descriptor)) return;
			const record = refs.get(descriptor._wvid);
			if (record === undefined || record.ownerRetains === 0) return;
			record.ownerRetains--;
			collectRefIfUnowned(descriptor._wvid, record);
		},
		releaseOwners() {
			// Root teardown is also the recovery boundary for a publication whose
			// close marker was lost behind a terminal transport fault.
			refOwnerPublicationOpen = false;
			deferredRefCollection.clear();
			for (const [id, record] of refs) {
				record.ownerRetains = 0;
				if (record.hostRetains !== 0 || record.activationRetains !== 0) continue;
				deferredRefCollection.delete(id);
				record.cell.current = null;
				refs.delete(id);
			}
		},
		isActive(value) {
			return activations.has(activationToken(value));
		},
		close() {
			if (closed) return;
			closed = true;
			refOwnerPublicationOpen = false;
			deferredRefCollection.clear();
			activations.clear();
			for (const record of refs.values()) record.cell.current = null;
			refs.clear();
		},
	};
}

interface BackgroundExecution {
	readonly functionId: string;
	readonly revision: number;
	readonly captures?: LynxWorkletRecord;
}

export interface LynxBackgroundFunctionRegistry {
	retain<T extends LynxWorkletValue>(value: T): T;
	run(handle: LynxBackgroundFunctionDescriptor, params?: readonly unknown[]): unknown;
	release(execution: string): void;
	isActive(execution: string): boolean;
	close(): void;
}

export function createLynxBackgroundFunctionRegistry(): LynxBackgroundFunctionRegistry {
	const executions = new Map<string, BackgroundExecution>();
	let nextExecution = 1;
	let closed = false;
	let runExecution!: (
		handle: LynxBackgroundFunctionDescriptor,
		params?: readonly unknown[],
	) => unknown;

	const hydrateExecutionValue = (
		value: LynxWorkletValue,
		clones: Map<object, unknown>,
	): unknown => {
		if (value === null || typeof value !== 'object') return value;
		const existing = clones.get(value);
		if (existing !== undefined) return existing;
		if (Array.isArray(value)) {
			const clone: unknown[] = [];
			clones.set(value, clone);
			for (const entry of value) clone.push(hydrateExecutionValue(entry, clones));
			return clone;
		}
		if (isLynxBackgroundFunctionDescriptor(value)) {
			const hydrated = (...args: unknown[]) => runExecution(value, args);
			clones.set(value, hydrated);
			return hydrated;
		}
		if (isLynxMainThreadRefDescriptor(value) || isLynxMainThreadWorkletDescriptor(value)) {
			clones.set(value, value);
			return value;
		}
		const record = value as LynxWorkletRecord;
		const clone: Record<string, unknown> =
			Object.getPrototypeOf(record) === null ? Object.create(null) : {};
		clones.set(value, clone);
		for (const key of Object.keys(record)) {
			setOwnDataProperty(clone, key, hydrateExecutionValue(record[key], clones));
		}
		return clone;
	};

	const bindHandles = (
		value: LynxWorkletValue,
		pending: Map<string, BackgroundExecution>,
		clones: Map<object, LynxWorkletValue>,
	): LynxWorkletValue => {
		if (Array.isArray(value)) {
			const existing = clones.get(value);
			if (existing !== undefined) return existing;
			const clone: LynxWorkletValue[] = [];
			clones.set(value, clone);
			for (const entry of value) clone.push(bindHandles(entry, pending, clones));
			return clone;
		}
		if (value === null || typeof value !== 'object') return value;
		const existing = clones.get(value);
		if (existing !== undefined) return existing;
		if (isLynxBackgroundFunctionDescriptor(value)) {
			if (value._execId !== undefined) {
				throw new Error('Octane Lynx cannot retain an already-bound background function.');
			}
			const definition = backgroundDefinitions.get(value._jsFnId);
			if (definition === undefined) {
				throw new Error(`Octane Lynx background function ${value._jsFnId} is not registered.`);
			}
			if (!Number.isSafeInteger(nextExecution)) {
				throw new Error('Octane Lynx exhausted background execution IDs.');
			}
			const execId = `exec:${nextExecution++}`;
			const bound: {
				_jsFnId: string;
				_execId: string;
				_c?: LynxWorkletRecord;
			} = {
				_jsFnId: value._jsFnId,
				_execId: execId,
			};
			clones.set(value, bound);
			const captures =
				value._c === undefined
					? undefined
					: (bindHandles(value._c, pending, clones) as LynxWorkletRecord);
			if (captures !== undefined) bound._c = captures;
			pending.set(execId, {
				functionId: value._jsFnId,
				revision: definition.revision,
				...(captures === undefined ? null : { captures }),
			});
			return bound;
		}
		if (isLynxMainThreadRefDescriptor(value)) {
			const clone: { _wvid: string; _initValue?: LynxWorkletValue } = {
				_wvid: value._wvid,
			};
			clones.set(value, clone);
			if (own(value, '_initValue')) {
				clone._initValue = bindHandles(value._initValue as LynxWorkletValue, pending, clones);
			}
			return clone;
		}
		if (isLynxMainThreadWorkletDescriptor(value)) {
			const clone: {
				_wkltId: string;
				_c?: LynxWorkletRecord;
			} = {
				_wkltId: value._wkltId,
			};
			clones.set(value, clone);
			if (value._c !== undefined) {
				clone._c = bindHandles(value._c, pending, clones) as LynxWorkletRecord;
			}
			return clone;
		}
		const record = value as LynxWorkletRecord;
		const clone: Record<string, LynxWorkletValue> =
			Object.getPrototypeOf(record) === null ? Object.create(null) : {};
		clones.set(value, clone);
		for (const key of Object.keys(record)) {
			setOwnDataProperty(clone, key, bindHandles(record[key], pending, clones));
		}
		return clone;
	};

	runExecution = (handle, params = []) => {
		if (closed) throw new Error('Octane Lynx background function registry is closed.');
		if (!isLynxBackgroundFunctionDescriptor(handle)) {
			throw new TypeError('Octane Lynx background function handle is invalid.');
		}
		if (!Array.isArray(params))
			throw new TypeError('Octane Lynx background params must be an array.');
		const definition = backgroundDefinitions.get(handle._jsFnId);
		const retained =
			handle._execId === undefined
				? { functionId: handle._jsFnId, revision: definition?.revision, captures: handle._c }
				: executions.get(handle._execId);
		if (
			retained === undefined ||
			definition === undefined ||
			retained.functionId !== handle._jsFnId ||
			retained.revision !== definition.revision
		) {
			throw new Error(`Octane Lynx background function ${handle._jsFnId} is stale or foreign.`);
		}
		const args = isolateLynxWorkletValue(
			params as LynxWorkletValue[],
			'background function arguments',
		);
		const captures =
			retained.captures === undefined
				? undefined
				: (hydrateExecutionValue(retained.captures, new Map()) as LynxWorkletRecord);
		const receiver = {
			...handle,
			...(captures === undefined ? null : { _c: captures }),
		};
		return definition.implementation.apply(receiver, args);
	};

	return {
		retain<T extends LynxWorkletValue>(value: T): T {
			if (closed) throw new Error('Octane Lynx background function registry is closed.');
			const isolated = isolateLynxWorkletValue(value, 'background execution value');
			const pending = new Map<string, BackgroundExecution>();
			const bound = bindHandles(isolated, pending, new Map()) as T;
			for (const [execId, execution] of pending) executions.set(execId, execution);
			return bound;
		},
		run: runExecution,
		release(execution) {
			assertId(execution, 'background execution');
			executions.delete(execution);
		},
		isActive(execution) {
			return executions.has(execution);
		},
		close() {
			closed = true;
			executions.clear();
		},
	};
}

let installedMainRegistry: LynxMainThreadWorkletRegistry | null = null;

export function installLynxMainThreadWorkletRegistry(
	registry: LynxMainThreadWorkletRegistry,
): () => void {
	if (installedMainRegistry !== null) {
		throw new Error('Octane Lynx already has an installed main-thread worklet registry.');
	}
	installedMainRegistry = registry;
	return () => {
		if (installedMainRegistry === registry) installedMainRegistry = null;
	};
}

function requireMainRegistry(): LynxMainThreadWorkletRegistry {
	if (installedMainRegistry === null) {
		throw new Error('Octane Lynx has no installed main-thread worklet registry.');
	}
	return installedMainRegistry;
}

const RETAIN_MAIN_THREAD_REF_OWNER = 'octane:retain-main-thread-ref-owner';
const RELEASE_MAIN_THREAD_REF_OWNER = 'octane:release-main-thread-ref-owner';

registerMainThreadWorklet(
	RETAIN_MAIN_THREAD_REF_OWNER,
	undefined,
	function () {
		const id = this._c?.id;
		if (typeof id !== 'string') {
			throw new TypeError('Octane Lynx main-thread ref owner requires a ref id.');
		}
		const initialValue = this._c?.initialValue as LynxWorkletValue;
		const descriptor = createLynxMainThreadRefDescriptor(id, initialValue);
		requireMainRegistry().retainOwner(descriptor);
	},
	'@octanejs/lynx main-thread ref owner retain',
);

registerMainThreadWorklet(
	RELEASE_MAIN_THREAD_REF_OWNER,
	undefined,
	function () {
		const id = this._c?.id;
		if (typeof id !== 'string') {
			throw new TypeError('Octane Lynx main-thread ref owner requires a ref id.');
		}
		requireMainRegistry().releaseOwner(createLynxMainThreadRefDescriptor(id));
	},
	'@octanejs/lynx main-thread ref owner release',
);

/** Retain a hook-owned ref for its mounted background component lifetime. */
export function retainLynxMainThreadRefOwner(
	descriptor: LynxMainThreadRefDescriptor,
): LynxCancelablePromise<void> {
	const worklet = registerMainThreadWorklet(RETAIN_MAIN_THREAD_REF_OWNER, {
		id: descriptor._wvid,
		initialValue: descriptor._initValue,
	});
	return runOnMainThread<readonly [], void>(worklet)();
}

/** Release a hook-owned ref after its background component unmounts. */
export function releaseLynxMainThreadRefOwner(
	descriptor: LynxMainThreadRefDescriptor,
): LynxCancelablePromise<void> {
	const worklet = registerMainThreadWorklet(RELEASE_MAIN_THREAD_REF_OWNER, {
		id: descriptor._wvid,
	});
	return runOnMainThread<readonly [], void>(worklet)();
}

export function activateLynxMainThreadWorklet(
	descriptor: LynxMainThreadWorkletDescriptor,
): LynxActivatedMainThreadWorklet {
	return requireMainRegistry().activate(descriptor);
}

export function releaseLynxMainThreadWorklet(descriptor: LynxActivatedMainThreadWorklet): void {
	requireMainRegistry().release(descriptor);
}

export function runLynxMainThreadWorklet(
	descriptor: LynxMainThreadWorkletDescriptor,
	params?: readonly unknown[],
): unknown {
	return requireMainRegistry().runWorklet(descriptor, params);
}

export function retainLynxMainThreadRef<T>(
	descriptor: LynxMainThreadRefDescriptor,
	initialValue: T,
): LynxMainThreadRefCell<T> {
	return requireMainRegistry().retainRef(descriptor, initialValue);
}

export function updateLynxMainThreadRef<T>(
	descriptor: LynxMainThreadRefDescriptor,
	value: T,
): void {
	requireMainRegistry().updateRef(descriptor, value);
}

export function releaseLynxMainThreadRef(descriptor: LynxMainThreadRefDescriptor): void {
	requireMainRegistry().releaseRef(descriptor);
}

const THREAD_FUNCTION_DESCRIPTOR = Symbol('octane.lynx.thread-function');

interface TaggedThreadFunctionState {
	readonly kind: LynxThreadFunctionKind;
	readonly id: string;
	readonly readCaptures: () => readonly unknown[];
	readonly source?: LynxThreadFunctionSourceLike;
	revision: number | null;
	captures: LynxWorkletRecord | null;
	descriptor: LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor | null;
	resolving: boolean;
}

type TaggedThreadFunction = ((...args: unknown[]) => unknown) & {
	readonly [THREAD_FUNCTION_DESCRIPTOR]?: TaggedThreadFunctionState;
};

function capturesRecord(values: readonly unknown[]): LynxWorkletRecord {
	const normalized = values.map((value, index) => {
		if (typeof value === 'function') {
			const state = (value as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR];
			if (state === undefined) {
				fail(`thread function capture[${index}]`, 'contains an unregistered function.');
			}
			return resolveThreadFunctionState(state).descriptor;
		}
		return value;
	});
	return { values: isolateLynxWorkletValue(normalized as LynxWorkletValue[], 'thread captures') };
}

function sourceAttributedCaptures(
	values: readonly unknown[],
	source: LynxThreadFunctionSourceLike | undefined,
): LynxWorkletRecord {
	try {
		return capturesRecord(values);
	} catch (error) {
		if (source === undefined) throw error;
		const message = error instanceof Error ? error.message : String(error);
		throw new TypeError(`${message}${sourceLabel(source)}`);
	}
}

function createThreadDescriptor(
	kind: LynxThreadFunctionKind,
	id: string,
	captures: LynxWorkletRecord,
): LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor {
	if (kind === 'main-thread') return registerMainThreadWorklet(id, captures);
	if (kind === 'background') {
		return Object.freeze({ ...registerBackgroundFunction(id), _c: captures });
	}
	return fail('thread function kind', 'must be main-thread or background.');
}

function currentThreadDefinitionRevision(kind: LynxThreadFunctionKind, id: string): number | null {
	return (
		(kind === 'main-thread' ? mainDefinitions : backgroundDefinitions).get(id)?.revision ?? null
	);
}

function assertThreadFunctionCurrent(state: TaggedThreadFunctionState): void {
	const revision = currentThreadDefinitionRevision(state.kind, state.id);
	if (revision === null) {
		throw new Error(
			`Octane Lynx ${state.kind} function ${state.id} cannot run in this thread layer.`,
		);
	}
	if (state.revision === null) {
		state.revision = revision;
	} else if (state.revision !== revision) {
		throw new Error(`Octane Lynx ${state.kind} function ${state.id} was reloaded.`);
	}
}

function resolveThreadFunctionState(state: TaggedThreadFunctionState): {
	readonly captures: LynxWorkletRecord;
	readonly descriptor: LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor;
} {
	if (state.revision !== null) assertThreadFunctionCurrent(state);
	if (state.captures !== null && state.descriptor !== null) {
		return { captures: state.captures, descriptor: state.descriptor };
	}
	if (state.resolving) {
		fail('thread captures', 'contain a recursive thread-function capture.');
	}
	state.resolving = true;
	try {
		const values = state.readCaptures();
		if (!Array.isArray(values)) fail('thread captures', 'must be an array.');
		const captures = sourceAttributedCaptures(values, state.source);
		const descriptor = createThreadDescriptor(state.kind, state.id, captures);
		state.captures = captures;
		state.descriptor = descriptor;
		return { captures, descriptor };
	} finally {
		state.resolving = false;
	}
}

function tagThreadFunction<Fn extends (...args: never[]) => unknown>(
	fn: Fn,
	state: TaggedThreadFunctionState,
): Fn {
	const current = (fn as unknown as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR];
	if (current !== undefined) {
		if (current.kind === state.kind && current.id === state.id) return fn;
		fail('thread function', `is already registered as ${current.kind} function ${current.id}.`);
	}
	Object.defineProperty(fn, THREAD_FUNCTION_DESCRIPTOR, {
		configurable: true,
		value: state,
	});
	return fn;
}

export function getThreadFunctionDescriptor(
	value: unknown,
): LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor | null {
	if (typeof value === 'function') {
		const state = (value as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR];
		return state === undefined ? null : resolveThreadFunctionState(state).descriptor;
	}
	if (isLynxMainThreadWorkletDescriptor(value) || isLynxBackgroundFunctionDescriptor(value)) {
		return value;
	}
	return null;
}

/** Convert an active-layer callable to the same plain descriptor used by the opposite layer. */
export function unwrapThreadFunctionDescriptor(
	value: unknown,
): LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor {
	const descriptor = getThreadFunctionDescriptor(value);
	if (descriptor === null) fail('thread function', 'does not have a compiler descriptor.');
	return descriptor;
}

export function registerThreadFunction(
	kind: LynxThreadFunctionKind,
	id: string,
	implementation: LynxCompiledThreadFunctionImplementation,
	source?: LynxThreadFunctionSourceLike,
): void {
	if (typeof implementation !== 'function')
		fail('thread function implementation', 'must be a function.');
	if (kind === 'main-thread') {
		compiledMainDefinitions.set(id, implementation);
		registerMainThreadWorklet(
			id,
			undefined,
			function (...args) {
				const values = (this._c?.values ?? []) as readonly unknown[];
				return implementation(values, this, args);
			},
			source,
		);
		return;
	}
	if (kind === 'background') {
		compiledBackgroundDefinitions.set(id, implementation);
		registerBackgroundFunction(
			id,
			function (...args) {
				const values = (this._c?.values ?? []) as readonly unknown[];
				return implementation(values, this, args);
			},
			source,
		);
		return;
	}
	fail('thread function kind', 'must be main-thread or background.');
}

export function bindThreadFunction(
	kind: LynxThreadFunctionKind,
	id: string,
	readCaptures: () => readonly unknown[],
	source?: LynxThreadFunctionSourceLike,
): TaggedThreadFunction | LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor {
	if (typeof readCaptures !== 'function') fail('thread capture reader', 'must be a function.');
	assertSource(source, 'thread function source');
	assertId(id, 'thread function id');
	if (kind !== 'main-thread' && kind !== 'background') {
		fail('thread function kind', 'must be main-thread or background.');
	}
	const bound = function (this: unknown, ...args: unknown[]) {
		return invokeThreadFunction(bound, this, args);
	};
	return tagThreadFunction(bound, {
		kind,
		id,
		readCaptures,
		...(source === undefined ? null : { source }),
		revision: currentThreadDefinitionRevision(kind, id),
		captures: null,
		descriptor: null,
		resolving: false,
	});
}

export function attachThreadFunction<Fn extends (...args: never[]) => unknown>(
	fn: Fn,
	kind: LynxThreadFunctionKind,
	id: string,
	readCaptures: () => readonly unknown[],
	source?: LynxThreadFunctionSourceLike,
): Fn {
	if (typeof fn !== 'function') fail('thread function', 'must be a function.');
	assertSource(source, 'thread function source');
	if (typeof readCaptures !== 'function') fail('thread capture reader', 'must be a function.');
	assertId(id, 'thread function id');
	if (kind !== 'main-thread' && kind !== 'background') {
		fail('thread function kind', 'must be main-thread or background.');
	}
	return tagThreadFunction(fn, {
		kind,
		id,
		readCaptures,
		...(source === undefined ? null : { source }),
		revision: currentThreadDefinitionRevision(kind, id),
		captures: null,
		descriptor: null,
		resolving: false,
	});
}

function invokeLocalThreadDescriptor(
	kind: LynxThreadFunctionKind,
	descriptor: LynxMainThreadWorkletDescriptor | LynxBackgroundFunctionDescriptor,
	args: readonly unknown[],
): unknown {
	const id =
		kind === 'main-thread'
			? (descriptor as LynxMainThreadWorkletDescriptor)._wkltId
			: (descriptor as LynxBackgroundFunctionDescriptor)._jsFnId;
	const implementation =
		kind === 'main-thread'
			? compiledMainDefinitions.get(id)
			: compiledBackgroundDefinitions.get(id);
	if (implementation === undefined) {
		throw new Error(`Octane Lynx ${kind} function ${id} cannot run in this thread layer.`);
	}
	const record = descriptor._c;
	const rawCaptures = (record?.values ?? []) as readonly LynxWorkletValue[];
	const clones = new Map<object, unknown>();
	const captures = rawCaptures.map((value) => hydrateLocalThreadValue(kind, value, clones));
	const receiver = {
		...descriptor,
		...(record === undefined ? null : { _c: { ...record, values: captures } }),
	};
	return implementation(captures, receiver, args);
}

function hydrateLocalThreadValue(
	kind: LynxThreadFunctionKind,
	value: LynxWorkletValue,
	clones: Map<object, unknown>,
): unknown {
	if (value === null || typeof value !== 'object') return value;
	const existing = clones.get(value);
	if (existing !== undefined) return existing;
	if (Array.isArray(value)) {
		const clone: unknown[] = [];
		clones.set(value, clone);
		for (const entry of value) clone.push(hydrateLocalThreadValue(kind, entry, clones));
		return clone;
	}
	if (kind === 'main-thread' && isLynxMainThreadWorkletDescriptor(value)) {
		const hydrated = (...args: unknown[]) => invokeLocalThreadDescriptor(kind, value, args);
		clones.set(value, hydrated);
		return hydrated;
	}
	if (kind === 'background' && isLynxBackgroundFunctionDescriptor(value)) {
		const hydrated = (...args: unknown[]) => invokeLocalThreadDescriptor(kind, value, args);
		clones.set(value, hydrated);
		return hydrated;
	}
	if (
		isLynxMainThreadRefDescriptor(value) ||
		isLynxMainThreadWorkletDescriptor(value) ||
		isLynxBackgroundFunctionDescriptor(value)
	) {
		clones.set(value, value);
		return value;
	}
	const record = value as LynxWorkletRecord;
	const clone: Record<string, unknown> =
		Object.getPrototypeOf(record) === null ? Object.create(null) : {};
	clones.set(value, clone);
	for (const key of Object.keys(record)) {
		setOwnDataProperty(clone, key, hydrateLocalThreadValue(kind, record[key], clones));
	}
	return clone;
}

export function invokeThreadFunction(
	fn: unknown,
	receiver: unknown,
	args: readonly unknown[],
): unknown {
	if (!Array.isArray(args)) fail('thread function arguments', 'must be an array.');
	if (typeof fn === 'function') {
		const state = (fn as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR];
		if (state === undefined) return fn.apply(receiver, args);
		assertThreadFunctionCurrent(state);
		const implementation =
			state.kind === 'main-thread'
				? compiledMainDefinitions.get(state.id)
				: compiledBackgroundDefinitions.get(state.id);
		if (implementation === undefined) {
			throw new Error(
				`Octane Lynx ${state.kind} function ${state.id} cannot run in this thread layer.`,
			);
		}
		const { captures } = resolveThreadFunctionState(state);
		const clones = new Map<object, unknown>();
		const values = ((captures.values ?? []) as readonly LynxWorkletValue[]).map((value) =>
			hydrateLocalThreadValue(state.kind, value, clones),
		);
		return implementation(values, receiver, args);
	}
	if (isLynxMainThreadWorkletDescriptor(fn)) return runLynxMainThreadWorklet(fn, args);
	fail('thread function', 'is not callable in this runtime.');
}

export interface LynxCancelablePromise<T> extends Promise<T> {
	cancel(reason?: string | Error): void;
}

export interface LynxCrossThreadDispatch<T> {
	readonly promise: PromiseLike<T>;
	cancel?(reason?: string | Error): void;
}

export interface LynxBackgroundCallBridge {
	callMain<T>(
		worklet: LynxMainThreadWorkletDescriptor,
		args: readonly LynxWorkletValue[],
	): LynxCrossThreadDispatch<T>;
}

export interface LynxMainThreadCallBridge {
	callBackground<T>(
		fn: LynxBackgroundFunctionDescriptor,
		args: readonly LynxWorkletValue[],
	): LynxCrossThreadDispatch<T>;
}

export class LynxCrossThreadCallCancelledError extends Error {
	constructor(message = 'Octane Lynx cross-thread call was cancelled.') {
		super(message);
		this.name = 'LynxCrossThreadCallCancelledError';
	}
}

interface InstalledBridge<T> {
	readonly bridge: T;
	active: boolean;
}

let backgroundCallBridge: InstalledBridge<LynxBackgroundCallBridge> | null = null;
let mainThreadCallBridge: InstalledBridge<LynxMainThreadCallBridge> | null = null;

function installBridge<T>(
	current: InstalledBridge<T> | null,
	bridge: T,
	set: (next: InstalledBridge<T> | null) => void,
	label: string,
): () => void {
	if (current !== null) throw new Error(`Octane Lynx already has an installed ${label}.`);
	if (bridge === null || typeof bridge !== 'object')
		throw new TypeError(`Octane Lynx ${label} must be an object.`);
	const installed = { bridge, active: true };
	set(installed);
	return () => {
		installed.active = false;
		set(null);
	};
}

export function installBackgroundCallBridge(bridge: LynxBackgroundCallBridge): () => void {
	if (typeof bridge?.callMain !== 'function') {
		throw new TypeError('Octane Lynx background call bridge requires callMain().');
	}
	return installBridge(
		backgroundCallBridge,
		bridge,
		(next) => (backgroundCallBridge = next),
		'background call bridge',
	);
}

export function installMainThreadCallBridge(bridge: LynxMainThreadCallBridge): () => void {
	if (typeof bridge?.callBackground !== 'function') {
		throw new TypeError('Octane Lynx main-thread call bridge requires callBackground().');
	}
	return installBridge(
		mainThreadCallBridge,
		bridge,
		(next) => (mainThreadCallBridge = next),
		'main-thread call bridge',
	);
}

function cancelable<T>(dispatch: () => LynxCrossThreadDispatch<T>): LynxCancelablePromise<T> {
	let settled = false;
	let rejectPromise!: (reason?: unknown) => void;
	let remoteCancel: ((reason?: string | Error) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		rejectPromise = reject;
		try {
			const result = dispatch();
			remoteCancel = result.cancel;
			Promise.resolve(result.promise).then(
				(value) => {
					if (settled) return;
					settled = true;
					resolve(value);
				},
				(error) => {
					if (settled) return;
					settled = true;
					reject(error);
				},
			);
		} catch (error) {
			settled = true;
			reject(error);
		}
	}) as LynxCancelablePromise<T>;
	promise.cancel = (reason) => {
		if (settled) return;
		settled = true;
		try {
			remoteCancel?.(reason);
		} finally {
			rejectPromise(
				reason instanceof Error ? reason : new LynxCrossThreadCallCancelledError(reason),
			);
		}
	};
	return promise;
}

export function runOnMainThread<Args extends readonly unknown[], Result>(
	fn: ((...args: Args) => Result) | LynxMainThreadWorkletDescriptor,
): (...args: Args) => LynxCancelablePromise<Awaited<Result>> {
	const state =
		typeof fn === 'function'
			? (fn as unknown as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR]
			: undefined;
	if (
		(state !== undefined && state.kind !== 'main-thread') ||
		(state === undefined && !isLynxMainThreadWorkletDescriptor(fn))
	) {
		throw new TypeError(
			'Octane Lynx runOnMainThread() requires a compiler-transformed main-thread function.',
		);
	}
	let descriptor = state === undefined ? (fn as LynxMainThreadWorkletDescriptor) : null;
	let installed: InstalledBridge<LynxBackgroundCallBridge> | null = null;
	return (...args) =>
		cancelable<Awaited<Result>>(() => {
			if (state !== undefined) {
				if (state.revision !== null) assertThreadFunctionCurrent(state);
				descriptor ??= resolveThreadFunctionState(state)
					.descriptor as LynxMainThreadWorkletDescriptor;
			}
			if (installed === null) {
				installed = backgroundCallBridge;
				if (installed === null) {
					throw new Error('Octane Lynx has no installed background call bridge.');
				}
			}
			if (!installed.active || backgroundCallBridge !== installed) {
				throw new Error('Octane Lynx background call bridge is stale.');
			}
			return installed.bridge.callMain<Awaited<Result>>(
				descriptor!,
				isolateLynxWorkletValue(
					args as unknown as LynxWorkletValue[],
					'main-thread call arguments',
				),
			);
		});
}

export function runOnBackground<Args extends readonly unknown[], Result>(
	fn: ((...args: Args) => Result) | LynxBackgroundFunctionDescriptor,
): (...args: Args) => LynxCancelablePromise<Awaited<Result>> {
	const state =
		typeof fn === 'function'
			? (fn as unknown as TaggedThreadFunction)[THREAD_FUNCTION_DESCRIPTOR]
			: undefined;
	if (
		(state !== undefined && state.kind !== 'background') ||
		(state === undefined && !isLynxBackgroundFunctionDescriptor(fn))
	) {
		throw new TypeError(
			'Octane Lynx runOnBackground() requires a compiler-transformed background-only function.',
		);
	}
	let descriptor = state === undefined ? (fn as LynxBackgroundFunctionDescriptor) : null;
	let installed: InstalledBridge<LynxMainThreadCallBridge> | null = null;
	return (...args) =>
		cancelable<Awaited<Result>>(() => {
			if (state !== undefined) {
				if (state.revision !== null) assertThreadFunctionCurrent(state);
				descriptor ??= resolveThreadFunctionState(state)
					.descriptor as LynxBackgroundFunctionDescriptor;
			}
			if (installed === null) {
				installed = mainThreadCallBridge;
				if (installed === null) {
					throw new Error('Octane Lynx has no installed main-thread call bridge.');
				}
			}
			if (!installed.active || mainThreadCallBridge !== installed) {
				throw new Error('Octane Lynx main-thread call bridge is stale.');
			}
			return installed.bridge.callBackground<Awaited<Result>>(
				descriptor!,
				isolateLynxWorkletValue(args as unknown as LynxWorkletValue[], 'background call arguments'),
			);
		});
}
