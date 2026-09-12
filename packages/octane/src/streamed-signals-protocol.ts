import type { EncodedSignalValue, ScopeSeed } from './signals/types.js';

/** Independent resource/HTML channel identity. Arrival order is never freshness. */
export interface StreamFrameIdentity {
	readonly protocol: 1;
	readonly buildId: string;
	readonly documentId: string;
	readonly ownerKey: string;
	readonly instanceKey: string;
	readonly nodeKey: string;
	readonly selectionKey: string;
	readonly selectionGeneration: number;
	readonly attempt: number;
}

interface StreamFrameBase {
	readonly identity: StreamFrameIdentity;
	/** Monotone within one identity and logical channel, beginning at zero. */
	readonly sequence: number;
}

export type StreamedSignalResultFrame = StreamFrameBase &
	(
		| { readonly channel: 'result'; readonly kind: 'open'; readonly resource: 'promise' | 'stream' }
		| { readonly channel: 'result'; readonly kind: 'value'; readonly value: EncodedSignalValue }
		| { readonly channel: 'result'; readonly kind: 'complete' }
		| { readonly channel: 'result'; readonly kind: 'error'; readonly code: string }
	);

export type StreamedRegionPlacementFrame = StreamFrameBase & {
	readonly channel: 'placement';
	readonly kind: 'html';
	/** Authoritative monotone revision for the currently selected source. */
	readonly contentRevision: number;
	/** A delta is legal only against this exact already-presented revision. */
	readonly baseRevision?: number;
	readonly mode: 'full' | 'delta';
	/** Renderer-owned artifact. Applications do not pass arbitrary HTML here. */
	readonly html: string;
	/** Exact values read to produce this range, independent of newer live values. */
	readonly historicalFrame: ScopeSeed;
	/** Compiler/bundler style identities that must be ready before reveal. */
	readonly styles: readonly string[];
};

export type StreamedRendererFrame = StreamedSignalResultFrame | StreamedRegionPlacementFrame;

function isRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return false;
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') return false;
		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
		if (!descriptor.enumerable || !('value' in descriptor)) return false;
	}
	return true;
}

