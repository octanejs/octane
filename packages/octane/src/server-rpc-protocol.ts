import { decodeSignalValue, encodeSignalValue } from './data-encoding.js';
import type { EncodedSignalValue } from './signals/types.js';

/** The streamed protocol is opt-in; legacy devalue RPC remains unchanged. */
export const SERVER_RESULT_CONTENT_TYPE = 'application/x-octane-rpc+ndjson';

export function encodeServerArguments(args: unknown[]): string {
	return JSON.stringify([1, encodeSignalValue(args)]);
}

export function decodeServerArguments(body: string): unknown[] {
	const envelope: unknown = JSON.parse(body);
	if (!Array.isArray(envelope) || envelope.length !== 2 || envelope[0] !== 1) {
		throw new Error('Invalid server argument protocol');
	}
	const args = decodeSignalValue(envelope[1] as EncodedSignalValue);
	if (!Array.isArray(args)) throw new Error('Invalid server arguments');
	return args;
}

/** No authoritative receipt arrived; retrying a mutation could execute it twice. */
export class ServerCallUncertainError extends Error {
	readonly code = 'OCTANE_RPC_UNCERTAIN';
	constructor(cause: unknown) {
		super(cause instanceof Error ? cause.message : 'Server function outcome is uncertain', {
			cause,
		});
		this.name = 'ServerCallUncertainError';
	}
}

export interface ServerResultLimits {
	/** Maximum encoded bytes in one complete value or terminal frame. */
	maxFrameBytes?: number;
	/** Maximum bytes in this invocation, independently of the request-body limit. */
	maxTotalBytes?: number;
	/** Total invocation lifetime, including a stalled producer or consumer. */
	timeoutMs?: number;
}

export interface ServerCallBatchOptions extends ServerResultLimits {
	/** Explicitly asserts independent, finite reads; mutations/subscriptions stay outside. */
	kind: 'independent-reads';
	/** Local compatibility keys, not credentials sent to or trusted by the server. */
	authority: string;
	document: string;
}

export function validateServerCallBatch(options: ServerCallBatchOptions): void {
	if (options.kind !== 'independent-reads' || !options.authority || !options.document) {
		throw new TypeError(
			'A server-call batch requires independent reads and authority/document keys',
		);
	}
	serverResultLimits(options);
}

export interface ResolvedServerResultLimits {
	maxFrameBytes: number;
	maxTotalBytes: number;
	timeoutMs: number;
}

export function serverResultLimits(limits: ServerResultLimits = {}): ResolvedServerResultLimits {
	const result = {
		maxFrameBytes: limits.maxFrameBytes ?? 1024 * 1024,
		maxTotalBytes: limits.maxTotalBytes ?? 16 * 1024 * 1024,
		timeoutMs: limits.timeoutMs ?? 30_000,
	};
	for (const value of Object.values(result)) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError('Server result limits must be positive safe integers');
		}
	}
	if (result.maxFrameBytes > result.maxTotalBytes) {
		throw new RangeError('A server result frame cannot exceed the total response budget');
	}
	return result;
}

export type ServerResultFrame =
	| { kind: 'stream' | 'complete' }
	| { kind: 'value'; value: unknown }
	| { kind: 'error'; error: string };

export function encodeServerResultFrame(sequence: number, frame: ServerResultFrame): Uint8Array {
	const payload =
		frame.kind === 'value'
			? encodeSignalValue(frame.value)
			: frame.kind === 'error'
				? frame.error
				: null;
	return new TextEncoder().encode(JSON.stringify([1, sequence, frame.kind, payload]) + '\n');
}

export function decodeServerResultFrame(line: string, sequence: number): ServerResultFrame {
	const frame: unknown = JSON.parse(line);
	if (!Array.isArray(frame) || frame.length !== 4 || frame[0] !== 1 || frame[1] !== sequence) {
		throw new Error('Invalid or out-of-order server result frame');
	}
	const [, , kind, payload] = frame;
	if (kind === 'value') {
		return { kind, value: decodeSignalValue(payload as EncodedSignalValue) };
	}
	if (kind === 'error' && typeof payload === 'string') return { kind, error: payload };
	if ((kind === 'stream' || kind === 'complete') && payload === null) return { kind };
	throw new Error('Invalid server result frame');
}

/**
 * Read one line at a time without concatenating the entire response or repeatedly
 * copying a growing partial frame. A transport chunk may contain several frames.
 */
export function serverResultReader(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	limits: ResolvedServerResultLimits,
) {
	let chunk: Uint8Array = new Uint8Array(0);
	let offset = 0;
	let sequence = 0;
	let totalBytes = 0;
	return async (): Promise<ServerResultFrame> => {
		const parts: Uint8Array[] = [];
		let bytes = 0;
		while (true) {
			if (offset === chunk.length) {
				const next = await reader.read();
				if (next.done) throw new Error('Server result ended without a terminal frame');
				chunk = next.value;
				offset = 0;
			}
			const newline = chunk.indexOf(10, offset);
			const end = newline === -1 ? chunk.length : newline + 1;
			const part = chunk.subarray(offset, end);
			bytes += part.length;
			totalBytes += part.length;
			if (bytes > limits.maxFrameBytes || totalBytes > limits.maxTotalBytes) {
				throw new Error('Server result exceeded its response budget');
			}
			parts.push(part);
			offset = end;
			if (newline !== -1) {
				const decoder = new TextDecoder('utf-8', { fatal: true });
				const text = parts.map((value) => decoder.decode(value, { stream: true }));
				text.push(decoder.decode());
				return decodeServerResultFrame(text.join(''), sequence++);
			}
		}
	};
}
