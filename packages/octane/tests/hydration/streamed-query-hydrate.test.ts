import { expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { prerender, renderToPipeableStream, type StreamOptions } from '../../src/runtime.server.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import * as signals from '../../src/signals/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import { controlledStream, drainProducers } from '../_fixtures/signals-async-controls.js';
import * as client from '../_fixtures/automatic-signal-stream.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/automatic-signal-stream.tsrx',
	{
		runtimeModules: {
			'octane/signals': signals,
			'octane/signals/query': signals,
			'octane/signals/facade': signals,
		},
	},
);

const rootQueries = ['StreamedRootQuery', 'NestedStreamedRootQuery', 'DirectRootQuery'] as const;

it.each(
	rootQueries.flatMap((component) =>
		(['streamed', 'buffered'] as const).flatMap((delivery) =>
			['', 'query-app-'].map((identifierPrefix) => ({ component, delivery, identifierPrefix })),
		),
	),
)(
	'adopts completed root query results and their interactive DOM (%j)',
	async ({ component, delivery, identifierPrefix }) => {
		const producer = controlledStream<string>();
		const gate = deferred<void>();
		const serverLoad = vi.fn(() => producer.iterable);
		const browserLoad = vi.fn(async function* () {
			yield 'duplicate browser result';
		});
		const controller = new AbortController();
		const options: StreamOptions = {
			...(identifierPrefix ? { identifierPrefix } : {}),
			signal: controller.signal,
			streamedSignals: { buildId: 'root-query-build', documentId: 'root-query-document' },
		};
		const props = {
			load: serverLoad,
			...(component === 'NestedStreamedRootQuery' ? { gate: gate.promise } : {}),
		};
		const container = document.createElement('div');
		document.body.append(container);
		const consoleErrors = vi.spyOn(console, 'error');
		let root: Root | undefined;
		let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
		try {
			const collector = createPipeableCollector();
			const rendering =
				delivery === 'buffered' ? prerender(server[component], props, options) : null;
			if (delivery === 'streamed')
				renderToPipeableStream(server[component], props, options).pipe(collector.destination);
			await producer.started;
			producer.emit('accepted server result');
			producer.end();
			await drainProducers();
			gate.resolve();
			const html = rendering ? (await rendering).html : await collector.ended;
			expect(serverLoad).toHaveBeenCalledTimes(1);
			container.innerHTML = html;
			activateStreamedMarkup(container);
			const output = container.querySelector('output');
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			expect(output?.textContent).toBe('accepted server result');
			input.value = 'browser draft';
			const diagnostics: unknown[] = [];
			hydration = bootstrapStreamedSignalHydration({
				buildId: 'root-query-build',
				documentId: 'root-query-document',
			});
			root = hydrateRoot(
				container,
				client[component],
				{ load: browserLoad },
				{
					...(identifierPrefix ? { identifierPrefix, signalInstancePrefix: identifierPrefix } : {}),
					signalOwner: hydration.signalOwner,
					onRecoverableError: (error) => diagnostics.push(error),
					onUncaughtError: (error) => diagnostics.push(error),
				},
			);
			await drainProducers();
			flushSync(() => {});
			expect(browserLoad).not.toHaveBeenCalled();
			expect(container.querySelector('output')).toBe(output);
			expect(output?.textContent).toBe('accepted server result');
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('browser draft');
			flushSync(() => button.click());
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('1');
			expect(container.querySelector('.streamed-query-pending')).toBeNull();
			expect(diagnostics).toEqual([]);
			expect(
				consoleErrors.mock.calls.filter((call) => String(call[0]).includes('hydration mismatch')),
			).toEqual([]);
		} finally {
			producer.end();
			gate.resolve();
			controller.abort();
			root?.unmount();
			hydration?.dispose();
			consoleErrors.mockRestore();
			container.remove();
			resetStreamRuntimeGlobals();
		}
	},
);

it.each(['', 'query-app-'])(
	'adopts an announced pending root query without starting a browser producer (%s)',
	async (identifierPrefix) => {
		const producer = controlledStream<string>();
		const browserLoad = vi.fn(async function* () {
			yield 'duplicate browser result';
		});
		const container = document.createElement('div');
		document.body.append(container);
		const consoleErrors = vi.spyOn(console, 'error');
		let root: Root | undefined;
		let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
		let stream: ReturnType<typeof renderToPipeableStream> | undefined;
		try {
			const collector = createPipeableCollector();
			stream = renderToPipeableStream(
				server.StreamedRootQuery,
				{ load: () => producer.iterable },
				{
					...(identifierPrefix ? { identifierPrefix } : {}),
					streamedSignals: { buildId: 'pending-query-build', documentId: 'pending-query-document' },
				},
			);
			stream.pipe(collector.destination);
			await producer.started;
			// Drain the initial selection announcement before activating the shell.
			await drainProducers();
			container.innerHTML = collector.chunks.join('');
			activateStreamedMarkup(container);
			expect(container.querySelector('.streamed-query-pending')?.textContent).toBe('waiting');
			const diagnostics: unknown[] = [];
			hydration = bootstrapStreamedSignalHydration({
				buildId: 'pending-query-build',
				documentId: 'pending-query-document',
			});
			root = hydrateRoot(
				container,
				client.StreamedRootQuery,
				{ load: browserLoad },
				{
					...(identifierPrefix ? { identifierPrefix, signalInstancePrefix: identifierPrefix } : {}),
					signalOwner: hydration.signalOwner,
					onRecoverableError: (error) => diagnostics.push(error),
					onUncaughtError: (error) => diagnostics.push(error),
				},
			);
			await drainProducers();
			flushSync(() => {});
			expect(container.querySelector('main')?.textContent).toBe('waiting');
			expect(container.querySelector('.streamed-query-view')).toBeNull();
			expect(browserLoad).not.toHaveBeenCalled();
			expect(diagnostics).toEqual([]);
			expect(
				consoleErrors.mock.calls.filter((call) => String(call[0]).includes('hydration mismatch')),
			).toEqual([]);
		} finally {
			producer.end();
			stream?.abort();
			root?.unmount();
			hydration?.dispose();
			consoleErrors.mockRestore();
			container.remove();
			resetStreamRuntimeGlobals();
		}
	},
);
