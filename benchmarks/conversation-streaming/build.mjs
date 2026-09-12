import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build } from 'vite';
import { octane } from '../../packages/vite-plugin-octane/src/index.js';
import { createNodeServer } from '../../packages/app-core/src/server/node-http.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const filesIn = (directory) =>
	fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory() ? filesIn(file) : [file];
	});

export function measurementEnvironment() {
	return {
		at: new Date().toISOString(),
		node: process.version,
		platform: process.platform,
		release: os.release(),
		architecture: process.arch,
		cpu: os.cpus()[0]?.model,
	};
}

function toolchainProvenance() {
	const result = {};
	for (const name of ['vite', 'esbuild', '@tsrx/core', '@tsrx/runtime', 'alien-signals']) {
		const entry = fs.realpathSync(
			require.resolve(name === '@tsrx/runtime' ? '@tsrx/runtime/ref' : name),
		);
		const root = packageRoot(entry, name);
		const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
		const implementation = (directory) =>
			fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
				if (item.name === 'node_modules' || item.name.startsWith('.')) return [];
				const file = path.join(directory, item.name);
				return item.isDirectory()
					? implementation(file)
					: /\.(?:[cm]?js|ts|json|node)$/.test(file) || file.includes('/bin/')
						? [file]
						: [];
			});
		let sourceRevision;
		for (
			let directory = root;
			directory !== path.dirname(directory);
			directory = path.dirname(directory)
		) {
			if (fs.existsSync(path.join(directory, '.git'))) {
				sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
					cwd: directory,
					encoding: 'utf8',
				}).trim();
				break;
			}
		}
		result[name] = {
			version: manifest.version,
			entry,
			root,
			sourceRevision,
			implementation: Object.fromEntries(
				implementation(root).map((file) => [file, hash(fs.readFileSync(file))]),
			),
		};
	}
	return result;
}

function packageRoot(file, name) {
	for (
		let directory = path.dirname(file);
		directory !== path.dirname(directory);
		directory = path.dirname(directory)
	) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest)).name === name)
			return directory;
	}
	throw new Error(`Cannot find ${name} package for ${file}`);
}

export function assetSizes(file) {
	const bytes = fs.readFileSync(file);
	return {
		raw: bytes.length,
		gzip: gzipSync(bytes, { level: 9 }).length,
		brotli: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}).length,
		sha256: hash(bytes),
	};
}

