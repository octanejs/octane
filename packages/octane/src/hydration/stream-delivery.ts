import {
	isStreamedRendererFrame,
	streamFrameIdentityKey,
	type StreamedRendererFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import {
	StreamedReceiverError,
	type StreamedFrameDisposition,
	type StreamedRegionReceiver,
} from './stream-receiver.js';

/** Stable realm slot used by CSP-nonced server frame calls. */
export const STREAMED_RENDERER_RECEIVER = '__octaneStreamedRenderer';

export interface StreamedRendererGlobal {
	receive(frame: unknown): void;
}

interface EarlyStreamedRendererGlobal extends StreamedRendererGlobal {
	readonly version: 1;
	readonly frames: unknown[];
	readonly overflow?: boolean;
}

export interface StreamedRendererDeliveryOptions {
	readonly maxFrameBytes?: number;
	/** Includes style/composition waits; also caps unfinished inline result channels. */
	readonly maxPendingFrames?: number;
	readonly maxPendingBytes?: number;
	/** Maximum queue/placement and inline result lifetime; readers also bound the response. */
	readonly timeoutMs?: number;
}

export interface StreamedRendererReadOptions extends StreamedRendererDeliveryOptions {
	readonly maxTotalBytes?: number;
	readonly signal?: AbortSignal;
}

const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const DEFAULT_PENDING_BYTES = 16 * 1024 * 1024;
const DEFAULT_PENDING_FRAMES = 64;
const DEFAULT_TIMEOUT_MS = 30_000;

function positiveLimit(value: number | undefined, fallback: number): number {
	const limit = value ?? fallback;
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new RangeError('Streamed renderer response limits must be positive safe integers.');
	}
	return limit;
}

/** Cold, optional stream work only. Ordering belongs to one identity/channel;
 * HTML style waits never hold the result channel or another independent region. */
function createDelivery(
	receiver: StreamedRegionReceiver,
	options: StreamedRendererDeliveryOptions,
	delivered?: (frame: StreamedRendererFrame, disposition: StreamedFrameDisposition) => void,
) {
	const maxFrameBytes = positiveLimit(options.maxFrameBytes, DEFAULT_MAX_FRAME_BYTES);
	const maxPendingBytes = positiveLimit(options.maxPendingBytes, DEFAULT_PENDING_BYTES);
	const maxPendingFrames = positiveLimit(options.maxPendingFrames, DEFAULT_PENDING_FRAMES);
	const timeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS);
	const tails = new Map<string, Promise<void>>();
	const pending = new Set<Promise<void>>();
	const aborters = new Set<(error: StreamedReceiverError) => void>();
	const waiters = new Set<() => void>();
	let pendingBytes = 0;
	let closed: StreamedReceiverError | undefined;
	const notify = () => {
		for (const wake of waiters) wake();
		waiters.clear();
	};
	function validateSize(bytes: number) {
		if (bytes > maxFrameBytes || bytes > maxPendingBytes)
			throw new StreamedReceiverError(
				'overflow',
				'A streamed renderer frame exceeded its byte budget.',
			);
	}
	return {
		async room(bytes: number) {
			validateSize(bytes);
			while (pending.size >= maxPendingFrames || pendingBytes + bytes > maxPendingBytes) {
				if (closed !== undefined) throw closed;
				await new Promise<void>((resolve) => waiters.add(resolve));
			}
			if (closed !== undefined) throw closed;
		},
		enqueue(frame: StreamedRendererFrame, bytes: number): Promise<void> {
			if (closed !== undefined) return Promise.reject(closed);
			try {
				validateSize(bytes);
				if (pending.size >= maxPendingFrames || pendingBytes + bytes > maxPendingBytes)
					throw new StreamedReceiverError(
						'overflow',
						'Streamed renderer delivery exceeded its pending budget.',
					);
			} catch (error) {
				receiver.failSelection(frame.identity, error as StreamedReceiverError);
				throw error;
			}
			const key = JSON.stringify([streamFrameIdentityKey(frame.identity), frame.channel]);
			const previous = tails.get(key) ?? Promise.resolve();
			let canceled: StreamedReceiverError | undefined;
			let abort!: (error: StreamedReceiverError) => void;
			const cancellation = new Promise<never>((_, reject) => {
				abort = (error) => {
					canceled = error;
					// Fence synchronously: compositionend can fire in the same task as
					// uninstall, before the rejected delivery's catch handler runs.
					try {
						receiver.failSelection(frame.identity, error);
					} catch {
						/* Still settle delivery. */
					}
					reject(error);
				};
				aborters.add(abort);
			});
			const timer = setTimeout(
				() => abort(new StreamedReceiverError('timeout', 'Streamed renderer delivery timed out.')),
				timeoutMs,
			);
			const work = previous
				.catch(() => {})
				.then(() => {
					if (canceled !== undefined) throw canceled;
					return receiver.receive(frame);
				});
			const delivery: Promise<void> = Promise.race([work, cancellation])
				.then((disposition) => {
					if (canceled !== undefined) throw canceled;
					delivered?.(frame, disposition);
				})
				.catch((cause: unknown) => {
					const error =
						cause instanceof StreamedReceiverError
							? cause
							: new StreamedReceiverError('protocol', 'Streamed renderer delivery failed.');
					try {
						receiver.failSelection(frame.identity, error);
					} catch {
						/* Cleanup still runs. */
					}
					throw error;
				})
				.finally(() => {
					clearTimeout(timer);
					aborters.delete(abort);
					pending.delete(delivery);
					pendingBytes -= bytes;
					if (tails.get(key) === delivery) tails.delete(key);
					notify();
				});
			pending.add(delivery);
			pendingBytes += bytes;
			tails.set(key, delivery);
			void delivery.catch(() => {});
			return delivery;
		},
		async drain() {
			while (pending.size !== 0) await Promise.allSettled([...pending]);
		},
		close(error: StreamedReceiverError) {
			if (closed !== undefined) return;
			closed = error;
			for (const abort of aborters) abort(error);
			notify();
		},
	};
}

