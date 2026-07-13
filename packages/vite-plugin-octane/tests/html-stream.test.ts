import { describe, expect, it } from 'vitest';
import { composeHtmlStream } from '../src/server/html-stream.js';

const decode = (value: Uint8Array | undefined) => new TextDecoder().decode(value);

describe('composeHtmlStream', () => {
	it('pulls prefix, renderer chunks, and suffix on demand', async () => {
		let rendererPulls = 0;
		const renderer = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					rendererPulls++;
					if (rendererPulls === 1) controller.enqueue(new TextEncoder().encode('body'));
					else controller.close();
				},
			},
			{ highWaterMark: 0 },
		);
		const composed = composeHtmlStream('prefix', renderer, 'suffix');
		const reader = composed.getReader();

		// Construction does not drain the renderer; the first read exposes only
		// the already-available template prefix.
		expect(rendererPulls).toBe(0);
		expect(decode((await reader.read()).value)).toBe('prefix');
		expect(rendererPulls).toBe(0);
		expect(decode((await reader.read()).value)).toBe('body');
		expect(rendererPulls).toBe(1);
		expect(decode((await reader.read()).value)).toBe('suffix');
		expect((await reader.read()).done).toBe(true);
	});

	it('propagates consumer cancellation to the locked renderer reader', async () => {
		let cancelledWith: unknown;
		const renderer = new ReadableStream<Uint8Array>({
			cancel(reason) {
				cancelledWith = reason;
			},
		});
		const reader = composeHtmlStream('prefix', renderer, 'suffix').getReader();
		await reader.read();
		await reader.cancel('request closed');
		expect(cancelledWith).toBe('request closed');
		expect(renderer.locked).toBe(false);
	});
});
