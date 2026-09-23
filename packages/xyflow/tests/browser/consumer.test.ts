import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';
import type { ReactFlowInstance } from '../../src/index.ts';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '../../../..');
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let cacheDir: string;

beforeAll(async () => {
	cacheDir = await mkdtemp(resolve(tmpdir(), 'octane-xyflow-vite-'));
	server = await createServer({
		configFile: false,
		root: HERE,
		cacheDir,
		logLevel: 'error',
		plugins: [octane()],
		resolve: {
			dedupe: ['octane'],
			alias: [
				{
					find: /^@octanejs\/xyflow$/,
					replacement: resolve(ROOT, 'packages/xyflow/src/index.ts'),
				},
				{
					find: '@octanejs/xyflow/dist/style.css',
					replacement: resolve(ROOT, 'packages/xyflow/src/styles/style.css'),
				},
			],
		},
		optimizeDeps: { exclude: ['octane', '@octanejs/xyflow', '@octanejs/zustand'] },
		server: { host: '127.0.0.1', port: 0, fs: { allow: [ROOT] } },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

async function openConsumer(mode: string) {
	const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(error.message));
	page.on('console', (message) => {
		if (/dependency array must keep the same length/.test(message.text())) {
			diagnostics.push(message.text());
		}
	});
	await page.goto(`${baseUrl}/?mode=${mode}`);
	return { page, diagnostics };
}

async function waitForMeasuredNodes(page: Page) {
	await page.waitForFunction(
		() => {
			const nodes = window.xyflowConsumer?.getNodes();
			return (
				nodes?.length &&
				nodes.every((node) => (node.measured?.width ?? 0) > 0 && (node.measured?.height ?? 0) > 0)
			);
		},
		undefined,
		{ timeout: 10_000 },
	);
	const visibility = await page
		.locator('.react-flow__node')
		.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).visibility));
	expect(visibility.length).toBeGreaterThan(0);
	expect(visibility.every((value) => value === 'visible')).toBe(true);
}

async function fitView(page: Page) {
	const fitted = await page.evaluate(() =>
		Promise.race([
			window.xyflowConsumer.fitView(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('fitView did not complete')), 5_000),
			),
		]),
	);
	expect(fitted).toBe(true);
}

async function batchUpdates(page: Page) {
	await page.locator('#batch').click();
	await page.waitForFunction(
		() => {
			const flow = window.xyflowConsumer;
			return (
				flow.getNodes().length === 2 &&
				flow.getNode('1')?.data.label === 'updated node 1' &&
				flow
					.getEdges()
					.map((edge) => edge.id)
					.join(',') === '1-2'
			);
		},
		undefined,
		{ timeout: 10_000 },
	);
	await waitForMeasuredNodes(page);
	expect(await page.locator('.react-flow__node').allTextContents()).toEqual([
		'updated node 1',
		'node 2',
	]);
	expect(await page.locator('.react-flow__edge').count()).toBe(1);
}

describe.sequential('compiled public xyflow consumers', () => {
	it('measures visible default nodes and applies queued node and edge mutations before fitting', async () => {
		const { page, diagnostics } = await openConsumer('default');
		try {
			await waitForMeasuredNodes(page);
			const before = await page.evaluate(() => window.xyflowConsumer.getViewport());
			await fitView(page);
			expect(await page.evaluate(() => window.xyflowConsumer.getViewport())).not.toEqual(before);
			await batchUpdates(page);
			await fitView(page);
			expect(diagnostics).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('retains controlled nodes through selection, dragging, zooming, keyboard movement and queued updates', async () => {
		const { page, diagnostics } = await openConsumer('controlled');
		try {
			await waitForMeasuredNodes(page);
			await batchUpdates(page);
			await fitView(page);
			const node = page.locator('.react-flow__node[data-id="1"]');
			await node.click();
			await page.waitForFunction(() => window.xyflowConsumer.getNode('1')?.selected);
			const pane = await page.locator('.react-flow__pane').boundingBox();
			if (!pane) throw new Error('The flow pane has no bounds');
			await page.mouse.click(pane.x + pane.width - 20, pane.y + pane.height - 20);
			await page.waitForFunction(
				() => !window.xyflowConsumer.getNodes().some((current) => current.selected),
			);

			const beforeDrag = await page.evaluate(() => window.xyflowConsumer.getNode('1')!.position);
			const box = await node.boundingBox();
			if (!box) throw new Error('The visible node has no bounds');
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 30, { steps: 8 });
			await page.mouse.up();
			await page.waitForFunction((before) => {
				const position = window.xyflowConsumer.getNode('1')!.position;
				return position.x > before.x && position.y > before.y;
			}, beforeDrag);

			const beforeZoom = await page.evaluate(() => window.xyflowConsumer.getViewport().zoom);
			await page.mouse.move(pane.x + pane.width - 40, pane.y + pane.height - 40);
			await page.mouse.wheel(0, 160);
			await page.waitForFunction(
				(before) => window.xyflowConsumer.getViewport().zoom !== before,
				beforeZoom,
			);

			await node.focus();
			const beforeKeyboard = await page.evaluate(
				() => window.xyflowConsumer.getNode('1')!.position,
			);
			await page.keyboard.press('ArrowRight');
			await page.waitForFunction(
				(before) => window.xyflowConsumer.getNode('1')!.position.x > before.x,
				beforeKeyboard,
			);
			await fitView(page);
			expect(diagnostics).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('keeps repeated context-default connection hooks in custom nodes independent while edges change', async () => {
		const { page, diagnostics } = await openConsumer('connections');
		try {
			await waitForMeasuredNodes(page);
			expect(await page.locator('.connection-count').allTextContents()).toEqual(['1:1:1', '1:1:1']);
			await page.evaluate(() => window.xyflowConsumer.setEdges([]));
			await expect
				.poll(() => page.locator('.connection-count').allTextContents())
				.toEqual(['0:0:0', '0:0:0']);
			await page.evaluate(() =>
				window.xyflowConsumer.setEdges([
					{
						id: 'restored',
						source: '1',
						target: '2',
						sourceHandle: 'source',
						targetHandle: 'target',
					},
				]),
			);
			await expect
				.poll(() => page.locator('.connection-count').allTextContents())
				.toEqual(['1:1:1', '1:1:1']);
			await fitView(page);
			expect(diagnostics).toEqual([]);
		} finally {
			await page.close();
		}
	});
});

declare global {
	interface Window {
		xyflowConsumer: ReactFlowInstance;
	}
}
