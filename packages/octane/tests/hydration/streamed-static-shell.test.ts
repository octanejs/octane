import { expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToPipeableStream } from '../../src/runtime.server.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import * as signals from '../../src/signals/index.js';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import { controlledStream, drainProducers } from '../_fixtures/signals-async-controls.js';
import * as client from './_fixtures/streamed-static-shell.tsrx';
import { StreamedShellSurrogate } from './_fixtures/streamed-static-shell-client.js';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx',
	{
		runtimeModules: {
			'octane/signals': signals,
			'octane/signals/query': signals,
			'octane/signals/facade': signals,
		},
	},
);

it.each(
	(['compiled shell', 'shell surrogate'] as const).flatMap((variant) =>
		(['before activation', 'after activation'] as const).map((secondDelivery) => ({
			variant,
			secondDelivery,
		})),
	),
)(
	'keeps an ongoing query and interactive child under one root (%j)',
	async ({ variant, secondDelivery }) => {
		const producer = controlledStream<string>();
		const secondValue = 'B: streamed update';
		const serverLoad = vi.fn(() => producer.iterable);
		const browserLoad = vi.fn(async function* () {
			yield 'duplicate browser result';
		});
		const cleanup = vi.fn();
		const container = document.createElement('div');
		document.body.append(container);
		const consoleErrors = vi.spyOn(console, 'error');
		const diagnostics: unknown[] = [];
		let root: Root | undefined;
		let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
		let stream: ReturnType<typeof renderToPipeableStream> | undefined;
		try {
			const collector = createPipeableCollector();
			let delivered = 0;
			// Browser HTML parsing runs each streamed script as it arrives. jsdom's
			// fragment insertion does not, so explicitly activate each batch.
			const deliver = () => {
				const html = collector.chunks.slice(delivered).join('');
				delivered = collector.chunks.length;
				if (html) container.insertAdjacentHTML('beforeend', html);
				activateStreamedMarkup(container);
			};
			stream = renderToPipeableStream(
				server.StreamedStaticShell,
				{ load: serverLoad, onCleanup: () => {} },
				{ streamedSignals: { buildId: 'shell-build', documentId: 'shell-document' } },
			);
			stream.pipe(collector.destination);
			await producer.started;
			producer.emit('A');
			await drainProducers();
			await vi.waitFor(() => {
				deliver();
				expect(container.querySelector('output')?.textContent).toBe('A');
			});
			const main = container.querySelector('main')!;
			const heading = container.querySelector('h1')!;
			const footer = container.querySelector('footer')!;
			expect(footer.textContent).toBe('Static sibling');
			const output = container.querySelector('output')!;
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			input.value = 'browser draft';
			if (secondDelivery === 'before activation') {
				const previousChunkCount = collector.chunks.length;
				producer.emit(secondValue);
				await vi.waitFor(() => {
					expect(collector.chunks.slice(previousChunkCount).join('')).toContain(secondValue);
				});
				deliver();
				expect(output.textContent).toBe('A');
			}
			hydration = bootstrapStreamedSignalHydration({
				buildId: 'shell-build',
				documentId: 'shell-document',
			});
			root = hydrateRoot(
				container,
				variant === 'compiled shell' ? client.StreamedStaticShell : StreamedShellSurrogate,
				{ load: browserLoad, onCleanup: cleanup },
				{
					signalOwner: hydration.signalOwner,
					onRecoverableError: (error) => diagnostics.push(error),
					onUncaughtError: (error) => diagnostics.push(error),
				},
			);
			flushEffects();
			if (secondDelivery === 'after activation') {
				expect(output.textContent).toBe('A');
				producer.emit(secondValue);
				await drainProducers();
				deliver();
			}
			await vi.waitFor(() => {
				deliver();
				flushSync(() => {});
				expect(output.textContent).toBe(secondValue);
			});
			expect(container.querySelector('main')).toBe(main);
			expect(container.querySelector('h1')).toBe(heading);
			expect(container.querySelector('footer')).toBe(footer);
			expect(footer.textContent).toBe('Static sibling');
			expect(container.querySelector('output')).toBe(output);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('browser draft');
			expect(container.querySelector('button')).toBe(button);
			flushSync(() => button.click());
			expect(button.textContent).toBe('1');
			expect(serverLoad).toHaveBeenCalledTimes(1);
			expect(browserLoad).not.toHaveBeenCalled();
			expect(diagnostics).toEqual([]);
			expect(
				consoleErrors.mock.calls.filter((call) => String(call[0]).includes('hydration mismatch')),
			).toEqual([]);
			root.unmount();
			flushEffects();
			root = undefined;
			expect(cleanup).toHaveBeenCalledTimes(1);
			expect(container.querySelector('main')).toBeNull();
			expect(footer.isConnected).toBe(false);
			expect(footer.textContent).toBe('Static sibling');
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
