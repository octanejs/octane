import { afterEach, expect, it, vi } from 'vitest';
import { enableSignalBindings } from '../src/runtime.js';
import {
	enableServerSignalBindings,
	renderToReadableStream,
	type StreamOptions,
} from '../src/runtime.server.js';
import {
	createStreamedRendererFrameStream,
	createStreamedSignalInjection,
	createStreamedSignalResultFrames,
} from '../src/server/streamed-signals.js';
import { bootstrapStreamedSignalResults } from '../src/hydration/streamed-signals.js';
import { __queryAt, runWithSignalOwner } from '../src/signals/index.js';
import type {
	StreamedRendererFrame,
	StreamedSignalResultFrame,
	StreamFrameIdentity,
} from '../src/streamed-signals-protocol.js';

afterEach(() => {
	vi.useRealTimers();
});

const identity: StreamFrameIdentity = {
	protocol: 1,
	buildId: 'build',
	documentId: 'document',
	ownerKey: 'owner',
	instanceKey: 'instance',
	nodeKey: 'node',
	selectionKey: 'selection',
	selectionGeneration: 0,
	attempt: 1,
};

/** An upstream (LLM tokens, a socket) that yields `values` and then stays open and idle. */
function idleUpstream(values: readonly string[] = ['first']) {
	const state = { nextCalls: 0, returned: 0 };
	const iterable: AsyncIterable<string> = {
		[Symbol.asyncIterator]() {
			return {
				next() {
					const value = values[state.nextCalls++];
					return value === undefined
						? new Promise<IteratorResult<string>>(() => {})
						: Promise.resolve({ done: false, value });
				},
				return() {
					state.returned++;
					return Promise.resolve({ done: true as const, value: undefined });
				},
			};
		},
	};
	return { iterable, state };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) {
	const decoder = new TextDecoder();
	let seen = '';
	while (!seen.includes(needle)) {
		const next = await reader.read();
		if (next.done) break;
		seen += decoder.decode(next.value, { stream: true });
	}
	return seen;
}

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = '';
	for (;;) {
		const next = await reader.read();
		if (next.done) return result + decoder.decode();
		result += decoder.decode(next.value, { stream: true });
	}
}

function App(): string {
	return '<p>shell</p>';
}

it('returns an idle upstream iterator when the consumer returns the frame producer', async () => {
	const upstream = idleUpstream();
	const frames = createStreamedSignalResultFrames(identity, Promise.resolve(upstream.iterable));
	expect((await frames.next()).value).toMatchObject({ kind: 'open', resource: 'stream' });
	expect((await frames.next()).value).toMatchObject({ kind: 'value' });
	const parked = frames.next();
	await settle();
	expect(upstream.state.nextCalls).toBe(2);
	// The body is parked on the idle upstream; return() must not queue behind it.
	await expect(frames.return(undefined)).resolves.toEqual({ done: true, value: undefined });
	expect(upstream.state.returned).toBe(1);
	// A departed consumer is owed no terminal frame.
	await expect(parked).resolves.toEqual({ done: true, value: undefined });
});

it('returns promptly while a promise result is still pending', async () => {
	const frames = createStreamedSignalResultFrames(identity, new Promise(() => {}));
	const parked = frames.next();
	await settle();
	await expect(frames.return(undefined)).resolves.toEqual({ done: true, value: undefined });
	await expect(parked).resolves.toEqual({ done: true, value: undefined });
});

it('reports a request abort during an idle upstream read and returns the upstream', async () => {
	const upstream = idleUpstream();
	const controller = new AbortController();
	const frames = createStreamedSignalResultFrames(identity, Promise.resolve(upstream.iterable), {
		signal: controller.signal,
	});
	await frames.next();
	await frames.next();
	const parked = frames.next();
	await settle();
	controller.abort(new Error('request disconnected'));
	await expect(parked).resolves.toMatchObject({
		done: false,
		value: { kind: 'error', code: 'SERVER_RESULT_FAILED', sequence: 2 },
	});
	await expect(frames.next()).resolves.toEqual({ done: true, value: undefined });
	expect(upstream.state.returned).toBe(1);
});

