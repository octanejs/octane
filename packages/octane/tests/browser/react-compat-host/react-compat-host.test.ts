import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { ReactCompatDocument } from 'octane/react/server';
import type {} from './page.js';

let server: ViteDevServer;
let browser: Browser;
let page: Page;
let url: string;
let data: PromiseWithResolvers<string>;
const errors: string[] = [];

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: import.meta.dirname,
		logLevel: 'error',
		appType: 'custom',
		cacheDir: '../../../node_modules/.vite/react-compat-host',
		optimizeDeps: { include: ['react', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'] },
		plugins: [octane({ requireDirective: true, hmr: false })],
		server: { host: '127.0.0.1', port: 0 },
	});
	const { tree } = await server.ssrLoadModule('/page.tsx');
	server.middlewares.use('/document', async (_req, res, next) => {
		try {
			const stream = await ReactCompatDocument.renderToReadableStream(tree(data.promise));
			res.setHeader('content-type', 'text/html');
			for await (const chunk of stream) res.write(chunk);
			res.end();
		} catch (error) {
			next(error);
		}
	});
	await server.listen();
	url = server.resolvedUrls!.local[0] + 'document';
	browser = await launchBrowser();
});

afterEach(async () => {
	data?.resolve('Ready');
	await page?.close();
	expect(errors.splice(0)).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function expectState(label: 'open' | 'closed', className: string = label) {
	const open = label === 'open';
	expect(await page.evaluate(() => window.host.snapshot())).toEqual({
		label,
		className,
		open: String(open),
		width: open ? '320px' : '160px',
		opacity: open ? '0.9' : '',
		original: true,
		focused: true,
		draft: 'unfinished',
		selection: [2, 4],
	});
}

async function start(stamp?: 'current' | 'stale') {
	data = Promise.withResolvers<string>();
	page = await browser.newPage();
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(url, { waitUntil: 'commit' });
	await page.getByText('Loading').waitFor();
	expect(await page.locator('#frame').getAttribute('data-octane-bindings')).toBeTruthy();
	await page.getByLabel('Draft').fill('unfinished');
	await page.evaluate((stamp) => {
		document.querySelector('input')!.setSelectionRange(2, 4);
		const frame = document.getElementById('frame')!;
		if (stamp === 'stale') frame.dataset.octaneBindings = 'stale';
		if (stamp) frame.className = 'altered';
	}, stamp);
	await page.evaluate("import('/page.tsx').then(({ hydrate }) => { window.host = hydrate(); })");
	await page.waitForFunction(() => window.host.refs.length > 0);
	// Only successful adoption repairs an altered value before any prop update.
	await expectState('open', stamp === 'stale' ? 'altered' : 'open');

	data.resolve('Ready');
	await page.getByText('Ready').waitFor();
	expect(await page.evaluate(() => window.host.finish())).toBe(true);
}

it.each(['current', 'stale'] as const)(
	'preserves the streamed editor with a %s binding stamp',
	async (stamp) => {
		await start(stamp);
		await page.keyboard.press('Escape');
		await expectState('closed');
		await page.keyboard.press('Escape');
		await expectState('open');
		expect(await page.evaluate(() => window.host.refs)).toEqual(['attached']);
		await page.evaluate(() => window.host.dispose());
		expect(await page.evaluate(() => window.host.refs)).toEqual(['attached', 'cleanup']);
	},
);

it('does not publish props from a suspended transition', async () => {
	await start();
	await page.evaluate(() => window.host.suspend());
	await expectState('open');
	await page.evaluate(() => window.host.set('closed'));
	await expectState('closed');
});

it('measures current styles on Activity reveal, including an initially hidden host', async () => {
	await start();
	await page.locator('#preloaded').waitFor({ state: 'attached' });
	expect(await page.locator('#preloaded').isHidden()).toBe(true);
	await page.evaluate(() => window.host.set('hidden'));
	await page.locator('#frame[aria-label=hidden]').waitFor({ state: 'attached' });
	expect(await page.locator('#frame').isHidden()).toBe(true);
	expect(await page.locator('#preloaded').isHidden()).toBe(true);
	await page.evaluate(() => window.host.set('revealed'));
	expect(await page.evaluate(() => window.host.measurements)).toEqual([
		['frame', 320, 'block'],
		['frame', 240, 'grid'],
		['preloaded', 240, 'grid'],
	]);
	expect(await page.evaluate(() => window.host.snapshot())).toMatchObject({
		original: true,
		draft: 'unfinished',
	});
});
