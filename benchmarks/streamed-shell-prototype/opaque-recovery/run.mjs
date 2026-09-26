import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build: viteBuild } = await import(pathToFileURL(require.resolve('vite')).href);
const { build: esbuild } = await import(pathToFileURL(require.resolve('esbuild')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-opaque-recovery-'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = new Map();
const record = (file) => {
	if (
		path.isAbsolute(file) &&
		file.startsWith(repo + path.sep) &&
		fs.existsSync(file) &&
		fs.statSync(file).isFile()
	)
		if (!inputs.has(file)) inputs.set(file, sha(fs.readFileSync(file)));
};
for (const name of ['run.mjs', 'server.ts', 'Shell.tsrx', 'client.ts', 'fallback.ts'])
	record(path.join(here, name));
record(path.join(repo, 'pnpm-lock.yaml'));
const recordCompiler = (directory) => {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) recordCompiler(file);
		else if (/\.[cm]?js$/.test(entry.name)) record(file);
	}
};
recordCompiler(path.join(repo, 'packages/octane/src/compiler'));
const client = await viteBuild({
	configFile: false,
	root: repo,
	mode: 'production',
	logLevel: 'warn',
	publicDir: false,
	plugins: [
		octane({ hmr: false, ssr: false }),
		{
			name: 'record-race-inputs',
			load(id) {
				record(id.split('?')[0]);
			},
		},
	],
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	build: {
		outDir: path.join(output, 'assets'),
		emptyOutDir: false,
		minify: false,
		target: 'es2022',
		reportCompressedSize: false,
		lib: { entry: path.join(here, 'client.ts'), formats: ['es'] },
		rolldownOptions: {
			output: { entryFileNames: 'client.js', chunkFileNames: '[name]-[hash].js' },
		},
	},
});
const clientOutputs = Array.isArray(client)
	? client.flatMap((result) => result.output)
	: client.output;
