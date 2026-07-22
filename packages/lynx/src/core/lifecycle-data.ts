import type { UniversalSerializableValue } from 'octane/universal/native';
import type { Lynx, LynxGlobalEventEmitter } from '../platform.js';
import {
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxDataLifecycleMessage,
	type LynxGlobalPropsMessage,
	type LynxLifecycleDataRecord,
	type LynxPageDataMessage,
} from './protocol.js';

export type { LynxLifecycleDataRecord } from './protocol.js';

interface IndexedLifecycleRecord {
	readonly index: number;
	readonly data: LynxLifecycleDataRecord;
}

function mergeLifecycleRecords(
	base: LynxLifecycleDataRecord | null,
	patch: LynxLifecycleDataRecord,
): LynxLifecycleDataRecord {
	return Object.freeze({ ...(base ?? {}), ...patch });
}

function mergeIndexedLifecycleRecord(
	current: IndexedLifecycleRecord | null,
	index: number,
	patch: LynxLifecycleDataRecord,
): IndexedLifecycleRecord {
	return {
		index: current === null ? index : current.index,
		data: mergeLifecycleRecords(current === null ? null : current.data, patch),
	};
}

/** Collapse an overflowed queue without losing its newest authoritative state. */
export function compactLynxLifecycleMessages(
	messages: readonly LynxDataLifecycleMessage[],
): LynxDataLifecycleMessage[] {
	let pageAbsolute: { readonly index: number; readonly message: LynxPageDataMessage } | null = null;
	let pageUpdate: IndexedLifecycleRecord | null = null;
	let globalUpdate: IndexedLifecycleRecord | null = null;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index]!;
		if (message.type === 'page-data') {
			if (message.operation === 'replace' || message.operation === 'reset') {
				pageAbsolute = { index, message };
				pageUpdate = null;
			} else {
				pageUpdate = mergeIndexedLifecycleRecord(pageUpdate, index, message.data);
			}
		} else {
			globalUpdate = mergeIndexedLifecycleRecord(globalUpdate, index, message.patch);
		}
	}

	const compacted: Array<{
		readonly index: number;
		readonly message: LynxDataLifecycleMessage;
	}> = [];
	if (pageAbsolute !== null) compacted.push(pageAbsolute);
	if (pageUpdate !== null) {
		compacted.push({
			index: pageUpdate.index,
			message: Object.freeze({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'page-data',
				operation: 'update',
				data: pageUpdate.data,
			}),
		});
	}
	if (globalUpdate !== null) {
		compacted.push({
			index: globalUpdate.index,
			message: Object.freeze({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'global-props',
				patch: globalUpdate.data,
			}),
		});
	}
	compacted.sort((left, right) => left.index - right.index);
	return compacted.map(({ message }) => message);
}

interface CloneState {
	readonly active: Set<object>;
	readonly clones: Map<object, UniversalSerializableValue>;
}

function lifecycleDataError(label: string, message: string): TypeError {
	return new TypeError(`Octane Lynx lifecycle ${label} ${message}`);
}

function ownEnumerableDataNames(
	value: object,
	label: string,
	allowArrayLength = false,
): readonly string[] {
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		throw lifecycleDataError(label, 'contains symbol fields.');
	}
	const names = Object.getOwnPropertyNames(value);
	for (const name of names) {
		const descriptor = Object.getOwnPropertyDescriptor(value, name)!;
		if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
			throw lifecycleDataError(`${label}.${name}`, 'must not be an accessor.');
		}
		if (!(allowArrayLength && name === 'length') && !descriptor.enumerable) {
			throw lifecycleDataError(`${label}.${name}`, 'must be enumerable.');
		}
	}
	return names;
}

function defineImmutable(
	target: Record<string, UniversalSerializableValue>,
	name: string,
	value: UniversalSerializableValue,
): void {
	Object.defineProperty(target, name, {
		configurable: false,
		enumerable: true,
		value,
		writable: false,
	});
}

