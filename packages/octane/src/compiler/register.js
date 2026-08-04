/**
 * Synchronous server-script compiler registration.
 *
 * Import this module before a Node or Bun entry point to compile authored
 * `.tsrx`/`.tsx` modules and slot Octane hooks in plain `.ts`/`.js` helpers.
 * Direct execution is a server pipeline, so authored `octane` runtime imports
 * resolve to `octane/server`, matching the server code the compiler emits.
 */
import * as nodeFs from 'node:fs';
import * as nodeModule from 'node:module';
import * as nodePath from 'node:path';
import * as nodeUrl from 'node:url';
import { createOctaneCompiler } from './bundler.js';

const compiler = createOctaneCompiler({
	root: process.cwd(),
	environment: 'server',
	hmr: false,
	dev: false,
});

const extensionlessCandidates = ['.tsrx', '.tsx', '.ts', '.mts', '.mjs', '.js'];

function isFile(path) {
	try {
		return nodeFs.statSync(path).isFile();
	} catch {
		return false;
	}
}

function candidateUrl(specifier, parentURL) {
	if (parentURL === undefined || !parentURL.startsWith('file:')) return null;
	if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) {
		return null;
	}

	let requested;
	try {
		requested = new URL(specifier, parentURL);
	} catch {
		return null;
	}
	if (requested.protocol !== 'file:') return null;

	const requestedPath = nodeUrl.fileURLToPath(requested);
	const extension = nodePath.extname(requestedPath);
	const candidates = [];
	if (extension === '') {
		for (const candidateExtension of extensionlessCandidates) {
			candidates.push(requestedPath + candidateExtension);
		}
		for (const candidateExtension of extensionlessCandidates) {
			candidates.push(nodePath.join(requestedPath, 'index' + candidateExtension));
		}
	} else if (extension === '.js') {
		const stem = requestedPath.slice(0, -extension.length);
		candidates.push(stem + '.ts', stem + '.tsx');
	} else if (extension === '.mjs') {
		candidates.push(requestedPath.slice(0, -extension.length) + '.mts');
	} else if (extension === '.cjs') {
		candidates.push(requestedPath.slice(0, -extension.length) + '.cts');
	}

	for (const candidate of candidates) {
		if (!isFile(candidate)) continue;
		const resolved = nodeUrl.pathToFileURL(candidate);
		resolved.search = requested.search;
		resolved.hash = requested.hash;
		return resolved.href;
	}
	return null;
}

function sourceText(source) {
	if (typeof source === 'string') return source;
	if (source === undefined) return null;
	return new TextDecoder().decode(source);
}

function resolve(specifier, context, nextResolve) {
	const runtimeRequest = compiler.resolveRuntimeRequest(specifier, 'server');
	if (runtimeRequest !== null) return nextResolve(runtimeRequest, context);

	try {
		return nextResolve(specifier, context);
	} catch (error) {
		const url = candidateUrl(specifier, context.parentURL);
		if (url !== null) return { url, shortCircuit: true };
		throw error;
	}
}

function load(url, context, nextLoad) {
	if (!url.startsWith('file:')) return nextLoad(url, context);
	const filename = nodeUrl.fileURLToPath(url);

	if (filename.endsWith('.tsrx') || filename.endsWith('.tsx')) {
		const source = nodeFs.readFileSync(filename, 'utf8');
		const result = compiler.transform(source, filename, { environment: 'server' });
		if (result === null || result.kind === 'none') return nextLoad(url, context);
		return { format: 'module', source: result.code, shortCircuit: true };
	}

	if ((filename.endsWith('.ts') && !filename.endsWith('.d.ts')) || filename.endsWith('.js')) {
		const loaded = nextLoad(url, context);
		const source = sourceText(loaded.source);
		if (source === null) return loaded;
		const result = compiler.transform(source, filename, { environment: 'server' });
		if (result === null || result.kind === 'none') return loaded;
		return { ...loaded, source: result.code, shortCircuit: true };
	}

	return nextLoad(url, context);
}

function registerBunPlugin() {
	globalThis.Bun.plugin({
		name: 'octane-compiler',
		setup(build) {
			build.onLoad({ filter: /\.(?:tsrx|tsx|ts|js)$/, namespace: 'file' }, ({ path }) => {
				const source = nodeFs.readFileSync(path, 'utf8');
				const result = compiler.transform(source, path, {
					environment: 'server',
					explicitRuntimeRequests: true,
				});
				const loader =
					path.endsWith('.tsx') || path.endsWith('.tsrx')
						? 'tsx'
						: path.endsWith('.ts')
							? 'ts'
							: 'js';
				if (result === null || result.kind === 'none') return { contents: source, loader };
				return {
					contents: result.code,
					loader: result.kind === 'slots' || result.kind === 'runtime-requests' ? loader : 'js',
				};
			});
		},
	});
}

if (typeof globalThis.Bun === 'object') registerBunPlugin();
else nodeModule.registerHooks({ resolve, load });
