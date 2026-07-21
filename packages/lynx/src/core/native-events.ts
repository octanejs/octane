export type LynxNativeEventPrefix =
	'bind' | 'catch' | 'capture-bind' | 'capture-catch' | 'global-bind';

export type LynxNativeEventPAPIType =
	'bindEvent' | 'catchEvent' | 'capture-bind' | 'capture-catch' | 'global-bindEvent';

export interface LynxNativeEventBinding {
	readonly prefix: LynxNativeEventPrefix;
	readonly type: LynxNativeEventPAPIType;
	readonly name: string;
}

const EVENT_PROP = /^(capture-bind|capture-catch|global-bind|bind|catch)([A-Za-z]+)$/;

const EVENT_PAPI_TYPES: Readonly<Record<LynxNativeEventPrefix, LynxNativeEventPAPIType>> =
	Object.freeze({
		bind: 'bindEvent',
		catch: 'catchEvent',
		'capture-bind': 'capture-bind',
		'capture-catch': 'capture-catch',
		'global-bind': 'global-bindEvent',
	});

/** Parse one background-thread Lynx event prop into its public Element PAPI tuple. */
export function parseLynxNativeEventProp(name: string): LynxNativeEventBinding | null {
	if (typeof name !== 'string') return null;
	const match = EVENT_PROP.exec(name);
	if (match === null) return null;
	const prefix = match[1] as LynxNativeEventPrefix;
	return Object.freeze({
		prefix,
		type: EVENT_PAPI_TYPES[prefix],
		name: match[2]!,
	});
}

declare const LYNX_NATIVE_EVENT_TOKEN: unique symbol;

/** Opaque native listener token. It deliberately carries no commit version. */
export type LynxNativeEventToken = string & {
	readonly [LYNX_NATIVE_EVENT_TOKEN]: true;
};

export interface LynxNativeEventTokenIdentity {
	readonly root: number;
	readonly id: number;
	readonly generation: number;
	readonly listener: number;
}

const TOKEN_PREFIX = 'octane-lynx:event:';
const TOKEN_PATTERN = /^octane-lynx:event:([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*)$/;
const TOKEN_IDENTITY_KEYS = ['root', 'id', 'generation', 'listener'] as const;

function tokenError(message: string): TypeError {
	return new TypeError(`Octane Lynx native event token ${message}`);
}

function assertPositiveSafeInteger(value: unknown, name: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw tokenError(`${name} must be a positive safe integer.`);
	}
}

function validateTokenIdentity(value: unknown): asserts value is LynxNativeEventTokenIdentity {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw tokenError('identity must be a plain object.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw tokenError('identity must be a plain object.');
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (
		keys.length !== TOKEN_IDENTITY_KEYS.length ||
		TOKEN_IDENTITY_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(record, key)) ||
		keys.some((key) => !(TOKEN_IDENTITY_KEYS as readonly string[]).includes(key)) ||
		Object.getOwnPropertySymbols(record).length !== 0
	) {
		throw tokenError('identity must contain only root, id, generation, and listener.');
	}
	for (const key of TOKEN_IDENTITY_KEYS) assertPositiveSafeInteger(record[key], `identity.${key}`);
}

/** Encode a root/host-generation/listener identity for `__AddEvent`. */
export function encodeLynxNativeEventToken(
	identity: LynxNativeEventTokenIdentity,
): LynxNativeEventToken {
	validateTokenIdentity(identity);
	return `${TOKEN_PREFIX}${identity.root}:${identity.id}:${identity.generation}:${identity.listener}` as LynxNativeEventToken;
}

/** Decode and validate a native listener token without accepting non-canonical aliases. */
export function decodeLynxNativeEventToken(value: unknown): LynxNativeEventTokenIdentity {
	if (typeof value !== 'string') throw tokenError('must be a string.');
	const match = TOKEN_PATTERN.exec(value);
	if (match === null) throw tokenError('is malformed.');
	const identity = {
		root: Number(match[1]),
		id: Number(match[2]),
		generation: Number(match[3]),
		listener: Number(match[4]),
	};
	for (const key of TOKEN_IDENTITY_KEYS) assertPositiveSafeInteger(identity[key], key);
	return Object.freeze(identity);
}

export type LynxNativeEventPayloadValue =
	| null
	| boolean
	| number
	| string
	| readonly LynxNativeEventPayloadValue[]
	| LynxNativeEventPayloadRecord;

export interface LynxNativeEventPayloadRecord {
	readonly [name: string]: LynxNativeEventPayloadValue;
}

export interface LynxNativeEventTargetSnapshot extends LynxNativeEventPayloadRecord {
	readonly id: string;
	readonly uid: number;
	readonly dataset: LynxNativeEventPayloadRecord;
}

export type LynxNativeEventPayloadSnapshot = LynxNativeEventPayloadRecord;

const OMIT_VALUE: unique symbol = Symbol('octane.lynx.native-event.omit');
const EVENT_RESERVED_FIELDS = new Set([
	'type',
	'timestamp',
	'timeStamp',
	'target',
	'currentTarget',
	'preventDefault',
	'stopPropagation',
	'stopImmediatePropagation',
]);

