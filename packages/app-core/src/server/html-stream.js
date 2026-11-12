// @ts-check

/**
 * Compose an HTML template around the renderer without draining it eagerly.
 * Each consumer pull advances at most one visible chunk (prefix, one render
 * chunk, suffix), so backpressure reaches the core stream. Cancellation goes
 * through the locked reader and therefore reaches the renderer's source.
 *
 * @param {string} prefix
 * @param {ReadableStream<Uint8Array>} renderStream
 * @param {string} suffix
 * @param {string} [afterShell] Owned bootstrap after the renderer's first complete shell chunk.
 * @param {{ tail(suffix: string): Promise<string>, end(): void, hold?(stream: ReadableStream<Uint8Array>): void }} [ending]
 *   Computes the suffix once the render has finished, runs `end` however the stream
 *   ends, and is handed the stream, so a failed request can cancel it.
 * @returns {ReadableStream<Uint8Array>}
 */
export function composeHtmlStream(prefix, renderStream, suffix, afterShell = '', ending) {
	const encoder = new TextEncoder();
	const reader = renderStream.getReader();
	let phase = 0; // 0 prefix, 1 renderer, 2 suffix, 3 closed
	let released = false;
	let shellWritten = false;

	function release() {
		if (released) return;
		released = true;
		reader.releaseLock();
	}

	const stream = new ReadableStream(
		{
			async pull(controller) {
				try {
					for (;;) {
						if (phase === 0) {
							phase = 1;
							if (prefix !== '') {
								controller.enqueue(encoder.encode(prefix));
								return;
							}
						}

						if (phase === 1) {
							if (shellWritten && afterShell !== '') {
								controller.enqueue(encoder.encode(afterShell));
								afterShell = '';
								return;
							}
							const { done, value } = await reader.read();
							if (!done) {
								shellWritten = true;
								controller.enqueue(value);
								return;
							}
							release();
							phase = 2;
						}

						if (phase === 2) {
							phase = 3;
							const tail = ending ? await ending.tail(suffix) : suffix;
							if (tail !== '') controller.enqueue(encoder.encode(tail));
							controller.close();
							ending?.end();
							return;
						}
						return;
					}
				} catch (error) {
					release();
					phase = 3;
					controller.error(error);
					ending?.end();
				}
			},
			async cancel(reason) {
				phase = 3;
				try {
					await reader.cancel(reason);
				} finally {
					release();
					ending?.end();
				}
			},
		},
		{ highWaterMark: 0 },
	);
	ending?.hold?.(stream);
	return stream;
}
