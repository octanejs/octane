import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import * as ServerRuntime from 'octane/server';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';
import { createPipeableCollector, deferred } from '../../_server-stream.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../conformance/_fixtures/fizz-readiness-hydration.tsrx');
const serverFixture = loadServerFixture(FIXTURE);
const REENTRANT_UNMOUNT_DIAGNOSTIC =
	'Attempted to synchronously unmount a root while Octane was already rendering. ' +
	'Octane cannot finish unmounting the root until the current render has completed, ' +
	'which may lead to a race condition.';

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];
let hydrationDiagnostics: string[] = [];
let reentrantUnmountDiagnostics: string[] = [];

async function streamedHydrationHtml(): Promise<string> {
	const serverValue = deferred<string>();
	const collector = createPipeableCollector();
	const stream = ServerRuntime.renderToPipeableStream(serverFixture.MismatchHydrationBoundary, {
		client: false,
		serverPromise: serverValue.promise,
		text: 'initial',
	});
	stream.pipe(collector.destination);
	expect(collector.chunks.join('')).toContain('hydration-fallback');
	serverValue.resolve('ready');
	return collector.ended;
}

function streamedMarkupPlugin(markup: string): Plugin {
	return {
		name: 'suspense-hydration-streamed-markup',
		enforce: 'post',
		transformIndexHtml(html) {
			return html.replace('<!--OCTANE_STREAMED_HYDRATION-->', () => markup);
		},
	};
}

