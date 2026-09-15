import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../../..');
const require = createRequire(path.join(REPO, 'packages/octane/package.json'));
const hash = (contents) => createHash('sha256').update(contents).digest('hex');
const forbidden =
	/\/packages\/octane\/src\/(?:runtime(?:\.server)?\.[jt]s$|server\/|react\/|internal\/|[^/]*devtools[^/]*\.[jt]s$)/;
function sizes(bytes) {
	return {
		raw: bytes.length,
		gzip: gzipSync(bytes, { level: 9 }).length,
		brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
		sha256: hash(bytes),
	};
}

export async function buildFixture(
	output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-behavior-only-')),
	{
		composerReceipts = false,
		bundler = 'esbuild',
		projection = 'none',
		richPresentation = 'none',
	} = {},
) {
	assert.ok(bundler === 'esbuild' || bundler === 'vite', 'Unknown client bundler');
	assert.ok(['none', 'manual', 'authored'].includes(projection), 'Unknown projection variant');
	assert.ok(
		['none', 'authored', 'renderer'].includes(richPresentation),
		'Unknown rich presentation variant',
	);
	assert.ok(
		richPresentation === 'none' || (!composerReceipts && projection === 'none'),
		'Rich presentation is a separate equal-work workload',
	);
	assert.ok(
		projection === 'none' || composerReceipts,
		'Projection comparison uses composer receipts',
	);
	fs.mkdirSync(output, { recursive: true });
	const { build, version } = await import(pathToFileURL(require.resolve('esbuild')).href);
	const compilerEntry = require.resolve('octane/compiler/bundler');
	const inputs = new Map();
	const source = (file) => {
		const physical = fs.realpathSync(file);
		if (!inputs.has(physical)) inputs.set(physical, fs.readFileSync(physical));
		return inputs.get(physical);
	};
	function recordCompiler(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) recordCompiler(file);
			else if (/\.[cm]?js$/.test(file)) source(file);
		}
	}
	recordCompiler(path.dirname(compilerEntry));
	const { createOctaneCompiler } = await import(pathToFileURL(compilerEntry).href);
	const compilerOptions = {
		root: REPO,
		requireDirective: false,
		dev: false,
		hmr: false,
		profile: false,
	};
	const buildOptions = {
		bundle: true,
		minify: true,
		metafile: true,
		treeShaking: true,
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	};
	const compilations = [];
	const loadSource = (compiler, environment, file) => {
		const physical = file.split('?')[0];
		const bytes = source(physical);
		const authored =
			physical === path.join(HERE, 'primary-action-mode.ts')
				? `export const primaryActionBenchmark = ${projection !== 'none'};`
				: bytes.toString();
		const compiled =
			file.startsWith(HERE + path.sep) && !file.endsWith('.mjs')
				? compiler.transform(authored, file)
				: null;
		if (compiled)
			compilations.push({
				environment,
				file,
				kind: compiled.kind,
				sourceSha256: hash(bytes),
				outputSha256: hash(compiled.code),
			});
		return compiled?.code ?? authored;
	};
	const resolveSource = (request, importer, environment) => {
		if (
			richPresentation !== 'none' &&
			request === './Shell.tsrx' &&
			importer === path.join(HERE, 'server.ts')
		)
			return path.join(HERE, 'rich/Shell.tsrx');
		if (
			richPresentation === 'renderer' &&
			request === './activate.tsrx' &&
			importer === path.join(HERE, 'rich/client.ts')
		)
			return path.join(HERE, 'rich/activate-renderer.ts');
		if (request.includes('?octane-bindings=')) {
			const [file, query] = request.split('?');
			return path.resolve(path.dirname(importer), file) + '?' + query;
		}
		if (request === './primary-action-manual.ts' && projection === 'authored')
			return path.join(HERE, 'primary-action-authored.tsrx');
		if (/^octane(?:\/|$)/.test(request))
			return require.resolve(
				request === 'octane' && environment === 'server' ? 'octane/server' : request,
			);
		if (
			composerReceipts &&
			request === './State.ts' &&
			['Shell.tsrx', 'server.ts', 'optional.ts'].some((name) => importer === path.join(HERE, name))
		)
			return path.join(HERE, 'ReceiptState.ts');
		if (
			environment === 'server' &&
			request === './loaders.ts' &&
			importer === path.join(HERE, composerReceipts ? 'receipt-query-state.ts' : 'State.ts')
		)
			return path.join(HERE, 'server-loaders.ts');
	};
	const makePlugin = (environment) => {
		const compiler = createOctaneCompiler({ ...compilerOptions, environment });
		return {
			name: 'behavior-only-public-compiler',
			setup(builder) {
				builder.onResolve(
					{
						filter:
							/^octane(?:\/|$)|^\.\/(?:State|loaders|primary-action-manual)\.ts$|^\.\/(?:Shell|activate)\.tsrx$|\?octane-bindings=/,
					},
					({ path: request, importer }) => {
						const resolved = resolveSource(request, importer, environment);
						return resolved ? { path: resolved } : undefined;
					},
				);
				builder.onLoad(
					{ filter: /\.(?:[cm]?[jt]s|tsx|jsx|tsrx|json)(?:\?octane-bindings=[^?]+)?$/ },
					({ path: file }) => {
						return {
							contents: loadSource(compiler, environment, file),
							loader: /\.tsx$/.test(file)
								? 'tsx'
								: /\.ts$/.test(file)
									? 'ts'
									: /\.json$/.test(file)
										? 'json'
										: 'js',
							resolveDir: path.dirname(file),
						};
					},
				);
			},
		};
	};
	let clientInputs, clientBundler;
	const outputs = {};
	const entry = path.join(
		HERE,
		richPresentation !== 'none'
			? 'rich/client.ts'
			: composerReceipts
				? 'receipt-client.ts'
				: 'client.ts',
	);
	if (bundler === 'esbuild') {
		const client = await build({
			...buildOptions,
			absWorkingDir: REPO,
			entryPoints: { behavior: entry },
			outdir: path.join(output, 'client'),
			platform: 'browser',
			splitting: true,
			chunkNames: 'chunks/[name]-[hash]',
			plugins: [makePlugin('client')],
		});
		// Preserve import edges even when a boundary assertion fails.
		fs.writeFileSync(
			path.join(output, 'client-metafile.json'),
			JSON.stringify(client.metafile, null, 2),
		);
		clientInputs = Object.keys(client.metafile.inputs).map(
			(file) =>
				fs.realpathSync(path.resolve(REPO, file.split('?')[0])) +
				(file.includes('?') ? '?' + file.split('?')[1] : ''),
		);
		clientBundler = { name: bundler, version, options: buildOptions };
		for (const [file, detail] of Object.entries(client.metafile.outputs)) {
			const absolute = path.resolve(REPO, file);
			outputs[path.relative(path.join(output, 'client'), absolute)] = {
				...sizes(fs.readFileSync(absolute)),
				entryPoint: detail.entryPoint,
				imports: detail.imports,
				inputs: detail.inputs,
			};
		}
	} else {
		const viteEntry = require.resolve('vite');
		const { build: viteBuild, version: viteVersion } = await import(pathToFileURL(viteEntry).href);
		const compiler = createOctaneCompiler({ ...compilerOptions, environment: 'client' });
		const loaded = new Set();
		const viteOptions = {
			configFile: false,
			root: REPO,
			logLevel: 'warn',
			clearScreen: false,
			publicDir: false,
			define: buildOptions.define,
			build: {
				outDir: path.join(output, 'client'),
				emptyOutDir: false,
				target: 'es2022',
				minify: true,
				sourcemap: false,
				reportCompressedSize: false,
				rolldownOptions: {
					input: { behavior: entry },
					output: { entryFileNames: 'behavior.js', chunkFileNames: 'chunks/[name]-[hash].js' },
				},
			},
		};
		const client = await viteBuild({
			...viteOptions,
			plugins: [
				{
					name: 'behavior-only-public-compiler',
					enforce: 'pre',
					resolveId: (request, importer) => resolveSource(request, importer, 'client'),
					load(id) {
						if (
							!path.isAbsolute(id) ||
							!/\.(?:[cm]?[jt]s|tsx|jsx|tsrx|json)(?:\?octane-bindings=[^?]+)?$/.test(id)
						)
							return;
						const [physical, query] = id.split('?');
						const file = fs.realpathSync(physical) + (query ? '?' + query : '');
						loaded.add(file);
						return loadSource(compiler, 'client', file);
					},
				},
			],
		});
		clientInputs = [...loaded];
		clientBundler = {
			name: bundler,
			version: viteVersion,
			rolldown: createRequire(viteEntry)('rolldown/package.json').version,
			options: viteOptions,
		};
		for (const chunk of client.output) {
			assert.equal(chunk.type, 'chunk', 'Unexpected non-JavaScript client output');
			outputs[chunk.fileName] = {
				...sizes(Buffer.from(chunk.code)),
				entryPoint: chunk.facadeModuleId,
				imports: [
					...chunk.imports.map((file) => [file, 'import-statement']),
					...chunk.dynamicImports.map((file) => [file, 'dynamic-import']),
				].map(([file, kind]) => ({
					path: path.relative(REPO, path.join(output, 'client', file)),
					kind,
				})),
				// Rolldown lengths precede final chunk minification. Keep that metric
				// distinct from esbuild's bytesInOutput; both prove retained membership.
				inputs: Object.fromEntries(
					Object.entries(chunk.modules).map(([file, detail]) => [
						file,
						{ renderedLength: detail.renderedLength },
					]),
				),
			};
		}
		fs.writeFileSync(
			path.join(output, 'client-metafile.json'),
			JSON.stringify({ clientInputs, outputs }, null, 2),
		);
	}
	if (richPresentation === 'renderer') {
		assert.ok(
			clientInputs.some((file) => /\/src\/runtime\.ts$/.test(file)),
			'The explicit equal-work renderer control must include the renderer',
		);
	} else {
		assert.deepEqual(
			clientInputs.filter((file) => forbidden.test(file)),
			[],
			'The browser graph must resolve no rendering engine, even if tree-shaken',
		);
	}
	assert.ok(
		clientInputs.includes(path.join(REPO, 'packages/octane/src/signals/document-owner.ts')),
		'Real renderer-free document owner must be bundled',
	);
	const server = await build({
		...buildOptions,
		absWorkingDir: REPO,
		entryPoints: [path.join(HERE, 'server.ts')],
		outfile: path.join(output, 'server.mjs'),
		platform: 'node',
		plugins: [makePlugin('server')],
	});
	for (const environment of ['client', 'server'])
		for (const file of composerReceipts
			? ['receipt-state.ts', 'receipt-query-state.ts', 'ReceiptState.ts']
			: ['State.ts'])
			assert.ok(
				compilations.some(
					(item) =>
						item.environment === environment &&
						item.file === path.join(HERE, file) &&
						item.kind === 'slots',
				),
				`Plain state must pass public slot lowering: ${environment} ${file}`,
			);
	const emitted = (contribution) => {
		const length = contribution.bytesInOutput ?? contribution.renderedLength;
		assert.ok(Number.isFinite(length) && length >= 0, 'Missing or invalid emitted module length');
		return length > 0;
	};
	for (const detail of Object.values(outputs)) {
		assert.deepEqual(
			Object.entries(detail.inputs).filter(
				([input, contribution]) =>
					/\/hydration\/event-capture\.[jt]s$/.test(input) && emitted(contribution),
			),
			[],
			'Control-only behavior must not ship independent-island intent capture',
		);
	}
	const eagerOutputs = new Set();
	function includeEager(file) {
		if (eagerOutputs.has(file)) return;
		eagerOutputs.add(file);
		for (const imported of outputs[file].imports) {
			if (imported.kind === 'dynamic-import' || imported.external) continue;
			includeEager(path.relative(path.join(output, 'client'), path.resolve(REPO, imported.path)));
		}
	}
	includeEager('behavior.js');
	if (composerReceipts) {
		assert.deepEqual(
			Object.values(outputs).flatMap((output) =>
				Object.entries(output.inputs).filter(
					([input, contribution]) =>
						/\/hydration\/stream-receiver\.ts$/.test(input) && emitted(contribution),
				),
			),
			[],
			'Result-only streaming must not ship DOM region placement in the eventual graph',
		);
		const queryImplementations = /\/signals\/(?:requests|query-attempt-observer|computations)\.ts$/;
		assert.deepEqual(
			[...eagerOutputs].flatMap((file) =>
				Object.entries(outputs[file].inputs).filter(
					([input, contribution]) => queryImplementations.test(input) && emitted(contribution),
				),
			),
			[],
			'Composer receipts must not load query or asynchronous-derived implementations before use',
		);
		assert.ok(
			Object.values(outputs).some((output) =>
				Object.entries(output.inputs).some(
					([input, contribution]) =>
						/\/signals\/requests\.ts$/.test(input) && emitted(contribution),
				),
			),
			'The delayed application controller must retain real native query execution',
		);
	}
	const changedInputsDuringBuild = [...inputs]
		.filter(([file, bytes]) => hash(fs.readFileSync(file)) !== hash(bytes))
		.map(([file]) => file);
	assert.deepEqual(changedInputsDuringBuild, [], 'Consumed source changed during build; rerun');
	const serverModule = await import(pathToFileURL(path.join(output, 'server.mjs')).href);
	const report = {
		suite: 'conversation-streaming-behavior-only',
		output,
		at: new Date().toISOString(),
		environment: {
			node: process.version,
			platform: process.platform,
			architecture: process.arch,
			cpu: os.cpus()[0]?.model,
			head: execFileSync('git', ['rev-parse', 'HEAD'], {
				cwd: REPO,
				encoding: 'utf8',
			}).trim(),
			esbuild: version,
		},
		compilerOptions,
		buildOptions,
		clientBundler,
		serverBundler: { name: 'esbuild', version },
		bundler,
		projection,
		richPresentation,
		composerReceipts,
		eagerOutputs: [...eagerOutputs],
		compilations,
		clientInputs,
		outputs,
		inlineCapture: sizes(Buffer.from(serverModule.earlySignalBootstrapScript())),
		server: {
			...sizes(fs.readFileSync(path.join(output, 'server.mjs'))),
			inputs: server.metafile.inputs,
		},
		inputHashes: Object.fromEntries([...inputs].map(([file, bytes]) => [file, hash(bytes)])),
		harnessHashes: Object.fromEntries(
			fs
				.readdirSync(HERE)
				.filter((file) => /\.(?:[cm]?[jt]s|tsrx)$/.test(file))
				.map((file) => [file, hash(fs.readFileSync(path.join(HERE, file)))]),
		),
		changedInputsDuringBuild,
		limitations: [
			`Local production ${bundler} split client and esbuild server output; fixture measurements do not establish deployed application performance or chunk policy.`,
			richPresentation === 'none'
				? 'Server-owned lists keep first-value historical HTML; live outputs observe later signal results without reconciling those lists.'
				: 'Rich presentation updates authored DOM continuously; its deterministic SVG map is not a production map SDK measurement.',
			'Payload sizes are raw/gzip9/brotli11; not network transfer, parse, paint, INP, or Safari-device measurements.',
		],
	};
	fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(report, null, 2));
	return report;
}

