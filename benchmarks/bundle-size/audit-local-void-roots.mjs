// Matched public consumers with separate plain entries and compiled views.
// Freeze the selected source/lock/tooling; compare full closures, never module sums.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
process.env.NODE_ENV = 'production';
const repository = path.resolve(import.meta.dirname, '../..');
const options = Object.fromEntries(
	process.argv.slice(2).map((argument) => {
		const match = /^--(source-root|tooling-root|output-root|label)=(.+)$/.exec(argument);
		assert.ok(match, 'Use --source-root=PATH --tooling-root=PATH --output-root=PATH --label=LABEL');
		return [match[1], match[2]];
	}),
);
const sourceRoot = path.resolve(options['source-root'] ?? repository);
const toolingRoot = path.resolve(options['tooling-root'] ?? repository);
const label = options.label ?? 'candidate';
assert.match(label, /^[a-z0-9][a-z0-9-]*$/);
const auditRoot = path.resolve(
	options['output-root'] ?? path.join(repository, '.cache/local-void-roots'),
);
const fixtureInputs = path.join(repository, 'benchmarks/bundle-size/fixtures/minimal');
assert.equal(process.version, 'v24.19.0');
const require = createRequire(path.join(toolingRoot, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { octane } = await import(
	pathToFileURL(path.join(sourceRoot, 'packages/octane/src/compiler/vite.js'))
);
const { verifyScenario } = await import(
	pathToFileURL(path.join(toolingRoot, 'benchmarks/bundle-size/verify-reachability.mjs'))
);
const hash = (v) => createHash('sha256').update(v).digest('hex');
assert.equal(
	hash(fs.readFileSync(path.join(sourceRoot, 'pnpm-lock.yaml'))),
	hash(fs.readFileSync(path.join(toolingRoot, 'pnpm-lock.yaml'))),
);
const root = path.join(auditRoot, 'fixtures');
fs.mkdirSync(root, { recursive: true });
const out = path.join(auditRoot, label);
fs.mkdirSync(out, { recursive: true });
const exports = JSON.parse(
	fs.readFileSync(path.join(sourceRoot, 'packages/octane/package.json')),
).exports;
const rows = [];
const sourceHashes = new Map();
function snapshot(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) snapshot(file);
		else if (entry.isFile()) sourceHashes.set(file, hash(fs.readFileSync(file)));
	}
}
snapshot(path.join(sourceRoot, 'packages/octane/src'));
const version = (request) => {
	let directory = path.dirname(require.resolve(request));
	while (true) {
		const file = path.join(directory, 'package.json');
		if (fs.existsSync(file)) {
			const manifest = JSON.parse(fs.readFileSync(file));
			if (manifest.name && manifest.version) return manifest.version;
		}
		const parent = path.dirname(directory);
		assert.notEqual(parent, directory);
		directory = parent;
	}
};
const tooling = Object.fromEntries(
	[
		'esbuild',
		'vite',
		'@tsrx/core',
		'@tsrx/oxc/tsrx-core-compat',
		'alien-signals',
		'devalue',
		'jsdom',
	].map((request) => [request, version(request)]),
);
for (const id of ['root-static', 'hooks-state', 'context']) {
	const original = fs.readFileSync(path.join(fixtureInputs, id + '.tsrx'), 'utf8');
	const cut = original.indexOf('export ');
	const body = original.slice(cut);
	assert.notEqual(cut, -1);
	const component = body.match(/root\.render\((\w+)\)/)[1];
	const counters = id === 'hooks-state' ? ['clicks', 'effects', 'cleanups'] : [];
	fs.writeFileSync(
		path.join(root, id + '-view.tsrx'),
		original
			.slice(0, cut)
			.replace('function ' + component + '(', 'export default function ' + component + '(') +
			(counters.length ? '\nexport { ' + counters.join(', ') + ' };\n' : ''),
	);
	const entry = path.join(root, id + '.ts');
	fs.writeFileSync(
		entry,
		"import {createRoot} from 'octane';\nimport View" +
			(counters.length ? ', { ' + counters.join(', ') + ' }' : '') +
			" from './" +
			id +
			"-view.tsrx';\n" +
			body.replace('root.render(' + component + ')', 'root.render(View)'),
	);
	let entryCode, modules;
	const result = await build({
		configFile: false,
		root,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			{
				name: 'exact-source',
				enforce: 'pre',
				resolveId(request) {
					if (request === 'octane' || request.startsWith('octane/')) {
						const value = exports[request === 'octane' ? '.' : '.' + request.slice(6)];
						if (typeof value === 'string')
							return path.resolve(sourceRoot, 'packages/octane', value);
					}
					if (/^(alien-signals|devalue)(\/|$)/.test(request)) return require.resolve(request);
				},
			},
			octane({ hmr: false }),
			{
				name: 'proof-and-closure',
				transform(code, id) {
					if (id === entry) entryCode = code;
				},
				generateBundle(_, bundle) {
					for (const chunk of Object.values(bundle))
						if (chunk.type === 'chunk')
							modules = Object.entries(chunk.modules).map(([file, m]) => ({
								file,
								renderedLength: m.renderedLength,
								renderedExports: m.renderedExports,
							}));
				},
			},
		],
		define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
		build: {
			write: false,
			minify: 'esbuild',
			target: 'esnext',
			lib: { entry, formats: ['iife'], name: '__OCTANE_REACHABILITY__' },
		},
	});
	const chunks = (Array.isArray(result) ? result[0] : result).output.filter(
		(f) => f.type === 'chunk',
	);
	assert.equal(chunks.length, 1);
	const code = chunks[0].code;
	const observations = await verifyScenario(id, code);
	const row = {
		id,
		fixtureSHA: hash(original),
		entrySHA: hash(fs.readFileSync(entry)),
		viewSHA: hash(fs.readFileSync(path.join(root, id + '-view.tsrx'))),
		raw: Buffer.byteLength(code),
		gzip: gzipSync(code, { level: 9 }).length,
		brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
		sha256: hash(code),
		observations,
		modules,
		entryCode,
	};
	rows.push(row);
	fs.writeFileSync(path.join(out, id + '.js'), code);
	console.log(
		JSON.stringify({
			...row,
			modules: undefined,
			entryCode: entryCode?.includes('__createVoidRoot') ? 'specialized' : 'generic',
		}),
	);
}
assert.deepEqual(
	[...sourceHashes].filter(([file, before]) => hash(fs.readFileSync(file)) !== before),
	[],
	'Compiler/runtime source drift',
);
const report = {
	sourceRoot,
	toolingRoot,
	label,
	node: process.version,
	tooling,
	lockSHA: hash(fs.readFileSync(path.join(sourceRoot, 'pnpm-lock.yaml'))),
	runnerSHA: hash(fs.readFileSync(import.meta.filename)),
	sourceHashes: Object.fromEntries(
		[...sourceHashes].map(([file, digest]) => [path.relative(sourceRoot, file), digest]),
	),
	rows,
};
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('REPORT ' + path.join(out, 'report.json'));
