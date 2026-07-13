import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { nodeRequestToWebRequest, sendWebResponse } from '../src/server/node-http.js';

class FakeResponse extends EventEmitter {
	statusCode = 0;
	statusMessage = '';
	destroyed = false;
	writableEnded = false;
	headers = new Map<string, unknown>();
	writes: Uint8Array[] = [];
	backpressure = true;

	setHeader(name: string, value: unknown) {
		this.headers.set(name, value);
	}

	write(value: Uint8Array) {
		this.writes.push(value);
		if (this.backpressure) {
			this.backpressure = false;
			return false;
		}
		return true;
	}

	end() {
		this.writableEnded = true;
	}
}

describe('Node HTTP web-stream bridge', () => {
	it('exposes an aborted Request signal when an upload disconnects', () => {
		const incoming = Object.assign(new EventEmitter(), {
			headers: {},
			method: 'GET',
			url: '/',
			aborted: false,
			destroyed: false,
			complete: false,
		});
		const request = nodeRequestToWebRequest(incoming as any);
		incoming.emit('aborted');
		expect(request.signal.aborted).toBe(true);
	});

	it('waits for drain before pulling the next web-stream chunk', async () => {
		let pulls = 0;
		const firstWrite = Promise.withResolvers<void>();
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulls++;
					if (pulls <= 2) controller.enqueue(new TextEncoder().encode(String(pulls)));
					else controller.close();
				},
			},
			{ highWaterMark: 0 },
		);
		const response = new FakeResponse();
		const originalWrite = response.write.bind(response);
		response.write = (value) => {
			const accepted = originalWrite(value);
			firstWrite.resolve();
			return accepted;
		};

		const sending = sendWebResponse(response as any, new Response(stream));
		await firstWrite.promise;
		expect(pulls).toBe(1);
		expect(response.writes).toHaveLength(1);
		response.emit('drain');
		await sending;
		expect(pulls).toBe(3);
		expect(response.writes).toHaveLength(2);
		expect(response.writableEnded).toBe(true);
	});

	it('cancels the web reader when the response socket closes', async () => {
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new TextEncoder().encode('body'));
			},
			cancel() {
				cancelled = true;
			},
		});
		const response = new FakeResponse();
		response.write = (value) => {
			response.writes.push(value);
			response.destroyed = true;
			response.emit('close');
			return false;
		};
		await sendWebResponse(response as any, new Response(stream));
		expect(cancelled).toBe(true);
		expect(response.writableEnded).toBe(false);
	});
});