function isKey(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function isCounter(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasOnly(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
	return Object.keys(record).every((key) => allowed.has(key));
}

const IDENTITY_KEYS = new Set([
	'protocol',
	'buildId',
	'documentId',
	'ownerKey',
	'instanceKey',
	'nodeKey',
	'selectionKey',
	'selectionGeneration',
	'attempt',
]);

export function isStreamFrameIdentity(value: unknown): value is StreamFrameIdentity {
	if (!isRecord(value) || !hasOnly(value, IDENTITY_KEYS)) return false;
	return (
		value.protocol === 1 &&
		isKey(value.buildId) &&
		isKey(value.documentId) &&
		isKey(value.ownerKey) &&
		isKey(value.instanceKey) &&
		isKey(value.nodeKey) &&
		isKey(value.selectionKey) &&
		isCounter(value.selectionGeneration) &&
		isCounter(value.attempt)
	);
}

function isEncodedSignalValue(value: unknown, depth = 0): value is EncodedSignalValue {
	if (depth > 100 || !Array.isArray(value) || typeof value[0] !== 'string') return false;
	const tag = value[0];
	if (tag === 'undefined' || tag === 'null') return value.length === 1;
	if (value.length !== 2) return false;
	if (tag === 'boolean') return typeof value[1] === 'boolean';
	if (tag === 'string') return typeof value[1] === 'string';
	if (tag === 'number') {
		return (
			value[1] === '-0' ||
			(typeof value[1] === 'number' && Number.isFinite(value[1]) && !Object.is(value[1], -0))
		);
	}
	if (tag === 'array') {
		return (
			Array.isArray(value[1]) && value[1].every((item) => isEncodedSignalValue(item, depth + 1))
		);
	}
	if (tag !== 'object' || !Array.isArray(value[1])) return false;
	let previous: string | undefined;
	for (const entry of value[1]) {
		if (
			!Array.isArray(entry) ||
			entry.length !== 2 ||
			typeof entry[0] !== 'string' ||
			(previous !== undefined && entry[0] <= previous) ||
			!isEncodedSignalValue(entry[1], depth + 1)
		) {
			return false;
		}
		previous = entry[0];
	}
	return true;
}

function isHistoricalFrame(value: unknown): value is ScopeSeed {
	return (
		isRecord(value) && value.version === 1 && isKey(value.scopeKey) && Array.isArray(value.entries)
	);
}

const RESULT_BASE_KEYS = new Set(['identity', 'sequence', 'channel', 'kind']);

/** Strictly validate an untrusted decoded frame before any mailbox or DOM mutation. */
export function isStreamedRendererFrame(value: unknown): value is StreamedRendererFrame {
	if (!isRecord(value) || !isStreamFrameIdentity(value.identity) || !isCounter(value.sequence)) {
		return false;
	}
	if (value.channel === 'result') {
		if (value.kind === 'open') {
			return (
				hasOnly(value, new Set([...RESULT_BASE_KEYS, 'resource'])) &&
				(value.resource === 'promise' || value.resource === 'stream')
			);
		}
		if (value.kind === 'value') {
			return (
				hasOnly(value, new Set([...RESULT_BASE_KEYS, 'value'])) && isEncodedSignalValue(value.value)
			);
		}
		if (value.kind === 'error') {
			return hasOnly(value, new Set([...RESULT_BASE_KEYS, 'code'])) && isKey(value.code);
		}
		return value.kind === 'complete' && hasOnly(value, RESULT_BASE_KEYS);
	}
	if (value.channel !== 'placement' || value.kind !== 'html') return false;
	const allowed = new Set([
		'identity',
		'sequence',
		'channel',
		'kind',
		'contentRevision',
		'baseRevision',
		'mode',
		'html',
		'historicalFrame',
		'styles',
	]);
	if (
		!hasOnly(value, allowed) ||
		!isCounter(value.contentRevision) ||
		(value.mode !== 'full' && value.mode !== 'delta') ||
		typeof value.html !== 'string' ||
		!isHistoricalFrame(value.historicalFrame) ||
		!Array.isArray(value.styles) ||
		!value.styles.every(isKey) ||
		new Set(value.styles).size !== value.styles.length
	) {
		return false;
	}
	if (value.mode === 'delta') return isCounter(value.baseRevision);
	return value.baseRevision === undefined || isCounter(value.baseRevision);
}

export function decodeStreamedRendererFrame(json: string): StreamedRendererFrame {
	const value: unknown = JSON.parse(json);
	if (!isStreamedRendererFrame(value)) throw new Error('Invalid Octane streamed renderer frame.');
	return value;
}

/** Escape a validated frame for a nonced inline receiver call; never evaluate it as source. */
export function encodeStreamedRendererFrameForScript(frame: StreamedRendererFrame): string {
	if (!isStreamedRendererFrame(frame)) throw new Error('Invalid Octane streamed renderer frame.');
	return JSON.stringify(frame)
		.replace(/&/g, '\\u0026')
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

export function sameStreamFrameIdentity(a: StreamFrameIdentity, b: StreamFrameIdentity): boolean {
	return (
		a.protocol === b.protocol &&
		a.buildId === b.buildId &&
		a.documentId === b.documentId &&
		a.ownerKey === b.ownerKey &&
		a.instanceKey === b.instanceKey &&
		a.nodeKey === b.nodeKey &&
		a.selectionKey === b.selectionKey &&
		a.selectionGeneration === b.selectionGeneration &&
		a.attempt === b.attempt
	);
}

/** Stable local map key only; authority still requires field-by-field comparison. */
export function streamFrameIdentityKey(identity: StreamFrameIdentity): string {
	return JSON.stringify([
		identity.protocol,
		identity.buildId,
		identity.documentId,
		identity.ownerKey,
		identity.instanceKey,
		identity.nodeKey,
		identity.selectionKey,
		identity.selectionGeneration,
		identity.attempt,
	]);
}
