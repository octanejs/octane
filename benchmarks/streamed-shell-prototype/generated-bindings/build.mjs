import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { transform } from './proof.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const fixture = path.join(repo, 'benchmarks/conversation-streaming/behavior-only');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const view = path.join(here, 'View.tsrx');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const sizes = (bytes) => ({
	raw: bytes.length,
	gzip: gzipSync(bytes, { level: 9 }).length,
	brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
	sha256: digest(bytes),
});

export function matchesHost(proof) {
	return (
		proof?.name === 'ConversationStatus' &&
		proof.fields.length === 4 &&
		['title', 'response', 'history', 'interactions'].every((field) =>
			proof.fields.includes(field),
		) &&
		proof.staticAttributes[0]?.some(
			([name, value]) => name === 'id' && value === 'automatic-status',
		)
	);
}

export async function build(
	mode,
	output = fs.mkdtempSync(path.join(os.tmpdir(), `octane-auto-bind-${mode}-`)),
	{ sourceOverride } = {},
) {
	assert.ok(['bindings', 'renderer'].includes(mode));
	fs.mkdirSync(output, { recursive: true });
	const { createOctaneCompiler } = await import(
		pathToFileURL(require.resolve('octane/compiler/bundler')).href
	);
	const { build: viteBuild } = await import(pathToFileURL(require.resolve('vite')).href);
	const { build: esbuild } = await import(pathToFileURL(require.resolve('esbuild')).href);
	const inputs = new Map();
	const source = (file) => {
		if (!inputs.has(file)) inputs.set(file, fs.readFileSync(file));
		return inputs.get(file).toString();
	};
	for (const file of ['build.mjs', 'proof.mjs', 'run-browser.mjs', 'proof.test.mjs', 'scan.mjs'])
		source(path.join(here, file));
	source(path.join(repo, 'pnpm-lock.yaml'));
	function recordCompiler(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) recordCompiler(file);
			else if (/\.[cm]?js$/.test(entry.name)) source(file);
		}
	}
	recordCompiler(path.join(repo, 'packages/octane/src/compiler'));
	const original = source(view);
	const initial = sourceOverride ?? original;
	const analysis = transform(initial, view);
	let proof = matchesHost(analysis) ? analysis : null;
	const compilerOptions = {
		root: repo,
		requireDirective: false,
		dev: false,
		hmr: false,
		profile: false,
	};
	const serverCompiler = createOctaneCompiler({ ...compilerOptions, environment: 'server' });
	const clientCompiler = createOctaneCompiler({ ...compilerOptions, environment: 'client' });
	let metadata = null;
	if (proof) {
		try {
			const { parseModule } = await import(pathToFileURL(require.resolve('@tsrx/core')).href);
			const id = `${view}?octane-bindings=${proof.name}`;
			const code = clientCompiler.transform(proof.code, id).code;
			const object = parseModule(code, view + '.js').body.find(
				(node) => node.type === 'ExportDefaultDeclaration',
			)?.declaration;
			const property = (name) => object?.properties.find((item) => item.key?.name === name)?.value;
			const value = (node) => {
				if (node?.type === 'Literal') return node.value;
				if (
					node?.type === 'UnaryExpression' &&
					node.operator === '-' &&
					node.argument?.type === 'Literal' &&
					typeof node.argument.value === 'number'
				)
					return -node.argument.value;
				if (node?.type === 'ArrayExpression') return node.elements.map(value);
				throw new Error('Unsupported compiler descriptor');
			};
			const stamp = value(property('id'));
			const nodes = value(property('nodes'));
			if (
				typeof stamp !== 'string' ||
				!Array.isArray(nodes) ||
				nodes.length !== proof.staticAttributes.length
			)
				throw new Error('Invalid compiler descriptor');
			metadata = { id: stamp, nodes, staticAttributes: proof.staticAttributes };
		} catch {
			proof = null;
		}
	}
	// Unsupported source goes through the normal renderer from the beginning.
	const selected = mode === 'bindings' && proof ? 'bindings' : 'renderer';
	const compilation = (compiler, id) => {
		const [physical] = id.split('?');
		const raw = physical === view ? initial : source(physical);
		const authored = physical === view && proof ? proof.code : raw;
		return compiler.transform(authored, id)?.code ?? authored;
	};
	const sourceRoot = (file) =>
		file.startsWith(here + path.sep) || file.startsWith(fixture + path.sep);
	const client = await viteBuild({
		configFile: false,
		root: repo,
		base: '/assets/',
		logLevel: 'warn',
		clearScreen: false,
		publicDir: false,
		define: {
			'process.env.NODE_ENV': JSON.stringify(
				process.env.AUTO_DEV === '1' ? 'development' : 'production',
			),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: {
			outDir: path.join(output, 'client'),
			emptyOutDir: false,
			target: 'es2022',
			minify: true,
			sourcemap: false,
			reportCompressedSize: false,
			rolldownOptions: {
				input: { behavior: path.join(here, `client-${selected}.ts`) },
				output: { entryFileNames: 'behavior.js', chunkFileNames: 'chunks/[name]-[hash].js' },
			},
		},
		plugins: [
			{
				name: 'automatic-scalar-binding-proof',
				enforce: 'pre',
				resolveId(request, importer) {
					if (request === 'virtual:automatic-proof') return '\0automatic-proof';
					if (request.includes('?octane-bindings=')) {
						const [file, query] = request.split('?');
						return path.resolve(path.dirname(importer), file) + '?' + query;
					}
				},
				load(id) {
					if (id === '\0automatic-proof') return `export default ${JSON.stringify(metadata)};`;
					const [file] = id.split('?');
					if (
						path.isAbsolute(file) &&
						file.startsWith(repo + path.sep) &&
						fs.existsSync(file) &&
						fs.statSync(file).isFile()
					)
						source(file);
					if (path.isAbsolute(file) && sourceRoot(file) && /\.(?:tsrx|ts|tsx|js)$/.test(file))
						return compilation(clientCompiler, id);
				},
			},
		],
	});
	const outputs = {};
	for (const chunk of client.output) {
		assert.equal(chunk.type, 'chunk');
		outputs[chunk.fileName] = {
			...sizes(Buffer.from(chunk.code)),
			imports: [
				...chunk.imports.map((name) => ({ name, kind: 'static' })),
				...chunk.dynamicImports.map((name) => ({ name, kind: 'dynamic' })),
			],
			modules: Object.fromEntries(
				Object.entries(chunk.modules).map(([file, detail]) => [file, detail.renderedLength]),
			),
		};
	}
	const server = await esbuild({
		absWorkingDir: repo,
		entryPoints: [path.join(fixture, 'server.ts')],
		outfile: path.join(output, 'server.mjs'),
		bundle: true,
		minify: true,
		metafile: true,
		platform: 'node',
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		define: {
			'process.env.NODE_ENV': JSON.stringify(
				process.env.AUTO_DEV === '1' ? 'development' : 'production',
			),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'automatic-scalar-server',
				setup(builder) {
					builder.onResolve(
						{ filter: /^octane(?:\/|$)|^\.\/(?:Shell\.tsrx|loaders\.ts)$/ },
						({ path: request, importer }) => {
							if (request === './Shell.tsrx' && importer === path.join(fixture, 'server.ts'))
								return { path: path.join(here, 'Shell.tsrx') };
							if (request === './loaders.ts' && importer === path.join(fixture, 'State.ts'))
								return { path: path.join(fixture, 'server-loaders.ts') };
							if (/^octane(?:\/|$)/.test(request))
								return { path: require.resolve(request === 'octane' ? 'octane/server' : request) };
						},
					);
					builder.onLoad({ filter: /\.(?:ts|tsx|tsrx|m?js)$/ }, ({ path: file }) => {
						if (file.startsWith(repo + path.sep)) source(file);
						if (!sourceRoot(file)) return;
						return {
							contents: compilation(serverCompiler, file),
							loader: file.endsWith('.ts') ? 'ts' : 'js',
							resolveDir: path.dirname(file),
						};
					});
				},
			},
		],
	});
	const initialOutputs = new Set();
	function visit(file) {
		if (initialOutputs.has(file)) return;
		assert.ok(outputs[file], `Missing emitted chunk ${file}`);
		initialOutputs.add(file);
		for (const edge of outputs[file].imports) if (edge.kind === 'static') visit(edge.name);
	}
	visit('behavior.js');
	const changedInputs = [...inputs]
		.filter(([file, bytes]) => digest(fs.readFileSync(file)) !== digest(bytes))
		.map(([file]) => file);
	assert.deepEqual(changedInputs, []);
	const result = {
		output,
		requested: mode,
		selected,
		stamp: metadata?.id ?? null,
		sourceOverrideSha256: sourceOverride === undefined ? null : digest(sourceOverride),
		proof: proof && { name: proof.name, fields: proof.fields },
		compilerOptions,
		outputs,
		initialOutputs: [...initialOutputs],
		initialGzip: [...initialOutputs].reduce((sum, file) => sum + outputs[file].gzip, 0),
		eventualGzip: Object.values(outputs).reduce((sum, chunk) => sum + chunk.gzip, 0),
		server: {
			...sizes(fs.readFileSync(path.join(output, 'server.mjs'))),
			inputs: Object.keys(server.metafile.inputs),
		},
		inputHashes: Object.fromEntries([...inputs].map(([file, bytes]) => [file, digest(bytes)])),
		changedInputs,
	};
	fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(result, null, 2));
	return result;
}

if (process.argv[1] === import.meta.filename) {
	const mode = process.argv.includes('--renderer') ? 'renderer' : 'bindings';
	console.log(JSON.stringify(await build(mode, process.env.BENCH_BUILD_DIR), null, 2));
}
