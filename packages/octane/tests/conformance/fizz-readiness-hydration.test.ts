import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	collectPipeableStream,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import * as client from './_fixtures/fizz-readiness-hydration.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/fizz-readiness-hydration.tsrx';
const server = loadServerFixture(FIXTURE);
const IS_PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function startPipeable(component: any, props?: any, options?: ServerRuntime.StreamOptions) {
	const collector = createPipeableCollector();
	const stream = ServerRuntime.renderToPipeableStream(component, props, options);
	stream.pipe(collector.destination);
	return { ...stream, collector };
}

function activate(html: string): HTMLDivElement {
	const container = document.createElement('div');
	container.dataset.fizzReadinessRoot = '';
	document.body.appendChild(container);
	container.innerHTML = html;
	activateStreamedMarkup(container);
	return container;
}

function hydrationDiagnostics(spy: ReturnType<typeof vi.spyOn>): string[] {
	return spy.mock.calls
		.map((call) => String(call[0]))
		.filter((message) => message.includes('hydration mismatch'));
}

function expectedDiagnosticCount(devCount: number): number {
	return IS_PROD_COMPILE ? 0 : devCount;
}

async function revealServerBoundary(component: any, text: string): Promise<HTMLDivElement> {
	const serverValue = deferred<string>();
	const stream = startPipeable(component, {
		client: false,
		serverPromise: serverValue.promise,
		text,
	});
	expect(stream.collector.chunks.join('')).toContain('hydration-fallback');
	serverValue.resolve('ready');
	return activate(await stream.collector.ended);
}

async function flushResolution(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	flushSync(() => {});
}

afterEach(() => {
	resetStreamRuntimeGlobals();
	document.querySelectorAll('[data-fizz-readiness-root]').forEach((node) => node.remove());
});

