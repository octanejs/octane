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
const argument = process.argv.find((value) => value.startsWith('--output-dir='));
const output = argument
	? path.resolve(argument.slice('--output-dir='.length))
	: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-streamed-shape-'));
if (argument) {
	assert.ok(!fs.existsSync(output), 'Use a new output directory');
	fs.mkdirSync(output, { recursive: true });
}
const sourceFiles = [
	'streamed-hydrate.ts',
	'streamed-baseline.ts',
	'streamed-candidate.ts',
	'streamed-build.mjs',
]
	.map((file) => path.join(HERE, file))
	.concat([
		path.join(REPO, 'packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx'),
		path.join(REPO, 'packages/octane/tests/hydration/_fixtures/streamed-static-shell-client.ts'),
	]);
const inputHashes = Object.fromEntries(
	sourceFiles.map((file) => [file, hash(fs.readFileSync(file))]),
);
const frameworkDirectory = path.join(REPO, 'packages/octane/src');
const frameworkHashes = Object.fromEntries(
	fs
		.readdirSync(frameworkDirectory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const file = path.join(entry.parentPath, entry.name);
			return [file, hash(fs.readFileSync(file))];
		}),
);
const { build, version } = await import(pathToFileURL(require.resolve('vite')).href);
const { octane } = await import(pathToFileURL(require.resolve('octane/compiler/vite')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const compiler = createOctaneCompiler({
	root: REPO,
	environment: 'server',
	dev: false,
	hmr: false,
});
const shellFile = sourceFiles.at(-2);
const shellCode = compiler.transform(fs.readFileSync(shellFile, 'utf8'), shellFile).code;
const sites = [...shellCode.matchAll(/\bc:[0-9a-f]+\b/g)].map((match) => match[0]);
assert.equal(sites.length, 1, 'The fixture must contain one component invocation');
assert.ok(
	fs.readFileSync(sourceFiles.at(-1), 'utf8').includes(`'${sites[0]}'`),
	'Surrogate must use the server site',
);
const variants = [];
for (const variant of ['baseline', 'candidate']) {
	const result = await build({
		configFile: false,
		root: REPO,
		mode: 'production',
		logLevel: 'warn',
		publicDir: false,
		plugins: [octane({ hmr: false, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		build: {
			write: false,
			minify: 'esbuild',
			target: 'es2022',
			reportCompressedSize: false,
			lib: { entry: path.join(HERE, `streamed-${variant}.ts`), formats: ['es'] },
			rolldownOptions: {
				output: { entryFileNames: 'entry.js', chunkFileNames: 'chunks/[name]-[hash].js' },
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
		assert.ok(chunks[file], `External or missing client chunk: ${file}`);
		reachable.add(file);
		for (const imported of [...chunks[file].imports, ...chunks[file].dynamicImports])
			include(imported);
	}
	include('entry.js');
	assert.deepEqual([...reachable].sort(), Object.keys(chunks).sort());
	const eager = new Set();
	function includeStatic(file) {
		if (eager.has(file)) return;
		eager.add(file);
		for (const imported of chunks[file].imports) includeStatic(imported);
	}
	includeStatic('entry.js');
	const files = Object.fromEntries(
		[...reachable].map((file) => [file, size(Buffer.from(chunks[file].code))]),
	);
	const contributions = Object.fromEntries(
		[...reachable].map((file) => [
			file,
			{
				imports: chunks[file].imports,
				dynamicImports: chunks[file].dynamicImports,
				modules: Object.fromEntries(
					Object.entries(chunks[file].modules).map(([id, meta]) => [
						path.relative(REPO, id),
						{ renderedLength: meta.renderedLength },
					]),
				),
			},
		]),
	);
	const sourceModule = Object.values(contributions)
		.flatMap((chunk) => Object.entries(chunk.modules))
		.filter(([id]) => id.endsWith('/streamed-static-shell.tsrx'));
	assert.ok(
		sourceModule.some(([, info]) => info.renderedLength > 0),
		'Shared child module must remain emitted',
	);
	const shellTemplateRetained = [...reachable].some((file) =>
		chunks[file].code.includes('Server-rendered shell'),
	);
	assert.equal(shellTemplateRetained, variant === 'baseline', 'Static shell template reachability');
	const clientDir = path.join(output, variant);
	fs.mkdirSync(clientDir, { recursive: true });
	for (const file of reachable) {
		const destination = path.join(clientDir, file);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.writeFileSync(destination, chunks[file].code);
	}
	variants.push({
		variant,
		files,
		eagerFiles: [...eager],
		eager: total([...eager].map((file) => files[file])),
		total: total(Object.values(files)),
		shellTemplateRetained,
		sourceModule,
		contributions,
	});
}
assert.deepEqual(
	sourceFiles.filter((file) => hash(fs.readFileSync(file)) !== inputHashes[file]),
	[],
	'Fixture changed during build',
);
assert.deepEqual(
	Object.entries(frameworkHashes).filter(
		([file, before]) => hash(fs.readFileSync(file)) !== before,
	),
	[],
	'Framework source changed during build',
);
const report = {
	output,
	head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
	node: process.version,
	vite: version,
	inputHashes,
	frameworkHashes,
	lockSha256: hash(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
	variants,
	limitations: [
		'Vite production library-mode ESM, not an application route or its generated bootstrap.',
		'This compares client JS only, with the same generic hydration entry and the exact test fixture; no HTML, CSS, inline stream frames, fallback, or network bytes are measured.',
		'The tested surrogate requires the first result to have resolved before activation and explicitly rejects its pending arm.',
		'The shell and live child share one source module; its retention does not imply that the shell template remains emitted.',
	],
};
fs.writeFileSync(path.join(output, 'streamed-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			variants: variants.map(({ variant, total, shellTemplateRetained, sourceModule }) => ({
				variant,
				total,
				shellTemplateRetained,
				sourceModule,
			})),
		},
		null,
		2,
	),
);