function cloneLifecycleValue(
	value: unknown,
	label: string,
	state: CloneState,
): UniversalSerializableValue {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	if (typeof value !== 'object') {
		throw lifecycleDataError(label, 'contains a non-clone-safe value.');
	}
	if (state.active.has(value)) throw lifecycleDataError(label, 'contains a cycle.');
	const existing = state.clones.get(value);
	if (existing !== undefined) return existing;

	state.active.add(value);
	try {
		if (Array.isArray(value)) {
			const names = ownEnumerableDataNames(value, label, true);
			if (
				names.length !== value.length + 1 ||
				names[names.length - 1] !== 'length' ||
				names.some((name, index) => name !== (index === value.length ? 'length' : String(index)))
			) {
				throw lifecycleDataError(label, 'must be a dense array without extra fields.');
			}
			const output: UniversalSerializableValue[] = [];
			state.clones.set(value, output);
			for (let index = 0; index < value.length; index++) {
				output.push(cloneLifecycleValue(value[index], `${label}[${index}]`, state));
			}
			return Object.freeze(output);
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw lifecycleDataError(label, 'requires arrays or plain objects.');
		}
		const names = ownEnumerableDataNames(value, label);
		const output: Record<string, UniversalSerializableValue> = {};
		state.clones.set(value, output);
		for (const name of names) {
			defineImmutable(
				output,
				name,
				cloneLifecycleValue((value as Record<string, unknown>)[name], `${label}.${name}`, state),
			);
		}
		return Object.freeze(output);
	} finally {
		state.active.delete(value);
	}
}

/** Validate, deeply clone, and freeze one native lifecycle data record. */
export function snapshotLynxLifecycleData(value: unknown, label = 'data'): LynxLifecycleDataRecord {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw lifecycleDataError(label, 'must be a plain object.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw lifecycleDataError(label, 'must be a plain object.');
	}
	return cloneLifecycleValue(value, label, {
		active: new Set(),
		clones: new Map(),
	}) as LynxLifecycleDataRecord;
}

function globalEventEmitter(runtime: Lynx): LynxGlobalEventEmitter {
	const emitter = runtime.getJSModule('GlobalEventEmitter');
	if (emitter === null || typeof emitter !== 'object' || typeof emitter.emit !== 'function') {
		throw new TypeError('Octane Lynx lifecycle requires the public GlobalEventEmitter emit API.');
	}
	return emitter;
}

function lifecycleRecordEntries(
	value: unknown,
	label: string,
): readonly (readonly [string, UniversalSerializableValue])[] {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw lifecycleDataError(label, 'must be a plain object.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw lifecycleDataError(label, 'must be a plain object.');
	}
	const entries: Array<readonly [string, UniversalSerializableValue]> = [];
	for (const name of ownEnumerableDataNames(value, label)) {
		const field = Object.getOwnPropertyDescriptor(value, name)!.value;
		if (typeof field === 'function' || typeof field === 'symbol') {
			throw lifecycleDataError(`${label}.${name}`, 'contains a non-clone-safe value.');
		}
		if (field !== null && typeof field === 'object' && !Array.isArray(field)) {
			const fieldPrototype = Object.getPrototypeOf(field);
			if (fieldPrototype !== Object.prototype && fieldPrototype !== null) {
				throw lifecycleDataError(`${label}.${name}`, 'requires an array or plain object.');
			}
		}
		entries.push([name, field as UniversalSerializableValue]);
	}
	return entries;
}

function mergeLifecycleData(
	base: unknown,
	patch: LynxLifecycleDataRecord,
	label: string,
): LynxLifecycleDataRecord {
	const fields = new Map<string, UniversalSerializableValue>();
	for (const [name, value] of lifecycleRecordEntries(base ?? {}, `${label} current data`)) {
		fields.set(name, value);
	}
	for (const [name, value] of lifecycleRecordEntries(patch, `${label} patch`)) {
		fields.set(name, value);
	}
	const output: Record<string, UniversalSerializableValue> = {};
	for (const [name, value] of fields) defineImmutable(output, name, value);
	return Object.freeze(output);
}

/** @internal Apply one validated main-to-background lifecycle message. */
export function applyLynxBackgroundLifecycleData(
	runtime: Lynx,
	message: LynxPageDataMessage | LynxGlobalPropsMessage,
): void {
	if (message.type === 'page-data') {
		const data = snapshotLynxLifecycleData(message.data, 'page data');
		if (message.operation === 'replace' || message.operation === 'reset') {
			runtime.__initData = data as unknown as NonNullable<Lynx['__initData']>;
		} else {
			runtime.__initData = mergeLifecycleData(
				runtime.__initData ?? runtime.__presetData,
				data,
				'page data',
			) as unknown as NonNullable<Lynx['__initData']>;
		}
		if (message.operation !== 'replace') {
			globalEventEmitter(runtime).emit('onDataChanged', [data]);
		}
		return;
	}

	const patch = snapshotLynxLifecycleData(message.patch, 'global props');
	runtime.__globalProps = mergeLifecycleData(
		runtime.__globalProps,
		patch,
		'global props',
	) as unknown as Lynx['__globalProps'];
	globalEventEmitter(runtime).emit('onGlobalPropsChanged', [runtime.__globalProps]);
}
