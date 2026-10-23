import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import * as ServerRuntime from 'octane/server';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { loadServerFixture } from '../../_server-fixture.js';
import { deferred } from '../../_server-stream.js';
import type * as App from './app.tsrx';

// Enforced, with no default policy: every HTML, script, or script-URL sink must
// receive a Trusted Types object. `octane` is the client runtime's policy,
// `octane-stream` the streaming bootstrap's, and `app` the application's own.
const CSP = "require-trusted-types-for 'script'; trusted-types octane octane-stream app";
const LATE_HTML = '<b id="late-b">late</b><template id="late-t"></template>';
const MODES = ['development', 'production'] as const;
type Mode = (typeof MODES)[number];
type Disposition = 'enforce' | 'report';
const VIOLATION_LOG = /requires 'Trusted(HTML|Script|ScriptURL)' assignment/;
const PAGES = ['/', '/stream', '/hydrate', '/deferred'];

const fixture = loadServerFixture<typeof App>(
	resolve('packages/octane/tests/browser/trusted-types/app.tsrx'),
);
const bundles = new Map<Mode, string>();
let browser: Browser;
let server: Server;
let origin: string;
// Resolves the open /stream response's boundaries.
let releaseStream: (() => void) | undefined;

beforeAll(async () => {
	for (const mode of MODES) bundles.set(mode, await clientBundle(mode));
	server = await serve();
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('No TCP port');
	origin = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
	await new Promise((done) => (server ? server.close(done) : done(undefined)));
});

async function clientBundle(mode: Mode): Promise<string> {
	const result = await build({
		configFile: false,
		logLevel: 'error',
		mode,
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		plugins: [octane({ hmr: false })],
		build: {
			write: false,
			minify: false,
			lib: {
				entry: resolve('packages/octane/tests/browser/trusted-types/client.ts'),
				formats: ['iife'],
				name: 'OctaneTrustedTypes',
			},
		},
	});
	const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
	const chunk = output.find((item) => item.type === 'chunk');
	if (!chunk || chunk.type !== 'chunk') throw new Error('Missing client bundle');
	return chunk.code;
}

/**
 * `/` streams a boundary after a client render; `/hydrate` and `/deferred`
 * send server HTML for `hydrateRoot`; `/stream` hydrates its shell before
 * `releaseStream` resolves the table and SVG boundaries.
 */