/**
 * Install the pre-module frame entrypoint. A host calls this before any
 * renderer-owned frame script; replacing a receiver already owned by another
 * document is an error rather than a silent authority transfer.
 */
export function installStreamedRendererGlobal(
	receiver: StreamedRegionReceiver,
	target: Record<string, unknown> = globalThis as Record<string, unknown>,
	options: StreamedRendererDeliveryOptions = {},
): () => void {
	const previous = Object.getOwnPropertyDescriptor(target, STREAMED_RENDERER_RECEIVER);
	const early = previous?.value as EarlyStreamedRendererGlobal | undefined;
	if (
		previous !== undefined &&
		(early === null ||
			typeof early !== 'object' ||
			early.version !== 1 ||
			!Array.isArray(early.frames) ||
			typeof early.receive !== 'function')
	) {
		throw new Error('An Octane streamed renderer receiver is already installed in this realm.');
	}
	if (early?.overflow === true) {
		throw new Error('The pre-module streamed renderer mailbox overflowed.');
	}
	const maxOpenResults = positiveLimit(options.maxPendingFrames, DEFAULT_PENDING_FRAMES);
	const resultTimeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS);
	const openResults = new Map<
		string,
		{ identity: StreamFrameIdentity; timer: ReturnType<typeof setTimeout> }
	>();
	function forgetResult(identity: StreamFrameIdentity) {
		const key = streamFrameIdentityKey(identity);
		const result = openResults.get(key);
		if (result === undefined) return;
		clearTimeout(result.timer);
		openResults.delete(key);
	}
	const delivery = createDelivery(receiver, options, (frame, disposition) => {
		if (disposition === 'stale' || frame.channel !== 'result') return;
		if (frame.kind === 'complete' || frame.kind === 'error') {
			forgetResult(frame.identity);
		} else if (frame.kind === 'open') {
			if (openResults.size >= maxOpenResults)
				throw new StreamedReceiverError(
					'overflow',
					'Streamed renderer exceeded its open result budget.',
				);
			const timer = setTimeout(() => {
				forgetResult(frame.identity);
				try {
					receiver.failSelection(
						frame.identity,
						new StreamedReceiverError('timeout', 'Streamed renderer result timed out.'),
					);
				} catch {
					/* The result was fenced before the host error callback ran. */
				}
			}, resultTimeoutMs);
			openResults.set(streamFrameIdentityKey(frame.identity), { identity: frame.identity, timer });
		}
	});
	let removed = false;
	const entrypoint: StreamedRendererGlobal = Object.freeze({
		receive(frame: unknown): void {
			if (removed) return;
			if (!isStreamedRendererFrame(frame)) {
				void receiver.receive(frame).catch(() => {});
				return;
			}
			try {
				void delivery
					.enqueue(frame, new TextEncoder().encode(JSON.stringify(frame)).byteLength)
					.catch(() => forgetResult(frame.identity));
			} catch {
				forgetResult(frame.identity);
				// The affected receiver selection reports overflow synchronously.
				// Inline callers cannot await backpressure or retry accepted work.
			}
		},
	});
	Object.defineProperty(target, STREAMED_RENDERER_RECEIVER, {
		value: entrypoint,
		configurable: true,
	});
	if (early !== undefined) {
		for (const frame of early.frames) entrypoint.receive(frame);
		early.frames.length = 0;
	}
	return () => {
		removed = true;
		const error = new StreamedReceiverError(
			'terminal',
			'Streamed renderer entrypoint was removed.',
		);
		delivery.close(error);
		for (const { identity, timer } of openResults.values()) {
			clearTimeout(timer);
			try {
				receiver.failSelection(identity, error);
			} catch {
				/* Keep retiring this transport. */
			}
		}
		openResults.clear();
		if (target[STREAMED_RENDERER_RECEIVER] !== entrypoint) return;
		delete target[STREAMED_RENDERER_RECEIVER];
	};
}

