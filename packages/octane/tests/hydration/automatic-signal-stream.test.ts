import { expect, it, vi } from 'vitest';
import { createRoot, enableSignalBindings, type Scope } from '../../src/runtime.js';
import {
	enableServerSignalBindings,
	prerender,
	renderToPipeableStream,
	renderToReadableStream,
	ssrBlock,
	ssrHtml,
	ssrTry,
	use,
	type StreamOptions,
} from '../../src/runtime.server.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import { StreamedReceiverError } from '../../src/hydration/stream-receiver.js';
import { __queryAt, runWithSignalOwner } from '../../src/signals/index.js';
import type { StreamedRendererFrame } from '../../src/streamed-signals-protocol.js';

type SSRScope = Parameters<typeof ssrTry>[0];

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
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

function streamedFrames(html: string): StreamedRendererFrame[] {
	return [...html.matchAll(/__octaneStreamedRenderer\.receive\((\{.*?\})\);<\/script>/g)].map(
		(match) => JSON.parse(match[1]!) as StreamedRendererFrame,
	);
}

function streamedTarget(html: string): Record<string, unknown> {
	const frames = streamedFrames(html);
	const selectionMatch = html.match(/v\.register\((\{.*?\})\);\}\)\(globalThis\);<\/script>/);
	expect(selectionMatch).not.toBeNull();
	return {
		__octaneStreamedSignalSelections: {
			version: 1,
			identities: [JSON.parse(selectionMatch![1]!)],
			register() {},
		},
		__octaneStreamedRenderer: {
			version: 1,
			frames: frames.slice(),
			receive(this: { frames: unknown[] }, frame: unknown) {
				this.frames.push(frame);
			},
		},
	};
}

it('automatically publishes a rendered query attempt after the pre-module receiver', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const load = vi.fn(() => result.promise);
	const value$ = __queryAt(
		'g:auto-stream-query-site',
		'authored-auto-query',
		() => 'conversation-a',
		load,
	);
	function App(_props: unknown, _scope: SSRScope): string {
		const snapshot = value$.snapshot();
		return `<p>${snapshot.status}</p>`;
	}

	const stream = await renderToReadableStream(App, undefined, {
		identifierPrefix: 'app-',
		streamedSignals: {
			buildId: 'build:auto-stream-query',
			documentId: 'document:auto-stream-query',
			selectionGeneration: 4,
		},
	});
	const output = text(stream);
	result.resolve('server-result');
	const html = await output;

	expect(load).toHaveBeenCalledTimes(1);
	expect(html.indexOf('var k="__octaneStreamedRenderer"')).toBeLessThan(
		html.indexOf('__octaneStreamedRenderer.receive('),
	);
	const frames = streamedFrames(html);
	expect(frames.map((frame) => frame.kind)).toEqual(['open', 'value', 'complete']);
	expect(frames[0]!.identity).toMatchObject({
		buildId: 'build:auto-stream-query',
		documentId: 'document:auto-stream-query',
		ownerKey: 'octane:document',
		instanceKey: JSON.stringify(['app-', 'root']),
		nodeKey: 'g:authored-auto-query',
		selectionGeneration: 4,
		attempt: 1,
	});
	const target = streamedTarget(html);
	enableSignalBindings();
	const hydration = bootstrapStreamedSignalHydration({
		buildId: 'build:auto-stream-query',
		documentId: 'document:auto-stream-query',
		target,
	});
	expect(value$.get()).toBe('server-result');
	expect(load).toHaveBeenCalledTimes(1);
	const container = document.createElement('div');
	document.body.append(container);
	let clientValue: unknown;
	let clientError: unknown;
	function Client(_props: unknown, _scope: Scope): void {
		clientValue = value$.get();
	}
	const root = createRoot(container, {
		signalOwner: hydration.signalOwner,
		signalInstancePrefix: 'app-',
		onUncaughtError(error) {
			clientError = error;
		},
	});
	root.render(Client, {});
	expect(clientError).toBeUndefined();
	expect(clientValue).toBe('server-result');
	expect(load).toHaveBeenCalledTimes(1);
	root.unmount();
	expect(value$.get()).toBe('server-result');
	expect(load).toHaveBeenCalledTimes(1);
	hydration.dispose();
	container.remove();
});