function serve(): Promise<Server> {
	const server = createServer((req, res) => {
		const url = new URL(req.url!, 'http://localhost');
		const mode = url.searchParams.get('mode') as Mode;
		if (url.pathname === '/client.js') {
			res.writeHead(200, { 'content-type': 'text/javascript' });
			res.end(bundles.get(mode));
			return;
		}
		if (!PAGES.includes(url.pathname)) {
			res.writeHead(404);
			res.end();
			return;
		}
		const header =
			url.searchParams.get('csp') === 'report'
				? 'content-security-policy-report-only'
				: 'content-security-policy';
		res.writeHead(200, { 'content-type': 'text/html', [header]: CSP });
		res.write(
			'<!doctype html><html><head><script>window.__violations=[];' +
				'document.addEventListener("securitypolicyviolation",function(e){' +
				'window.__violations.push(e.sample)})</script></head><body>',
		);
		const client = `<script src="/client.js?mode=${mode}"></script>`;
		if (url.pathname === '/') {
			res.write('<div id="client-root"></div><div id="raw-root"></div>' + client);
			const late = deferred<string>();
			stream(
				res,
				ServerRuntime.renderToPipeableStream(fixture.Streamed, { promise: late.promise }),
			);
			setTimeout(() => late.resolve(LATE_HTML), 50);
		} else if (url.pathname === '/stream') {
			const rows = deferred<string>();
			const shapes = deferred<string>();
			res.write('<div id="root">');
			stream(
				res,
				ServerRuntime.renderToPipeableStream(fixture.StreamedPage, {
					html: fixture.PAGE_HTML,
					rows: rows.promise,
					shapes: shapes.promise,
				}),
			);
			res.write('</div>' + client);
			releaseStream = () => {
				rows.resolve('streamed row');
				shapes.resolve('streamed shape');
			};
		} else {
			const body = url.pathname === '/deferred' ? fixture.DeferredPage : fixture.HydratedPage;
			const { html } = ServerRuntime.renderToString(body, { html: fixture.PAGE_HTML });
			res.end(`<div id="root">${html}</div>${client}</body></html>`);
		}
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

function stream(res: ServerResponse, rendered: { pipe(dest: any): unknown }) {
	rendered.pipe({
		write(chunk: string | Uint8Array) {
			res.write(chunk);
			return true;
		},
		end() {
			res.end('</body></html>');
		},
	});
}

/** Opens `path`, failing the test on any page error or console error. */
async function open(path: string, mode: Mode, disposition: Disposition = 'enforce') {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		// The browser logs each violation too; __violations already records them.
		if (message.type() === 'error' && !VIOLATION_LOG.test(message.text()))
			errors.push(message.text());
	});
	// `/stream` holds its response open, so its load event waits for the release.
	await page.goto(`${origin}${path}?mode=${mode}&csp=${disposition}`, { waitUntil: 'commit' });
	await page.waitForFunction(() => Boolean((window as any).__trustedTypes));
	return { page, errors };
}

/**
 * Drives a hydrated page to its updated state: the toggle mounts a fresh row in
 * `<tbody>` and a fresh `<rect>` in `<svg>`, and rewrites each adopted
 * `dangerouslySetInnerHTML` with the TrustedHTML.
 */
async function toggle(page: Page, ready: string[]) {
	await page.waitForFunction(
		(names) => names.every((name) => (window as any).__trustedTypes.ready.includes(name)),
		ready,
	);
	await page.click('#toggle');
	await page.waitForSelector('#row-added');
	await page.waitForSelector('#rect');
	return page.evaluate(() => {
		const rowAdded = document.getElementById('row-added')!;
		const rect = document.getElementById('rect')!;
		return {
			...(window as any).__trustedTypes,
			row: document.getElementById('row')?.firstElementChild?.textContent,
			shape: document.getElementById('shape')?.textContent,
			pageHTML: document.getElementById('page-html')?.innerHTML,
			rowHTML: document.getElementById('row-html')?.innerHTML,
			rowAddedParent: rowAdded.parentElement?.localName,
			rectNamespace: rect.namespaceURI,
			rectParent: rect.parentElement?.id,
			fallbacks: document.querySelectorAll('#rows-fallback, #shapes-fallback').length,
			violations: (window as any).__violations,
		};
	});
}

const UPDATED = {
	adopted: true,
	recoverable: [],
	pageHTML: '<i>trusted</i>',
	rowHTML: '<i>trusted</i>',
	rowAddedParent: 'tbody',
	rectNamespace: 'http://www.w3.org/2000/svg',
	rectParent: 'shapes',
	fallbacks: 0,
	violations: [],
};

async function hydrateCase(mode: Mode, disposition: Disposition) {
	const { page, errors } = await open('/hydrate', mode, disposition);
	try {
		expect(await toggle(page, ['page'])).toMatchObject({ ...UPDATED, row: 'row', shape: 'shape' });
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

async function streamCase(mode: Mode, disposition: Disposition) {
	const { page, errors } = await open('/stream', mode, disposition);
	try {
		// The shell hydrates with both boundaries still pending.
		expect(await page.locator('#rows-fallback, #shapes-fallback').count()).toBe(2);
		releaseStream!();
		expect(await toggle(page, ['rows', 'shapes'])).toMatchObject({
			...UPDATED,
			row: 'streamed row',
			shape: 'streamed shape',
		});
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

async function deferredCase(mode: Mode, disposition: Disposition) {
	const { page, errors } = await open('/deferred', mode, disposition);
	try {
		// Dormant until the first click, which activates it and replays.
		expect(await page.evaluate(() => (window as any).__trustedTypes.ready)).toEqual([]);
		const state = await toggle(page, []);
		expect(state).toMatchObject({ ...UPDATED, row: 'row', shape: 'shape' });
		expect(state.ready).toEqual(expect.arrayContaining(['page', 'deferred']));
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

describe.sequential('Trusted Types under an enforced CSP', () => {
	it.each(MODES)('%s renders through every sink', async (mode) => {
		const { page, errors } = await open('/', mode);
		try {
			await page.waitForSelector('#late-b');
			const state = await page.evaluate(() => ({
				...(window as any).__trustedTypes,
				enforced: typeof (window as any).trustedTypes?.createPolicy === 'function',
				fallback: document.getElementById('fallback') !== null,
				lateTemplate: document.getElementById('late-t')?.localName ?? null,
				violations: (window as any).__violations,
			}));
			expect(state).toMatchObject({
				enforced: true,
				inner: 'two',
				staticText: 'static',
				srcdoc: '<p>doc two</p>',
				src: '/two.js',
				rawMounted: false,
				fallback: false,
				lateTemplate: 'template',
			});
			expect(state.rejected).toMatch(/TrustedHTML/);
			// The application string is the only sink write the browser refused.
			expect(state.violations).toHaveLength(1);
			expect(state.violations[0]).toContain('<i>raw</i>');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it.each(MODES)('%s hydrates server HTML with hydrateRoot', (mode) =>
		hydrateCase(mode, 'enforce'),
	);
	it.each(MODES)('%s hydrates a streamed page with table and SVG boundaries', (mode) =>
		streamCase(mode, 'enforce'),
	);
	it.each(MODES)('%s activates a deferred Hydrate boundary', (mode) =>
		deferredCase(mode, 'enforce'),
	);
});

describe.sequential('Trusted Types under a report-only CSP', () => {
	// Report-only lets every write through, so one run lists every string sink a
	// hydrated page reaches instead of stopping at the first.
	it.each(MODES)('%s reports no violations while hydrating', async (mode) => {
		await hydrateCase(mode, 'report');
		await streamCase(mode, 'report');
		await deferredCase(mode, 'report');
	});
});