function payloadError(path: string, message: string): TypeError {
	return new TypeError(`Octane Lynx native event payload ${path} ${message}`);
}

function assignSnapshotField(
	target: Record<string, LynxNativeEventPayloadValue>,
	name: string,
	value: LynxNativeEventPayloadValue,
): void {
	Object.defineProperty(target, name, {
		configurable: false,
		enumerable: true,
		value,
		writable: false,
	});
}

function snapshotPayloadValue(
	value: unknown,
	path: string,
	seen: Set<object>,
): LynxNativeEventPayloadValue | typeof OMIT_VALUE {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw payloadError(path, 'must be a finite number.');
		return value;
	}
	if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
		return OMIT_VALUE;
	}
	if (typeof value === 'bigint') throw payloadError(path, 'is not JSON-like.');
	if (seen.has(value)) throw payloadError(path, 'contains a cycle.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const output: LynxNativeEventPayloadValue[] = [];
			for (let index = 0; index < value.length; index++) {
				const child = snapshotPayloadValue(value[index], `${path}[${index}]`, seen);
				// Match JSON array semantics: stripping an entry must preserve its index.
				output.push(child === OMIT_VALUE ? null : child);
			}
			return Object.freeze(output);
		}
		const output = Object.create(null) as Record<string, LynxNativeEventPayloadValue>;
		for (const name of Object.keys(value)) {
			const child = snapshotPayloadValue(
				(value as Record<string, unknown>)[name],
				`${path}.${name}`,
				seen,
			);
			if (child !== OMIT_VALUE) assignSnapshotField(output, name, child);
		}
		return Object.freeze(output);
	} finally {
		seen.delete(value);
	}
}

function snapshotEventTarget(
	value: unknown,
	path: string,
	seen: Set<object>,
): LynxNativeEventTargetSnapshot | null {
	if (value === null) return null;
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw payloadError(path, 'must be an object or null.');
	}
	if (seen.has(value)) throw payloadError(path, 'contains a cycle.');
	seen.add(value);
	try {
		const target = value as Record<string, unknown>;
		const id = target.id;
		const uid = target.uid === undefined ? target.$$uiSign : target.uid;
		const rawDataset = target.dataset;
		if (typeof id !== 'string') throw payloadError(`${path}.id`, 'must be a string.');
		if (typeof uid !== 'number' || !Number.isFinite(uid) || uid <= 0) {
			throw payloadError(`${path}.uid`, 'must be a positive finite number.');
		}
		if (rawDataset === null || typeof rawDataset !== 'object' || Array.isArray(rawDataset)) {
			throw payloadError(`${path}.dataset`, 'must be an object.');
		}
		const dataset = snapshotPayloadValue(rawDataset, `${path}.dataset`, seen);
		if (
			dataset === OMIT_VALUE ||
			dataset === null ||
			Array.isArray(dataset) ||
			typeof dataset !== 'object'
		) {
			throw payloadError(`${path}.dataset`, 'must be an object.');
		}
		const output = Object.create(null) as Record<string, LynxNativeEventPayloadValue>;
		assignSnapshotField(output, 'id', id);
		assignSnapshotField(output, 'uid', uid);
		assignSnapshotField(output, 'dataset', dataset);
		return Object.freeze(output) as LynxNativeEventTargetSnapshot;
	} finally {
		seen.delete(value);
	}
}

/**
 * Snapshot a native event into the JSON-like background payload contract.
 * Live methods, prototypes, symbols, and non-data event-target fields never cross threads.
 */
export function snapshotLynxNativeEventPayload(value: unknown): LynxNativeEventPayloadSnapshot {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw payloadError('root', 'must be an object.');
	}
	const event = value as Record<string, unknown>;
	const seen = new Set<object>([value]);
	const output = Object.create(null) as Record<string, LynxNativeEventPayloadValue>;

	const type = event.type;
	if (type !== undefined) {
		if (typeof type !== 'string') throw payloadError('root.type', 'must be a string.');
		assignSnapshotField(output, 'type', type);
	}
	const nativeTimestamp = event.timestamp;
	const timestamp = nativeTimestamp === undefined ? event.timeStamp : nativeTimestamp;
	if (timestamp !== undefined) {
		if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
			throw payloadError('root.timestamp', 'must be a finite number.');
		}
		assignSnapshotField(output, 'timestamp', timestamp);
	}

	for (const name of Object.keys(event)) {
		if (EVENT_RESERVED_FIELDS.has(name)) continue;
		const child = snapshotPayloadValue(event[name], `root.${name}`, seen);
		if (child !== OMIT_VALUE) assignSnapshotField(output, name, child);
	}

	if ('target' in event) {
		assignSnapshotField(output, 'target', snapshotEventTarget(event.target, 'root.target', seen));
	}
	if ('currentTarget' in event) {
		assignSnapshotField(
			output,
			'currentTarget',
			snapshotEventTarget(event.currentTarget, 'root.currentTarget', seen),
		);
	}

	return Object.freeze(output);
}