it('releases 32 staggered query regions without waiting for earlier siblings', async () => {
	enableServerSignalBindings();
	const pending = Array.from({ length: 32 }, () => deferred<string>());
	const values = pending.map((result, index) =>
		__queryAt(
			`g:staggered-query-${index}`,
			() => index,
			() => result.promise,
		),
	);
	function App(_props: unknown, scope: SSRScope): string {
		return ssrHtml(
			values
				.map((value, index) =>
					ssrTry(
						scope,
						`staggered-region-${index}`,
						() => ssrBlock(`<p data-index="${index}">${value.get()}</p>`),
						() => ssrBlock(`<i data-index="${index}">waiting</i>`),
						null,
					),
				)
				.join(''),
		);
	}
	const controller = new AbortController();
	const stream = await renderToReadableStream(App, undefined, {
		signal: controller.signal,
		streamedSignals: {
			buildId: 'staggered-build',
			documentId: 'staggered-document',
			timeoutMs: 2_000,
		},
	});
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let html = '';
	const readUntil = async (needle: string): Promise<void> => {
		while (!html.includes(needle)) {
			const next = await reader.read();
			if (next.done) throw new Error(`Stream ended before ${needle}`);
			html += decoder.decode(next.value, { stream: true });
		}
	};
	try {
		await readUntil('<i data-index="31">waiting</i>');
		// The last sibling settles first, while every preceding sibling is still pending.
		for (let index = pending.length - 1; index >= 0; index--) {
			pending[index]!.resolve(`accepted:${index}`);
			await readUntil(`accepted:${index}</p>`);
		}
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			html += decoder.decode(next.value, { stream: true });
		}
		const frames = streamedFrames(html);
		expect(
			frames
				.filter((frame) => frame.kind === 'value')
				.map((frame) => (frame.kind === 'value' ? frame.value : undefined)),
		).toEqual(pending.map((_, index) => ['string', `accepted:${31 - index}`]));
		expect(frames.filter((frame) => frame.kind === 'complete')).toHaveLength(pending.length);
	} finally {
		controller.abort();
		await reader.cancel();
	}
});

it('joins pending server queries from the initial shell without starting a browser fetch', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const load = vi.fn(() => result.promise);
	const value$ = __queryAt('g:early-query', 'early-query', () => 'a', load);
	const loadBody = vi.fn(async function* () {
		yield 'first server turn';
		yield 'second server turn';
	});
	const body$ = __queryAt(
		'g:early-dependent-query',
		'early-dependent-query',
		() => value$.get(),
		loadBody,
		{ kind: 'stream' },
	);
	const ready = vi.fn();
	const stream = await renderToReadableStream(
		() => `<p>${value$.snapshot().status}:${body$.snapshot().status}</p>`,
		undefined,
		{
			onEarlyHydrationReady: ready,
			streamedSignals: { buildId: 'build:early', documentId: 'document:early' },
		},
	);
	const reader = stream.getReader();
	let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
	let unsubscribe: (() => void) | undefined;
	try {
		expect(ready).toHaveBeenCalledTimes(1);
		const shell = new TextDecoder().decode((await reader.read()).value);
		result.resolve('authenticated');
		let remainder = '';
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			remainder += new TextDecoder().decode(next.value);
		}
		const frames = streamedFrames(remainder);
		const bodyFrames = frames.filter(
			(frame) => frame.identity.nodeKey === 'g:early-dependent-query',
		);
		expect(bodyFrames.map((frame) => frame.kind)).toEqual(['open', 'value', 'value', 'complete']);
		enableSignalBindings();
		for (const ordering of [
			'before-open',
			'after-open',
			'after-complete',
			'overflow',
			'timeout',
			'superseded',
			'wrong-resource',
		]) {
			const target = streamedTarget(shell);
			const signalOwner = { scopeKey: 'octane:document' };
			hydration = bootstrapStreamedSignalHydration({
				buildId: 'build:early',
				documentId: 'document:early',
				signalOwner,
				target,
				...(ordering === 'overflow' ? { maxPendingFrames: 2 } : {}),
			});
			const snapshot = () => runWithSignalOwner(signalOwner, () => body$.snapshot());
			const observed: unknown[] = [];
			const observe = () => {
				expect(snapshot().status).toBe('pending');
				unsubscribe = runWithSignalOwner(signalOwner, () =>
					body$.subscribe(() => observed.push(snapshot())),
				);
			};
			expect(runWithSignalOwner(signalOwner, () => value$.snapshot().status)).toBe('pending');
			if (!ordering.startsWith('after-')) observe();
			(target.__octaneStreamedSignalSelections as { register(identity: unknown): void }).register(
				bodyFrames[0]!.identity,
			);
			// A sibling can open before auth delivery, and before or after this
			// descriptor exists. Neither ordering may lose the first sequence.
			await hydration.receiver.receive(
				ordering === 'wrong-resource' ? { ...bodyFrames[0], resource: 'promise' } : bodyFrames[0],
			);
			if (ordering === 'after-open') observe();
			if (ordering === 'timeout') {
				expect(
					hydration.receiver.failSelection(
						bodyFrames[0]!.identity,
						new StreamedReceiverError('timeout', 'The dependent transport timed out.'),
					),
				).toBe(true);
			} else if (ordering === 'superseded') {
				const identity = { ...bodyFrames[0]!.identity, selectionGeneration: 1, attempt: 2 };
				(target.__octaneStreamedSignalSelections as { register(identity: unknown): void }).register(
					identity,
				);
				for (const frame of bodyFrames.slice(1))
					expect(await hydration.receiver.receive(frame)).toBe('stale');
				for (const frame of bodyFrames) await hydration.receiver.receive({ ...frame, identity });
			} else {
				await hydration.receiver.receive(bodyFrames[1]);
				if (ordering === 'overflow') {
					await expect(hydration.receiver.receive(bodyFrames[2])).rejects.toMatchObject({
						code: 'overflow',
					});
				} else if (ordering === 'wrong-resource') {
					await hydration.receiver.receive({ ...bodyFrames[3], sequence: 2 });
				} else {
					for (const frame of bodyFrames.slice(2)) await hydration.receiver.receive(frame);
				}
			}
			if (ordering === 'after-complete') observe();
			expect(snapshot().status).toBe('pending');
			for (const frame of frames.filter((frame) => frame.identity.nodeKey === 'g:early-query')) {
				await hydration.receiver.receive(frame);
			}
			const expected =
				ordering === 'overflow' || ordering === 'timeout' || ordering === 'wrong-resource'
					? {
							status: 'error',
							error: { code: ordering === 'wrong-resource' ? 'identity' : ordering },
						}
					: { status: 'ready', value: 'second server turn', complete: true };
			await vi.waitFor(() => expect(snapshot()).toMatchObject(expected));
			expect(observed.at(-1)).toMatchObject(expected);
			unsubscribe();
			unsubscribe = undefined;
			hydration.dispose();
			hydration = undefined;
		}
		expect(load).toHaveBeenCalledTimes(1);
		expect(loadBody).toHaveBeenCalledTimes(1);
	} finally {
		result.resolve('cleanup');
		await reader.cancel();
		unsubscribe?.();
		hydration?.dispose();
	}
});

