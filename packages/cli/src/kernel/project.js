import { existsSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readJsonc } from './jsonc.js';

const IGNORED_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.git',
	'coverage',
	'.next',
	'.vercel',
]);
const SOURCE_EXTENSIONS = new Set(['.tsrx', '.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs']);
const SOURCE_FILE_LIMIT = 5000;
const EXTENDS_LIMIT = 10;

const LOCKFILES = /** @type {const} */ ([
	['pnpm-lock.yaml', 'pnpm'],
	['package-lock.json', 'npm'],
	['yarn.lock', 'yarn'],
	['bun.lockb', 'bun'],
	['bun.lock', 'bun'],
]);

const BUNDLER_CONFIGS = /** @type {const} */ ([
	['vite.config', 'vite'],
	['rspack.config', 'rspack'],
	['rsbuild.config', 'rsbuild'],
	['lynx.config', 'rspeedy'],
]);

const CONFIG_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs', '.cts', '.cjs'];

/**
 * @param {string} base
 * @returns {string | null}
 */
function firstExisting(base) {
	for (const ext of CONFIG_EXTENSIONS) {
		if (existsSync(base + ext)) return base + ext;
	}
	return null;
}

/**
 * Nearest ancestor directory containing a `package.json`.
 *
 * @param {string} cwd
 * @returns {string}
 */
export function findRoot(cwd) {
	let dir = path.resolve(cwd);
	for (;;) {
		if (existsSync(path.join(dir, 'package.json'))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return path.resolve(cwd);
		dir = parent;
	}
}

/**
 * @param {string} root
 * @param {string} spec
 * @param {string} fromDir
 * @returns {string | null}
 */
function resolveExtends(root, spec, fromDir) {
	if (spec.startsWith('.') || path.isAbsolute(spec)) {
		const base = path.resolve(fromDir, spec);
		if (existsSync(base) && !spec.endsWith('.json')) return path.join(base, 'tsconfig.json');
		return existsSync(base) ? base : `${base}.json`;
	}
	const candidate = path.join(root, 'node_modules', spec);
	if (existsSync(candidate)) {
		return existsSync(path.join(candidate, 'tsconfig.json'))
			? path.join(candidate, 'tsconfig.json')
			: candidate;
	}
	return existsSync(`${candidate}.json`) ? `${candidate}.json` : null;
}

/**
 * Load a tsconfig with its `extends` chain flattened. `compilerOptions` merges
 * shallowly with the child winning, which is what TypeScript itself does and is
 * the only part the doctor checks read.
 *
 * @param {string} root
 * @param {string} [file]
 * @returns {{ path: string, config: any, chain: string[] } | null}
 */
export function loadTsconfig(root, file = path.join(root, 'tsconfig.json')) {
	if (!existsSync(file)) return null;

	/** @type {string[]} */
	const chain = [];
	/** @type {any} */
	let merged = {};
	/** @type {string | null} */
	let current = file;

	while (current && chain.length < EXTENDS_LIMIT) {
		const config = readJsonc(current);
		if (!config) break;
		chain.push(current);

		merged = {
			...config,
			...merged,
			compilerOptions: { ...(config.compilerOptions ?? {}), ...(merged.compilerOptions ?? {}) },
		};

		const parent = config.extends;
		if (typeof parent !== 'string') break;
		current = resolveExtends(root, parent, path.dirname(current));
	}

	return chain.length > 0 ? { path: file, config: merged, chain } : null;
}

/**
 * Read an installed package's manifest by walking `node_modules` upwards. Done
 * by hand rather than through `require.resolve` because most packages do not
 * expose `./package.json` in their export map.
 *
 * @param {string} root
 * @param {string} name
 * @returns {{ version: string, dir: string, manifest: any } | null}
 */
export function readInstalled(root, name) {
	let dir = path.resolve(root);
	for (;;) {
		const candidate = path.join(dir, 'node_modules', name);
		const manifest = readJsonc(path.join(candidate, 'package.json'));
		if (manifest) return { version: String(manifest.version ?? '0.0.0'), dir: candidate, manifest };
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Every physically distinct copy of a package reachable from the project's
 * direct dependencies.
 *
 * Two copies of `octane` in one tree is the single worst failure mode in the
 * ecosystem: hooks and context are keyed per-runtime, so a duplicate breaks
 * them silently rather than loudly. The scan is deliberately bounded to the
 * top level and one level of nesting, which is where real duplicates surface,
 * instead of walking the whole tree.
 *
 * @param {string} root
 * @param {string} name
 * @returns {{ version: string, realPath: string, via: string }[]}
 */
export function findCopies(root, name) {
	const modules = path.join(root, 'node_modules');
	if (!existsSync(modules)) return [];

	/** @type {Map<string, { version: string, realPath: string, via: string }>} */
	const found = new Map();

	const record = (/** @type {string} */ dir, /** @type {string} */ via) => {
		const manifest = readJsonc(path.join(dir, 'package.json'));
		if (!manifest) return;
		let realPath = dir;
		try {
			realPath = realpathSync(dir);
		} catch {
			// Broken link; report the logical path.
		}
		if (!found.has(realPath)) {
			found.set(realPath, { version: String(manifest.version ?? '0.0.0'), realPath, via });
		}
	};

	record(path.join(modules, name), 'the project');

	/** @type {string[]} */
	const owners = [];
	for (const entry of safeReaddir(modules)) {
		if (entry.startsWith('.')) continue;
		if (entry.startsWith('@')) {
			for (const scoped of safeReaddir(path.join(modules, entry))) {
				owners.push(`${entry}/${scoped}`);
			}
		} else {
			owners.push(entry);
		}
	}

	for (const owner of owners) {
		if (owner === name) continue;
		record(path.join(modules, owner, 'node_modules', name), owner);
	}

	return [...found.values()];
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function safeReaddir(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

/**
 * Walk project sources, skipping build output and dependencies.
 *
 * @param {string} root
 * @param {{ limit?: number }} [options]
 * @returns {string[]}
 */
export function scanSourceFiles(root, { limit = SOURCE_FILE_LIMIT } = {}) {
	/** @type {string[]} */
	const files = [];
	/** @type {string[]} */
	const queue = [root];

	while (queue.length > 0 && files.length < limit) {
		const dir = queue.pop();
		if (dir === undefined) break;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith('.') && entry.name !== '.') continue;
			const absolute = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name)) queue.push(absolute);
			} else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
				files.push(absolute);
				if (files.length >= limit) break;
			}
		}
	}

	return files;
}

