import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerResult } from '../src/server-rpc-stream-client.js';
import { encodeServerResultFrame, ServerCallUncertainError } from '../src/server-rpc-protocol.js';
import {
	installStreamedRendererGlobal,
	readStreamedRendererResponse,
	type StreamedRendererGlobal,
} from '../src/hydration/stream-delivery.js';
import type { StreamedRendererFrame } from '../src/streamed-signals-protocol.js';

function hostTask(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			channel.port2.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}
async function microtasks() {
	for (let i = 0; i < 100; i++) await Promise.resolve();
}
function clock() {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	return (ms = 2) => {
		now += ms;
	};
}
function rpcBytes(count: number): Uint8Array<ArrayBuffer> {
	const frames = [
		encodeServerResultFrame(0, { kind: 'stream' }),
		...Array.from({ length: count }, (_, value) =>
			encodeServerResultFrame(value + 1, { kind: 'value', value }),
		),
		encodeServerResultFrame(count + 1, { kind: 'complete' }),
	];
	const bytes = new Uint8Array(frames.reduce((length, frame) => length + frame.length, 0));
	let offset = 0;
	for (const frame of frames) {
		bytes.set(frame, offset);
		offset += frame.length;
	}
	return bytes;
}
async function rpcIterator(response: Response, signal?: AbortSignal) {
	return ((await readServerResult(response, { signal })) as AsyncIterable<number>)[
		Symbol.asyncIterator
	]();
}
function rendererFrames(count: number): StreamedRendererFrame[] {
	const identity = {
		protocol: 1 as const,
		buildId: 'build',
		documentId: 'document',
		ownerKey: 'owner',
		instanceKey: 'instance',
		nodeKey: 'node',
		selectionKey: 'selection',
		selectionGeneration: 0,
		attempt: 0,
	};
	return [
		{ identity, sequence: 0, channel: 'result', kind: 'open', resource: 'stream' },
		...Array.from({ length: count }, (_, value) => ({
			identity,
			sequence: value + 1,
			channel: 'result' as const,
			kind: 'value' as const,
			value: ['number', value] as ['number', number],
		})),
		{ identity, sequence: count + 1, channel: 'result', kind: 'complete' },
	];
}
function rendererResponse(count: number) {
	return new Response(
		rendererFrames(count)
			.map((frame) => JSON.stringify(frame) + '\n')
			.join(''),
	);
}

afterEach(async () => {
	await hostTask();
	vi.restoreAllMocks();
});

