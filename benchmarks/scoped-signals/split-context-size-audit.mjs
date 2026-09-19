// Whole matched closures; separately compressed modules must never be added.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { MessageChannel } from 'node:worker_threads';

const tooling = process.cwd();
const req = createRequire(path.join(tooling, 'packages/octane/package.json'));
const { build } = req('esbuild'),
	{ Window } = req('happy-dom');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const lockSHA = sha(fs.readFileSync(path.join(tooling, 'pnpm-lock.yaml')));
const snapshot = (root) =>
	Object.fromEntries(
		[
			'runtime.ts',
			'index.ts',
			'compiler/compile.js',
			'compiler/hydrate-boundaries.js',
			'compiler/private-context.js',
		].map((file) => [file, sha(fs.readFileSync(path.join(root, 'packages/octane/src', file)))]),
	);
export async function measureConsumer(
	rootArg,
	fixture = 'split-context-consumer.tsrx',
	dev = false,
	authoredOverride = null,
) {
	const root = path.resolve(rootArg);
	const filename = path.join(tooling, 'benchmarks/scoped-signals', fixture);
	const source = authoredOverride ?? fs.readFileSync(filename, 'utf8');
	assert.equal(sha(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))), lockSHA);
	const pkg = path.join(root, 'packages/octane');
	const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json')));
	const { compile } = await import(pathToFileURL(path.join(pkg, 'src/compiler/compile.js')));
	const sourceHashes = snapshot(root);
	const result = await build({
		stdin: {
			contents: compile(source, filename, { dev, hmr: false }).code,
			resolveDir: path.dirname(filename),
		},
		bundle: true,
		write: false,
		minify: true,
		metafile: true,
		format: 'iife',
		globalName: '__CONTEXT_CONSUMER__',
		target: 'esnext',
		platform: 'browser',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'selected-authored-source',
				setup(build) {
					build.onResolve({ filter: /^(octane(?:\/|$)|alien-signals|devalue)/ }, (args) => {
						if (args.path === 'octane' || args.path.startsWith('octane/')) {
							const target =
								manifest.exports[args.path === 'octane' ? '.' : '.' + args.path.slice(6)];
							assert.equal(typeof target, 'string', args.path);
							return { path: path.resolve(pkg, target) };
						}
						return { path: req.resolve(args.path) };
					});
					build.onResolve({ filter: /\?octane-hydrate=/ }, (args) => ({
						path: path.resolve(args.resolveDir, args.path),
						namespace: 'authored-query',
					}));
					build.onLoad({ filter: /.*/, namespace: 'authored-query' }, (args) => ({
						contents: compile(source, args.path, { dev, hmr: false }).code,
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
		semantic = JSON.parse(JSON.stringify(await window.__CONTEXT_CONSUMER__.run(host)));
	} finally {
		for (const channel of channels) {
			channel.port1.close();
			channel.port2.close();
		}
		window.close();
	}
	assert.deepEqual(snapshot(root), sourceHashes, 'Selected source changed during measurement');
	const frameworkInputs = Object.keys(result.metafile.inputs).filter((file) =>
		file.includes('/packages/octane/src/'),
	);
	for (const file of frameworkInputs)
		assert.ok(path.resolve(file).startsWith(pkg + '/src/'), 'Wrong framework source: ' + file);
	return {
		root,
		sourceHashes,
		fixtureSHA: sha(source),
		semantic,
		raw: Buffer.byteLength(code),
		gzip: gzipSync(code, { level: 9 }).length,
		brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
		bundleSHA: sha(code),
		outputImports: Object.values(result.metafile.outputs).flatMap((output) => output.imports),
		frameworkInputs,
	};
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
	const [baselineArg, candidateArg = '.', outputArg = 'split-context-audit.json'] =
		process.argv.slice(2);
	assert.ok(baselineArg, 'Pass baseline checkout, candidate checkout, and output JSON');
	const report = {
		node: process.version,
		runnerSHA: sha(fs.readFileSync(import.meta.filename)),
		lockSHA,
		variants: [],
	};
	for (const [label, root] of [
		['baseline', baselineArg],
		['candidate', candidateArg],
	]) {
		const row = await measureConsumer(root);
		assert.deepEqual(row.semantic, {
			initial: 'outerfirst',
			updated: 'outersecond',
			identity: true,
			effects: ['mount', 'cleanup'],
			cleaned: true,
		});
		report.variants.push({ label, ...row });
	}
	fs.writeFileSync(path.resolve(outputArg), JSON.stringify(report, null, 2) + '\n');
	console.log(
		JSON.stringify(
			report.variants.map(({ label, raw, gzip, brotli, semantic }) => ({
				label,
				raw,
				gzip,
				brotli,
				semantic,
			})),
		),
	);
}
