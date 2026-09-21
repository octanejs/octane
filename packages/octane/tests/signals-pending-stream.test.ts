import { afterEach, describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import { bootstrapStreamedSignalHydration } from 'octane/hydration/streamed-signals';
import { renderToPipeableStream } from 'octane/server';
import { createScope, type QueryContext } from 'octane/signals';
import * as signals from 'octane/signals';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';
import { controlledStream, drainProducers } from './_fixtures/signals-async-controls.js';
import * as client from './_fixtures/signals-pending-stream.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-pending-stream.tsrx',
	{
		compileOptions: {
			dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
			hmr: false,
		},
		runtimeModules: { 'octane/signals': signals },
	},
);

afterEach(() => {
	resetStreamRuntimeGlobals();
	delete (globalThis as any).__octaneStreamedSignalSelections;
	delete (globalThis as any).__octaneStreamedRenderer;
});

function browserStreams() {
	const requests: Array<{
		selection: string;
		signal: AbortSignal;
		stream: ReturnType<typeof controlledStream<string>>;
	}> = [];
	const load = (selection: string, { signal }: QueryContext) => {
		const stream = controlledStream<string>();
		requests.push({ selection, signal, stream });
		return stream.iterable;
	};
	return { requests, load };
}

describe('pending native streams', () => {
	it.each(['value', 'error', 'remove'] as const)(
		'keeps pending inputs through parent renders before %s',
		async (outcome) => {
			const { requests, load } = browserStreams();
			const rendered = mount(client.PendingStreamParent, { load });
			try {
				expect(rendered.find('.stream-pending').textContent).toBe('Waiting for stream');
				expect(requests.map(({ selection }) => selection)).toEqual(['original']);
				const original = requests[0]!;
				rendered.click('.same-inputs');
				await act(() => {});
				expect(rendered.find('.parent-render').textContent).toBe('1');
				expect(original.signal.aborted).toBe(false);
				expect(requests.map(({ selection }) => selection)).toEqual(['original']);
				rendered.click('.same-inputs');
				await act(() => {});
				expect(rendered.find('.parent-render').textContent).toBe('2');
				expect(original.signal.aborted).toBe(false);
				expect(requests.map(({ selection }) => selection)).toEqual(['original']);

				rendered.click('.change-selection');
				await act(() => {});
				expect(original.signal.aborted).toBe(true);
				expect(requests.map(({ selection }) => selection)).toEqual(['original', 'replacement']);
				const replacement = requests[1]!;
				if (outcome === 'value') {
					await act(() => replacement.stream.emit('replacement:1'));
					expect(rendered.find('.stream-value').textContent).toBe('replacement:1');
					await act(() => original.stream.emit('obsolete'));
					expect(rendered.find('.stream-value').textContent).toBe('replacement:1');
				} else if (outcome === 'error') {
					await act(() => replacement.stream.fail(new Error('Stream failed')));
					expect(rendered.find('.stream-error').textContent).toBe('Stream failed');
					await act(() => original.stream.emit('obsolete'));
					expect(rendered.find('.stream-error').textContent).toBe('Stream failed');
				} else {
					expect(rendered.find('.stream-pending').textContent).toBe('Waiting for stream');
				}
				rendered.click('.remove-stream');
				await act(() => {});
				if (outcome !== 'error') expect(replacement.signal.aborted).toBe(true);
				expect(
					rendered.container.querySelector('.stream-value, .stream-pending, .stream-error'),
				).toBeNull();
			} finally {
				rendered.unmount();
				for (const { stream } of requests) stream.end();
			}
		},
	);

	it.each([false, true])(
		'joins the pending server stream before parent updates (changed selection: %s)',
		async (changed) => {
			const serverOwner = createScope({ scopeKey: `pending-stream-hydration-${changed}` });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const serverStream = controlledStream<string>();
			const collector = createPipeableCollector();
			const shellReady = deferred<void>();
			const serverErrors: unknown[] = [];
			const config = {
				buildId: 'pending-stream-hydration-build',
				documentId: `pending-stream-hydration-document-${changed}`,
			};
			const container = document.createElement('div');
			const { requests, load } = browserStreams();
			const errors: unknown[] = [];
			let bridge: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
			let root: ReturnType<typeof hydrateRoot> | undefined;
			const rendering = renderToPipeableStream(
				server.PendingStreamParent,
				{ load: () => serverStream.iterable },
				{
					signalOwner: serverOwner,
					streamedSignals: config,
					onShellReady: () => shellReady.resolve(),
					onShellError: (error) => shellReady.reject(error),
					onError: (error) => serverErrors.push(error),
				},
			);
			try {
				rendering.pipe(collector.destination);
				await shellReady.promise;
				await drainProducers();
				container.innerHTML = collector.chunks.join('');
				document.body.append(container);
				activateStreamedMarkup(container);
				const shellChunkCount = collector.chunks.length;
				const fallback = container.querySelector('.stream-pending');
				expect(fallback?.textContent).toBe('Waiting for stream');
				bridge = bootstrapStreamedSignalHydration({ ...config, signalOwner: clientOwner });
				root = hydrateRoot(
					container,
					client.PendingStreamParent,
					{ load },
					{
						signalOwner: bridge.signalOwner,
						onCaughtError: (error) => errors.push(error),
						onUncaughtError: (error) => errors.push(error),
						onRecoverableError: (error) => errors.push(error),
					},
				);
				await act(() => {});
				expect(container.querySelector('.stream-pending')?.textContent).toBe('Waiting for stream');
				// Joining a server-authorized pending selection must not run its loader.
				expect(requests).toEqual([]);
				await act(() => {
					container.querySelector<HTMLButtonElement>('.same-inputs')!.click();
				});
				expect(container.querySelector('.parent-render')?.textContent).toBe('1');
				expect(requests).toEqual([]);
				if (changed) {
					await act(() => {
						container.querySelector<HTMLButtonElement>('.change-selection')!.click();
					});
					expect(requests.map(({ selection }) => selection)).toEqual(['replacement']);
					await act(() => requests[0]!.stream.emit('replacement:1'));
					expect(container.querySelector('.stream-value')?.textContent).toBe('replacement:1');
				}
				serverStream.emit('original:1');
				serverStream.emit('original:2');
				serverStream.end();
				await collector.ended;
				container.insertAdjacentHTML('beforeend', collector.chunks.slice(shellChunkCount).join(''));
				activateStreamedMarkup(container);
				await act(() => {});
				expect(container.querySelector('.stream-value')?.textContent).toBe(
					changed ? 'replacement:1' : 'original:2',
				);
				expect(errors).toEqual([]);
				expect(serverErrors).toEqual([]);
				if (changed) {
					root.unmount();
					await drainProducers();
					expect(requests[0]!.signal.aborted).toBe(true);
				}
			} finally {
				root?.unmount();
				bridge?.dispose();
				rendering.abort();
				serverStream.end();
				for (const { stream } of requests) stream.end();
				serverOwner.dispose();
				clientOwner.dispose();
				container.remove();
			}
		},
	);
});