/**
 * @typedef {Object} Project
 * @property {string} root
 * @property {string | null} manifestPath null when no package.json exists
 *   anywhere up the tree, which is what separates "a project" from "a directory"
 * @property {any} manifest
 * @property {Record<string, string>} declaredDependencies every dependency kind, merged
 * @property {string[]} bindings installed `@octanejs/*` package names
 * @property {'pnpm' | 'npm' | 'yarn' | 'bun' | null} packageManager
 * @property {string | null} lockfile
 * @property {{ path: string, config: any, chain: string[] } | null} tsconfig
 * @property {string | null} bundlerConfigPath
 * @property {'vite' | 'rspack' | 'rsbuild' | 'rspeedy' | null} bundler
 * @property {string | null} octaneConfigPath
 * @property {string[]} sourceFiles
 * @property {string[]} tsrxFiles
 * @property {boolean} isOctaneProject
 */

/**
 * Detect everything the commands share about a project, in one pass. Commands
 * read this model instead of re-globbing, so a `doctor` run touches the tree
 * once.
 *
 * @param {string} cwd
 * @returns {Project}
 */
export function detectProject(cwd) {
	const root = findRoot(cwd);
	const manifestPath = path.join(root, 'package.json');
	const manifest = readJsonc(manifestPath);

	const declaredDependencies = {
		...(manifest?.dependencies ?? {}),
		...(manifest?.devDependencies ?? {}),
		...(manifest?.peerDependencies ?? {}),
	};

	// Walk up for the lockfile: in a monorepo it lives at the workspace root, not
	// beside the package being inspected.
	let packageManager = /** @type {Project['packageManager']} */ (null);
	let lockfile = null;
	for (let dir = root; ;) {
		for (const [file, name] of LOCKFILES) {
			if (existsSync(path.join(dir, file))) {
				lockfile = path.relative(root, path.join(dir, file)) || file;
				packageManager = name;
				break;
			}
		}
		const parent = path.dirname(dir);
		if (lockfile || parent === dir) break;
		dir = parent;
	}

	if (!packageManager && typeof manifest?.packageManager === 'string') {
		packageManager = /** @type {Project['packageManager']} */ (
			manifest.packageManager.split('@')[0]
		);
	}

	let bundlerConfigPath = null;
	let bundler = /** @type {Project['bundler']} */ (null);
	for (const [base, name] of BUNDLER_CONFIGS) {
		const found = firstExisting(path.join(root, base));
		if (found) {
			bundlerConfigPath = found;
			bundler = name;
			break;
		}
	}

	const sourceFiles = scanSourceFiles(root);
	const tsrxFiles = sourceFiles.filter((file) => file.endsWith('.tsrx'));

	return {
		root,
		manifestPath: manifest === null ? null : manifestPath,
		manifest: manifest ?? {},
		declaredDependencies,
		bindings: Object.keys(declaredDependencies).filter((name) => name.startsWith('@octanejs/')),
		packageManager,
		lockfile,
		tsconfig: loadTsconfig(root),
		bundlerConfigPath,
		bundler,
		octaneConfigPath: firstExisting(path.join(root, 'octane.config')),
		sourceFiles,
		tsrxFiles,
		isOctaneProject:
			'octane' in declaredDependencies ||
			tsrxFiles.length > 0 ||
			readInstalled(root, 'octane') !== null,
	};
}

/**
 * The shared, serializable view of a project. `doctor --json` and `info` both
 * report it, so a bug report and a CI result describe the same thing.
 *
 * @param {Project} project
 * @returns {Record<string, unknown>}
 */
export function summarizeProject(project) {
	const octane = readInstalled(project.root, 'octane');

	return {
		root: project.root,
		name: project.manifest.name ?? null,
		hasManifest: project.manifestPath !== null,
		packageManager: project.packageManager,
		lockfile: project.lockfile,
		bundler: project.bundler,
		bundlerConfig: project.bundlerConfigPath
			? path.relative(project.root, project.bundlerConfigPath)
			: null,
		octaneConfig: project.octaneConfigPath
			? path.relative(project.root, project.octaneConfigPath)
			: null,
		octane: octane?.version ?? null,
		tsconfig: project.tsconfig ? path.relative(project.root, project.tsconfig.path) : null,
		tsrxFileCount: project.tsrxFiles.length,
		bindings: project.bindings.map((name) => ({
			name,
			version: readInstalled(project.root, name)?.version ?? null,
		})),
	};
}
