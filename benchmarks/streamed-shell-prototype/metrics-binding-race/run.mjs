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
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-metrics-binding-race-'));
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
	'View.tsrx',
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
	for (const name of ['reveal-before-activation', 'activation-before-reveal', 'reject', 'abort']) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
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
			await page.locator('#binding').waitFor();
			const initial = await page.locator('#metrics').innerHTML();
			assert.ok(initial.includes('data-oct-b='), initial);
			assert.equal(await page.locator('#status').textContent(), 'pending');
			if (name === 'reveal-before-activation') {
				await control('resolve');
				await page.waitForFunction(
					() => document.querySelector('#status')?.textContent === 'ready',
				);
			}
			await page.evaluate(async () => {
				window.race = (await import('/client.js')).start();
			});
			await page.evaluate(() => window.race.tick());
			await page.locator('#binding button').click();
			const before = await page.evaluate(() => window.race.state());
			assert.equal(before.containerConnected, true);
			assert.equal(before.sameContainer, true);
			assert.equal(before.connected, true);
			assert.equal(before.sameRoot, true);
			assert.equal(before.ownedTick, '1');
			assert.equal(before.clicks, 1);
			assert.equal(before.subscriptions, 1);
			if (name !== 'reveal-before-activation') {
				await control(name === 'activation-before-reveal' ? 'resolve' : name);
				await page.waitForFunction(async (testName) => {
					const response = await fetch(`/evidence?case=${testName}`);
					return (await response.json()).ended;
				}, name);
				if (name === 'reject')
					await page.waitForFunction(
						() => document.querySelector('#status')?.textContent === 'error',
					);
				if (name === 'abort')
					await page.waitForFunction(
						() => document.querySelector('#metrics template[data-oct-err]') !== null,
					);
			}
			const evidence = await read();
			assert.equal(evidence.loads, 1);
			const delivered = evidence.chunks.join('');
			assert.ok(delivered.includes('$OCTRC'), 'The actual server swap runtime must be emitted');
			if (name === 'activation-before-reveal' || name === 'reject') {
				if (name === 'activation-before-reveal')
					await page.waitForFunction(
						() => document.querySelector('#status')?.textContent === 'ready',
					);
				assert.ok(
					delivered.includes('>$OCTRC('),
					'The parser received a real late placement script',
				);
				await page.evaluate(() => window.race.tick());
				await page.locator('#binding button').click();
				const after = await page.evaluate(() => window.race.state());
				assert.deepEqual(after, {
					containerConnected: true,
					sameContainer: true,
					connected: false,
					sameRoot: false,
					ownedStatus: 'pending',
					ownedTick: '2',
					currentStatus: name === 'reject' ? 'error' : 'ready',
					currentTick: '0',
					clicks: 1,
					subscriptions: 1,
				});
			} else if (name === 'reveal-before-activation') {
				assert.ok(delivered.includes('>$OCTRC('));
				await page.evaluate(() => window.race.tick());
				const after = await page.evaluate(() => window.race.state());
				assert.equal(after.currentTick, '2');
				assert.equal(after.connected, true);
			} else {
				assert.ok(
					delivered.includes('>$OCTRX('),
					'The abort must emit its real terminal instruction',
				);
				await page.evaluate(() => window.race.tick());
				const after = await page.evaluate(() => window.race.state());
				assert.equal(after.connected, true);
				assert.equal(after.sameRoot, true);
				assert.equal(after.currentStatus, 'pending');
				assert.equal(after.currentTick, '2');
				assert.equal(evidence.errors.length, 1);
				assert.match(evidence.errors[0], /Octane error #42/);
			}
			if (name !== 'abort') assert.deepEqual(evidence.errors, []);
			const after = await page.evaluate(() => window.race.state());
			const html = await page.locator('#metrics').innerHTML();
			await page.evaluate(() => {
				window.race.dispose();
				window.race.clickOwned();
				window.race.tick();
			});
			const cleaned = await page.evaluate(() => window.race.state());
			assert.equal(cleaned.subscriptions, 0);
			assert.equal(cleaned.clicks, after.clicks, 'Disposal removes the binding event listener');
			assert.equal(cleaned.ownedTick, after.ownedTick, 'Disposal stops source publications');
			assert.deepEqual(errors, []);
			reports.push({ name, initial, before, after, cleaned, html, errors, server: evidence });
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
