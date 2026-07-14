// @ts-check
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { get_route_entry_path } from '@octanejs/app-core/routes';
import { compile } from 'octane/compiler';

const OCTANE_COMPONENT_EXTENSIONS = new Set(['.tsrx', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.octane',
	'.vercel',
	'__fixtures__',
	'__tests__',
	'build',
	'coverage',
	'dist',
	'examples',
	'fixtures',
	'node_modules',
	'playground',
	'test',
	'tests',
]);
const SERVER_MODULE_CANDIDATE = /\bmodule\s+server\s*\{/;
const COMPILED_SERVER_NAMESPACE = /(?:^|\n)\s*export\s+const\s+_\$_server_\$_\s*=/;

/**
 * Replace comments and string/template contents with whitespace while keeping
 * line breaks and token boundaries intact. This is only a cheap candidate
 * filter: the Octane compiler remains the syntax authority below.
 *
 * Template expressions are intentionally masked with the surrounding
 * template. A `module server` declaration cannot be top-level while it is
 * nested in an expression, and treating template text as source caused false
 * RPC imports in the old regexp-only scan.
 *
 * @param {string} source
 */
function maskNonCode(source) {
	const output = source.split('');
	let state = 'code';

	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		const next = source[index + 1];

		if (state === 'code') {
			if (character === '/' && next === '/') {
				output[index] = output[index + 1] = ' ';
				index++;
				state = 'line-comment';
			} else if (character === '/' && next === '*') {
				output[index] = output[index + 1] = ' ';
				index++;
				state = 'block-comment';
			} else if (character === "'" || character === '"' || character === '`') {
				output[index] = ' ';
				state = character;
			}
			continue;
		}

		if (state === 'line-comment') {
			if (character === '\n' || character === '\r') state = 'code';
			else output[index] = ' ';
			continue;
		}

		if (state === 'block-comment') {
			if (character === '*' && next === '/') {
				output[index] = output[index + 1] = ' ';
				index++;
				state = 'code';
			} else if (character !== '\n' && character !== '\r') {
				output[index] = ' ';
			}
			continue;
		}

		if (character === '\\') {
			output[index] = ' ';
			if (index + 1 < source.length) {
				index++;
				if (source[index] !== '\n' && source[index] !== '\r') output[index] = ' ';
			}
		} else if (character === state) {
			output[index] = ' ';
			state = 'code';
		} else if (character !== '\n' && character !== '\r') {
			output[index] = ' ';
		}
	}

	return output.join('');
}

/**
 * Confirm a candidate through the same parser and server transform used by
 * the Rspack loader. Inspecting the compiler-owned namespace declaration keeps
 * comments, JSX text, regexps, and string/template content out of the static
 * RPC graph without maintaining a second TSRX parser here.
 *
 * @param {string} source
 * @param {string} id
 */
function ownsServerModule(source, id) {
	if (!SERVER_MODULE_CANDIDATE.test(maskNonCode(source))) return false;
	const compiled = compile(source, id, { mode: 'server' });
	return COMPILED_SERVER_NAMESPACE.test(maskNonCode(compiled.code));
}

/**
 * Convert a stable, project-root module ID used in route/config data into a
 * concrete import specifier for Rspack. IDs remain stable in serialized
 * hydration/RPC data; only generated source sees the filesystem path.
 *
 * @param {string} id
 * @param {string} root
 */
export function resolveProjectModule(id, root) {
	const projectRoot = path.resolve(root);
	if (path.isAbsolute(id)) {
		const normalized = path.resolve(id);
		if (normalized === projectRoot || normalized.startsWith(projectRoot + path.sep)) {
			return normalized;
		}
		// Canonical IDs for linked/raw Octane dependencies remain absolute. A
		// project-root ID such as `/src/Page.tsrx` normally does not exist as an
		// absolute filesystem path and falls through to the root-relative case.
		if (fs.existsSync(normalized)) return normalized;
		// Octane config paths use project-root syntax (`/src/Page.tsrx`).
		return path.join(projectRoot, id.replace(/^[/\\]+/, ''));
	}
	return path.resolve(projectRoot, id);
}

