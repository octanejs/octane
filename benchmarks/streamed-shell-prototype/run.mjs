import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const require = createRequire(path.join(REPO, 'packages/octane/package.json'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const size = (bytes) => ({
	raw: bytes.length,
	gzip: gzipSync(bytes, { level: 9 }).length,
	brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
	sha256: hash(bytes),
});
const total = (items) =>
	Object.fromEntries(
		['raw', 'gzip', 'brotli'].map((key) => [key, items.reduce((n, x) => n + x[key], 0)]),
	);

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
const outputArgument = process.argv.find((argument) => argument.startsWith('--output-dir='));
const output = outputArgument
	? path.resolve(outputArgument.slice('--output-dir='.length))
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-streamed-shell-'));
if (outputArgument) {
	assert.ok(!fs.existsSync(output), 'Use a new output directory');
	fs.mkdirSync(output, { recursive: true });
}
const variantArgument = process.argv.find((argument) => argument.startsWith('--variant='));
const available = [
	'baseline',
	'candidate',
	'rootvoid',
	'slotvoid',
	'slotflags',
	'optimized',
	'drop-effect',
];
const variants = variantArgument ? [variantArgument.slice('--variant='.length)] : available;
assert.ok(
	variants.every((variant) => available.includes(variant)),
	'Unknown variant',
);
const inputHashes = Object.fromEntries(
	fs
		.readdirSync(HERE)
		.filter((file) => /\.(?:mjs|ts|tsrx|css)$/.test(file))
		.map((file) => [file, hash(fs.readFileSync(path.join(HERE, file)))]),
);
function snapshotFiles(directory) {
	return Object.fromEntries(
		fs
			.readdirSync(directory, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const file = path.join(entry.parentPath, entry.name);
				return [file, hash(fs.readFileSync(file))];
			}),
	);
}
const frameworkHashes = snapshotFiles(path.join(REPO, 'packages/octane/src'));

// Build SSR from the same authored shell in both variants. The public compiler
// is the same entry used by the production bundler integrations.
const compiler = createOctaneCompiler({
	root: REPO,
	environment: 'server',
	requireDirective: false,
	dev: false,
	hmr: false,
	profile: false,
});
const shellFile = path.join(HERE, 'Shell.tsrx');
const shellCompiled = compiler.transform(fs.readFileSync(shellFile, 'utf8'), shellFile).code;
const sites = [...shellCompiled.matchAll(/\bc:[0-9a-f]+\b/g)].map((match) => match[0]);
assert.equal(sites.length, 1, 'The fixed shell must contain one component invocation');
for (const variant of variants.filter((name) => name !== 'baseline')) {
	assert.ok(
		fs.readFileSync(path.join(HERE, `${variant}.ts`), 'utf8').includes(`'${sites[0]}'`),
		`${variant} site must match the current server compiler output`,
	);
}
const serverFile = path.join(output, 'server.mjs');
await esbuild({
	entryPoints: [path.join(HERE, 'server.ts')],
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
			name: 'streamed-shell-server-compiler',
			setup(builder) {
				builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
					path: require.resolve(request === 'octane' ? 'octane/server' : request),
				}));
				builder.onLoad({ filter: /\.(?:ts|tsrx)$/ }, ({ path: file }) => {
					if (!file.startsWith(HERE + path.sep)) return;
					const source = fs.readFileSync(file, 'utf8');
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
const { render } = await import(pathToFileURL(serverFile).href);
const body = render();
assert.ok(body.includes('A server-authored page with a live child'));
assert.ok(body.includes('A server-authored introduction for Ada.'));

async function buildClient(variant) {
	const entry = path.join(HERE, `${variant}.ts`);
	assert.ok(fs.existsSync(entry), `Missing ${variant} entry: ${entry}`);
	const clientDir = path.join(output, variant);
	const result = await viteBuild({
		configFile: false,
		root: REPO,
		mode: 'production',
		logLevel: 'warn',
		publicDir: false,
		plugins: [octane({ hmr: false, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		build: {
			outDir: clientDir,
			emptyOutDir: false,
			minify: 'esbuild',
			target: 'es2022',
			cssCodeSplit: true,
			reportCompressedSize: false,
			lib: { entry, formats: ['es'] },
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
	const chunks = Object.fromEntries(
		outputs.filter((item) => item.type === 'chunk').map((item) => [item.fileName, item]),
	);
	assert.ok(chunks['entry.js']?.isEntry);
	const reachable = new Set();
	function include(file) {
		if (reachable.has(file)) return;
		const chunk = chunks[file];
		assert.ok(chunk, `External or missing client chunk: ${file}`);
		reachable.add(file);
		for (const imported of [...chunk.imports, ...chunk.dynamicImports]) include(imported);
	}
	include('entry.js');
	assert.deepEqual(
		[...reachable].sort(),
		Object.keys(chunks).sort(),
		'Every emitted JS chunk must be accounted for',
	);
	const eager = new Set();
	function includeStatic(file) {
		if (eager.has(file)) return;
		eager.add(file);
		for (const imported of chunks[file].imports) includeStatic(imported);
	}
	includeStatic('entry.js');
	const styles = outputs.filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'));
	assert.ok(styles.length > 0, 'The shell stylesheet must survive');
	const document =
		'<!doctype html><html><head><meta charset="utf-8">' +
		styles.map((style) => `<link rel="stylesheet" href="/${style.fileName}">`).join('') +
		'</head><body><div id="root">' +
		body +
		'</div><script type="module" src="/entry.js"></script></body></html>';
	const files = Object.fromEntries(
		[...reachable].map((file) => [file, size(Buffer.from(chunks[file].code))]),
	);
	const css = Object.fromEntries(
		styles.map((style) => [style.fileName, size(Buffer.from(style.source))]),
	);
	const eagerJavascript = total([...eager].map((file) => files[file]));
	const contributions = Object.fromEntries(
		[...reachable].map((file) => [
			file,
			{
				imports: chunks[file].imports,
				dynamicImports: chunks[file].dynamicImports,
				modules: Object.fromEntries(
					Object.entries(chunks[file].modules).map(([id, info]) => [
						path.relative(REPO, id),
						{ renderedLength: info.renderedLength },
					]),
				),
			},
		]),
	);
	const emitted = (file) =>
		Object.values(contributions).some((chunk) =>
			Object.entries(chunk.modules).some(
				([id, info]) => id.endsWith('/' + file) && info.renderedLength > 0,
			),
		);
	assert.ok(emitted('shared.ts'), 'Shared live dependency must remain emitted');
	assert.ok(emitted('later.ts'), 'The dynamic child dependency must remain emitted');
	assert.equal(
		emitted('shell-side-effect.ts'),
		variant !== 'drop-effect',
		'Shell-only effect reachability',
	);
	if (variant === 'baseline')
		assert.ok(emitted('Shell.tsrx'), 'The baseline must include the shell');
	if (variant !== 'baseline') {
		assert.ok(!emitted('Shell.tsrx'), 'The surrogate must not retain the shell');
		assert.ok(!emitted('shell-only.ts'), 'The server-only helper must not be emitted');
	}
	return {
		variant,
		negativeControl: variant === 'drop-effect',
		clientDir,
		document,
		files,
		css,
		contributions,
		modules: {
			shell: emitted('Shell.tsrx'),
			shellOnly: emitted('shell-only.ts'),
			shellOnlyEffect: emitted('shell-side-effect.ts'),
			shared: emitted('shared.ts'),
			later: emitted('later.ts'),
		},
		html: size(Buffer.from(document)),
		inlineScripts: { count: 0, raw: 0 },
		eagerFiles: [...eager],
		eagerJavascript,
		javascript: total(Object.values(files)),
		stylesheet: total(Object.values(css)),
		eagerDelivery: total([
			size(Buffer.from(document)),
			...[...eager].map((file) => files[file]),
			...Object.values(css),
		]),
		delivery: total([size(Buffer.from(document)), ...Object.values(files), ...Object.values(css)]),
	};
}

const reports = [];
for (const variant of variants) reports.push(await buildClient(variant));
assert.deepEqual(
	Object.entries(inputHashes).filter(
		([file, before]) => hash(fs.readFileSync(path.join(HERE, file))) !== before,
	),
	[],
	'Fixture source changed during the build',
);
assert.deepEqual(
	Object.entries(frameworkHashes).filter(
		([file, before]) => hash(fs.readFileSync(file)) !== before,
	),
	[],
	'Framework source changed during the build',
);
const report = {
	output,
	head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
	node: process.version,
	vite: viteVersion,
	esbuild: esbuildVersion,
	inputHashes,
	frameworkHashes,
	lockSha256: hash(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
	server: size(fs.readFileSync(serverFile)),
	variants: reports,
	limitations: [
		'Physical-file gzip and Brotli totals are not transferred network bytes.',
		'Vite production library-mode ESM, not an application route or its generated bootstrap.',
		'The fixture explicitly imports CSS in both entries; this does not prove automatic CSS discovery.',
		'This is a hand-authored, hydration-only shell candidate, not an automatic whole-graph optimizer.',
	],
};
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			variants: reports.map(({ variant, modules, javascript, stylesheet, html, delivery }) => ({
				variant,
				modules,
				javascript,
				stylesheet,
				html,
				delivery,
			})),
		},
		null,
		2,
	),
);
