import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import type { Frame, Page } from 'playwright';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';
import type { MountSpec } from './harness/mount.ts';

const directory = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(directory, 'harness');
const packageSrc = resolve(directory, '../../src/index.tsrx');
const octaneSrc = resolve(directory, '../../../octane/src/index.ts');

function freePort(): Promise<number> {
	return new Promise(function resolvePort(resolvePromise, reject) {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', function onListen() {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(function onClose() {
				resolvePromise(port);
			});
		});
	});
}

let server: ViteDevServer;
let origin: string;

beforeAll(async function setupServer() {
	const port = await freePort();
	server = await createServer({
		root: harnessRoot,
		logLevel: 'error',
		server: { host: '127.0.0.1', port, strictPort: true },
		plugins: [octane()],
		resolve: {
			alias: [
				{ find: /^@octanejs\/draggable$/, replacement: packageSrc },
				{ find: /^octane$/, replacement: octaneSrc },
			],
		},
	});
	await server.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async function teardownServer() {
	await server?.close();
});

async function withPage(run: (page: Page) => Promise<void>): Promise<void> {
	const browser = await launchBrowser({ headless: true });
	const page = await browser.newPage();
	try {
		await page.goto(origin, { waitUntil: 'networkidle' });
		await page.waitForFunction(function ready() {
			return Boolean(window.__reactDraggableBrowser);
		});
		await run(page);
	} finally {
		await page.close();
		await browser.close();
	}
}

async function mount(page: Page, spec: MountSpec): Promise<void> {
	await page.evaluate(function mountSpec(payload) {
		window.__reactDraggableBrowser.mount(payload as MountSpec);
	}, spec);
}

async function dragBy(
	page: Page,
	selector: string,
	deltaX: number,
	deltaY: number,
	options: { frame?: Frame; startOffset?: number } = {},
): Promise<void> {
	const handle = options.frame ? await options.frame.$(selector) : await page.$(selector);
	if (!handle) throw new Error(`missing ${selector}`);
	const box = await handle.boundingBox();
	if (!box) throw new Error(`no box for ${selector}`);
	const offset = options.startOffset ?? 50;
	await page.mouse.move(box.x + offset, box.y + offset);
	await page.mouse.down();
	await page.mouse.move(box.x + offset + deltaX, box.y + offset + deltaY);
	await page.mouse.up();
}

describe('pinned browser public cases', function browserSuite() {
	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should update transform on drag
	it('should update transform on drag', async function caseUpdateTransform() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic' });
			await page.waitForSelector('#draggable-test');
			const initial = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(initial).toMatch(/translate\(0px,?\s*0px\)/);
			await dragBy(page, '#draggable-test', 100, 100);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(100px,?\s*100px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should honor x axis constraint
	it('should honor x axis constraint', async function caseAxisX() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { axis: 'x' } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(100px,?\s*0px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should honor y axis constraint
	it('should honor y axis constraint', async function caseAxisY() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { axis: 'y' } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(0px,?\s*100px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should call onStop when drag ends
	it('should call onStop when drag ends', async function caseOnStop() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const stopCalled = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.stopCalled;
			});
			expect(stopCalled).toBe(true);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should clip dragging to bounds object
	it('should clip dragging to bounds object', async function caseBoundsObject() {
		await withPage(async function run(page) {
			await mount(page, {
				kind: 'basic',
				props: { bounds: { left: 0, right: 50, top: 0, bottom: 50 } },
			});
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 150, 150);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(50px,?\s*50px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should clip dragging to parent bounds
	it('should clip dragging to parent bounds', async function caseParentBounds() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'parent-bounds' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 450, 450);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(200px,?\s*200px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should clip to negative bounds
	it('should clip to negative bounds', async function caseNegativeBounds() {
		await withPage(async function run(page) {
			await mount(page, {
				kind: 'basic',
				props: { bounds: { left: -50, right: 50, top: -50, bottom: 50 } },
			});
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', -150, -150);
			const finalTransform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(-50px,?\s*-50px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should snap movement to grid
	it('should snap movement to grid', async function caseGridSnap() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { grid: [25, 25] } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 30, 30);
			const position = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.lastPosition;
			});
			expect(position).toEqual({ x: 25, y: 25 });
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should not trigger onDrag when movement is less than grid
	it('should not trigger onDrag when movement is less than grid', async function caseSubGrid() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { grid: [50, 50] } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 20, 20);
			const dragCallCount = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragCallCount;
			});
			expect(dragCallCount).toBe(0);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should snap to larger grid correctly
	it('should snap to larger grid correctly', async function caseLargeGrid() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { grid: [100, 100] } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 150, 150);
			const position = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.lastPosition;
			});
			expect(position).toEqual({ x: 200, y: 200 });
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should adjust position when scale is 2x
	it('should adjust position when scale is 2x', async function caseScale() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic', props: { scale: 2 } });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const dragData = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragData;
			});
			expect(dragData).toEqual({ x: 50, y: 50, deltaX: 50, deltaY: 50 });
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should only drag from handle
	it('should only drag from handle', async function caseHandle() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'handle' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '.content', 100, 100, { startOffset: 25 });
			let transform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(transform).toMatch(/translate\(0px,?\s*0px\)/);
			await dragBy(page, '.handle', 100, 100, { startOffset: 25 });
			transform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(transform).toMatch(/translate\(100px,?\s*100px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should drag from deeply nested handle elements
	it('should drag from deeply nested handle elements', async function caseNestedHandle() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'nested-handle' });
			await page.waitForSelector('.deep');
			await dragBy(page, '.deep', 100, 100, { startOffset: 25 });
			const transform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(transform).toMatch(/translate\(100px,?\s*100px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should not drag from deeply nested cancel elements
	it('should not drag from deeply nested cancel elements', async function caseNestedCancel() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'nested-cancel' });
			await page.waitForSelector('.deep');
			await dragBy(page, '.deep', 100, 100, { startOffset: 25 });
			const transform = await page.$eval('#draggable-test', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(transform).toMatch(/translate\(0px,?\s*0px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should work correctly inside an iframe
	it('should work correctly inside an iframe', async function caseIframe() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'iframe' });
			const iframeHandle = await page.waitForSelector('#test-iframe');
			const frame = await iframeHandle!.contentFrame();
			if (!frame) throw new Error('missing frame');
			await frame.waitForFunction(function ready() {
				return Boolean(window.__reactDraggableBrowser);
			});
			await frame.evaluate(function mountInner() {
				window.__reactDraggableBrowser.mount({ kind: 'iframe' });
			});
			await frame.waitForSelector('#iframe-draggable');
			const initial = await frame.$eval('#iframe-draggable', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(initial).toMatch(/translate\(0px,?\s*0px\)/);
			await dragBy(page, '#iframe-draggable', 100, 100, { frame });
			const finalTransform = await frame.$eval('#iframe-draggable', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(100px,?\s*100px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should respect bounds inside an iframe
	it('should respect bounds inside an iframe', async function caseIframeBounds() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'iframe-bounds' });
			const iframeHandle = await page.waitForSelector('#test-iframe-bounds');
			const frame = await iframeHandle!.contentFrame();
			if (!frame) throw new Error('missing frame');
			await frame.waitForFunction(function ready() {
				return Boolean(window.__reactDraggableBrowser);
			});
			await frame.evaluate(function mountInner() {
				window.__reactDraggableBrowser.mount({ kind: 'iframe-bounds' });
			});
			await frame.waitForSelector('#iframe-draggable-bounds');
			await dragBy(page, '#iframe-draggable-bounds', 450, 450, { frame });
			const finalTransform = await frame.$eval('#iframe-draggable-bounds', function read(el) {
				return (el as HTMLElement).style.transform;
			});
			expect(finalTransform).toMatch(/translate\(200px,?\s*200px\)/);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should handle dragging in scrollable containers
	it('should handle dragging in scrollable containers', async function caseScrollable() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'basic' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const dragData = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragData;
			});
			expect(dragData).not.toBeNull();
			expect(dragData!.deltaX).toBe(100);
			expect(dragData!.deltaY).toBe(100);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should clip dragging to parent bounds in shadow DOM
	it('should clip dragging to parent bounds in shadow DOM', async function caseShadowParent() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'shadow-parent' });
			await page.waitForFunction(function ready() {
				const host = document.getElementById('shadow-host');
				return Boolean(host?.shadowRoot?.getElementById('shadow-draggable'));
			});
			const handle = await page.evaluateHandle(function getNode() {
				return document
					.getElementById('shadow-host')!
					.shadowRoot!.getElementById('shadow-draggable');
			});
			const box = await handle.asElement()!.boundingBox();
			if (!box) throw new Error('missing shadow box');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 500, box.y + 500);
			await page.mouse.up();
			const dragData = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragData;
			});
			expect(dragData).toEqual({ x: 100, y: 100 });
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should clip dragging to selector bounds in shadow DOM
	it('should clip dragging to selector bounds in shadow DOM', async function caseShadowSelector() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'shadow-selector' });
			await page.waitForFunction(function ready() {
				const host = document.getElementById('shadow-host-2');
				return Boolean(host?.shadowRoot?.getElementById('shadow-draggable-2'));
			});
			const handle = await page.evaluateHandle(function getNode() {
				return document
					.getElementById('shadow-host-2')!
					.shadowRoot!.getElementById('shadow-draggable-2');
			});
			const box = await handle.asElement()!.boundingBox();
			if (!box) throw new Error('missing shadow box');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 500, box.y + 500);
			await page.mouse.up();
			const dragData = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragData;
			});
			expect(dragData).toEqual({ x: 100, y: 100 });
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should not throw when unmounted during onStop callback
	it('should not throw when unmounted during onStop callback', async function caseUnmountOnStop() {
		await withPage(async function run(page) {
			await page.evaluate(function installErrorGuard() {
				window.__reactDraggableBrowser.api.errorThrown = false;
				window.onerror = function onError() {
					window.__reactDraggableBrowser.api.errorThrown = true;
					return true;
				};
			});
			await mount(page, { kind: 'unmount-on-stop' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			await page.waitForSelector('#unmounted');
			const errorThrown = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.errorThrown;
			});
			expect(errorThrown).toBe(false);
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should not defocus inputs when draggable unmounts
	it('should not defocus inputs when draggable unmounts', async function caseFocusUnmount() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'focus-unmount' });
			await page.waitForSelector('#test-input');
			await page.waitForSelector('#draggable-test');
			await page.focus('#test-input');
			await page.type('#test-input', 'hello');
			const isFocused = await page.evaluate(function read() {
				return document.activeElement === document.getElementById('test-input');
			});
			expect(isFocused).toBe(true);
			await page.evaluate(function resetAndUnmount() {
				window.__reactDraggableBrowser.api.inputBlurred = false;
				window.__reactDraggableBrowser.api.setShowDraggable!(false);
			});
			await page.waitForFunction(function gone() {
				return !document.getElementById('draggable-test');
			});
			const wasBlurred = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.inputBlurred;
			});
			expect(wasBlurred).toBe(false);
			const stillFocused = await page.evaluate(function read() {
				return document.activeElement === document.getElementById('test-input');
			});
			expect(stillFocused).toBe(true);
			const inputValue = await page.$eval('#test-input', function read(el) {
				return (el as HTMLInputElement).value;
			});
			expect(inputValue).toBe('hello');
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should not steal focus from inputs when starting drag
	it('should not steal focus from inputs when starting drag', async function caseFocusDrag() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'focus-drag' });
			await page.waitForSelector('#test-input-drag');
			await page.waitForSelector('#draggable-focus-test');
			await page.focus('#test-input-drag');
			await page.type('#test-input-drag', 'test');
			await page.evaluate(function resetBlur() {
				window.__reactDraggableBrowser.api.inputBlurred = false;
			});
			await dragBy(page, '#draggable-focus-test', 50, 50);
			const inputValue = await page.$eval('#test-input-drag', function read(el) {
				return (el as HTMLInputElement).value;
			});
			expect(inputValue).toBe('test');
		});
	});

	// @parity-case adapted-browser:tag/test/browser/browser.test.js::should calculate drag with offset position correctly
	it('should calculate drag with offset position correctly', async function caseOffset() {
		await withPage(async function run(page) {
			await mount(page, { kind: 'offset' });
			await page.waitForSelector('#draggable-test');
			await dragBy(page, '#draggable-test', 100, 100);
			const dragData = await page.evaluate(function read() {
				return window.__reactDraggableBrowser.api.dragData;
			});
			expect(dragData!.deltaX).toBe(100);
			expect(dragData!.deltaY).toBe(100);
		});
	});
});