it('keeps the result grammar and upstream ownership when nothing cancels', async () => {
	const failing: AsyncIterable<string> = {
		[Symbol.asyncIterator]() {
			let calls = 0;
			return {
				next: () =>
					calls++ === 0
						? Promise.resolve({ done: false, value: 'a' })
						: Promise.reject(new Error('upstream broke')),
				return: returned,
			};
		},
	};
	const returned = vi.fn(() => Promise.resolve({ done: true as const, value: undefined }));
	const kinds = async (result: unknown) => {
		const out: string[] = [];
		for await (const frame of createStreamedSignalResultFrames(identity, result)) {
			out.push((frame as StreamedSignalResultFrame).kind);
		}
		return out;
	};
	const drainedReturn = vi.fn(() => Promise.resolve({ done: true as const, value: undefined }));
	const drained: AsyncIterable<string> = {
		[Symbol.asyncIterator]() {
			const values = ['a', 'b'];
			return {
				next: () =>
					Promise.resolve(
						values.length === 0
							? { done: true as const, value: undefined }
							: { done: false as const, value: values.shift()! },
					),
				return: drainedReturn,
			};
		},
	};
	await expect(kinds(Promise.resolve(drained))).resolves.toEqual([
		'open',
		'value',
		'value',
		'complete',
	]);
	await expect(kinds(Promise.resolve('value'))).resolves.toEqual(['open', 'value', 'complete']);
	await expect(kinds(Promise.reject(new Error('nope')))).resolves.toEqual(['open', 'error']);
	await expect(kinds(Promise.resolve(failing))).resolves.toEqual(['open', 'value', 'error']);
	// A failed read still releases the upstream; a drained one is not returned again.
	expect(returned).toHaveBeenCalledTimes(1);
	expect(drainedReturn).not.toHaveBeenCalled();
});

it('returns an idle upstream when the reader cancels a streamed response', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const upstream = idleUpstream();
	const injection = createStreamedSignalInjection(identity, Promise.resolve(upstream.iterable), {
		timeoutMs: 1_000,
	});
	const stream = await renderToReadableStream(App, undefined, { injection });
	const reader = stream.getReader();
	await readUntil(reader, '"kind":"value"');
	await vi.advanceTimersByTimeAsync(10);
	expect(upstream.state.nextCalls).toBe(2);
	expect(upstream.state.returned).toBe(0);
	await reader.cancel('client went away');
	await vi.advanceTimersByTimeAsync(10);
	expect(upstream.state.returned).toBe(1);
	expect(vi.getTimerCount()).toBe(0);
});

it('returns an idle upstream when its inactivity timeout fails the injection', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const upstream = idleUpstream();
	const injection = createStreamedSignalInjection(identity, Promise.resolve(upstream.iterable), {
		timeoutMs: 1_000,
	});
	const failed = expect(injection.done).rejects.toThrow('Streamed renderer injection timed out.');
	injection.subscribe(() => {
		injection.take();
		injection.accepted?.();
	});
	await vi.advanceTimersByTimeAsync(999);
	expect(upstream.state.returned).toBe(0);
	await vi.advanceTimersByTimeAsync(1);
	await failed;
	expect(upstream.state.returned).toBe(1);
});

it('returns an idle upstream when an NDJSON response is cancelled', async () => {
	const upstream = idleUpstream();
	const stream = createStreamedRendererFrameStream(
		createStreamedSignalResultFrames(identity, Promise.resolve(upstream.iterable)),
		{ timeoutMs: 60_000 },
	);
	const reader = stream.getReader();
	await readUntil(reader, '"kind":"value"');
	// A demand-driven stream reaches the idle upstream only with a read outstanding.
	const parked = reader.read();
	await settle();
	expect(upstream.state.nextCalls).toBe(2);
	await reader.cancel();
	await expect(parked).resolves.toEqual({ done: true, value: undefined });
	await settle();
	expect(upstream.state.returned).toBe(1);
});

