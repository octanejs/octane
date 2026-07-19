// Real-browser evidence for the render-outline overlay: the canvas exists
// above the app without intercepting input, flashes ink when components
// render, fades back to empty, and stays dark when animationSpeed is 'off'.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let server: ViteDevServer;
let browser: Browser;
let page: Page;
let baseUrl: string;
let pageFailures: string[] = [];

/** Total alpha painted on the overlay canvas — 0 means visually empty. */
async function overlayInk(target: Page): Promise<number> {
	return target.evaluate(() => {
		const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
		if (canvas === null) return -1;
		const context = canvas.getContext('2d')!;
		const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let ink = 0;
		for (let index = 3; index < data.length; index += 4) ink += data[index];
		return ink;
	});
}

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ profile: true })],
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
			`Chromium is required for outline evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
		);
	}
	page = await browser.newPage();
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error') pageFailures.push(`console error: ${message.text()}`);
	});
	await page.goto(baseUrl);
	await page.waitForSelector('#inc');
});

afterAll(async () => {
	expect(pageFailures).toEqual([]);
	await browser?.close();
	await server?.close();
});

describe('render outlines browser evidence', () => {
	it('creates the overlay above the app without intercepting input', async () => {
		await page.waitForSelector('canvas[data-octane-scan]');
		const pointerEvents = await page.evaluate(
			() => getComputedStyle(document.querySelector('canvas[data-octane-scan]')!).pointerEvents,
		);
		expect(pointerEvents).toBe('none');

		// The overlay covers the button, yet clicks land on the app.
		await page.locator('#inc').click();
		await page.waitForFunction(() => document.querySelector('#value')?.textContent === 'count: 1');
	});

	it('flashes outlines for a render burst, then fades back to an empty canvas', async () => {
		await page.locator('#inc').click();
		// Ink appears with the commit's outline flash…
		await page.waitForFunction(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
			if (canvas === null) return false;
			const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
			for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
			return false;
		});
		// …and fully clears once the fade completes.
		await page.waitForFunction(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
			const data = canvas!.getContext('2d')!.getImageData(0, 0, canvas!.width, canvas!.height).data;
			for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return false;
			return true;
		});
	});

	it('draws nothing when animationSpeed is off, and resumes when restored', async () => {
		await page.evaluate(() => {
			(window as any).__scan.setOptions({ animationSpeed: 'off' });
		});
		await page.locator('#inc').click();
		// The render itself still commits; the overlay just stays empty. Give a
		// couple of frames for any (incorrect) draw to land before sampling.
		await page.waitForFunction(() => document.querySelector('#value')?.textContent === 'count: 3');
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
		);
		expect(await overlayInk(page)).toBe(0);

		await page.evaluate(() => {
			(window as any).__scan.setOptions({ animationSpeed: 'fast' });
		});
		await page.locator('#inc').click();
		await page.waitForFunction(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
			const data = canvas!.getContext('2d')!.getImageData(0, 0, canvas!.width, canvas!.height).data;
			for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
			return false;
		});
	});

	it('pauses outlines from the toolbar toggle and resumes', async () => {
		// Wait for the fade from the previous test so a stale flash cannot leak in.
		await page.waitForFunction(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
			const data = canvas!.getContext('2d')!.getImageData(0, 0, canvas!.width, canvas!.height).data;
			for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return false;
			return true;
		});
		await page.locator('[data-octane-scan-toolbar] [data-action="toggle"]').click();
		await page.locator('#inc').click();
		await page.waitForFunction(() => document.querySelector('#value')?.textContent === 'count: 5');
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
		);
		expect(await overlayInk(page)).toBe(0);

		await page.locator('[data-octane-scan-toolbar] [data-action="toggle"]').click();
		await page.locator('#inc').click();
		await page.waitForFunction(() => {
			const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-octane-scan]');
			const data = canvas!.getContext('2d')!.getImageData(0, 0, canvas!.width, canvas!.height).data;
			for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
			return false;
		});
	});
});

describe('interaction inspector browser evidence', () => {
	/** Read a value out of the toolbar's shadow root. */
	function fromToolbar<T>(target: Page, read: (root: ShadowRoot) => T): Promise<T> {
		return target.evaluate((source) => {
			const host = document.querySelector('[data-octane-scan-toolbar]');
			// eslint-disable-next-line no-new-func
			const fn = new Function('root', `return (${source})(root);`) as (root: ShadowRoot) => T;
			return fn(host!.shadowRoot!);
		}, read.toString());
	}

	it('records a real click as an interaction and shows it in the History panel', async () => {
		// A fresh interaction with real browser event/animation timing.
		await page.locator('#inc').click();
		await page.waitForFunction(() => {
			const host = document.querySelector('[data-octane-scan-toolbar]');
			return host?.shadowRoot?.querySelector('[data-action="notifications"]') != null;
		});

		// Open the notifications panel from the bell.
		await fromToolbar(page, (root) =>
			(root.querySelector('[data-action="notifications"]') as HTMLElement).click(),
		);

		await page.waitForFunction(() => {
			const host = document.querySelector('[data-octane-scan-toolbar]');
			const rows = host?.shadowRoot?.querySelectorAll('.history-row');
			return rows != null && rows.length > 0;
		});

		const opened = await fromToolbar(page, (root) =>
			root.querySelector('.widget')!.classList.contains('open'),
		);
		expect(opened).toBe(true);

		const badge = await fromToolbar(
			page,
			(root) => root.querySelector('.history-row .history-time')?.textContent ?? '',
		);
		expect(badge).toContain('ms');

		// The interaction resolves to a real component name — not "Unknown" — even
		// though the app rendered before scanning was toggled on.
		const name = await fromToolbar(
			page,
			(root) => root.querySelector('.history-row .history-name')?.textContent ?? '',
		);
		expect(['App', 'Label']).toContain(name);

		// The Ranked tab lists at least one component that rendered.
		const ranked = await fromToolbar(page, (root) => root.querySelectorAll('.rank-row').length);
		expect(ranked).toBeGreaterThan(0);
	});
});