describe('shared host budget for optional transport readers', () => {
	it('paces direct buffered RPC consumption and retains every ordered value', async () => {
		const spend = clock();
		const values: number[] = [];
		const marker = hostTask().then(() => values.length);
		const work = (async () => {
			const iterator = await rpcIterator(new Response(rpcBytes(32)));
			for (;;) {
				const step = await iterator.next();
				if (step.done) break;
				values.push(step.value);
				spend();
			}
		})();
		expect(await marker).toBeLessThan(32);
		await work;
		expect(values).toEqual(Array.from({ length: 32 }, (_, i) => i));
	});

	it('paces a queued renderer delivery backlog after its first acknowledgement resumes', async () => {
		const spend = clock();
		const values: number[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const failSelection = vi.fn(() => true);
		const work = readStreamedRendererResponse(rendererResponse(32), {
			async receive(value) {
				const frame = value as StreamedRendererFrame;
				if (frame.kind === 'open') await gate;
				if (frame.kind === 'value') {
					values.push(frame.value[1] as number);
					spend();
				}
				return 'accepted';
			},
			failSelection,
		});
		await hostTask();
		const marker = hostTask().then(() => values.length);
		release();
		expect(await marker).toBeLessThan(32);
		await work;
		expect(values).toEqual(Array.from({ length: 32 }, (_, i) => i));
		expect(failSelection).not.toHaveBeenCalled();
	});

	it('paces ready partial-frame transport reads before a full value exists', async () => {
		const spend = clock();
		const bytes = rpcBytes(1);
		let offset = 0;
		const response = new Response(
			new ReadableStream(
				{
					pull(controller) {
						spend();
						if (offset === bytes.length) controller.close();
						else controller.enqueue(bytes.slice(offset, ++offset));
					},
				},
				{ highWaterMark: 0 },
			),
		);
		const marker = hostTask().then(() => offset);
		const work = (async () => {
			const iterator = await rpcIterator(response);
			expect(await iterator.next()).toEqual({ done: false, value: 0 });
			expect((await iterator.next()).done).toBe(true);
		})();
		expect(await marker).toBeLessThan(bytes.length);
		await work;
		expect(response.body!.locked).toBe(false);
	});

	it('shares its budget as more direct readers join the same task', async () => {
		const spend = clock();
		const seen = Array.from({ length: 12 }, () => [] as number[]);
		const iterators: AsyncIterator<number>[] = [];
		const marker = hostTask().then(() => seen.flat().length);
		const work = (async () => {
			// Each reader remains open while another joins. A budget reset for
			// every reader would admit all twelve first values in this task.
			for (const values of seen) {
				const iterator = await rpcIterator(new Response(rpcBytes(4)));
				iterators.push(iterator);
				const first = await iterator.next();
				values.push(first.value!);
				spend();
			}
			await Promise.all(
				iterators.map(async (iterator, index) => {
					for (;;) {
						const step = await iterator.next();
						if (step.done) break;
						seen[index].push(step.value);
						spend();
					}
				}),
			);
		})();
		expect(await marker).toBeLessThan(12);
		await work;
		expect(seen).toEqual(Array.from({ length: 12 }, () => [0, 1, 2, 3]));
	});

	for (const fragmented of [false, true])
		it(`retires a waiting RPC pull after return (${fragmented ? 'fragmented' : 'buffered'})`, async () => {
			const spend = clock();
			const bytes = rpcBytes(3);
			let offset = 0;
			let pulls = 0;
			const cancel = vi.fn();
			const response = new Response(
				new ReadableStream(
					{
						pull(controller) {
							pulls++;
							if (offset === bytes.length) controller.close();
							else {
								const end = fragmented ? Math.min(bytes.length, offset + 8) : bytes.length;
								controller.enqueue(bytes.slice(offset, end));
								offset = end;
							}
						},
						cancel,
					},
					{ highWaterMark: 0 },
				),
			);
			const iterator = await rpcIterator(response);
			expect(await iterator.next()).toEqual({ done: false, value: 0 });
			spend(8);
			const pending = iterator.next();
			await microtasks();
			await iterator.return!();
			const pullsAtReturn = pulls;
			expect(await pending).toEqual({ done: true, value: undefined });
			expect(pulls).toBe(pullsAtReturn);
			expect(cancel).toHaveBeenCalledTimes(1);
			expect(response.body!.locked).toBe(false);
		});

	it('keeps abort authoritative while an RPC pull waits for the budget', async () => {
		const spend = clock();
		const controller = new AbortController();
		const response = new Response(rpcBytes(3));
		const iterator = await rpcIterator(response, controller.signal);
		await iterator.next();
		spend(8);
		const pending = iterator.next();
		await microtasks();
		controller.abort('stopped');
		await expect(pending).rejects.toBeInstanceOf(ServerCallUncertainError);
		expect(response.body!.locked).toBe(false);
	});

	it('continues to reject malformed RPC frames instead of treating close as return', async () => {
		const response = new Response(
			new TextDecoder().decode(encodeServerResultFrame(0, { kind: 'stream' })) + 'invalid\n',
		);
		const iterator = await rpcIterator(response);
		await expect(iterator.next()).rejects.toBeInstanceOf(ServerCallUncertainError);
		expect(response.body!.locked).toBe(false);
	});

	it('cancels renderer admission without delivering queued frames after abort', async () => {
		const spend = clock();
		const controller = new AbortController();
		const values: number[] = [];
		const response = rendererResponse(32);
		const work = readStreamedRendererResponse(
			response,
			{
				async receive(value) {
					const frame = value as StreamedRendererFrame;
					if (frame.kind === 'value') {
						values.push(frame.value[1] as number);
						spend(8);
					}
					return 'accepted';
				},
				failSelection() {
					return true;
				},
			},
			{ signal: controller.signal },
		);
		const outcome = work.catch((error) => error);
		await microtasks();
		controller.abort();
		const count = values.length;
		expect(count).toBeLessThan(32);
		expect(await outcome).toBeInstanceOf(Error);
		await hostTask();
		expect(values).toHaveLength(count);
		expect(response.body!.locked).toBe(false);
	});

	it('retains custom-reader backpressure while a delivery is pending', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const sequences: number[] = [];
		const work = readStreamedRendererResponse(
			rendererResponse(3),
			{
				async receive(value) {
					const frame = value as StreamedRendererFrame;
					sequences.push(frame.sequence);
					if (frame.sequence === 0) await gate;
					return 'accepted';
				},
				failSelection() {
					return true;
				},
			},
			{ maxPendingFrames: 1 },
		);
		await hostTask();
		expect(sequences).toEqual([0]);
		release();
		await work;
		expect(sequences).toEqual([0, 1, 2, 3, 4]);
	});

	it('keeps the existing inline document delivery path unpaced', async () => {
		const spend = clock();
		const values: number[] = [];
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(
			{
				async receive(value) {
					const frame = value as StreamedRendererFrame;
					if (frame.kind === 'value') {
						values.push(frame.value[1] as number);
						spend();
					}
					return 'accepted';
				},
				failSelection() {
					return true;
				},
			},
			realm,
		);
		try {
			const marker = hostTask().then(() => values.length);
			for (const frame of rendererFrames(32))
				(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive(frame);
			expect(await marker).toBe(32);
		} finally {
			uninstall();
		}
	});
});