it('returns an idle automatic query upstream when the request aborts', async () => {
	enableServerSignalBindings();
	const upstream = idleUpstream();
	const value$ = __queryAt(
		'g:idle-automatic',
		() => 'a',
		() => upstream.iterable,
		{ key: 'idle-automatic' },
	);
	const controller = new AbortController();
	const stream = await renderToReadableStream(
		() => `<p>${value$.snapshot().status}</p>`,
		undefined,
		{
			signal: controller.signal,
			streamedSignals: { buildId: 'build', documentId: 'idle-automatic', timeoutMs: 60_000 },
			onError() {},
		} as StreamOptions,
	);
	const reader = stream.getReader();
	const reading = readUntil(reader, '"kind":"value"');
	await reading;
	await settle();
	expect(upstream.state.returned).toBe(0);
	controller.abort(new Error('request disconnected'));
	await reader.cancel().catch(() => {});
	await settle();
	expect(upstream.state.returned).toBe(1);
});

it('streams the automatic channels it can hold and leaves overflow attempts to the browser', async () => {
	enableServerSignalBindings();
	const pending: Array<() => void> = [];
	const loads = Array.from({ length: 300 }, () => 0);
	const queries = Array.from({ length: 300 }, (_, i) =>
		__queryAt(
			`g:channel-overflow-${i}`,
			() => `k${i}`,
			() => {
				loads[i]!++;
				return new Promise<string>((resolve) => pending.push(() => resolve(`v${i}`)));
			},
			{ key: `channel-overflow-${i}` },
		),
	);
	const errors: unknown[] = [];
	const stream = await renderToReadableStream(
		() => queries.map((query) => `<p>${query.snapshot().status}</p>`).join(''),
		undefined,
		{
			streamedSignals: { buildId: 'build', documentId: 'channel-overflow' },
			onError: (error: unknown) => errors.push(error),
		} as StreamOptions,
	);
	const html = text(stream);
	await settle();
	for (const resolve of pending) resolve();
	const output = await html;
	expect(errors).toEqual([]);
	expect(pending).toHaveLength(300);
	// Every live channel keeps its server work, and only those are announced.
	expect(output.match(/"kind":"complete"/g)).toHaveLength(256);
	expect(output.match(/v\.register\(/g)).toHaveLength(256);

	// In the browser, announced channels adopt the server result; the overflow loads itself.
	const frames = [
		...output.matchAll(/__octaneStreamedRenderer\.receive\((\{.*?\})\);<\/script>/g),
	].map((match) => JSON.parse(match[1]!) as StreamedRendererFrame);
	const identities = [...output.matchAll(/v\.register\((\{.*?\})\);\}\)\(globalThis\);/g)].map(
		(match) => JSON.parse(match[1]!),
	);
	const signalOwner = { scopeKey: 'octane:document' };
	enableSignalBindings();
	const results = bootstrapStreamedSignalResults({
		buildId: 'build',
		documentId: 'channel-overflow',
		signalOwner,
		target: {
			__octaneStreamedSignalSelections: { version: 1, identities, register() {} },
			__octaneStreamedRenderer: { version: 1, frames, receive() {} },
		},
	});
	try {
		const snapshot = (i: number) => runWithSignalOwner(signalOwner, () => queries[i]!.snapshot());
		expect(snapshot(0)).toMatchObject({ status: 'ready', value: 'v0' });
		expect(snapshot(255)).toMatchObject({ status: 'ready', value: 'v255' });
		expect(loads[0]).toBe(1);
		expect(snapshot(299).status).toBe('pending');
		expect(loads[299]).toBe(2);
	} finally {
		results.dispose();
	}
});
