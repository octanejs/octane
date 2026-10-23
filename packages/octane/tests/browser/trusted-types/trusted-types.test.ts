import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { createServer, type Server } from 'node:http';
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

const fixture = loadServerFixture<typeof App>(
	resolve('packages/octane/tests/browser/trusted-types/app.tsrx'),
);
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

async function clientBundle(mode: 'development' | 'production'): Promise<string> {
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

/** Streams the SSR document; its Suspense boundary resolves after the shell is sent. */
function serve(bundle: string): Promise<Server> {
	const server = createServer((req, res) => {
		if (req.url === '/client.js') {
			res.writeHead(200, { 'content-type': 'text/javascript' });
			res.end(bundle);
			return;
		}
		res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP });
		res.write(
			'<!doctype html><html><head><script>window.__violations=[];' +
				'document.addEventListener("securitypolicyviolation",function(e){' +
				'window.__violations.push(e.sample)})</script></head><body>' +
				'<div id="client-root"></div><div id="raw-root"></div>' +
				'<script src="/client.js"></script>',
		);
		const late = deferred<string>();
		ServerRuntime.renderToPipeableStream(fixture.Streamed, { promise: late.promise }).pipe({
			write(chunk: string | Uint8Array) {
				res.write(chunk);
				return true;
			},
			end() {
				res.end('</body></html>');
			},
		} as any);
		setTimeout(() => late.resolve(LATE_HTML), 50);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

describe.sequential('Trusted Types under an enforced CSP', () => {
	it.each(['development', 'production'] as const)('%s renders through every sink', async (mode) => {
		const server = await serve(await clientBundle(mode));
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('No TCP port');
			await page.goto(`http://127.0.0.1:${address.port}/`);
			await page.waitForFunction(() => Boolean((window as any).__trustedTypes));
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
			await new Promise((done) => server.close(done));
		}
	});
});
