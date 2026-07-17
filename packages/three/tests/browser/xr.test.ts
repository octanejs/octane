// @vitest-environment node
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';
import { threeRenderers } from '../../src/config.js';

interface XRProofSnapshot {
	enabled: boolean;
	frameTags: string[];
	forcedContextLossPrevented: boolean | null;
	listeners: { sessionend: number; sessionstart: number };
	loopInstalled: boolean;
	renders: number;
	disposals: number;
}

interface OffscreenLifecycleProof {
	callbackCanvasMatched: boolean;
	callbackCount: number;
	cleanup: { dispose: number; forceContextLoss: number; renderLists: number };
	sceneAfterUnmount: string[];
	sceneBeforeUnmount: string[];
	setSize: { height: number; updateStyle: boolean | undefined; width: number } | null;
	size: { height: number; left: number; top: number; width: number };
}

interface BrowserXRProof {
	contextLost(): boolean;
	contextRestored(): void;
	endSession(): XRProofSnapshot;
	invokeStaleFrame(tag: string): XRProofSnapshot;
	offscreenLifecycle(): Promise<OffscreenLifecycleProof>;
	runFrame(tag: string): XRProofSnapshot;
	setFrameloop(frameloop: 'always' | 'demand' | 'never'): void;
	snapshot(): XRProofSnapshot;
	startSession(): XRProofSnapshot;
	unmount(): XRProofSnapshot;
}

const harnessRoot = resolve(import.meta.dirname, '../_fixtures/xr-app');
const threeEntry = resolve(import.meta.dirname, '../../src/index.ts');
const octaneEntry = resolve(import.meta.dirname, '../../../octane/src/index.ts');
const octaneUniversalEntry = resolve(import.meta.dirname, '../../../octane/src/universal.ts');

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(address.port));
		});
	});
}

let viteServer: ViteDevServer;
let browser: import('playwright').Browser;
let page: import('playwright').Page;
let origin = '';
let errors: string[];

async function callProof<T>(method: keyof BrowserXRProof, ...args: unknown[]): Promise<T> {
	return page.evaluate(
		([name, values]) => {
			const proof = (globalThis as typeof globalThis & { __octaneThreeXR: BrowserXRProof })
				.__octaneThreeXR;
			return (proof[name] as (...parameters: unknown[]) => unknown)(...values) as T;
		},
		[method, args] as const,
	);
}

beforeAll(async () => {
	let chromium: typeof import('playwright').chromium;
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/three XR] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}

	const port = await getFreePort();
	viteServer = await createServer({
		root: harnessRoot,
		configFile: false,
		logLevel: 'error',
		server: { port, host: '127.0.0.1', strictPort: true },
		plugins: [octane({ renderers: threeRenderers })],
		resolve: {
			alias: [
				{ find: /^@octanejs\/three$/, replacement: threeEntry },
				{ find: /^octane$/, replacement: octaneEntry },
				{ find: /^octane\/universal$/, replacement: octaneUniversalEntry },
			],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

beforeEach(async () => {
	errors = [];
	page = await browser.newPage();
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.waitForFunction(
		() => !!(globalThis as typeof globalThis & { __octaneThreeXR?: unknown }).__octaneThreeXR,
	);
	await page.evaluate(
		() =>
			new Promise<void>((resolveFrames) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolveFrames())),
			),
	);
});

afterEach(async () => {
	await page.close().catch(() => {});
});

describe('Three WebXR lifecycle', () => {
	it('runs a direct root lifecycle on an actual OffscreenCanvas', async () => {
		const lifecycle = await callProof<OffscreenLifecycleProof>('offscreenLifecycle');

		expect(lifecycle).toEqual({
			callbackCanvasMatched: true,
			callbackCount: 1,
			cleanup: { dispose: 1, forceContextLoss: 1, renderLists: 1 },
			sceneAfterUnmount: [],
			sceneBeforeUnmount: ['xr-lifecycle-scene'],
			setSize: { width: 160, height: 90, updateStyle: false },
			size: { width: 160, height: 90, top: 0, left: 0 },
		});
		expect(errors).toEqual([]);
	});

	it('switches to the XR animation loop and restores the configured frame loop', async () => {
		const initial = await callProof<XRProofSnapshot>('snapshot');
		expect(initial.listeners).toEqual({ sessionend: 1, sessionstart: 1 });

		const started = await callProof<XRProofSnapshot>('startSession');
		expect(started).toMatchObject({ enabled: true, loopInstalled: true });
		const frame = await callProof<XRProofSnapshot>('runFrame', 'demand-xr-frame');
		expect(frame.frameTags).toEqual([...started.frameTags, 'demand-xr-frame']);
		expect(frame.renders).toBeGreaterThan(started.renders);

		const ended = await callProof<XRProofSnapshot>('endSession');
		expect(ended).toMatchObject({ enabled: false, loopInstalled: false });
		await page.waitForFunction(
			(renderCount) =>
				(
					globalThis as typeof globalThis & { __octaneThreeXR: BrowserXRProof }
				).__octaneThreeXR.snapshot().renders > renderCount,
			ended.renders,
		);
		expect(errors).toEqual([]);
	});

	it('does not advance a manual root and makes a disconnected XR callback inert', async () => {
		await callProof<void>('setFrameloop', 'never');
		await callProof<XRProofSnapshot>('startSession');
		const before = await callProof<XRProofSnapshot>('snapshot');
		const manual = await callProof<XRProofSnapshot>('runFrame', 'manual-xr-frame');
		expect(manual.frameTags).toEqual(before.frameTags);
		expect(manual.renders).toBe(before.renders);

		const unmounted = await callProof<XRProofSnapshot>('unmount');
		expect(unmounted).toMatchObject({
			disposals: 1,
			enabled: false,
			listeners: { sessionend: 0, sessionstart: 0 },
			loopInstalled: false,
		});
		const stale = await callProof<XRProofSnapshot>('invokeStaleFrame', 'stale-xr-frame');
		expect(stale.frameTags).toEqual(before.frameTags);
		expect(stale.renders).toBe(before.renders);
		expect(errors).toEqual([]);
	});

	it('recovers a demand root after context restoration and detaches on teardown', async () => {
		const before = await callProof<XRProofSnapshot>('snapshot');
		expect(await callProof<boolean>('contextLost')).toBe(true);
		await callProof<void>('contextRestored');
		await page.waitForFunction(
			(renderCount) =>
				(
					globalThis as typeof globalThis & { __octaneThreeXR: BrowserXRProof }
				).__octaneThreeXR.snapshot().renders > renderCount,
			before.renders,
		);

		const unmounted = await callProof<XRProofSnapshot>('unmount');
		expect(unmounted.forcedContextLossPrevented).toBe(false);
		expect(await callProof<boolean>('contextLost')).toBe(false);
		await callProof<void>('contextRestored');
		await page.evaluate(
			() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
		);
		const after = await callProof<XRProofSnapshot>('snapshot');
		expect(after.renders).toBe(unmounted.renders);
		expect(errors).toEqual([]);
	});
});
