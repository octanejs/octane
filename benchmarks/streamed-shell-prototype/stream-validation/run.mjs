import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyEvidence, writeEvidence } from './evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const prototype = path.dirname(here);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build: viteBuild, version: viteVersion } = await import(
	pathToFileURL(require.resolve('vite')).href
);
const { build: esbuild } = await import(pathToFileURL(require.resolve('esbuild')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const { chromium } = require('playwright');
const outputArg = process.argv.find((arg) => arg.startsWith('--output-dir='));
const output = outputArg
	? path.resolve(outputArg.slice('--output-dir='.length))
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-stream-browser-'));
if (outputArg) {
	assert.ok(!fs.existsSync(output), 'Use a fresh output directory');
	fs.mkdirSync(output, { recursive: true });
}
const fixture = path.join(
	repo,
	'packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx',
);
const surrogate = path.join(
	repo,
	'packages/octane/tests/hydration/_fixtures/streamed-static-shell-client.ts',
);
const compiler = createOctaneCompiler({
	root: repo,
	environment: 'server',
	dev: false,
	hmr: false,
	profile: false,
});
const serverCode = compiler.transform(fs.readFileSync(fixture, 'utf8'), fixture).code;
const sites = [...serverCode.matchAll(/\bc:[0-9a-f]+\b/g)].map((match) => match[0]);
assert.equal(sites.length, 1);
assert.ok(
	fs.readFileSync(surrogate, 'utf8').includes(`'${sites[0]}'`),
	'The surrogate must use the SSR component site',
);

for (const variant of ['baseline', 'candidate']) {
	await viteBuild({
		configFile: false,
		root: repo,
		mode: 'production',
		logLevel: 'warn',
		publicDir: false,
		plugins: [octane({ hmr: false, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		build: {
			outDir: path.join(output, variant),
			emptyOutDir: false,
			minify: 'esbuild',
			target: 'es2022',
			reportCompressedSize: false,
			lib: { entry: path.join(prototype, `streamed-${variant}.ts`), formats: ['es'] },
			rolldownOptions: {
				output: { entryFileNames: 'entry.js', chunkFileNames: 'chunks/[name]-[hash].js' },
			},
		},
	});
}

const serverFile = path.join(output, 'server.mjs');
await esbuild({
	entryPoints: [path.join(here, 'server-entry.ts')],
	outfile: serverFile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'octane-server-fixture',
			setup(builder) {
				builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
					path: require.resolve(request === 'octane' ? 'octane/server' : request),
				}));
				builder.onLoad({ filter: /\.tsrx$/ }, ({ path: file }) => ({
					contents: compiler.transform(fs.readFileSync(file, 'utf8'), file).code,
					loader: 'js',
					resolveDir: path.dirname(file),
				}));
			},
		},
	],
});

const manifestSha256 = writeEvidence(repo, output, {
	node: process.version,
	vite: viteVersion,
	site: sites[0],
});
assert.equal(verifyEvidence(repo, output), manifestSha256);

if (process.argv.includes('--build-only')) {
	console.log(
		JSON.stringify(
			{ output, node: process.version, vite: viteVersion, site: sites[0], manifestSha256 },
			null,
			2,
		),
	);
	process.exit(0);
}

