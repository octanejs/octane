import { decodeSignalValue } from './data-encoding.js';
import { yieldForHostBudget } from './host-budget.js';
import {
	serverResultLimits,
	ServerCallUncertainError,
	type ResolvedServerResultLimits,
	type ServerResultFrame,
	type ServerResultLimits,
} from './server-rpc-protocol.js';
import type { EncodedSignalValue } from './signals/types.js';

/** A single-consumer result; iterator.return() cancels only this invocation. */
export async function readServerResult(
	response: Response,
	options: ServerResultLimits & { signal?: AbortSignal | undefined } = {},
): Promise<unknown> {
	if (response.body === null)
		throw new ServerCallUncertainError(new Error('Server function returned an empty response'));
	const limits = serverResultLimits(options);
	const reader = response.body.getReader();
	let finished = false;
	const read = serverResultReader(reader, limits, () => finished);
	let failure: unknown;
	const cleanup = () => {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
	};
	const close = async () => {
		if (finished) return;
		finished = true;
		cleanup();
		// A custom transport may never finish cancellation. Retire now so an
		// error or iterator return cannot be held hostage by best-effort cleanup.
		try {
			void reader.cancel().catch(() => {});
		} catch {
			/* Already closed. */
		}
		reader.releaseLock();
	};
	const abort = () => {
		failure = new ServerCallUncertainError(
			options.signal?.reason ?? new DOMException('Server function canceled', 'AbortError'),
		);
		void close();
	};
	const timer = setTimeout(() => {
		failure = new ServerCallUncertainError(
			new DOMException('Server function timed out', 'TimeoutError'),
		);
		void close();
	}, limits.timeoutMs);
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted) abort();
	const next = async () => {
		if (failure !== undefined) throw failure;
		try {
			const frame = await read();
			if (failure !== undefined) throw failure;
			if (finished) return { kind: 'complete' } as const;
			if (frame.kind === 'error') throw new Error(frame.error);
			return frame;
		} catch (error) {
			// return() may retire a reader while a budget wait is pending. Check
			// before close() so a fresh protocol failure is never swallowed.
			if (finished && failure === undefined) return { kind: 'complete' } as const;
			await close();
			throw failure ?? new ServerCallUncertainError(error);
		}
	};
	try {
		const first = await next();
		if (first.kind === 'value') {
			if ((await next()).kind !== 'complete') throw new Error('Invalid one-shot server result');
			await close();
			return first.value;
		}
		if (first.kind !== 'stream') throw new Error('Invalid server result opening frame');
		let claimed = false;
		return {
			[Symbol.asyncIterator]() {
				if (claimed) throw new Error('A server result stream supports one consumer');
				claimed = true;
				let pulls: Promise<unknown> = Promise.resolve();
				const pull = async (): Promise<IteratorResult<unknown>> => {
					if (failure !== undefined) throw failure;
					if (finished) return { done: true, value: undefined };
					const frame = await next();
					if (frame.kind === 'value') return { done: false, value: frame.value };
					await close();
					if (frame.kind !== 'complete') throw new Error('Invalid server result continuation');
					return { done: true, value: undefined };
				};
				return {
					next(): Promise<IteratorResult<unknown>> {
						const result = pulls.then(pull, pull);
						pulls = result;
						return result;
					},
					async return(): Promise<IteratorResult<unknown>> {
						await close();
						return { done: true, value: undefined };
					},
				};
			},
		};
	} catch (error) {
		await close();
		throw error instanceof ServerCallUncertainError ? error : new ServerCallUncertainError(error);
	}
}

function decodeServerResultFrame(line: string, sequence: number): ServerResultFrame {
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
function serverResultReader(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	limits: ResolvedServerResultLimits,
	isClosed: () => boolean,
) {
	let chunk: Uint8Array = new Uint8Array(0);
	let offset = 0;
	let sequence = 0;
	let totalBytes = 0;
	return async (): Promise<ServerResultFrame> => {
		const parts: Uint8Array[] = [];
		let bytes = 0;
		while (true) {
			if (isClosed()) return { kind: 'complete' };
			const wait = yieldForHostBudget();
			if (wait !== undefined) {
				await wait;
				continue;
			}
			if (offset === chunk.length) {
				const next = await reader.read();
				if (next.done) throw new Error('Server result ended without a terminal frame');
				chunk = next.value;
				offset = 0;
				// Ready transport results re-enter the shared budget and retirement guard.
				continue;
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
