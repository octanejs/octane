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
 * @returns {ReadableStream<Uint8Array>}
 */
export function composeHtmlStream(prefix, renderStream, suffix) {
	const encoder = new TextEncoder();
	const reader = renderStream.getReader();
	let phase = 0; // 0 prefix, 1 renderer, 2 suffix, 3 closed
	let released = false;

	function release() {
		if (released) return;
		released = true;
		reader.releaseLock();
	}

	return new ReadableStream(
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
							const { done, value } = await reader.read();
							if (!done) {
								controller.enqueue(value);
								return;
							}
							release();
							phase = 2;
						}

						if (phase === 2) {
							phase = 3;
							if (suffix !== '') controller.enqueue(encoder.encode(suffix));
							controller.close();
							return;
						}
						return;
					}
				} catch (error) {
					release();
					phase = 3;
					controller.error(error);
				}
			},
			async cancel(reason) {
				phase = 3;
				try {
					await reader.cancel(reason);
				} finally {
					release();
				}
			},
		},
		{ highWaterMark: 0 },
	);
}