beforeAll(async () => {
	const markup = await streamedHydrationHtml();
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		// The full Vitest matrix starts several in-process Vite servers at once.
		// Isolate this app's dependency optimizer so a concurrent server cannot
		// invalidate its URLs and return transient 504 "Outdated Optimize Dep"
		// responses before the page installs its test bridge.
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-suspense-hydration'),
		plugins: [octane(), streamedMarkupPlugin(markup)],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			`Chromium is required for Suspense/hydration evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
		);
	}
});

afterEach(async () => {
	const failures = pageFailures.slice();
	try {
		await page?.close();
	} finally {
		page = undefined;
		pageFailures = [];
		hydrationDiagnostics = [];
		reentrantUnmountDiagnostics = [];
	}
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openCase(query: string): Promise<Page> {
	page = await browser.newPage();
	pageFailures = [];
	hydrationDiagnostics = [];
	reentrantUnmountDiagnostics = [];
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const text = message.text();
		if (text.includes('hydration mismatch')) hydrationDiagnostics.push(text);
		else if (query === 'case=direct-ref-unmount' && text === REENTRANT_UNMOUNT_DIAGNOSTIC) {
			reentrantUnmountDiagnostics.push(text);
		} else pageFailures.push(`${message.type()}: ${text}`);
	});
	await page.goto(`${baseUrl}/?${query}`);
	await page.waitForFunction(() => Boolean(window.__suspenseHydration));
	if (pageFailures.length) throw new Error(pageFailures.join('\n'));
	return page;
}

async function snapshot(): Promise<any> {
	return page!.evaluate(() => window.__suspenseHydration.snapshot());
}

async function waitForFallback(): Promise<void> {
	await page!.waitForFunction(() => window.__suspenseHydration.snapshot().fallbackCount === 1);
}

async function waitForReveal(): Promise<void> {
	await page!.waitForFunction(() => {
		const state = window.__suspenseHydration.snapshot();
		return state.fallbackCount === 0 && state.routeText === 'route:B';
	});
}

function expectPreservedInput(state: any): void {
	expect(state.panelSame).toBe(true);
	expect(state.inputSame).toBe(true);
	expect(state.scrollerSame).toBe(true);
	expect(state.editableSame).toBe(true);
	expect(state.portalSame).toBe(true);
	expect(state.panelConnected).toBe(true);
	expect(state.portalConnected).toBe(true);
	expect(state.inputValue).toBe('browser-owned value');
	expect([state.selectionStart, state.selectionEnd]).toEqual([2, 9]);
	expect(state.countText).toBe('count:1');
	expect(state.globalFailures).toEqual([]);
}

async function expectUrgentPreservation(shape: 'same' | 'swap'): Promise<void> {
	await openCase(`case=suspense&shape=${shape}`);
	await page!.waitForFunction(() => window.__suspenseHydration.snapshot().listenerCount === 1);
	let state = await page!.evaluate(() => window.__suspenseHydration.prepareInput!());
	expect(state.activeId).toBe('preserved-input');
	expect(state.scrollTop).toBe(800);

	await page!.evaluate(() => window.__suspenseHydration.urgent!());
	await waitForFallback();
	state = await snapshot();
	expectPreservedInput(state);
	expect(state.panelVisible).toBe(false);
	expect(state.portalVisible).toBe(false);
	expect(state.lifecycle).toEqual(['portal:layout', 'portal:cleanup']);
	expect(state.refLifecycle).toEqual(['attach', 'detach']);
	// Suspense disconnects layout work while the primary is hidden, but passive
	// subscriptions stay connected until the subtree is actually deleted.
	expect(state.listenerCount).toBe(1);

	await page!.evaluate(() => window.__suspenseHydration.resolve());
	await waitForReveal();
	await page!.waitForFunction(() => window.__suspenseHydration.snapshot().listenerCount === 1);
	state = await snapshot();
	expectPreservedInput(state);
	expect(state.panelVisible).toBe(true);
	expect(state.portalVisible).toBe(true);
	expect(state.scrollTop).toBe(800);
	expect(state.activeId).toBe('');
	expect(state.lifecycle).toEqual(['portal:layout', 'portal:cleanup', 'portal:layout']);
	expect(state.refLifecycle).toEqual(['attach', 'detach', 'attach']);
	expect(state.listenerCount).toBe(1);
}

describe.sequential('real-browser Suspense and async hydration evidence', () => {
	it('contains async hydration recovery and preserves an interactive outside sibling', async () => {
		const page = await openCase('case=hydration');
		let state = await snapshot();
		expect(state.boundarySame).toBe(true);
		expect(state.outsideSame).toBe(true);
		expect(state.fallbackCount).toBe(1);

		await page.locator('#hydration-outside').click();
		expect((await snapshot()).outsideText).toBe('outside:1');
		await page.evaluate(() => window.__suspenseHydration.resolve());
		await page.waitForFunction(() => window.__suspenseHydration.snapshot().headings.length === 1);

		state = await snapshot();
		expect(state.boundarySame).toBe(true);
		expect(state.outsideSame).toBe(true);
		expect(state.fallbackCount).toBe(0);
		expect(state.headings).toEqual(['replaced']);
		expect(state.globalFailures).toEqual([]);
		expect(hydrationDiagnostics).toHaveLength(1);
		await page.locator('#hydration-outside').click();
		expect((await snapshot()).outsideText).toBe('outside:2');
	});

	it('pins React 19.2.7 focus behavior for fallback-visible primary content', async () => {
		await openCase('case=react-baseline');
		let state = await page!.evaluate(() => window.__suspenseHydration.prepareInput!());
		expect(state.reactVersion).toBe('19.2.7');
		expect(state.activeId).toBe('react-input');

		await page!.evaluate(() => window.__suspenseHydration.urgent!());
		await page!.waitForFunction(() => window.__suspenseHydration.snapshot().fallbackCount === 1);
		state = await snapshot();
		expect(state.inputSame).toBe(true);
		expect(state.inputConnected).toBe(true);
		expect(state.inputVisible).toBe(false);

		await page!.evaluate(() => window.__suspenseHydration.resolve());
		await page!.waitForFunction(() => {
			const current = window.__suspenseHydration.snapshot();
			return current.fallbackCount === 0 && current.routeText === 'route:B';
		});
		state = await snapshot();
		expect(state.inputSame).toBe(true);
		expect(state.inputVisible).toBe(true);
		// Chromium normalizes focus to <body> before the async reveal completes.
		expect(state.activeId).toBe('');
		expect(state.globalFailures).toEqual([]);
	});

	it('preserves same-tree browser state through an urgent fallback', () =>
		expectUrgentPreservation('same'));

	it('preserves swap-tree browser state through an urgent fallback', () =>
		expectUrgentPreservation('swap'));

	it('preserves a DOM Range anchor through a fallback-visible route swap', async () => {
		await openCase('case=suspense&shape=swap');
		let state = await page!.evaluate(() => window.__suspenseHydration.prepareRange!());
		expect(state.rangeAnchored).toBe(true);
		expect([state.rangeStart, state.rangeEnd]).toEqual([2, 12]);

		await page!.evaluate(() => window.__suspenseHydration.urgent!());
		await waitForFallback();
		state = await snapshot();
		expect(state.rangeAnchored).toBe(true);
		expect([state.rangeStart, state.rangeEnd]).toEqual([2, 12]);

		await page!.evaluate(() => window.__suspenseHydration.resolve());
		await waitForReveal();
		state = await snapshot();
		expect(state.rangeAnchored).toBe(true);
		expect([state.rangeStart, state.rangeEnd]).toEqual([2, 12]);
		expect(state.scrollTop).toBe(800);
	});

	it('keeps browser state live when a transition resolves before fallback', async () => {
		await openCase('case=suspense&shape=swap');
		const initial = await page!.evaluate(() => window.__suspenseHydration.prepareInput!());
		expect(initial.activeId).toBe('preserved-input');

		await page!.evaluate(() => window.__suspenseHydration.transition!());
		await page!.waitForFunction(
			() => window.__suspenseHydration.snapshot().transitionText === 'pending',
		);
		let state = await snapshot();
		expectPreservedInput(state);
		expect(state.fallbackCount).toBe(0);
		expect(state.panelVisible).toBe(true);
		expect(state.portalVisible).toBe(true);
		expect(state.activeId).toBe('preserved-input');
		expect(state.scrollTop).toBe(800);
		expect(state.lifecycle).toEqual(['portal:layout']);
		expect(state.refLifecycle).toEqual(['attach']);

		await page!.evaluate(() => window.__suspenseHydration.resolve());
		await waitForReveal();
		state = await snapshot();
		expectPreservedInput(state);
		expect(state.activeId).toBe('preserved-input');
		expect(state.scrollTop).toBe(800);
		expect(state.transitionText).toBe('idle');
	});

	it('preserves browser state when a transition crosses its fallback timeout', async () => {
		await openCase('case=suspense&shape=swap');
		await page!.evaluate(() => {
			window.__suspenseHydration.setFallbackTimeout!(0);
			window.__suspenseHydration.prepareInput!();
			window.__suspenseHydration.transition!();
		});
		await waitForFallback();
		let state = await snapshot();
		expectPreservedInput(state);
		expect(state.panelVisible).toBe(false);
		expect(state.portalVisible).toBe(false);

		await page!.evaluate(() => window.__suspenseHydration.resolve());
		await waitForReveal();
		state = await snapshot();
		expectPreservedInput(state);
		expect(state.panelVisible).toBe(true);
		expect(state.portalVisible).toBe(true);
		expect(state.scrollTop).toBe(800);
		expect(state.activeId).toBe('');
	});

	it('keeps a direct-root boundary empty when ref detach synchronously unmounts it', async () => {
		await openCase('case=direct-ref-unmount');
		const initial = await snapshot();
		expect(initial.rootEmpty).toBe(false);
		expect(initial.inputConnected).toBe(true);
		expect(initial.refLifecycle).toEqual(['attach']);

		await page!.evaluate(() => window.__suspenseHydration.urgent!());
		await page!.waitForFunction(() => window.__suspenseHydration.snapshot().rootEmpty === true);
		await page!.evaluate(async () => {
			window.__suspenseHydration.resolve();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		});

		const state = await snapshot();
		expect(state.rootEmpty).toBe(true);
		expect(state.fallbackCount).toBe(0);
		expect(state.inputConnected).toBe(false);
		expect(state.refLifecycle).toEqual(['attach', 'detach']);
		expect(state.globalFailures).toEqual([]);
		expect(reentrantUnmountDiagnostics).toEqual([REENTRANT_UNMOUNT_DIAGNOSTIC]);
	});
});

declare global {
	interface Window {
		__suspenseHydration: {
			kind: 'hydration' | 'suspense' | 'react-baseline' | 'direct-ref-unmount';
			prepareInput?: () => any;
			prepareRange?: () => any;
			urgent?: () => void;
			transition?: () => void;
			setFallbackTimeout?: (ms: number) => void;
			resolve: () => void;
			unmount: () => void;
			snapshot: () => any;
		};
	}
}
