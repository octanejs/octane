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
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-opaque-metrics-'));
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
for (const name of [
	'run.mjs',
	'server.ts',
	'Shell.tsrx',
	'Frame.tsrx',
	'Ready.tsrx',
	'State.tsrx',
	'calls.ts',
	'adapter.tsrx',
	'client.ts',
	'README.md',
])
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
let child;
const reports = [];
try {
	child = fork(serverFile, [path.join(output, 'assets')], {
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	});
	const [message] = await once(child, 'message');
	const origin = `http://127.0.0.1:${message.port}`;

	for (const name of [
		'reveal-before-activation',
		'activation-before-reveal',
		'stale-target',
		'reject',
		'abort',
		'dispose-before-reveal',
	]) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		let queued = null;
		let afterGate = null;
		let whenDisposed = null;
		let postDispose = null;
		page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
		page.on('requestfailed', (request) =>
			errors.push(`${request.url()}: ${request.failure()?.errorText}`),
		);
		const read = async () => (await fetch(`${origin}/evidence?case=${name}`)).json();
		const control = async (action) => {
			const response = await fetch(`${origin}/control?case=${name}&action=${action}`, {
				method: 'POST',
			});
			assert.equal(response.status, 200);
		};
		try {
			await page.goto(`${origin}/?case=${name}`, { waitUntil: 'commit' });
			await page.locator('#pending').waitFor();
			await page.waitForFunction(
				() => globalThis.__octaneStreamedSignalSelections?.identities.length > 0,
			);
			const initial = await page.locator('#island').innerHTML();
			if (name === 'reveal-before-activation') {
				await control('resolve');
				await page.locator('#ready').waitFor();
				await page.evaluate(() => {
					window.originalReady = document.getElementById('ready');
				});
			}
			await page.evaluate(
				async ({ name }) => {
					window.probe = (await import('/client.js')).start(
						name,
						name === 'abort' ? 1800 : 10000,
						name === 'activation-before-reveal' || name === 'stale-target',
					);
				},
				{ name },
			);
			await page.waitForFunction(() => window.probe.state().entered);
			await page.waitForFunction(() => window.probe.state().ticks >= 1);
			const before = await page.evaluate(() => window.probe.state());
			assert.equal(before.frameConnected, true);
			assert.equal(before.sameFrame, true);
			assert.equal(before.sameRow, true);
			assert.equal(before.frameSubscriptions, 1);
			assert.equal(before.signalSubscriptions, 1);
			assert.equal(before.rowText, String(before.ticks));
			assert.equal(before.timerStarts, 1);
			assert.equal(before.timerStops, 0);
			assert.equal(before.clientLoads, 0);
			assert.deepEqual(before.errors, []);
			if (name === 'reveal-before-activation') assert.equal(before.signal, 'ready');
			else {
				assert.equal(before.signal, 'pending');
				assert.equal(before.pending, 'Waiting for configuration');
			}
			if (name === 'dispose-before-reveal')
				whenDisposed = await page.evaluate(() => {
					window.probe.dispose();
					return window.probe.state();
				});
			if (name !== 'reveal-before-activation') {
				await control(
					name === 'activation-before-reveal' ||
						name === 'dispose-before-reveal' ||
						name === 'stale-target'
						? 'resolve'
						: name,
				);
			}
			await page.waitForFunction(
				async (caseName) => (await (await fetch(`/evidence?case=${caseName}`)).json()).ended,
				name,
			);
			const evidence = await read();
			assert.equal(evidence.loads, 1);
			const delivered = evidence.chunks.join('');
			assert.ok(
				delivered.includes('"nodeKey":"g:'),
				'The actual selected query must have a global site',
			);
			if (
				name === 'reveal-before-activation' ||
				name === 'activation-before-reveal' ||
				name === 'stale-target'
			) {
				await page.locator('#ready button').waitFor();
				assert.ok(delivered.includes('>$OCTRC('));
				if (name === 'activation-before-reveal' || name === 'stale-target') {
					await page.evaluate(() => {
						window.originalReady = document.getElementById('ready');
					});
					assert.equal((await page.evaluate(() => window.probe.state())).readyAdoptions, 0);
					await page.locator('#ready button').click();
					queued = await page.evaluate(() => window.probe.state());
					assert.equal(queued.clicks, 0);
					if (name === 'stale-target')
						await page.evaluate(() => {
							const button = document.querySelector('#ready button');
							button.replaceWith(button.cloneNode(true));
						});
					await page.evaluate(() => window.probe.releaseBehavior());
					if (name === 'stale-target') {
						await page.waitForFunction(() => window.probe.state().readyAdoptions === 1);
						afterGate = await page.evaluate(() => window.probe.state());
						assert.equal(afterGate.clicks, 0);
						await page.locator('#ready button').click();
					}
				} else {
					await page.waitForFunction(() => window.probe.state().readyAdoptions === 1);
					await page.locator('#ready button').click();
				}
				await page.waitForFunction(() => window.probe.state().clicks === 1);
				const live = await page.evaluate(() => window.probe.state());
				assert.equal(live.signal, 'ready');
				assert.equal(live.readyText, 'ready');
				assert.equal(live.readyAdoptions, 1);
				assert.equal(live.readySubscriptions, 1);
				assert.deepEqual(live.trusted, [true]);
				assert.equal(
					await page.evaluate(
						() =>
							window.originalReady?.isConnected &&
							window.originalReady === document.getElementById('ready'),
					),
					true,
				);
			} else if (name === 'reject') {
				await page.locator('#error').waitFor();
				await page.waitForFunction(() => window.probe.state().signal === 'error');
				assert.ok(delivered.includes('>$OCTRC('));
				assert.equal((await page.evaluate(() => window.probe.state())).readyAdoptions, 0);
			} else if (name === 'abort') {
				await page.waitForFunction(() =>
					document.querySelector('#stream-slot template[data-oct-err]'),
				);
				await page.waitForFunction(() => window.probe.state().signal === 'error');
				assert.ok(delivered.includes('>$OCTRX('));
				const unsupported = await page.evaluate(() => window.probe.state());
				assert.equal(unsupported.pending, 'Waiting for configuration');
				assert.equal(unsupported.error, null);
				assert.equal(unsupported.readyAdoptions, 0);
				assert.equal(evidence.errors.length, 1);
				assert.match(evidence.errors[0], /Octane error #42/);
			} else {
				await page.locator('#ready button').waitFor();
				await page.locator('#ready button').click();
				const disposed = await page.evaluate(() => window.probe.state());
				assert.equal(disposed.clicks, 0);
				assert.equal(disposed.readyAdoptions, 0);
			}
			if (name !== 'abort') assert.deepEqual(evidence.errors, []);
			const after = await page.evaluate(() => window.probe.state());
			assert.equal(after.sameFrame, true);
			assert.equal(after.sameRow, true);
			assert.equal(after.clientLoads, 0);
			assert.deepEqual(after.errors, []);
			assert.equal(after.rowText, String(after.ticks));
			const html = await page.locator('#island').innerHTML();
			await page.evaluate(() => window.probe.dispose());
			const cleaned = await page.evaluate(() => window.probe.state());
			assert.equal(cleaned.unmounted, 1);
			assert.equal(cleaned.timerStops, 1);
			assert.equal(cleaned.frameSubscriptions, 0);
			assert.equal(cleaned.readySubscriptions, 0);
			assert.equal(cleaned.signalSubscriptions, 0);
			if (
				name === 'reveal-before-activation' ||
				name === 'activation-before-reveal' ||
				name === 'stale-target'
			) {
				await page.locator('#ready button').click();
				await page.waitForTimeout(450);
				postDispose = await page.evaluate(() => window.probe.state());
				assert.equal(
					postDispose.clicks,
					cleaned.clicks,
					'Disposal removes the native click handler',
				);
				assert.equal(postDispose.ticks, cleaned.ticks, 'Disposal stops the timer');
			}
			if (name === 'dispose-before-reveal') {
				assert.equal(
					cleaned.ticks,
					whenDisposed.ticks,
					'Disposed timer must remain stopped through reveal',
				);
			}
			await page.evaluate(() => window.probe.disposeBridge());
			assert.deepEqual(errors, []);
			reports.push({
				name,
				initial,
				before,
				queued,
				afterGate,
				whenDisposed,
				after,
				cleaned,
				postDispose,
				html,
				errors,
				server: evidence,
			});
		} finally {
			await context.close();
		}
	}
	assert.deepEqual(
		[...inputs].filter(([file, digest]) => sha(fs.readFileSync(file)) !== digest),
		[],
	);
	const result = {
		browser: browser.version(),
		manifest: sha(fs.readFileSync(path.join(output, 'manifest.json'))),
		reports,
	};
	fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
	console.log(
		JSON.stringify(
			{
				output,
				result: path.join(output, 'result.json'),
				reports: reports.map(({ name, before, after, cleaned, server }) => ({
					name,
					before,
					after,
					cleaned,
					serverErrors: server.errors,
				})),
			},
			null,
			2,
		),
	);
} finally {
	await browser.close();
	child?.kill();
}