describe('conformance: Fizz readiness and hydration behavior', () => {
	// Per ReactDOMFizzServer-test.js:6484 (canary b740af7).
	it('fires onAllReady once when an instrumented thenable fulfills synchronously', async () => {
		let thenCallCount = 0;
		const thenable = {
			status: 'pending',
			value: undefined as string | undefined,
			then(resolve: (value: string) => void) {
				thenCallCount++;
				if (thenCallCount > 1) {
					this.status = 'fulfilled';
					this.value = 'hello';
					resolve('hello');
				}
			},
		};
		const onAllReady = vi.fn();
		const result = await collectPipeableStream(
			server.InstrumentedThenableBoundary,
			{ promise: thenable },
			{ onAllReady },
		);
		const container = activate(result.html);
		try {
			expect(onAllReady).toHaveBeenCalledOnce();
			expect(container.querySelector('#instrumented-value')?.textContent).toBe('hello');
			expect(container.querySelector('#instrumented-fallback')).toBeNull();
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6533 (canary b740af7).
	it('fires onAllReady once when content resolves while the fallback remains suspended', async () => {
		const content = deferred<string>();
		const fallback = deferred<string>();
		const onAllReady = vi.fn();
		const stream = startPipeable(
			server.ContentAndFallbackSuspend,
			{
				contentPromise: content.promise,
				fallbackPromise: fallback.promise,
			},
			{ onAllReady },
		);

		await Promise.resolve();
		content.resolve('hello');
		const container = activate(await stream.collector.ended);
		try {
			expect(onAllReady).toHaveBeenCalledOnce();
			expect(container.querySelector('#content-value')?.textContent).toBe('hello');
			expect(container.querySelector('#fallback-value')).toBeNull();
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:6533 (canary b740af7), with the abandoned
	// fallback suspension handled by its own nested boundary.
	it('finishes after resolved content abandons a nested suspended fallback', async () => {
		const content = deferred<string>();
		const fallback = deferred<string>();
		const onAllReady = vi.fn();
		const props = {
			contentPromise: content.promise,
			fallbackPromise: fallback.promise,
			includeLateFallback: false,
		};
		const stream = startPipeable(server.ContentAndNestedFallbackSuspend, props, { onAllReady });

		await Promise.resolve();
		// This branch appears only during the completed boundary's bookkeeping
		// pass. It was never visible fallback and must not publish its resources.
		props.includeLateFallback = true;
		content.resolve('hello');
		const container = activate(await stream.collector.ended);
		try {
			expect(onAllReady).toHaveBeenCalledOnce();
			expect(container.querySelector('#nested-content-value')?.textContent).toBe('hello');
			expect(container.querySelector('#abandoned-outer-fallback')).toBeNull();
			expect(container.querySelector('#abandoned-nested-fallback')).toBeNull();
			expect(container.querySelector('#abandoned-late-fallback')).toBeNull();
			expect(container.textContent).not.toContain('rgb(123, 45, 67)');
		} finally {
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:4581 (React 19.2.7, issue #24384).
	// OCTANE DIVERGENCE: Hydration is synchronous and has no selective boundary
	// hydration. A client suspension therefore reconciles to the pending arm
	// immediately, reports that recovery, and mounts fresh content on resolution.
	it('eagerly recovers a matching streamed boundary that suspends during hydration', async () => {
		const container = await revealServerBoundary(server.MatchingHydrationBoundary, 'initial');
		const leaf = container.querySelector('#hydration-leaf');
		const heading = container.querySelector('#hydration-text');
		const loader = deferred<{ default: typeof client.HydrationLeaf }>();
		client.setMatchingHydrationModule(loader.promise);
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.MatchingHydrationBoundary, {
			client: true,
			text: 'initial',
		});
		try {
			flushSync(() => {});
			expect(hydrationDiagnostics(diagnostic)).toHaveLength(expectedDiagnosticCount(1));
			expect(container.querySelector('.hydration-fallback')?.textContent).toBe('Loading…');
			expect(container.querySelector('#hydration-leaf')).not.toBe(leaf);
			expect(container.querySelector('#hydration-text')).not.toBe(heading);

			loader.resolve({ default: client.HydrationLeaf });
			await flushResolution();
			expect(hydrationDiagnostics(diagnostic)).toHaveLength(expectedDiagnosticCount(1));
			expect(container.querySelector('.hydration-fallback')).toBeNull();
			expect(container.querySelector('#hydration-text')?.textContent).toBe('initial');
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:4657 (React 19.2.7, issue #24384).
	// OCTANE DIVERGENCE: Without selective hydration, Octane reports the eager
	// success-to-pending recovery rather than deferring that warning. Resolution
	// still converges to the client arm; only the diagnostic timing diverges.
	it('reports eager pending-arm recovery instead of deferring a streamed-boundary mismatch', async () => {
		const container = await revealServerBoundary(server.MismatchHydrationBoundary, 'initial');
		const heading = container.querySelector('#hydration-text');
		const loader = deferred<{ default: typeof client.HydrationLeaf }>();
		client.setMismatchHydrationModule(loader.promise);
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.MismatchHydrationBoundary, {
			client: true,
			text: 'replaced',
		});
		try {
			flushSync(() => {});
			expect(hydrationDiagnostics(diagnostic)).toHaveLength(expectedDiagnosticCount(1));
			expect(container.querySelector('.hydration-fallback')?.textContent).toBe('Loading…');
			expect(container.querySelector('#hydration-text')).not.toBe(heading);

			loader.resolve({ default: client.HydrationLeaf });
			await flushResolution();
			expect(hydrationDiagnostics(diagnostic)).toHaveLength(expectedDiagnosticCount(1));
			expect(container.querySelector('.hydration-fallback')).toBeNull();
			expect(
				Array.from(container.querySelectorAll('#hydration-text'), (node) => node.textContent),
			).toEqual(['replaced']);
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	// Per ReactDOMFizzServer-test.js:4740 (React 19.2.7).
	// OCTANE DIVERGENCE: Diagnostics are source-site based rather than boundary
	// aggregated, so each independently patched mismatch publishes one warning.
	it('publishes one hydration mismatch diagnostic per mismatched source site', async () => {
		const result = await collectPipeableStream(server.MultipleMismatchBoundary, {
			text: 'initial',
		});
		const container = activate(result.html);
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.MultipleMismatchBoundary, { text: 'replaced' });
		try {
			flushSync(() => {});
			expect(hydrationDiagnostics(diagnostic)).toHaveLength(expectedDiagnosticCount(3));
			expect(Array.from(container.querySelectorAll('h2'), (node) => node.textContent)).toEqual([
				'replaced',
				'replaced',
				'replaced',
			]);
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});
});
