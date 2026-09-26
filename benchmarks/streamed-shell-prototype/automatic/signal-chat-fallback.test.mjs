import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { analyze, automaticStaticShell } from './plugin.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const root = path.join(repo, 'examples/signal-chat');
const file = path.join(root, 'src/App.tsrx');
const stylesheet = path.join(root, 'src/styles.css');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const independentManifest = 'octane-independent-hydration.json';

// This measures a Vite library entry for the real route module. The app's
// generated bootstrap and network/streaming lifecycle require separate tests.
test('unsupported Signal Chat route preserves emitted independent island discovery', async (t) => {
	const source = fs.readFileSync(file, 'utf8');
	const inputHashes = [file, stylesheet].map((name) => digest(fs.readFileSync(name)));
	assert.equal(analyze(source, file), null);
	const metadata = [];
	for (const environment of ['client', 'server']) {
		const compiler = createOctaneCompiler({
			root,
			environment,
			requireDirective: false,
			dev: false,
			hmr: false,
			profile: false,
		});
		metadata.push(
			compiler.transform(source, file, { environment, dev: false, hmr: false, profile: false })
				.independentWidgets,
		);
	}
	assert.equal(metadata[0].length, 5);
	assert.deepEqual(metadata[0], metadata[1], 'server and client must derive identical identities');

	async function compile(candidate) {
		const decisions = [];
		const compiled = new Map();
		const record = {
			name: 'observe-signal-chat-compiled-output',
			enforce: 'post',
			transform(code, id) {
				if (id === file || id.startsWith(file + '?octane-hydrate=')) compiled.set(id, code);
				return null;
			},
		};
		const result = await build({
			root,
			configFile: false,
			publicDir: false,
			mode: 'production',
			logLevel: 'silent',
			plugins: [
				...(candidate
					? automaticStaticShell({
							root,
							file,
							specialize: true,
							onDecision: (decision) => decisions.push(decision),
						})
					: []),
				octane({ hmr: false, ssr: false }),
				record,
			],
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			build: {
				write: false,
				minify: 'esbuild',
				target: 'es2022',
				cssCodeSplit: true,
				lib: { entry: file, formats: ['es'] },
				rolldownOptions: {
					output: {
						entryFileNames: 'entry.js',
						chunkFileNames: 'chunks/[name]-[hash].js',
						assetFileNames: 'assets/[name]-[hash][extname]',
					},
				},
			},
		});
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
		const chunks = new Map(
			outputs.filter((item) => item.type === 'chunk').map((item) => [item.fileName, item]),
		);
		const assets = new Map(
			outputs.filter((item) => item.type === 'asset').map((item) => [item.fileName, item]),
		);
		assert.ok(chunks.get('entry.js')?.exports.includes('App'));
		assert.ok(chunks.get('entry.js')?.exports.includes('EagerApp'));
		const reached = new Set();
		function visit(name) {
			if (reached.has(name)) return;
			const chunk = chunks.get(name);
			assert.ok(chunk, `Missing emitted chunk ${name}`);
			reached.add(name);
			for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) visit(dependency);
		}
		visit('entry.js');
		assert.deepEqual([...reached].sort(), [...chunks.keys()].sort());
		const manifest = JSON.parse(assets.get(independentManifest).source);
		const clientBuild = JSON.parse(assets.get('octane-client-build.json').source);
		assert.equal(manifest.buildId, clientBuild.buildId);
		assert.equal(clientBuild.capabilities.independentHydration, true);
		assert.equal(Object.keys(manifest.widgets).length, metadata[0].length);
		for (const expected of metadata[0]) {
			const actual = manifest.widgets[expected.boundaryId];
			assert.ok(actual, `Missing emitted boundary ${expected.boundaryId}`);
			for (const key of [
				'version',
				'boundaryId',
				'exportName',
				'captureSchema',
				'hookSeed',
				'idSeed',
				'signalSites',
				'parentDependencies',
			]) {
				assert.deepEqual(actual[key], expected[key], `${expected.boundaryId}: ${key}`);
			}
			const widgetChunk = chunks.get(actual.moduleId);
			assert.ok(widgetChunk, `Missing activation chunk ${actual.moduleId}`);
			assert.ok(
				Object.keys(widgetChunk.modules).some(
					(id) => id === file + expected.request.slice(expected.request.indexOf('?')),
				),
				`Activation chunk must contain ${expected.request}`,
			);
			for (const css of actual.styles) assert.ok(assets.has(css), `Missing island CSS ${css}`);
		}
		const css = [...assets].filter(([name]) => name.endsWith('.css'));
		assert.ok(css.length, 'The route stylesheet must still be emitted');
		return {
			decisions,
			compiled: Object.fromEntries(
				[...compiled].map(([id, code]) => [path.relative(root, id), digest(code)]),
			),
			css: css.map(([, asset]) => digest(asset.source)).sort(),
			entryBytes: Buffer.byteLength(chunks.get('entry.js').code),
			entryGzip: gzipSync(chunks.get('entry.js').code, { level: 9 }).length,
			jsBytes: [...chunks.values()].reduce(
				(total, chunk) => total + Buffer.byteLength(chunk.code),
				0,
			),
			jsGzip: [...chunks.values()].reduce(
				(total, chunk) => total + gzipSync(chunk.code, { level: 9 }).length,
				0,
			),
		};
	}
	const baseline = await compile(false);
	const control = await compile(false);
	const candidate = await compile(true);
	assert.deepEqual(
		candidate.decisions.map(({ accepted, reason }) => ({ accepted, reason })),
		[{ accepted: false, reason: 'unsupported-source' }],
	);
	assert.deepEqual(candidate.css, baseline.css);
	assert.deepEqual(control.css, baseline.css);
	assert.deepEqual(
		[file, stylesheet].map((name) => digest(fs.readFileSync(name))),
		inputHashes,
	);
	t.diagnostic(JSON.stringify({ inputHashes, baseline, control, candidate }));
});
