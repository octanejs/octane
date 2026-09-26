import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { automaticStaticShell } from './plugin.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build: viteBuild, version: viteVersion } = await import(
	pathToFileURL(require.resolve('vite')).href
);
const { build: esbuild, version: esbuildVersion } = await import(
	pathToFileURL(require.resolve('esbuild')).href
);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);

const shellFile = path.join(here, 'Shell.tsrx');
const divRoot = process.argv.includes('--div-root');
function fixtureSource(source, file) {
	if (!divRoot || file !== shellFile) return source;
	assert.ok(source.includes('<main data-shell>') && source.includes('</main>'));
	return source.replace('<main data-shell>', '<div data-shell>').replace('</main>', '</div>');
}
const argument = process.argv.find((value) => value.startsWith('--output-dir='));
const output = argument
	? path.resolve(argument.slice('--output-dir='.length))
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-automatic-shell-'));
if (argument) {
	assert.ok(!fs.existsSync(output), 'Use a fresh output directory');
	fs.mkdirSync(output, { recursive: true });
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = [
	'plugin.mjs',
	'build.mjs',
	'Shell.tsrx',
	'LiveCounter.tsrx',
	'client.ts',
	'server.ts',
	'../shared.ts',
	'../later.ts',
	'../style.css',
	'../shell-side-effect.ts',
	'../../../packages/octane/src/hydration/stream-delivery.ts',
	'../../../packages/octane/src/hydration/streamed-signals.ts',
	'../../../pnpm-lock.yaml',
].map((name) => path.resolve(here, name));
const inputHashes = Object.fromEntries(
	inputs.map((file) => [path.relative(repo, file), hash(fs.readFileSync(file))]),
);
const size = (value) => {
	const bytes = Buffer.from(value);
	return {
		raw: bytes.length,
		gzip: gzipSync(bytes, { level: 9 }).length,
		brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
		sha256: hash(bytes),
	};
};
const total = (values) =>
	Object.fromEntries(
		['raw', 'gzip', 'brotli'].map((key) => [
			key,
			values.reduce((sum, value) => sum + value[key], 0),
		]),
	);
const compiler = createOctaneCompiler({
	root: repo,
	environment: 'server',
	requireDirective: false,
	dev: false,
	hmr: false,
	profile: false,
});
const serverFile = path.join(output, 'server.mjs');
await esbuild({
	entryPoints: [path.join(here, 'server.ts')],
	outfile: serverFile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	minify: true,
	tsconfigRaw: { compilerOptions: {} },
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'server-compiler',
			setup(builder) {
				builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
					path: require.resolve(request === 'octane' ? 'octane/server' : request),
				}));
				builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
				builder.onLoad({ filter: /\.(?:ts|tsrx)$/ }, ({ path: file }) => {
					if (!file.startsWith(path.dirname(here) + path.sep)) return;
					const source = fixtureSource(fs.readFileSync(file, 'utf8'), file);
					return {
						contents: compiler.transform(source, file)?.code ?? source,
						loader: file.endsWith('.tsrx') ? 'js' : 'ts',
						resolveDir: path.dirname(file),
					};
				});
			},
		},
	],
});
const body = (await import(pathToFileURL(serverFile).href)).render();
assert.ok(body.includes('A server-authored page with a live child'));

