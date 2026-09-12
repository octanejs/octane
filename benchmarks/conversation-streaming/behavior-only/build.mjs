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
) {
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
	const makePlugin = (environment) => {
		const compiler = createOctaneCompiler({ ...compilerOptions, environment });
		return {
			name: 'behavior-only-public-compiler',
			setup(builder) {
				builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
					path: require.resolve(
						request === 'octane' && environment === 'server' ? 'octane/server' : request,
					),
				}));
				if (environment === 'server')
					builder.onResolve({ filter: /^\.\/loaders\.ts$/ }, ({ importer }) =>
						importer === path.join(HERE, 'State.ts')
							? { path: path.join(HERE, 'server-loaders.ts') }
							: undefined,
					);
				builder.onLoad({ filter: /\.(?:[cm]?[jt]s|tsx|jsx|tsrx|json)$/ }, ({ path: file }) => {
					const bytes = source(file);
					const compiled =
						file.startsWith(HERE + path.sep) && !file.endsWith('.mjs')
							? compiler.transform(bytes.toString(), file)
							: null;
					if (compiled)
						compilations.push({
							environment,
							file,
							kind: compiled.kind,
							sourceSha256: hash(bytes),
							outputSha256: hash(compiled.code),
						});
					return {
						contents: compiled?.code ?? bytes,
						loader: /\.tsx$/.test(file)
							? 'tsx'
							: /\.ts$/.test(file)
								? 'ts'
								: /\.json$/.test(file)
									? 'json'
									: 'js',
						resolveDir: path.dirname(file),
					};
				});
			},
		};
	};
	const client = await build({
		...buildOptions,
		absWorkingDir: REPO,
		entryPoints: { behavior: path.join(HERE, 'client.ts') },
		outdir: path.join(output, 'client'),
		platform: 'browser',
		splitting: true,
		chunkNames: 'chunks/[name]-[hash]',
		plugins: [makePlugin('client')],
	});
	const clientInputs = Object.keys(client.metafile.inputs).map((file) =>
		fs.realpathSync(path.resolve(REPO, file)),
	);
	assert.deepEqual(
		clientInputs.filter((file) => forbidden.test(file)),
		[],
		'The browser graph must resolve no rendering engine, even if tree-shaken',
	);
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
		assert.ok(
			compilations.some(
				(item) =>
					item.environment === environment &&
					item.file.endsWith('/State.ts') &&
					item.kind === 'slots',
			),
			`Plain state must pass public slot lowering: ${environment}`,
		);
	const outputs = {};
	for (const [file, detail] of Object.entries(client.metafile.outputs)) {
		const absolute = path.resolve(REPO, file);
		outputs[path.relative(path.join(output, 'client'), absolute)] = {
			...sizes(fs.readFileSync(absolute)),
			entryPoint: detail.entryPoint,
			imports: detail.imports,
			inputs: detail.inputs,
		};
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
			'Local production esbuild split output, not lightweight-web deployment or its Vite chunk policy.',
			'Server-owned lists keep first-value historical HTML; live outputs observe later signal results without reconciling those lists.',
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
	const report = await buildFixture(process.env.BENCH_BUILD_DIR);
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
