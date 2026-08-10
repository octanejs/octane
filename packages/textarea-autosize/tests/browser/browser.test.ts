import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, firefox, type BrowserType, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from '../../../octane/src/compiler/vite.js';

const HERE = new URL('.', import.meta.url).pathname;
let server: ViteDevServer;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ requireDirective: true }), react()],
		resolve: {
			dedupe: ['react', 'react-dom'],
			alias: {
				octane: new URL('../../../octane/src/index.ts', import.meta.url).pathname,
				'use-composed-ref': new URL(
					'../../../../node_modules/use-composed-ref/dist/use-composed-ref.esm.js',
					import.meta.url,
				).pathname,
				'use-isomorphic-layout-effect': new URL(
					'../../../../node_modules/use-isomorphic-layout-effect/dist/use-isomorphic-layout-effect.esm.js',
					import.meta.url,
				).pathname,
				'use-latest': new URL(
					'../../../../node_modules/use-latest/dist/use-latest.esm.js',
					import.meta.url,
				).pathname,
			},
		},
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
	expect(pageFailures).toEqual([]);
	await page?.context().browser()?.close();
	page = undefined;
	pageFailures = [];
});

afterAll(async () => {
	await server?.close();
});

async function open(browserType: BrowserType): Promise<void> {
	const browser = await browserType.launch({ headless: true });
	page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	pageFailures = [];
	page.on('pageerror', (error) => pageFailures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			pageFailures.push(`${message.type()}: ${message.text()}`);
		}
	});
	await page.goto(baseUrl);
	await page.waitForSelector('#octane-root textarea');
	await page.waitForSelector('#react-root textarea');
	await page.waitForFunction(() => Boolean(window.__textareaAutosizeParity));
	await page.waitForFunction(() => {
		const parity = window.__textareaAutosizeParity;
		return parity.state('octane').heights.length > 0 && parity.state('react').heights.length > 0;
	});
}

async function state(runtime: 'octane' | 'react') {
	return page!.evaluate((side) => window.__textareaAutosizeParity.state(side), runtime);
}

async function exercise(browserType: BrowserType): Promise<void> {
	await open(browserType);
	expect((await state('octane')).height).toBe((await state('react')).height);

	await page!.locator('#octane-root textarea').fill('');
	await page!.locator('#react-root textarea').fill('');
	await page!.evaluate(() => window.__textareaAutosizeParity.resetLogs());
	for (const runtime of ['octane', 'react'] as const) {
		const textarea = page!.locator(`#${runtime}-root textarea`);
		await textarea.pressSequentially('one');
		await textarea.press('Enter');
		await textarea.pressSequentially('two');
		await textarea.press('Enter');
		await textarea.pressSequentially('three');
	}
	const typed = await state('octane');
	expect(typed).toEqual(await state('react'));
	const heightIndex = typed.order.findIndex((entry) => entry.startsWith('height:'));
	expect(heightIndex).toBeGreaterThan(0);
	expect(typed.order.slice(heightIndex - 2, heightIndex + 2)).toEqual([
		'input',
		'change:capture',
		typed.order[heightIndex],
		'change',
	]);

	await page!.evaluate(() => {
		for (const textarea of document.querySelectorAll('textarea')) textarea.style.width = '100px';
		window.dispatchEvent(new UIEvent('resize'));
	});
	expect(await state('octane')).toEqual(await state('react'));

	await page!.evaluate(() => {
		(document.querySelector('#octane-form') as HTMLFormElement).reset();
		(document.querySelector('#react-form') as HTMLFormElement).reset();
	});
	await page!.waitForFunction(() => {
		const parity = window.__textareaAutosizeParity;
		return parity.state('octane').value === 'one' && parity.state('react').value === 'one';
	});
	await page!.waitForTimeout(32);
	expect(await state('octane')).toEqual(await state('react'));
}

describe.sequential('textarea-autosize real-browser parity', () => {
	// @parity-case browser:chromium
	it('matches React in Chromium', async () => {
		await exercise(chromium);
	});

	// @parity-case browser:firefox
	it('matches React in focused Firefox coverage', async () => {
		await exercise(firefox);
	});
});

declare global {
	interface Window {
		__textareaAutosizeParity: {
			resetLogs(): void;
			state(runtime: 'octane' | 'react'): {
				height: string;
				heights: number[];
				order: string[];
				value: string;
				width: string;
			};
		};
	}
}
