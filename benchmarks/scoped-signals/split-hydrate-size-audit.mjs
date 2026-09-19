// Matched complete closure and actual Vite split chunks. Do not add chunk gzip sizes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
const [baselineArg, candidateArg = '.', outputArg = 'split-hydrate-audit.json'] =
	process.argv.slice(2);
assert.ok(
	baselineArg,
	'Usage: node split-hydrate-size-audit.mjs baseline-checkout [candidate-checkout] [output.json]',
);
const baseline = path.resolve(baselineArg),
	candidate = path.resolve(candidateArg),
	tooling = candidate,
	out = path.resolve(outputArg);
assert.equal(
	hashFileLock(baseline),
	hashFileLock(candidate),
	'Use the same frozen lock and toolchain for both checkouts',
);
function hashFileLock(root) {
	return createHash('sha256')
		.update(fs.readFileSync(path.join(root, 'pnpm-lock.yaml')))
		.digest('hex');
}
const req = createRequire(path.join(tooling, 'packages/octane/package.json'));
const { build: esbuild } = req('esbuild');
const { build: vite } = await import(pathToFileURL(req.resolve('vite')));
const { Window } = req('happy-dom');
const hash = (x) => createHash('sha256').update(x).digest('hex');
const measure = (code) => ({
	raw: Buffer.byteLength(code),
	gzip: gzipSync(code, { level: 9 }).length,
	brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
	sha256: hash(code),
});
const authored = fs.readFileSync(
	path.join(tooling, 'benchmarks/scoped-signals/split-hydrate-consumer.tsrx'),
	'utf8',
);
const scratch = fs.realpathSync(
	fs.mkdtempSync(path.join(os.tmpdir(), 'octane-split-hydrate-bundles-')),
);
const report = {
	node: process.version,
	runnerSHA: hash(fs.readFileSync(import.meta.filename)),
	scratch,
	fixtureSHA: hash(authored),
	lockSHA: hash(fs.readFileSync(path.join(tooling, 'pnpm-lock.yaml'))),
	variants: [],
};
for (const [label, root] of [
	['baseline', baseline],
	['candidate', candidate],
]) {
	const pkg = path.join(root, 'packages/octane'),
		manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json')));
	const resolveRequest = (request) => {
		if (request === 'octane' || request.startsWith('octane/')) {
			const target = manifest.exports[request === 'octane' ? '.' : '.' + request.slice(6)];
			if (typeof target === 'string') return path.resolve(pkg, target);
		}
		if (/^(alien-signals|devalue)(\/|$)/.test(request)) return req.resolve(request);
	};
	const { compile } = await import(pathToFileURL(path.join(pkg, 'src/compiler/compile.js'))),
		{ octane } = await import(pathToFileURL(path.join(pkg, 'src/compiler/vite.js')));
	const sourceHashes = Object.fromEntries(
		[
			'runtime.ts',
			'index.ts',
			'compiler/compile.js',
			'compiler/hydrate-boundaries.js',
			'compiler/bundler.js',
			'compiler/vite.js',
		].map((f) => [f, hash(fs.readFileSync(path.join(pkg, 'src', f)))]),
	);
	for (const explicit of [false, true]) {
		const source = explicit
				? authored.replace('when={load()}', 'when={load()} fallback={undefined}')
				: authored,
			filename = path.join(tooling, 'benchmarks/scoped-signals/split-hydrate-consumer.tsrx');
		const compiled = compile(source, filename, { dev: false, hmr: false }).code;
		const result = await esbuild({
			stdin: { contents: compiled, resolveDir: path.dirname(filename) },
			bundle: true,
			write: false,
			minify: true,
			metafile: true,
			format: 'iife',
			globalName: '__OCTANE_REACHABILITY__',
			target: 'esnext',
			platform: 'browser',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'selected-source-query',
					setup(b) {
						b.onResolve({ filter: /^(octane(?:\/|$)|alien-signals|devalue)/ }, (a) => {
							const p = resolveRequest(a.path);
							return p ? { path: p } : undefined;
						});
						b.onResolve({ filter: /\?octane-hydrate=/ }, (a) => ({
							path: path.resolve(a.resolveDir, a.path),
							namespace: 'authored-query',
						}));
						b.onLoad({ filter: /.*/, namespace: 'authored-query' }, (a) => ({
							contents: compile(source, a.path, { dev: false, hmr: false }).code,
							loader: 'js',
							resolveDir: path.dirname(filename),
						}));
					},
				},
			],
		});
		const code = result.outputFiles[0].text;
		const window = new Window({ settings: { enableJavaScriptEvaluation: true } }),
			channels = [];
		class Channel extends MessageChannel {
			constructor() {
				super();
				channels.push(this);
			}
		}
		window.MessageChannel = Channel;
		let semantic;
		try {
			window.eval(code);
			const host = window.document.createElement('div');
			window.document.body.append(host);
			semantic = JSON.parse(JSON.stringify(await window.__OCTANE_REACHABILITY__.run(host)));
			assert.deepEqual(semantic, {
				initial: 'first:0',
				updated: 'first:1',
				identity: true,
				effects: ['mount', 'cleanup'],
				cleaned: true,
			});
		} finally {
			for (const c of channels) {
				c.port1.close();
				c.port2.close();
			}
			window.close();
		}
		fs.writeFileSync(
			path.join(scratch, `${label}-${explicit ? 'fallback' : 'absent'}-complete-iife.js`),
			code,
		);
		const fixture = path.join(scratch, `${label}-${explicit ? 'fallback' : 'absent'}-vite`);
		fs.mkdirSync(fixture);
		fs.symlinkSync(path.join(tooling, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
		fs.writeFileSync(path.join(fixture, 'Consumer.tsrx'), source);
		fs.writeFileSync(
			path.join(fixture, 'index.html'),
			'<!doctype html><script type="module" src="/main.ts"></script>',
		);
		fs.writeFileSync(
			path.join(fixture, 'main.ts'),
			"import{run}from'./Consumer.tsrx';window.run=run;",
		);
		const built = await vite({
			configFile: false,
			root: fixture,
			mode: 'production',
			logLevel: 'error',
			plugins: [
				{ name: 'selected-source', enforce: 'pre', resolveId: resolveRequest },
				octane({ hmr: false }),
			],
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			build: { write: false, target: 'esnext', minify: 'esbuild' },
		});
		const chunks = (Array.isArray(built) ? built : [built])
			.flatMap((x) => x.output)
			.filter((o) => o.type === 'chunk');
		const row = {
			label,
			explicitFallback: explicit,
			authoredSHA: hash(source),
			sourceHashes,
			completeEsbuild: {
				...measure(code),
				semantic,
				outputImports: Object.values(result.metafile.outputs).flatMap((o) => o.imports),
			},
			viteChunks: chunks.map((c) => ({
				file: c.fileName,
				isEntry: c.isEntry,
				isDynamicEntry: c.isDynamicEntry,
				imports: c.imports,
				dynamicImports: c.dynamicImports,
				...measure(c.code),
			})),
			viteConcatenatedClosureDiagnostic: measure(chunks.map((c) => c.code).join('\n')),
		};
		for (const c of chunks) fs.writeFileSync(path.join(fixture, path.basename(c.fileName)), c.code);
		report.variants.push(row);
		console.log(
			JSON.stringify({ label, explicit, row: row.completeEsbuild, vite: row.viteChunks }),
		);
	}
	assert.deepEqual(
		Object.fromEntries(
			Object.keys(sourceHashes).map((f) => [f, hash(fs.readFileSync(path.join(pkg, 'src', f)))]),
		),
		sourceHashes,
	);
}
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log('REPORT ' + out);