async function buildClient(variant) {
	const decisions = [];
	const clientDir = path.join(output, variant);
	const optimized = variant !== 'baseline';
	const result = await viteBuild({
		configFile: false,
		root: repo,
		mode: 'production',
		logLevel: 'warn',
		publicDir: false,
		plugins: [
			...(divRoot
				? [
						{
							name: 'experimental-div-root-fixture',
							load(id) {
								return id === shellFile ? fixtureSource(fs.readFileSync(id, 'utf8'), id) : null;
							},
						},
					]
				: []),
			...(optimized
				? automaticStaticShell({
						root: repo,
						file: shellFile,
						specialize: variant === 'specialized',
						onDecision: (decision) => decisions.push(decision),
					})
				: []),
			octane({ hmr: false, ssr: false }),
		],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		build: {
			outDir: clientDir,
			emptyOutDir: false,
			minify: 'esbuild',
			target: 'es2022',
			cssCodeSplit: true,
			reportCompressedSize: false,
			lib: { entry: path.join(here, 'client.ts'), formats: ['es'] },
			rolldownOptions: {
				output: {
					entryFileNames: 'entry.js',
					chunkFileNames: 'chunks/[name]-[hash].js',
					assetFileNames: 'assets/[name]-[hash][extname]',
				},
			},
		},
	});
	if (optimized) (assert.equal(decisions.length, 1), assert.equal(decisions[0].accepted, true));
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
	const chunks = Object.fromEntries(
		outputs.filter((item) => item.type === 'chunk').map((item) => [item.fileName, item]),
	);
	const reachable = new Set();
	function include(file) {
		if (reachable.has(file)) return;
		assert.ok(chunks[file], `Missing client chunk ${file}`);
		reachable.add(file);
		for (const next of [...chunks[file].imports, ...chunks[file].dynamicImports]) include(next);
	}
	include('entry.js');
	assert.deepEqual([...reachable].sort(), Object.keys(chunks).sort());
	const files = Object.fromEntries([...reachable].map((file) => [file, size(chunks[file].code)]));
	const styles = outputs.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'));
	assert.ok(styles.length);
	const css = Object.fromEntries(styles.map((item) => [item.fileName, size(item.source)]));
	const document =
		'<!doctype html><html><head><meta charset="utf-8">' +
		styles.map((style) => `<link rel="stylesheet" href="/${style.fileName}">`).join('') +
		'</head><body><div id="root">' +
		body +
		'</div><script type="module" src="/entry.js"></script></body></html>';
	const contributions = Object.fromEntries(
		[...reachable].map((file) => [
			file,
			{
				imports: chunks[file].imports,
				dynamicImports: chunks[file].dynamicImports,
				modules: Object.fromEntries(
					Object.entries(chunks[file].modules).map(([id, info]) => [
						path.relative(repo, id),
						{ renderedLength: info.renderedLength },
					]),
				),
			},
		]),
	);
	const allJs = [...reachable].map((file) => chunks[file].code).join('\n');
	assert.equal(
		allJs.includes('Content retained from the server'),
		!optimized,
		'the static template must leave the generated client graph',
	);
	return {
		variant,
		negativeControl: false,
		clientDir,
		document,
		files,
		css,
		contributions,
		javascript: total(Object.values(files)),
		stylesheet: total(Object.values(css)),
		html: size(document),
		decision: decisions[0] ?? null,
	};
}

const variants = [];
for (const variant of ['baseline', 'candidate', 'specialized'])
	variants.push(await buildClient(variant));
for (const [file, expected] of Object.entries(inputHashes))
	assert.equal(
		hash(fs.readFileSync(path.join(repo, file))),
		expected,
		`Input changed during build: ${file}`,
	);
const report = {
	output,
	rootTag: divRoot ? 'div' : 'main',
	head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
	inputHashes,
	server: size(fs.readFileSync(serverFile)),
	node: process.version,
	vite: viteVersion,
	esbuild: esbuildVersion,
	variants,
	limitations: [
		'Compressed physical file bytes, not network transfer or runtime timing.',
		'Vite library-mode build, not an application route or bootstrap.',
		'The one-time immutable root and exact SSR DOM are assumptions; no runtime recovery or general fallback.',
		'No server streaming, pending boundaries, client navigation, root updates or remounts.',
	],
};
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			variants: variants.map(({ variant, javascript, stylesheet, html, decision }) => ({
				variant,
				javascript,
				stylesheet,
				html,
				decision,
			})),
		},
		null,
		2,
	),
);