for (const chunk of clientOutputs) {
	if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) record(id.split('?')[0]);
}
const compiler = createOctaneCompiler({
	root: repo,
	environment: 'server',
	dev: false,
	hmr: false,
	profile: false,
});
const serverFile = path.join(output, 'server.mjs');
const serverBuild = await esbuild({
	absWorkingDir: repo,
	entryPoints: [path.join(here, 'server.ts')],
	outfile: serverFile,
	bundle: true,
	metafile: true,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'race-server',
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
for (const file of Object.keys(serverBuild.metafile.inputs)) record(path.resolve(repo, file));
assert.deepEqual(
	[...inputs].filter(([file, digest]) => sha(fs.readFileSync(file)) !== digest),
	[],
);
const manifest = {
	inputs: Object.fromEntries(inputs),
	server: sha(fs.readFileSync(serverFile)),
	assets: Object.fromEntries(
		fs
			.readdirSync(path.join(output, 'assets'))
			.map((file) => [file, sha(fs.readFileSync(path.join(output, 'assets', file)))]),
	),
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (process.argv.includes('--build-only')) {
	console.log(JSON.stringify({ output, manifest: path.join(output, 'manifest.json') }, null, 2));
	process.exit(0);
}

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert.ok(executablePath, 'Set PLAYWRIGHT_EXECUTABLE_PATH to the authorized Chromium');
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath, headless: true });
const child = fork(serverFile, [path.join(output, 'assets')], {
	stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
const [message] = await once(child, 'message');
const origin = `http://127.0.0.1:${message.port}`;
const fallbackAsset = Object.keys(manifest.assets).find((file) => file.startsWith('fallback-'));
assert.ok(fallbackAsset);
const cases = [
	'ordinary-abort',
	'early-abort',
	'abort-before',
	'held-dispose',
	'held-stale',
	'import-failure',
	'hydrate-failure',
	'resolve',
	'reject',
];
const results = [];
let failure;
try {
	for (const name of cases) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		const requestFailures = [];
		page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
		page.on('requestfailed', (request) =>
			requestFailures.push({ url: request.url(), error: request.failure()?.errorText }),
		);
		let releaseImport;
		let startedImport;
		const importStarted = new Promise((resolve) => {
			startedImport = resolve;
		});
		const importGate = new Promise((resolve) => {
			releaseImport = resolve;
		});
		if (name === 'held-dispose' || name === 'held-stale' || name === 'import-failure') {
			await page.route(`**/${fallbackAsset}`, async (route) => {
				startedImport();
				if (name === 'import-failure') await route.abort('failed');
				else {
					await importGate;
					await route.continue();
				}
			});
		}
		const readServer = async () => (await fetch(`${origin}/evidence?case=${name}`)).json();
		const control = async (action) => {
			const response = await fetch(`${origin}/control?case=${name}&action=${action}`, {
				method: 'POST',
			});
			assert.equal(response.status, 200);
		};
		const read = () =>
			page.evaluate(() => ({ ...window.probe.state(), timers: window.timerProbe.snapshot() }));
		let before, after, advanced, disposed, late, successClick;
		try {
			await page.goto(`${origin}/?case=${name}`, { waitUntil: 'commit' });
			await page.locator('#pending').waitFor();
			await page.waitForFunction(
				() => globalThis.__octaneStreamedSignalSelections?.identities.length > 0,
			);
			await page.evaluate(() => {
				const active = new Set();
				const originalSet = window.setInterval.bind(window);
				const originalClear = window.clearInterval.bind(window);
				let starts = 0,
					stops = 0,
					peak = 0;
				window.setInterval = (callback, delay, ...args) => {
					const id = originalSet(callback, delay, ...args);
					if (delay === 400) {
						active.add(id);
						starts++;
						peak = Math.max(peak, active.size);
					}
					return id;
				};
				window.clearInterval = (id) => {
					if (active.delete(id)) stops++;
					originalClear(id);
				};
				window.timerProbe = { snapshot: () => ({ starts, stops, peak, active: active.size }) };
			});
			if (name === 'abort-before') {
				await control('abort');
				await page.waitForSelector('template[data-oct-b][data-oct-err]', { state: 'attached' });
			}
			await page.evaluate(
				async ({ name }) => {
					window.probe = await (
						await import('/client.js')
					).begin(
						name,
						name === 'ordinary-abort' ? 'ordinary' : 'early',
						name === 'hydrate-failure',
					);
				},
				{ name },
			);
			if (name !== 'ordinary-abort')
				await page.waitForFunction(() => window.probe.state().early.entered);
			before = await read();
			assert.equal(before.signal, 'pending');
			assert.equal(before.clientLoads, 0);
			if (name !== 'abort-before')
				await control(name === 'resolve' || name === 'reject' ? name : 'abort');
			await page.waitForFunction(
				async (caseName) => (await (await fetch(`/evidence?case=${caseName}`)).json()).ended,
				name,
			);
			if (name === 'resolve' || name === 'reject') {
				await page.waitForSelector(name === 'resolve' ? '#ready' : '#error');
				await page.waitForFunction(
					(status) => window.probe.state().signal === status,
					name === 'resolve' ? 'ready' : 'error',
				);
			} else if (name === 'held-dispose' || name === 'held-stale') {
				await importStarted;
				await page.evaluate(() => {
					window.probe.recover();
					window.probe.recover();
				});
				const held = await read();
				assert.equal(held.attempts, 1);
				await page.waitForFunction(
					(tick) => window.probe.state().early.ticks > tick,
					held.early.ticks,
				);
				if (name === 'held-dispose')
					await page.evaluate(() => {
						window.probe.dispose();
						window.probe.dispose();
					});
				else
					await page.evaluate(() =>
						document.querySelector('template[data-oct-err]').removeAttribute('data-oct-err'),
					);
				releaseImport();
				await page.waitForFunction(() => window.probe.state().declines === 1);
			} else if (name === 'import-failure' || name === 'hydrate-failure') {
				await page.waitForFunction(() => window.probe.state().phase === 'failed');
			} else {
				await page.waitForFunction(() => window.probe.state().signal === 'error');
				await page.waitForSelector('#error', { timeout: 10000 });
			}
			after = await read();
			if (name === 'early-abort' || name === 'abort-before') {
				assert.equal(after.phase, 'renderer');
				assert.equal(after.adoptions, 1);
				assert.equal(after.early.timerStarts, 1);
				assert.equal(after.early.timerStops, 1);
				assert.equal(after.renderer.active, 1);
				assert.equal(after.ownerMatched, true);
				assert.equal(after.renderer.renderOwnerMatched, true);
				assert.ok(after.renderer.renderOwnerChecks > 0);
				assert.equal(after.sameFrame, true);
				assert.equal(after.sameRow, true);
				assert.equal(after.rowText, String(after.early.ticks));
				assert.deepEqual(after.timers, { starts: 2, stops: 1, peak: 1, active: 1 });
				assert.equal(after.error, 'Configuration failed');
				await page.waitForFunction(
					(tick) => window.probe.state().renderer.ticks > tick,
					after.renderer.ticks,
				);
				advanced = await read();
				assert.ok(Number(advanced.rowText) > Number(after.rowText));
				assert.equal(advanced.sameFrame, true);
				assert.equal(advanced.sameRow, true);
				late = await page.evaluate(async () => {
					const state = window.probe.state();
					const carrier = document.createElement('div');
					carrier.setAttribute('data-oct-s', state.sentinelId);
					carrier.innerHTML = '<b id="late-adversarial">late</b>';
					document.body.append(carrier);
					window.$OCTRC(state.sentinelId);
					for (const frame of [
						{
							identity: state.identity,
							sequence: 0,
							channel: 'result',
							kind: 'open',
							resource: 'promise',
						},
						{
							identity: state.identity,
							sequence: 1,
							channel: 'result',
							kind: 'value',
							value: ['string', 'late'],
						},
						{ identity: state.identity, sequence: 2, channel: 'result', kind: 'complete' },
					])
						window.__octaneStreamedRenderer.receive(frame);
					await new Promise((resolve) => setTimeout(resolve, 100));
					return {
						carrierConnected: carrier.isConnected,
						lateVisible: !!document.getElementById('late-adversarial'),
						state: window.probe.state(),
					};
				});
				assert.equal(late.carrierConnected, false);
				assert.equal(late.lateVisible, false);
				assert.equal(late.state.signal, 'error');
				assert.equal(late.state.error, 'Configuration failed');
			}
			if (name === 'ordinary-abort') {
				assert.equal(after.phase, 'renderer');
				assert.equal(after.ownerMatched, true);
				assert.equal(after.renderer.renderOwnerMatched, true);
				assert.ok(after.renderer.renderOwnerChecks > 0);
				assert.equal(after.sameFrame, true);
				assert.equal(after.sameRow, true);
				assert.deepEqual(after.timers, { starts: 1, stops: 0, peak: 1, active: 1 });
				assert.equal(after.error, 'Configuration failed');
			}
			if (name === 'held-dispose') {
				assert.equal(after.phase, 'disposed');
				assert.equal(after.adoptions, 0);
				assert.equal(after.disposals, 1);
			}
			if (name === 'held-stale') {
				assert.equal(after.phase, 'early');
				assert.equal(after.adoptions, 0);
				assert.equal(after.early.timerStops, 0);
			}
			if (name === 'import-failure') {
				assert.equal(after.adoptions, 0);
				assert.equal(after.early.timerStops, 0);
				assert.equal(after.errors.length, 1);
			}
			if (name === 'hydrate-failure') {
				assert.equal(after.adoptions, 1);
				assert.equal(after.early.timerStops, 1);
				assert.equal(after.renderer.active, 0);
				assert.equal(after.errors.length, 1);
			}
			if (name === 'resolve' || name === 'reject') {
				assert.equal(after.phase, 'early');
				assert.equal(after.adoptions, 0);
				assert.equal(after.early.timerStops, 0);
			}
			if (name === 'resolve') {
				await page.locator('#ready button').click();
				await page.waitForFunction(() => window.probe.state().early.clicks === 1);
				successClick = await read();
				assert.deepEqual(successClick.early.trusted, [true]);
			}
			assert.equal(after.clientLoads, 0);
			assert.equal(after.timers.peak, 1);
			await page.evaluate(() => {
				window.probe.dispose();
				window.probe.dispose();
			});
			disposed = await read();
			assert.equal(disposed.disposals, 1);
			assert.equal(disposed.renderer.active, 0);
			assert.equal(disposed.timers.active, 0);
			assert.equal(disposed.timers.starts, disposed.timers.stops);
			if (disposed.early) {
				assert.equal(disposed.early.timerStops, 1);
				assert.equal(disposed.early.unmounted, 1);
				assert.equal(disposed.early.frameSubscriptions, 0);
				assert.equal(disposed.early.signalSubscriptions, 0);
			}
			await page.evaluate(() => window.probe.disposeBridge());
			const server = await readServer();
			assert.equal(server.loads, 1);
			assert.equal(server.errors.length, name === 'resolve' || name === 'reject' ? 0 : 1);
			assert.ok(server.chunks.join('').includes('"nodeKey":"g:'));
			if (name !== 'resolve' && name !== 'reject') {
				assert.ok(server.chunks.join('').includes('>$OCTRX('));
				assert.match(server.errors[0], /Octane error #42/);
			}
			assert.deepEqual(errors, []);
			if (name === 'import-failure') {
				assert.equal(requestFailures.length, 1);
				assert.ok(requestFailures[0].url.endsWith('/' + fallbackAsset));
				assert.equal(requestFailures[0].error, 'net::ERR_FAILED');
			} else assert.deepEqual(requestFailures, []);
			results.push({
				name,
				before,
				after,
				advanced,
				successClick,
				disposed,
				late,
				server: {
					loads: server.loads,
					errors: server.errors,
					ended: server.ended,
					selectionScript: server.chunks.join('').includes('"nodeKey":"g:'),
					abortedSentinel: server.chunks.join('').includes('>$OCTRX('),
				},
				errors,
				requestFailures,
			});
			console.log(`${name}: passed`);
		} catch (error) {
			try {
				after = await read();
			} catch {}
			results.push({
				name,
				before,
				after,
				disposed,
				late,
				errors,
				requestFailures,
				failure: error.stack ?? String(error),
			});
			failure = error;
			break;
		} finally {
			releaseImport?.();
			await context.close();
		}
	}
} finally {
	child.kill();
	await browser.close();
	const changedInputs = [...inputs].filter(
		([file, digest]) => sha(fs.readFileSync(file)) !== digest,
	);
	if (changedInputs.length > 0 && !failure)
		failure = new Error(`Build inputs changed: ${changedInputs.map(([file]) => file).join(', ')}`);
	fs.writeFileSync(
		path.join(output, 'result.json'),
		JSON.stringify(
			{
				browser: browser.version(),
				manifest: sha(fs.readFileSync(path.join(output, 'manifest.json'))),
				results,
			},
			null,
			2,
		),
	);
	console.log(
		JSON.stringify({ output, cases: results.length, failure: failure && String(failure) }, null, 2),
	);
}
if (failure) throw failure;
