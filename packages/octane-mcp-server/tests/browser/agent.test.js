import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { chromium } from 'playwright';
import { injectAgent, openApp } from '../../src/agent.js';

const root = fileURLToPath(new URL('./fixture/', import.meta.url));
let server;
let url;
let chromiumMissing = null;

beforeAll(async () => {
	try {
		await (await chromium.launch()).close();
	} catch (error) {
		chromiumMissing = String(error.message).split('\n')[0];
		console.warn(`agent driver e2e skipped: ${chromiumMissing}`);
		return;
	}
	server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ profile: true })],
		server: { port: 0, strictPort: false },
	});
	await server.listen();
	url = server.resolvedUrls.local[0];
}, 60_000);

afterAll(async () => {
	await server?.close();
});

describe('injectAgent', () => {
	it('puts the agent module first in the head, ahead of the app', () => {
		const html = injectAgent(
			'<html><head><title>x</title><script type="module" src="/main.js"></script></head></html>',
		);
		expect(html.indexOf('/@id/octane/agent')).toBeLessThan(html.indexOf('/main.js'));
		expect(html.indexOf('/@id/octane/agent')).toBeGreaterThan(html.indexOf('<head>'));
	});
});

describe('the agent driver', () => {
	it('drives an app whose time moves only when the agent says so', async (context) => {
		if (chromiumMissing) context.skip();
		const app = await openApp({ url });
		try {
			expect(await app.tree()).toContain('button "Add one"');
			expect(await app.tree()).toContain('count 0');

			// The click commits, but its effect waits for a frame the clock holds,
			// however much real time passes.
			await app.tap({ testId: 'add' });
			await app.page.waitForTimeout(100);
			let tree = await app.tree();
			expect(tree).toContain('count 1');
			expect(tree).toContain('seen 0');

			await app.clock({ frame: true });
			expect(await app.tree()).toContain('seen 1');

			await app.type({ role: 'textbox', name: 'Name' }, 'Ada');
			tree = await app.tree();
			expect(tree).toContain('hello Ada');

			const state = await app.state();
			expect(state).toEqual([
				{
					name: 'App',
					state: [1, 1, 'Ada'],
					children: [{ name: 'Greeting', state: ['hello'], children: [] }],
				},
			]);

			expect(app.logs()).toContain('info: fixture booted');
			expect(app.logs()).toEqual([]);

			const png = Buffer.from(await app.screenshot());
			expect(png.subarray(1, 4).toString()).toBe('PNG');
		} finally {
			await app.close();
		}
	}, 60_000);

	it('leaves a page the driver did not open on real time', async (context) => {
		if (chromiumMissing) context.skip();
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			await page.goto(url);
			await page.getByTestId('add').click();
			await page.getByText('seen 1', { exact: true }).waitFor({ timeout: 10_000 });
			expect(await page.evaluate(() => globalThis.__OCTANE_AGENT__)).toBeUndefined();
		} finally {
			await browser.close();
		}
	}, 60_000);
});