/**
 * Incrementally consume the same newline-delimited frame protocol used by the
 * initial document stream. A bounded cross-channel window permits independent
 * progress; a full window applies backpressure before accepting another frame.
 */
export async function readStreamedRendererResponse(
	response: Response,
	receiver: StreamedRegionReceiver,
	options: StreamedRendererReadOptions = {},
): Promise<void> {
	if (response.body === null) throw new Error('The streamed renderer response has no body.');
	const maxFrameBytes = positiveLimit(options.maxFrameBytes, DEFAULT_MAX_FRAME_BYTES);
	const maxTotalBytes = positiveLimit(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES);
	const timeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS);
	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const openResults = new Map<string, StreamFrameIdentity>();
	const delivery = createDelivery(receiver, options, (frame, disposition) => {
		if (disposition === 'stale' || frame.channel !== 'result') return;
		const key = streamFrameIdentityKey(frame.identity);
		if (frame.kind === 'open') openResults.set(key, frame.identity);
		else if (frame.kind === 'complete' || frame.kind === 'error') openResults.delete(key);
	});
	let frameParts: Uint8Array[] = [];
	let frameBytes = 0;
	let totalBytes = 0;
	let finished = false;
	let failure: StreamedReceiverError | undefined;
	function failOpenResults(error: StreamedReceiverError): boolean {
		let failed = false;
		for (const identity of openResults.values())
			failed = receiver.failSelection(identity, error) || failed;
		openResults.clear();
		return failed;
	}
	const acceptLine = async (): Promise<void> => {
		if (frameBytes === 0) return;
		const bytes =
			frameParts.length === 1
				? frameParts[0]
				: (() => {
						const joined = new Uint8Array(frameBytes);
						let offset = 0;
						for (const part of frameParts) {
							joined.set(part, offset);
							offset += part.byteLength;
						}
						return joined;
					})();
		const frame = JSON.parse(decoder.decode(bytes)) as unknown;
		if (!isStreamedRendererFrame(frame))
			throw new StreamedReceiverError('protocol', 'Malformed streamed renderer frame.');
		await delivery.room(frameBytes);
		void delivery.enqueue(frame, frameBytes).catch((error: StreamedReceiverError) => {
			failure ??= error;
		});
	};

	const abort = (): void => {
		failure ??= new StreamedReceiverError('terminal', 'Streamed renderer response was canceled.');
		delivery.close(failure);
		failOpenResults(failure);
		void reader.cancel(options.signal?.reason).catch(() => {});
	};
	const timer = setTimeout(() => {
		failure ??= new StreamedReceiverError('timeout', 'Streamed renderer response timed out.');
		abort();
	}, timeoutMs);
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted) abort();
	try {
		for (;;) {
			if (failure !== undefined && options.signal?.aborted) throw failure;
			options.signal?.throwIfAborted();
			const next = await reader.read();
			if (next.done) break;
			totalBytes += next.value.byteLength;
			if (totalBytes > maxTotalBytes) {
				throw new Error('The streamed renderer response exceeded its total byte budget.');
			}
			let start = 0;
			for (let index = 0; index < next.value.byteLength; index++) {
				if (next.value[index] !== 10) continue;
				const part = next.value.subarray(start, index);
				if (part.byteLength > 0) frameParts.push(part);
				frameBytes += part.byteLength;
				if (frameBytes > maxFrameBytes) {
					throw new Error('A streamed renderer frame exceeded its byte budget.');
				}
				await acceptLine();
				frameParts = [];
				frameBytes = 0;
				start = index + 1;
			}
			const tail = next.value.subarray(start);
			if (tail.byteLength > 0) frameParts.push(tail);
			frameBytes += tail.byteLength;
			if (frameBytes > maxFrameBytes) {
				throw new Error('A streamed renderer frame exceeded its byte budget.');
			}
		}
		if (frameBytes !== 0) throw new Error('The streamed renderer response ended mid-frame.');
		await delivery.drain();
		const terminalError = new StreamedReceiverError(
			'terminal',
			'The streamed renderer response ended before a result terminal.',
		);
		if (failOpenResults(terminalError)) failure ??= terminalError;
		if (failure !== undefined) throw failure;
		finished = true;
	} catch (cause) {
		const error =
			cause instanceof StreamedReceiverError
				? cause
				: new StreamedReceiverError(
						'protocol',
						cause instanceof Error ? cause.message : 'Streamed renderer response failed.',
					);
		delivery.close(error);
		failOpenResults(error);
		throw error;
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
		if (!finished) {
			try {
				void reader.cancel().catch(() => {});
			} catch {
				// The transport may already have failed or closed.
			}
		}
		reader.releaseLock();
	}
}
