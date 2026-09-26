// Build-only counterfactual. The generated wrapper is deliberately not run:
// it has no runtime fallback and adds a shell the real application did not have.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { automaticStaticShell } from './plugin.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const root = path.join(repo, 'examples/signal-chat');
const wrapper = path.join(root, 'src/__experimental_shell.tsrx');
const app = path.join(root, 'src/App.tsrx');
const source = `import { App } from './App.tsrx';
export function Shell() @{ <div data-counterfactual-shell><div><App /></div></div> }`;
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('a hypothetical wrapper preserves the original App island graph', async (t) => {
	assert.ok(!fs.existsSync(wrapper), 'The experiment must never shadow a real file');
	const tracked = [
		app,
		path.join(root, 'src/styles.css'),
		path.join(import.meta.dirname, 'plugin.mjs'),
		import.meta.filename,
	];
	const hashes = tracked.map((file) => digest(fs.readFileSync(file)));
	const compiler = (environment) =>
		createOctaneCompiler({
			root,
			environment,
			requireDirective: false,
			dev: false,
			hmr: false,
			profile: false,
		});
	const compiled = compiler('server').transform(source, wrapper, {
		environment: 'server',
		dev: false,
		hmr: false,
		profile: false,
	}).code;
	const sites = [...compiled.matchAll(/['"](c:[a-f0-9]+)['"]/g)].map((match) => match[1]);
	assert.equal(sites.length, 1);
	const appSource = fs.readFileSync(app, 'utf8');
	const expected = compiler('client').transform(appSource, app, {
		environment: 'client',
		dev: false,
		hmr: false,
		profile: false,
	}).independentWidgets;
	assert.equal(expected.length, 5);

	async function compile(candidate) {
		const decisions = [];
		const virtual = {
			name: 'in-memory-counterfactual-wrapper',
			resolveId(id) {
				if (id === wrapper) return id;
			},
			load(id) {
				if (id === wrapper) return source;
			},
		};
		const result = await build({
			root,
			configFile: false,
			publicDir: false,
			mode: 'production',
			logLevel: 'silent',
			plugins: [
				virtual,
				...(candidate
					? automaticStaticShell({
							root,
							file: wrapper,
							specialize: true,
							onDecision: (decision) => decisions.push(decision),
						})
					: []),
				octane({ hmr: false, ssr: false }),
			],
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			build: {
				write: false,
				minify: 'esbuild',
				target: 'es2022',
				cssCodeSplit: true,
				lib: { entry: wrapper, formats: ['es'] },
				rolldownOptions: {
					output: {
						entryFileNames: 'entry.js',
						chunkFileNames: 'chunks/[name]-[hash].js',
						assetFileNames: 'assets/[name]-[hash][extname]',
					},
				},
			},
		});
		const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
		const chunks = new Map(
			output.filter((item) => item.type === 'chunk').map((item) => [item.fileName, item]),
		);
		const assets = new Map(
			output.filter((item) => item.type === 'asset').map((item) => [item.fileName, item]),
		);
		const visited = new Set();
		function visit(name) {
			if (visited.has(name)) return;
			const chunk = chunks.get(name);
			assert.ok(chunk, `Missing ${name}`);
			visited.add(name);
			for (const child of [...chunk.imports, ...chunk.dynamicImports]) visit(child);
		}
		visit('entry.js');
		assert.deepEqual([...visited].sort(), [...chunks.keys()].sort());
		const manifest = JSON.parse(assets.get('octane-independent-hydration.json').source);
		assert.equal(Object.keys(manifest.widgets).length, 5);
		for (const widget of expected) {
			const record = manifest.widgets[widget.boundaryId];
			assert.ok(record);
			for (const key of [
				'version',
				'boundaryId',
				'exportName',
				'captureSchema',
				'hookSeed',
				'idSeed',
				'signalSites',
				'parentDependencies',
			])
				assert.deepEqual(record[key], widget[key]);
			const activation = chunks.get(record.moduleId);
			assert.ok(activation);
			const query = widget.request.slice(widget.request.indexOf('?'));
			assert.ok(Object.keys(activation.modules).includes(app + query));
			for (const style of record.styles) assert.ok(assets.has(style));
		}
		const js = [...chunks.values()].map((chunk) => chunk.code);
		assert.equal(
			js.some((code) => code.includes('data-counterfactual-shell')),
			!candidate,
		);
		const css = [...assets]
			.filter(([name]) => name.endsWith('.css'))
			.map(([, asset]) => digest(asset.source))
			.sort();
		assert.ok(css.length);
		return {
			decision: decisions[0] ?? null,
			css,
			entryBytes: Buffer.byteLength(chunks.get('entry.js').code),
			entryGzip: gzipSync(chunks.get('entry.js').code, { level: 9 }).length,
			jsBytes: js.reduce((total, code) => total + Buffer.byteLength(code), 0),
			jsGzip: js.reduce((total, code) => total + gzipSync(code, { level: 9 }).length, 0),
		};
	}
	const baseline = await compile(false);
	const control = await compile(false);
	const candidate = await compile(true);
	assert.equal(candidate.decision.accepted, true);
	assert.equal(candidate.decision.site, sites[0]);
	assert.equal(candidate.decision.childVoid, true);
	assert.equal(candidate.decision.rootVoid, true);
	assert.deepEqual(candidate.css, baseline.css);
	assert.deepEqual(control.css, baseline.css);
	assert.deepEqual(
		tracked.map((file) => digest(fs.readFileSync(file))),
		hashes,
	);
	t.diagnostic(JSON.stringify({ hashes, site: sites[0], baseline, control, candidate }));
});