/** Build a fresh copy; never replace an earlier measured artifact. */
export async function buildFixture(outputDirectory) {
	fs.mkdirSync(outputDirectory, { recursive: true });
	// Match the resolver's physical paths (macOS /var points to /private/var).
	const directory = fs.realpathSync(outputDirectory);
	const root = path.join(directory, 'fixture');
	assert.ok(!fs.existsSync(root), `Refusing to replace an existing fixture: ${root}`);
	fs.cpSync(path.join(import.meta.dirname, 'fixture'), root, {
		recursive: true,
		errorOnExist: true,
		force: false,
	});
	const fixtureHashes = Object.fromEntries(
		filesIn(root).map((file) => [path.relative(root, file), hash(fs.readFileSync(file))]),
	);
	for (const [name, target] of [
		['octane', path.join(REPO, 'packages/octane')],
		['@octanejs/app-core', path.join(REPO, 'packages/app-core')],
		['@octanejs/vite-plugin', path.join(REPO, 'packages/vite-plugin-octane')],
		['vite', packageRoot(require.resolve('vite'), 'vite')],
	]) {
		const destination = path.join(root, 'node_modules', name);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.symlinkSync(target, destination, 'dir');
	}
	const sourceFiles = ['octane', 'app-core', 'vite-plugin-octane'].flatMap((name) => [
		...filesIn(path.join(REPO, 'packages', name, 'src')),
		path.join(REPO, 'packages', name, 'package.json'),
	]);
	const sourceHashes = Object.fromEntries(
		sourceFiles.map((file) => [file, hash(fs.readFileSync(file))]),
	);
	const toolchain = toolchainProvenance();
	const graph = {};
	const consumed = {};
	const startedAt = new Date().toISOString();
	await build({
		root,
		configFile: false,
		logLevel: 'warn',
		plugins: [
			octane(),
			{
				name: 'conversation-benchmark-provenance',
				generateBundle(_options, bundle) {
					for (const [file, item] of Object.entries(bundle)) {
						if (item.type !== 'chunk') continue;
						graph[file] = {
							entry: item.isEntry,
							imports: item.imports,
							dynamicImports: item.dynamicImports,
							modules: Object.keys(item.modules),
							css: [...(item.viteMetadata?.importedCss ?? [])],
						};
						for (const id of Object.keys(item.modules)) {
							const source = id.split('?')[0];
							if (
								path.isAbsolute(source) &&
								fs.existsSync(source) &&
								fs.statSync(source).isFile()
							) {
								consumed[source] = hash(fs.readFileSync(source));
							}
						}
					}
				},
			},
		],
		build: { outDir: 'dist', minify: 'esbuild', manifest: true },
		ssr: { noExternal: [/^octane($|\/)/] },
	});
	for (const [file, expected] of Object.entries(sourceHashes)) {
		assert.equal(hash(fs.readFileSync(file)), expected, `Source changed during build: ${file}`);
	}
	for (const tool of Object.values(toolchain))
		for (const [file, expected] of Object.entries(tool.implementation)) {
			assert.equal(
				hash(fs.readFileSync(file)),
				expected,
				`Toolchain changed during build: ${file}`,
			);
		}
	const distDir = path.join(root, 'dist');
	assert.ok(
		fs.existsSync(path.join(distDir, 'server/entry.js')),
		'Production server bundle missing',
	);
	const assets = Object.fromEntries(
		filesIn(path.join(distDir, 'client'))
			.filter((file) => /\.(js|css)$/.test(file))
			.map((file) => [path.relative(path.join(distDir, 'client'), file), assetSizes(file)]),
	);
	const result = {
		root,
		distDir,
		graph,
		assets,
		serverFiles: Object.fromEntries(
			filesIn(path.join(distDir, 'server')).map((file) => [
				path.relative(path.join(distDir, 'server'), file),
				hash(fs.readFileSync(file)),
			]),
		),
		provenance: {
			startedAt,
			finishedAt: new Date().toISOString(),
			commit: execFileSync('git', ['rev-parse', 'HEAD'], {
				cwd: REPO,
				encoding: 'utf8',
			}).trim(),
			node: process.version,
			platform: process.platform,
			architecture: process.arch,
			cpu: os.cpus()[0]?.model,
			fixtureHashes,
			toolchain,
			sourceHashes,
			consumed,
			runnerSha256: hash(fs.readFileSync(import.meta.filename)),
			lockSha256: hash(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
			server: assetSizes(path.join(distDir, 'server/entry.js')),
			compression: { gzipLevel: 9, brotliQuality: 11, perPhysicalFile: true },
		},
	};
	fs.writeFileSync(path.join(directory, 'build.json'), JSON.stringify(result, null, 2) + '\n');
	return result;
}

export function readBuild(directory) {
	const result = JSON.parse(fs.readFileSync(path.join(directory, 'build.json')));
	assert.equal(
		hash(fs.readFileSync(path.join(result.distDir, 'server/entry.js'))),
		result.provenance.server.sha256,
		'Measured server bundle changed',
	);
	for (const [file, expected] of Object.entries(result.serverFiles ?? {})) {
		assert.equal(
			hash(fs.readFileSync(path.join(result.distDir, 'server', file))),
			expected,
			`Measured server file changed: ${file}`,
		);
	}
	for (const [file, expected] of Object.entries(result.assets)) {
		assert.equal(
			hash(fs.readFileSync(path.join(result.distDir, 'client', file))),
			expected.sha256,
			`Measured asset changed: ${file}`,
		);
	}
	return result;
}

export async function startServer(directory) {
	const built = readBuild(directory);
	const { handler } = await import(pathToFileURL(path.join(built.distDir, 'server/entry.js')));
	const server = createNodeServer(handler, {
		staticDir: path.join(built.distDir, 'client'),
	}).listen(/** @type {any} */ ({ port: 0, host: '127.0.0.1' }));
	try {
		await once(server, 'listening');
	} catch (error) {
		server.close();
		throw error;
	}
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	return {
		...built,
		server,
		handler,
		origin: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeIdleConnections();
			}),
	};
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
	const directory =
		process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'octane-conversation-bench-'));
	const result = await buildFixture(directory);
	console.log(
		JSON.stringify({
			directory,
			distDir: result.distDir,
			assets: Object.keys(result.assets).length,
		}),
	);
}