const child = fork(serverFile, [output], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let serverLog = '';
child.stdout.on('data', (chunk) => {
	serverLog += String(chunk);
});
child.stderr.on('data', (chunk) => {
	serverLog += String(chunk);
});
let browser;
try {
	const [message] = await Promise.race([
		once(child, 'message'),
		once(child, 'exit').then(([code]) => {
			throw new Error(`SSR process exited ${code}: ${serverLog}`);
		}),
		new Promise((_, reject) => {
			setTimeout(() => reject(new Error('SSR process did not listen')), 10000).unref();
		}),
	]);
	const origin = `http://127.0.0.1:${message.port}`;
	const executablePath =
		process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	browser = await chromium.launch({ headless: true, executablePath, timeout: 10000 });
	const cases = [];
	for (const variant of ['baseline', 'candidate']) {
		for (const timing of ['before', 'after']) {
			for (const lifecycle of ['dispose-after-end', 'suspend-before-end', 'dispose-before-end']) {
				const name = `${variant}-${timing}-${lifecycle}`;
				const context = await browser.newContext();
				try {
					const page = await context.newPage();
					const errors = [];
					const requests = [];
					page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
					page.on('console', (message) => {
						if (message.type() === 'error') errors.push(message.text());
					});
					page.on('requestfailed', (request) =>
						errors.push(`${request.url()}: ${request.failure()?.errorText}`),
					);
					page.on('request', (request) => requests.push(new URL(request.url()).pathname));
					const control = async (action) => {
						const response = await fetch(`${origin}/control?case=${name}&action=${action}`, {
							method: 'POST',
						});
						assert.equal(response.status, 200);
					};
					const metrics = async () => {
						const response = await fetch(`${origin}/metrics?case=${name}`);
						assert.equal(response.status, 200);
						return response.json();
					};
					await page.goto(`${origin}/?case=${name}`, { waitUntil: 'commit' });
					await page.waitForFunction(() => document.querySelector('output')?.textContent === 'A');
					await page.evaluate(() => {
						window.__nodes = Object.fromEntries(
							['main', 'h1', 'footer', 'output', 'input', 'button'].map((selector) => [
								selector,
								document.querySelector(selector),
							]),
						);
						window.__browserLoads = 0;
						window.__cleanup = 0;
						window.__earlyRenderer = globalThis.__octaneStreamedRenderer;
					});
					assert.deepEqual(
						await page.evaluate(() => ({
							version: window.__earlyRenderer?.version,
							frames: Array.isArray(window.__earlyRenderer?.frames),
							receive: typeof window.__earlyRenderer?.receive,
						})),
						{ version: 1, frames: true, receive: 'function' },
						'The real document must install its early renderer mailbox before hydration',
					);
					await page.locator('input').fill('browser draft');
					const second = 'B: streamed update';
					if (timing === 'before') {
						await control('next');
						await page.waitForFunction(
							(value) => [...document.scripts].some((script) => script.textContent.includes(value)),
							second,
						);
						assert.equal(await page.locator('output').textContent(), 'A');
					}
					await page.evaluate(async (which) => {
						const module = await import(`/${which}/entry.js`);
						window.__runtime = module.start(document.getElementById('root'), {
							async *load() {
								window.__browserLoads++;
								yield 'unexpected browser result';
							},
							onCleanup() {
								window.__cleanup++;
							},
						});
					}, variant);
					assert.equal(
						await page.evaluate(
							() => globalThis.__octaneStreamedRenderer === window.__earlyRenderer,
						),
						false,
						'Hydration must install its receiver over the early mailbox',
					);
					if (timing === 'after') {
						assert.equal(await page.locator('output').textContent(), 'A');
						await control('next');
					}
					await page.waitForFunction(
						(value) => document.querySelector('output')?.textContent === value,
						second,
					);
					const adoption = await page.evaluate(() => ({
						identities: Object.fromEntries(
							Object.entries(window.__nodes).map(([selector, node]) => [
								selector,
								node === document.querySelector(selector),
							]),
						),
						draft: document.querySelector('input').value,
						focus: document.activeElement === document.querySelector('input'),
						browserLoads: window.__browserLoads,
					}));
					assert.deepEqual(adoption, {
						identities: {
							main: true,
							h1: true,
							footer: true,
							output: true,
							input: true,
							button: true,
						},
						draft: 'browser draft',
						focus: true,
						browserLoads: 0,
					});
					assert.equal(await page.locator('footer').textContent(), 'Static sibling');
					for (const count of ['1', '2']) {
						await page.locator('button').click();
						await page.waitForFunction(
							(value) => document.querySelector('button')?.textContent === value,
							count,
						);
						assert.equal(
							await page.evaluate(() => window.__nodes.button === document.querySelector('button')),
							true,
						);
					}
					const cleanup = async (method) =>
						page.evaluate(async (method) => {
							window.__runtime.root.unmount();
							await new Promise((resolve) => setTimeout(resolve, 0));
							window.__runtime.hydration[method]();
							return {
								count: window.__cleanup,
								mainPresent: document.querySelector('main') !== null,
								receiver: typeof globalThis.__octaneStreamedRenderer?.receive,
							};
						}, method);
					let cleaned;
					let mailboxRestored;
					let terminalQueued;
					if (lifecycle !== 'dispose-after-end') {
						assert.equal((await metrics()).ended, false);
						assert.notEqual(await page.evaluate(() => document.readyState), 'complete');
						cleaned = await cleanup(lifecycle === 'suspend-before-end' ? 'suspend' : 'dispose');
						assert.deepEqual(cleaned, { count: 1, mainPresent: false, receiver: 'function' });
						if (lifecycle === 'dispose-before-end') {
							mailboxRestored = await page.evaluate(
								() => globalThis.__octaneStreamedRenderer === window.__earlyRenderer,
							);
							assert.equal(
								mailboxRestored,
								true,
								'Dispose must restore the actual pre-hydration mailbox',
							);
						}
					}
					await control('end');
					await page.waitForFunction(() => document.readyState === 'complete');
					const state = await metrics();
					assert.equal(state.ended, true);
					assert.equal(state.loads, 1);
					assert.deepEqual(state.errors, []);
					assert.ok(
						state.chunks.some((chunk) => chunk.includes(second)),
						'The second value must come from the SSR HTTP stream',
					);
					assert.ok(
						state.chunks.join('').includes('"kind":"complete"'),
						'The terminal frame must arrive after the lifecycle action when suspended',
					);
					assert.equal(
						await page.evaluate(() =>
							[...document.querySelectorAll('script[data-octane-stream]')].some((script) =>
								script.textContent.includes('"kind":"complete"'),
							),
						),
						true,
						'The browser must parse the terminal frame',
					);
					if (lifecycle === 'dispose-before-end') {
						terminalQueued = await page.evaluate(() =>
							window.__earlyRenderer.frames.some(
								(frame) => frame.channel === 'result' && frame.kind === 'complete',
							),
						);
						assert.equal(
							terminalQueued,
							true,
							'The restored mailbox must receive the late terminal frame',
						);
					}
					if (lifecycle === 'dispose-after-end') {
						cleaned = await cleanup('dispose');
						assert.equal(cleaned.count, 1);
						assert.equal(cleaned.mainPresent, false);
					}
					// Give any page error from executing the final parser-delivered script a turn to arrive.
					await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
					assert.deepEqual(errors, []);
					assert.ok(requests.includes(`/${variant}/entry.js`));
					cases.push({
						variant,
						timing,
						lifecycle,
						mailboxRestored,
						terminalQueued,
						adoption,
						cleanup: cleaned,
						serverLoads: state.loads,
						chunks: state.chunks.length,
						requests,
					});
				} finally {
					await context.close();
				}
			}
		}
	}
	const result = {
		browser: browser.version(),
		node: process.version,
		vite: viteVersion,
		output,
		manifestSha256,
		cases,
	};
	fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
} finally {
	await browser?.close();
	child.kill();
}