it.each(['open', 'missing', 'complete'])(
	'bounds a pre-module result whose delivery is %s',
	async (delivery) => {
		enableServerSignalBindings();
		const load = vi.fn(async () => 'server');
		const value$ = __queryAt(
			`g:truncated-early-query-${delivery}`,
			`truncated-early-query-${delivery}`,
			() => 'a',
			load,
		);
		const html = await text(
			await renderToReadableStream(() => `<p>${value$.snapshot().status}</p>`, undefined, {
				streamedSignals: { buildId: 'truncated-build', documentId: 'truncated-document' },
			}),
		);
		const target = streamedTarget(html);
		// Bootstrap must preserve complete results and bound both kinds of truncation.
		(target.__octaneStreamedRenderer as { frames: unknown[] }).frames = streamedFrames(html).filter(
			(frame) => delivery === 'complete' || (delivery === 'open' && frame.kind === 'open'),
		);
		vi.useFakeTimers();
		const hydration = bootstrapStreamedSignalHydration({
			buildId: 'truncated-build',
			documentId: 'truncated-document',
			signalOwner: Object.freeze({ scopeKey: 'octane:document' }),
			target,
			timeoutMs: 20,
		});
		try {
			expect(runWithSignalOwner(hydration.signalOwner, () => value$.snapshot().status)).toBe(
				delivery === 'complete' ? 'ready' : 'pending',
			);
			await vi.advanceTimersByTimeAsync(21);
			expect(runWithSignalOwner(hydration.signalOwner, () => value$.snapshot())).toMatchObject({
				...(delivery === 'complete'
					? { status: 'ready', value: 'server', complete: true }
					: { status: 'error', error: { code: 'timeout' } }),
			});
			expect(load).toHaveBeenCalledTimes(1);
		} finally {
			hydration.dispose();
			vi.useRealTimers();
		}
	},
);

