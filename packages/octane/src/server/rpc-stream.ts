import {
	encodeServerResultFrame,
	serverResultLimits,
	type ServerResultFrame,
	type ServerResultLimits,
} from '../server-rpc-protocol.js';

/**
 * One invocation, one bounded result channel. next() is demand-driven: a slow
 * reader cannot make a generator produce an unbounded server-side mailbox.
 */
export function createServerResultStream(
	result: unknown,
	options: ServerResultLimits & { signal?: AbortSignal; cancel?: () => void } = {},
): ReadableStream<Uint8Array> {
	const limits = serverResultLimits(options);
	let sequence = 0;
	let totalBytes = 0;
	let iterator: AsyncIterator<unknown> | undefined;
	let finished = false;
	let terminal = false;
	let streaming = false;
	let initialized = false;
	let pending: Promise<unknown> | undefined = Promise.resolve(result);
	// Observe rejection even if the transport never asks for the first frame.
	void pending.catch(() => {});
	let controller: ReadableStreamDefaultController<Uint8Array>;
	let timer: ReturnType<typeof setTimeout>;
	const cleanup = () => {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
		const abandoned = pending;
		pending = undefined;
		if (abandoned === undefined) return;
		// An unread response still owns any iterable that finishes setup after it ends.
		void abandoned.then(
			(value) => {
				try {
					if (value !== null && typeof value === 'object' && Symbol.asyncIterator in value) {
						closeIterator((value as AsyncIterable<unknown>)[Symbol.asyncIterator]());
					}
				} catch {
					/* Best effort. */
				}
			},
			() => {},
		);
	};
	const closeIterator = (target = iterator) => {
		iterator = undefined;
		try {
			void Promise.resolve(target?.return?.()).catch(() => {});
		} catch {
			/* Best effort. */
		}
	};
	const write = (frame: ServerResultFrame) => {
		const encoded = encodeServerResultFrame(sequence, frame);
		if (
			encoded.byteLength > limits.maxFrameBytes ||
			totalBytes + encoded.byteLength > limits.maxTotalBytes
		) {
			throw new Error('Server result exceeded its response budget');
		}
		sequence++;
		totalBytes += encoded.byteLength;
		controller.enqueue(encoded);
	};
	const fail = (message: string) => {
		if (finished) return;
		finished = true;
		cleanup();
		options.cancel?.();
		closeIterator();
		try {
			write({ kind: 'error', error: message });
			controller.close();
		} catch (error) {
			controller.error(error);
		}
	};
	const abort = () => fail('Server function was canceled');
	return new ReadableStream<Uint8Array>(
		{
			start(streamController) {
				controller = streamController;
				timer = setTimeout(() => fail('Server function timed out'), limits.timeoutMs);
				options.signal?.addEventListener('abort', abort, { once: true });
				if (options.signal?.aborted) abort();
			},
			async pull() {
				if (finished) return;
				try {
					if (terminal) {
						write({ kind: 'complete' });
						finished = true;
						cleanup();
						controller.close();
						return;
					}
					if (!initialized) {
						const value = await pending;
						pending = undefined;
						if (finished) return;
						initialized = true;
						if (value !== null && typeof value === 'object' && Symbol.asyncIterator in value) {
							iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
							streaming = true;
							write({ kind: 'stream' });
							return;
						}
						write({ kind: 'value', value });
						terminal = true;
						return;
					}
					if (streaming) {
						const item = await iterator!.next();
						if (finished) return;
						if (item.done) {
							iterator = undefined;
							write({ kind: 'complete' });
							finished = true;
							cleanup();
							controller.close();
						} else {
							write({ kind: 'value', value: item.value });
						}
					}
				} catch {
					// Do not expose a thrown server error or private stack over this wire.
					fail('Server function failed');
				}
			},
			cancel() {
				if (finished) return;
				finished = true;
				cleanup();
				options.cancel?.();
				closeIterator();
			},
		},
		{ highWaterMark: 0 },
	);
}