export async function startServer(report) {
	for (const [file, expected] of Object.entries(report.outputs))
		assert.equal(
			hash(fs.readFileSync(path.join(report.output, 'client', file))),
			expected.sha256,
			`Changed browser artifact: ${file}`,
		);
	assert.equal(hash(fs.readFileSync(path.join(report.output, 'server.mjs'))), report.server.sha256);
	const { diagnostics, render } = await import(
		pathToFileURL(path.join(report.output, 'server.mjs')).href
	);
	const server = createServer(async (incoming, response) => {
		const url = new URL(incoming.url, 'http://127.0.0.1');
		try {
			if (url.pathname.startsWith('/assets/')) {
				const file = url.pathname.slice('/assets/'.length);
				if (!Object.hasOwn(report.outputs, file)) {
					response.writeHead(404).end();
					return;
				}
				response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
				response.end(fs.readFileSync(path.join(report.output, 'client', file)));
				return;
			}
			const run = url.searchParams.get('run') ?? 'manual';
			if (!/^[a-zA-Z0-9_-]{1,80}$/.test(run)) {
				response.writeHead(400).end();
				return;
			}
			url.searchParams.set('run', run);
			const abort = new AbortController();
			response.on('close', () => {
				if (!response.writableFinished) abort.abort();
			});
			const config = {
				run,
				scenario: url.searchParams.get('scenario') ?? 'large-waves',
				holdAuth: url.searchParams.get('hold') !== 'false',
				bodyCount: 20,
				historyCount: 12,
			};
			const request = new Request(url, {
				method: incoming.method,
				signal: abort.signal,
				headers: { 'x-conversation-bench': JSON.stringify(config) },
			});
			if (url.pathname === '/trace' || url.pathname === '/release') {
				const result = diagnostics(request);
				response.writeHead(result.status, Object.fromEntries(result.headers));
				response.end(await result.text());
				return;
			}
			if (url.pathname !== '/') {
				response.writeHead(404).end();
				return;
			}
			const stream = await render(request, '/assets/behavior.js');
			response.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store',
			});
			const reader = stream.getReader();
			try {
				for (;;) {
					const next = await reader.read();
					if (next.done) break;
					if (!response.write(next.value)) await once(response, 'drain');
				}
				response.end();
			} finally {
				reader.releaseLock();
			}
		} catch (error) {
			if (!response.headersSent) response.writeHead(500);
			response.end(String(error));
		}
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeAllConnections();
			}),
	};
}

if (process.argv[1] === import.meta.filename) {
	const report = await buildFixture(process.env.BENCH_BUILD_DIR, {
		composerReceipts: process.argv.includes('--composer-receipts'),
		bundler:
			process.argv
				.find((argument) => argument.startsWith('--bundler='))
				?.slice('--bundler='.length) ?? 'esbuild',
		projection:
			process.argv
				.find((argument) => argument.startsWith('--projection='))
				?.slice('--projection='.length) ?? 'none',
		richPresentation:
			process.argv
				.find((argument) => argument.startsWith('--rich-presentation='))
				?.slice('--rich-presentation='.length) ?? 'none',
	});
	console.log(
		JSON.stringify(
			{
				build: path.join(report.output, 'build.json'),
				outputs: report.outputs,
				inlineCapture: report.inlineCapture,
			},
			null,
			2,
		),
	);
}