it('buffers prerendered query results into the same pre-module receiver', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const load = vi.fn(() => result.promise);
	const value$ = __queryAt(
		'g:auto-prerender-query-site',
		'authored-auto-prerender-query',
		() => 'conversation-buffered',
		load,
	);
	function App(): string {
		return ssrHtml(ssrBlock(`<html><body><p>${value$.get()}</p></body></html>`));
	}

	const rendering = prerender(App, undefined, {
		identifierPrefix: 'buffered-',
		signalOwner: { scopeKey: 'octane:document' },
		streamedSignals: {
			buildId: 'build:auto-prerender-query',
			documentId: 'document:auto-prerender-query',
		},
	});
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
	result.resolve('buffered-server-result');
	const rendered = await rendering;

	expect(rendered.html).toContain('<p>buffered-server-result</p>');
	expect(rendered.html.lastIndexOf('__octaneStreamedRenderer.receive(')).toBeLessThan(
		rendered.html.indexOf('</body>'),
	);
	expect(streamedFrames(rendered.html).map((frame) => frame.kind)).toEqual([
		'open',
		'value',
		'complete',
	]);
	enableSignalBindings();
	const hydration = bootstrapStreamedSignalHydration({
		buildId: 'build:auto-prerender-query',
		documentId: 'document:auto-prerender-query',
		target: streamedTarget(rendered.html),
	});
	expect(value$.get()).toBe('buffered-server-result');
	expect(load).toHaveBeenCalledTimes(1);
	hydration.dispose();
});

it('observes buffered transport failure while rendering is still suspended', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const started = deferred<void>();
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => {
		unhandled.push(reason);
	};
	process.on('unhandledRejection', onUnhandled);
	const value$ = __queryAt(
		'g:buffered-timeout',
		'buffered-timeout',
		() => 'a',
		() => {
			started.resolve();
			return result.promise;
		},
	);
	try {
		const rendering = prerender(() => `<p>${value$.get()}</p>`, undefined, {
			streamedSignals: { buildId: 'build', documentId: 'buffered-timeout', timeoutMs: 10 },
		});
		const rejected = expect(rendering).rejects.toThrow('Automatic streamed signals timed out.');
		await started.promise;
		await new Promise((resolve) => setTimeout(resolve, 40));
		result.resolve('too late');
		await rejected;
		expect(unhandled).toEqual([]);
	} finally {
		result.resolve('cleanup');
		process.off('unhandledRejection', onUnhandled);
	}
});

it('cancels buffered result collection with the request rather than waiting for its transport timeout', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const started = deferred<void>();
	const value$ = __queryAt(
		'g:buffered-abort',
		'buffered-abort',
		() => 'a',
		() => {
			started.resolve();
			return result.promise;
		},
	);
	const controller = new AbortController();
	const reason = new Error('request disconnected');
	const rendering = prerender(() => `<p>${value$.snapshot().status}</p>`, undefined, {
		signal: controller.signal,
		streamedSignals: { buildId: 'build', documentId: 'buffered-abort', timeoutMs: 150 },
	});
	const rejected = expect(rendering).rejects.toBe(reason);
	try {
		await started.promise;
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort(reason);
		await rejected;
	} finally {
		result.resolve('cleanup');
	}
});

it('propagates a buffered transport deadline through a permanently suspended render', async () => {
	enableServerSignalBindings();
	const value$ = __queryAt(
		'g:buffered-never',
		'buffered-never',
		() => 'a',
		() => new Promise<string>(() => {}),
	);
	await expect(
		prerender(() => `<p>${value$.get()}</p>`, undefined, {
			timeoutMs: 150,
			streamedSignals: { buildId: 'build', documentId: 'buffered-never', timeoutMs: 10 },
		}),
	).rejects.toThrow('Automatic streamed signals timed out.');
});

it('preserves the render failure when external producer cleanup throws', async () => {
	const failure = new Error('render failed');
	const options: StreamOptions = {
		injection: {
			take: () => '',
			subscribe: () => () => {},
			done: new Promise<void>(() => {}),
			cancel() {
				throw new Error('cleanup failed');
			},
		},
	};
	await expect(
		prerender(
			() => {
				throw failure;
			},
			undefined,
			options,
		),
	).rejects.toBe(failure);
});

