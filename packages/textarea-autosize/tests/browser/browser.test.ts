import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from '../../../octane/src/compiler/vite.js';

const HERE = new URL('.', import.meta.url).pathname;
let server: ViteDevServer;
let baseUrl: string;
let cacheDir: string;

beforeAll(async () => {
	cacheDir = await mkdtemp(resolve(tmpdir(), 'octane-textarea-autosize-vite-'));
	server = await createServer({
		cacheDir,
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ requireDirective: true }), react()],
		resolve: {
			dedupe: ['react', 'react-dom'],
			alias: [
				{
					find: /^octane$/,
					replacement: new URL('../../../octane/src/index.ts', import.meta.url).pathname,
				},
			],
		},
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await server?.close();
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

async function open() {
	const browser = await launchBrowser({ headless: true });
	let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
	try {
		context = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await context.newPage();
		const pageFailures: string[] = [];
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
		return { browser, context, page, pageFailures };
	} catch (error) {
		await Promise.allSettled([context?.close(), browser.close()]);
		throw error;
	}
}

async function state(page: Page, runtime: 'octane' | 'react') {
	return page.evaluate((side) => window.__textareaAutosizeParity.state(side), runtime);
}

async function exercise(): Promise<void> {
	const { browser, context, page, pageFailures } = await open();
	try {
		expect((await state(page, 'octane')).height).toBe((await state(page, 'react')).height);

		await page.locator('#octane-root textarea').fill('');
		await page.locator('#react-root textarea').fill('');
		await page.evaluate(() => window.__textareaAutosizeParity.resetLogs());
		for (const runtime of ['octane', 'react'] as const) {
			const textarea = page.locator(`#${runtime}-root textarea`);
			await textarea.pressSequentially('one');
			await textarea.press('Enter');
			await textarea.pressSequentially('two');
			await textarea.press('Enter');
			await textarea.pressSequentially('three');
		}
		const typed = await state(page, 'octane');
		expect(typed).toEqual(await state(page, 'react'));
		const heightIndex = typed.order.findIndex((entry) => entry.startsWith('height:'));
		expect(heightIndex).toBeGreaterThan(0);
		expect(typed.order.slice(heightIndex - 2, heightIndex + 2)).toEqual([
			'input',
			'change:capture',
			typed.order[heightIndex],
			'change',
		]);

		await page.evaluate(() => {
			for (const textarea of document.querySelectorAll('textarea')) textarea.style.width = '100px';
			window.dispatchEvent(new UIEvent('resize'));
		});
		expect(await state(page, 'octane')).toEqual(await state(page, 'react'));

		await page.evaluate(() => {
			(document.querySelector('#octane-form') as HTMLFormElement).reset();
			(document.querySelector('#react-form') as HTMLFormElement).reset();
		});
		await page.waitForFunction(() => {
			const parity = window.__textareaAutosizeParity;
			return parity.state('octane').value === 'one' && parity.state('react').value === 'one';
		});
		await page.waitForTimeout(32);
		expect(await state(page, 'octane')).toEqual(await state(page, 'react'));
		expect(pageFailures).toEqual([]);
	} finally {
		await Promise.allSettled([context.close(), browser.close()]);
	}
}

describe.sequential('textarea-autosize real-browser parity', () => {
	// @parity-case browser:chromium
	it('matches React in Chromium', async () => {
		await exercise();
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