/** @param {string} file @param {string} root */
export function toProjectModuleId(file, root) {
	const relative = path.relative(path.resolve(root), path.resolve(file));
	if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
		let externalFile = path.resolve(file);
		try {
			// Rspack resolves linked packages through their real path before invoking
			// loaders. Use the same path in RPC hashes (notably `/private/var` on
			// macOS) so generated manifest keys and compiler hashes cannot diverge.
			externalFile = fs.realpathSync.native(externalFile);
		} catch {
			// Preserve a stable absolute ID for a missing path; the build will report
			// the missing import with its normal resolver diagnostic.
		}
		return externalFile.split(path.sep).join('/');
	}
	return '/' + relative.split(path.sep).join('/');
}

/**
 * Every module the server may serialize into `#__octane_data`.
 *
 * @param {import('@octanejs/app-core').ResolvedOctaneConfig} config
 */
export function collectClientEntries(config) {
	const entries = config.router.routes
		.filter((route) => route.type === 'render')
		.flatMap((route) => [get_route_entry_path(route.entry), route.layout]);
	if (config.router.preHydrate) entries.push(config.router.preHydrate);
	entries.push(
		get_route_entry_path(config.rootBoundary.pending),
		get_route_entry_path(config.rootBoundary.catch),
	);
	return [...new Set(entries.filter((entry) => typeof entry === 'string'))];
}

/**
 * Discover project-owned and raw-dependency TSRX/TSX modules containing an
 * actual top-level `module server` block. This is an inclusion pre-pass so the
 * generated server graph can statically import every RPC owner before Rspack
 * compiles it; the compiler validates candidates rather than a second parser.
 *
 * @param {string} root
 * @param {string[]} [sourceRoots]
 * @returns {{ ids: string[], files: string[], directories: string[] }}
 */
export function discoverServerModules(root, sourceRoots = [root]) {
	const projectRoot = path.resolve(root);
	const files = new Set();
	/** @type {string[]} */
	const directories = [];
	/** @type {string[]} */
	const pending = [...new Set(sourceRoots.map((sourceRoot) => path.resolve(sourceRoot)))];
	const visitedDirectories = new Set();

	while (pending.length > 0) {
		const directory = /** @type {string} */ (pending.pop());
		if (visitedDirectories.has(directory)) continue;
		visitedDirectories.add(directory);
		directories.push(directory);
		/** @type {fs.Dirent[]} */
		let entries;
		try {
			entries = fs.readdirSync(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(path.join(directory, entry.name));
				continue;
			}
			if (!entry.isFile() || !OCTANE_COMPONENT_EXTENSIONS.has(path.extname(entry.name))) continue;
			const file = path.join(directory, entry.name);
			let source;
			try {
				source = fs.readFileSync(file, 'utf8');
			} catch {
				continue;
			}
			const id = toProjectModuleId(file, projectRoot);
			if (ownsServerModule(source, id)) files.add(file);
		}
	}

	const sortedFiles = [...files].sort();
	return {
		ids: sortedFiles.map((file) => toProjectModuleId(file, projectRoot)),
		files: sortedFiles,
		directories,
	};
}

/**
 * Resolve the source directories of installed packages the neutral compiler
 * identified as raw Octane dependencies. Published packages normally expose a
 * `src` directory; limiting linked workspace packages to that directory avoids
 * accidentally pulling their tests/examples into the server RPC manifest.
 *
 * @param {string} root
 * @param {string[]} packageNames
 * @returns {string[]}
 */
export function resolveOctaneSourceRoots(root, packageNames) {
	const projectRoot = path.resolve(root);
	const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
	const roots = [projectRoot];

	for (const packageName of packageNames) {
		if (packageName === 'octane' || packageName === '@octanejs/app-core') continue;
		let entry;
		try {
			entry = projectRequire.resolve(packageName);
		} catch {
			continue;
		}
		let directory = path.dirname(entry);
		let packageRoot = null;
		for (;;) {
			const manifest = path.join(directory, 'package.json');
			if (fs.existsSync(manifest)) {
				try {
					if (JSON.parse(fs.readFileSync(manifest, 'utf8')).name === packageName) {
						packageRoot = directory;
						break;
					}
				} catch {
					// Keep walking; the resolver already found a usable package entry.
				}
			}
			const parent = path.dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
		if (!packageRoot) continue;
		const sourceDirectory = path.join(packageRoot, 'src');
		roots.push(fs.existsSync(sourceDirectory) ? sourceDirectory : packageRoot);
	}

	return [...new Set(roots)];
}