it('settles an automatic deadline and releases all observations when external cleanup throws', async () => {
	enableServerSignalBindings();
	const value$ = __queryAt(
		'g:buffered-cleanup',
		'buffered-cleanup',
		() => 'a',
		() => new Promise<string>(() => {}),
	);
	const unsubscribe = vi.fn(() => {
		throw new Error('unsubscribe failed');
	});
	const cancel = vi.fn(() => {
		throw new Error('cancel failed');
	});
	const options: StreamOptions = {
		timeoutMs: 150,
		streamedSignals: { buildId: 'build', documentId: 'buffered-cleanup', timeoutMs: 10 },
		injection: {
			take: () => '',
			subscribe: () => unsubscribe,
			done: new Promise<void>(() => {}),
			cancel,
		},
	};
	await expect(
		prerender(() => `<p>${value$.snapshot().status}</p>`, undefined, options),
	).rejects.toThrow('Automatic streamed signals timed out.');
	// The external producer's cleanup remains a public lifetime contract even when it throws.
	expect(cancel).toHaveBeenCalledTimes(1);
	expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('announces a query first discovered after the readable shell', async () => {
	enableServerSignalBindings();
	const reveal = deferred<string>();
	const result = deferred<string>();
	const load = vi.fn(() => result.promise);
	const value$ = __queryAt(
		'g:auto-late-query-site',
		'authored-auto-late-query',
		() => 'conversation-late',
		load,
	);
	function App(props: { reveal: Promise<string> }, scope: SSRScope): string {
		return ssrHtml(
			ssrTry(
				scope,
				'late-query-boundary',
				() => {
					use(props.reveal, 'late-query-reveal');
					return ssrBlock(`<p>${value$.snapshot().status}</p>`);
				},
				() => ssrBlock('<p>waiting</p>'),
				null,
			),
		);
	}

	const stream = await renderToReadableStream(
		App,
		{ reveal: reveal.promise },
		{
			streamedSignals: {
				buildId: 'build:auto-late-query',
				documentId: 'document:auto-late-query',
			},
		},
	);
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const shell = await reader.read();
	expect(shell.done).toBe(false);
	expect(decoder.decode(shell.value)).toContain('waiting');
	expect(decoder.decode(shell.value)).not.toContain('__octaneStreamedRenderer');

	reveal.resolve('ready');
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
	result.resolve('late-server-result');
	let tail = '';
	for (;;) {
		const next = await reader.read();
		if (next.done) break;
		tail += decoder.decode(next.value, { stream: true });
	}
	tail += decoder.decode();
	expect(tail.indexOf('var k="__octaneStreamedRenderer"')).toBeLessThan(
		tail.indexOf('__octaneStreamedRenderer.receive('),
	);
	expect(streamedFrames(tail).map((frame) => frame.kind)).toEqual(['open', 'value', 'complete']);
});

it('publishes automatic query results through the pipeable transport', async () => {
	enableServerSignalBindings();
	const result = deferred<string>();
	const load = vi.fn(() => result.promise);
	const value$ = __queryAt(
		'g:auto-pipe-query-site',
		'authored-auto-pipe-query',
		() => 'conversation-pipe',
		load,
	);
	function App(): string {
		return `<p>${value$.snapshot().status}</p>`;
	}
	const chunks: string[] = [];
	let finish!: () => void;
	const ended = new Promise<void>((resolve) => {
		finish = resolve;
	});
	renderToPipeableStream(App, undefined, {
		streamedSignals: {
			buildId: 'build:auto-pipe-query',
			documentId: 'document:auto-pipe-query',
		},
	}).pipe({
		write(chunk) {
			chunks.push(chunk);
			return true;
		},
		end() {
			finish();
		},
	});
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
	result.resolve('pipe-server-result');
	await ended;
	const html = chunks.join('');
	expect(html.indexOf('var k="__octaneStreamedRenderer"')).toBeLessThan(
		html.indexOf('__octaneStreamedRenderer.receive('),
	);
	expect(streamedFrames(html).map((frame) => frame.kind)).toEqual(['open', 'value', 'complete']);
	expect(load).toHaveBeenCalledTimes(1);
});

it('does not emit a receiver for an automatically configured query-free render', async () => {
	const ready = vi.fn();
	function Static(): string {
		return '<p>static</p>';
	}
	const options = {
		streamedSignals: {
			buildId: 'build:query-free',
			documentId: 'document:query-free',
		},
	};
	const stream = await renderToReadableStream(Static, undefined, {
		...options,
		onEarlyHydrationReady: ready,
	});
	const html = await text(stream);
	expect(ready).not.toHaveBeenCalled();
	expect(html).toContain('static');
	expect(html).not.toContain('__octaneStreamedRenderer');
	expect(html).not.toContain('__octaneStreamedSignalSelections');
	const buffered = await prerender(Static, undefined, options);
	expect(buffered.html).toContain('static');
	expect(buffered.html).not.toContain('__octaneStreamedRenderer');
	expect(buffered.html).not.toContain('__octaneStreamedSignalSelections');
});
