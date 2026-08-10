import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, firefox, type BrowserType } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const fixtureRoot = dirname(fileURLToPath(new URL('./fixture/index.html', import.meta.url)));
let server: ViteDevServer;
let url: string;
let cacheDir: string;

beforeAll(async () => {
	cacheDir = await mkdtemp(resolve(tmpdir(), 'octane-react-syntax-highlighter-vite-'));
	server = await createServer({
		cacheDir,
		configFile: false,
		root: fixtureRoot,
		logLevel: 'error',
		plugins: [octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await server?.close();
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

async function verifyBrowser(name: string, browserType: BrowserType) {
	const browser = await browserType.launch({ headless: true });
	const page = await browser.newPage();
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			failures.push(`${message.type()}: ${message.text()}`);
		}
	});
	try {
		await page.goto(url);
		await page.waitForFunction(() => Boolean(window.__syntaxHighlighterBrowser));
		const initial = await page.evaluate(() => window.__syntaxHighlighterBrowser.snapshot());
		expect(initial.octane, `${name} React initial parity`).toEqual(initial.react);
		expect(initial.octane, `${name} initial rendering`).toEqual({
			hostTag: 'SECTION',
			codeTag: 'SAMP',
			text: '1const answer = 42;\n2answer += 1;',
			whiteSpace: 'pre-wrap',
			lineDisplays: ['flex', 'flex'],
			lineNumberMinWidth: '16.25px',
			selected: 'const',
		});

		const updated = await page.evaluate(() => window.__syntaxHighlighterBrowser.update());
		expect(updated.octane, `${name} React update parity`).toEqual(updated.react);
		expect(updated.octane, `${name} live update`).toEqual({
			text: '1{"answer":43}',
			attribute: '"answer"',
		});

		const asyncState = await page.evaluate(() => window.__syntaxHighlighterBrowser.asyncSnapshot());
		expect(asyncState.octane, `${name} React async parity`).toEqual(asyncState.react);
		expect(asyncState.octane, `${name} async loading`).toEqual({
			keyword: 'const',
			text: 'const asyncValue = true;',
		});
		expect(failures).toEqual([]);
	} finally {
		await page.evaluate(() => window.__syntaxHighlighterBrowser.unmount()).catch(() => {});
		await Promise.allSettled([page.close(), browser.close()]);
	}
}

describe.sequential('react-syntax-highlighter real-browser behavior', () => {
	// @parity-case browser:chromium-render-update-async
	it('matches rendering, selection, updates, and async loading in Chromium', async () => {
		await verifyBrowser('Chromium', chromium);
	});

	// @parity-case browser:firefox-whitespace-selection
	it('preserves whitespace, wrapping, and selection in Firefox', async () => {
		await verifyBrowser('Firefox', firefox);
	});
});
