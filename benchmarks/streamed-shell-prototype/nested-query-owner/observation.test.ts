import { expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from '../../../packages/octane/src/index.js';
import { renderToPipeableStream } from '../../../packages/octane/src/runtime.server.js';
import { bootstrapStreamedSignalHydration } from '../../../packages/octane/src/hydration/streamed-signals.js';
import * as signals from '../../../packages/octane/src/signals/index.js';
import { loadServerFixture } from '../../../packages/octane/tests/_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	resetStreamRuntimeGlobals,
} from '../../../packages/octane/tests/_server-stream.js';
import {
	controlledStream,
	drainProducers,
} from '../../../packages/octane/tests/_fixtures/signals-async-controls.js';
import * as client from './fixture.tsrx';

const server = loadServerFixture<typeof client>(
	'benchmarks/streamed-shell-prototype/nested-query-owner/fixture.tsrx',
	{
		runtimeModules: {
			'octane/signals': signals,
			'octane/signals/query': signals,
			'octane/signals/facade': signals,
		},
	},
);

async function observeNestedQuery(): Promise<{
	browserLoads: number;
	output: string | null;
	diagnostics: unknown[];
}> {
	const producer = controlledStream<string>();
	const browserLoad = vi.fn(async function* () {
		yield 'duplicate browser result';
	});
	const container = document.createElement('div');
	document.body.append(container);
	const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const diagnostics: unknown[] = [];
	let root: Root | undefined;
	let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
	let stream: ReturnType<typeof renderToPipeableStream> | undefined;
	try {
		const collector = createPipeableCollector();
		stream = renderToPipeableStream(
			server.StreamedStaticShell,
			{ load: () => producer.iterable, onCleanup: () => {} },
			{ streamedSignals: { buildId: 'nested-build', documentId: 'nested-document' } },
		);
		stream.pipe(collector.destination);
		await producer.started;
		producer.emit('A');
		await drainProducers();
		let delivered = 0;
		await vi.waitFor(() => {
			const html = collector.chunks.slice(delivered).join('');
			delivered = collector.chunks.length;
			if (html) container.insertAdjacentHTML('beforeend', html);
			activateStreamedMarkup(container);
			expect(container.querySelector('output')?.textContent).toBe('A');
		});
		hydration = bootstrapStreamedSignalHydration({
			buildId: 'nested-build',
			documentId: 'nested-document',
		});
		root = hydrateRoot(
			container,
			client.StreamedStaticShell,
			{ load: browserLoad, onCleanup: () => {} },
			{
				signalOwner: hydration.signalOwner,
				onRecoverableError: (error) => diagnostics.push(error),
				onUncaughtError: (error) => diagnostics.push(error),
			},
		);
		await drainProducers();
		flushSync(() => {});
		return {
			browserLoads: browserLoad.mock.calls.length,
			output: container.querySelector('output')?.textContent ?? null,
			diagnostics,
		};
	} finally {
		producer.end();
		stream?.abort();
		root?.unmount();
		hydration?.dispose();
		consoleErrors.mockRestore();
		container.remove();
		resetStreamRuntimeGlobals();
	}
}

// This benchmark characterizes a known defect; its assertions are not the
// desired framework contract. A correct hydration retains A without a browser
// loader or mismatch. The compiler and renderer paths are otherwise unchanged.
it('characterizes the existing nested query hydration mismatch', async () => {
	const result = await observeNestedQuery();
	expect(result.browserLoads).toBe(1);
	expect(result.output).toBe('duplicate browser result');
	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toBeInstanceOf(Error);
	expect((result.diagnostics[0] as Error).message).toMatch(
		/Hydration mismatch: the server-rendered text differed|Minified Octane error #61;/,
	);
});
