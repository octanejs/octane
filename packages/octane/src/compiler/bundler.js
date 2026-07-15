/**
 * Bundler-neutral Octane source integration.
 *
 * This module owns every decision shared by Vite, Rspack, and future bundlers:
 * source eligibility, package-manifest rules, canonical compiler IDs, compiler
 * target/HMR options, raw-source dependency discovery, and runtime requests.
 * Bundler adapters are responsible only for translating their own lifecycle and
 * watch APIs to this small surface.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseModule } from '@tsrx/core';
import { compile, isVoidJsxCodeBlockFunction } from './compile.js';
import { normalizeRendererConfig, resolveRendererForFile } from './renderers.js';
import { findVoidRootImports, slotHooks } from './slot-hooks.js';

export { findVoidRootImports };
export {
	DOM_RENDERER_ID,
	DOM_RENDERER_MODULE,
	RENDERER_CONFIG_VERSION,
	normalizeRendererConfig,
	resolveRendererForFile,
} from './renderers.js';

const OCTANE_DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
];

export const OCTANE_RUNTIME_REQUESTS = Object.freeze({
	client: 'octane',
	server: 'octane/server',
});

/** Strip bundler query/hash suffixes without changing the underlying path. */
export function cleanModuleId(id) {
	const query = id.indexOf('?');
	const hash = id.indexOf('#');
	let end = id.length;
	if (query !== -1) end = query;
	if (hash !== -1 && hash < end) end = hash;
	return id.slice(0, end);
}

function isPathInside(root, file) {
	const relativeFile = relative(root, file);
	return relativeFile !== '..' && !relativeFile.startsWith('..' + sep) && !isAbsolute(relativeFile);
}

function normalizeModulePath(file) {
	return file.split(/[\\/]/).join('/');
}

/**
 * Return the stable ID embedded in hook keys and dev source metadata. Files
 * inside the project root use a root-relative POSIX path so builds are portable;
 * external files retain their absolute path. Bundler query suffixes never enter
 * compiler output or cache keys.
 */
export function canonicalModuleId(id, projectRoot) {
	const file = cleanModuleId(id);
	if (!projectRoot || !isAbsolute(file)) return normalizeModulePath(file);
	const root = resolve(projectRoot);
	const relativeFile = relative(root, file);
	if (!isPathInside(root, file)) return normalizeModulePath(file);
	return '/' + normalizeModulePath(relativeFile);
}

export function resolveOctaneRuntimeRequest(request, environment) {
	if (request !== 'octane') return null;
	if (environment !== 'client' && environment !== 'server') {
		throw new Error(
			`Unknown Octane environment ${JSON.stringify(environment)} — expected 'client' or 'server'.`,
		);
	}
	return OCTANE_RUNTIME_REQUESTS[environment];
}

function packageUsesOctane(pkg) {
	return (
		pkg.name === 'octane' ||
		['dependencies', 'optionalDependencies', 'peerDependencies'].some(
			(field) => typeof pkg[field]?.octane === 'string',
		)
	);
}

function metadata(dependencies = [], missingDependencies = []) {
	return { dependencies, missingDependencies };
}

function addMetadata(target, source) {
	for (const file of source.dependencies) target.dependencies.add(file);
	for (const file of source.missingDependencies) target.missingDependencies.add(file);
}

function finishMetadata(value) {
	return {
		dependencies: [...value.dependencies].sort(),
		missingDependencies: [...value.missingDependencies].sort(),
	};
}

function normalizeHmrDialect(value) {
	// Backwards compatibility: compile(..., { hmr: true }) has always meant the
	// Vite import.meta.hot dialect.
	if (value === true) return 'vite';
	if (value === false || value == null) return false;
	if (value === 'vite' || value === 'webpack') return value;
	throw new Error(
		`Unknown Octane HMR dialect ${JSON.stringify(value)} — expected false, 'vite', or 'webpack'.`,
	);
}

/**
 * Classify only direct function exports whose TSRX body never returns a value.
 * This fact is attached to the module by bundler adapters after compiling the
 * exact source those adapters loaded. Re-exports and indirect bindings remain
 * deliberately unknown.
 */
export function findVoidComponentExports(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return [];
	}
	const exports = [];
	for (const node of ast.body || []) {
		if (node.type === 'ExportDefaultDeclaration') {
			const declaration = node.declaration;
			if (
				(declaration?.type === 'FunctionDeclaration' ||
					declaration?.type === 'FunctionExpression' ||
					declaration?.type === 'ArrowFunctionExpression') &&
				isVoidJsxCodeBlockFunction(declaration)
			) {
				exports.push('default');
			}
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration') continue;
		const declaration = node.declaration;
		if (
			declaration?.type === 'FunctionDeclaration' &&
			declaration.id?.name &&
			isVoidJsxCodeBlockFunction(declaration)
		) {
			exports.push(declaration.id.name);
			continue;
		}
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			if (
				item.id?.type === 'Identifier' &&
				(item.init?.type === 'FunctionExpression' ||
					item.init?.type === 'ArrowFunctionExpression') &&
				isVoidJsxCodeBlockFunction(item.init)
			) {
				exports.push(item.id.name);
			}
		}
	}
	return exports;
}

class OctaneBundlerCompiler {
	constructor(options) {
		this.root = resolve(options.root ?? process.cwd());
		try {
			this.realRoot = realpathSync(this.root);
		} catch {
			this.realRoot = this.root;
		}
		this.exclude = [...(options.exclude ?? [])];
		this.defaults = {
			environment: options.environment ?? 'client',
			hmr: normalizeHmrDialect(options.hmr),
			dev: options.dev,
			profile: options.profile === true,
			parallelUse: options.parallelUse,
		};
		this.renderers = normalizeRendererConfig(options.renderers);
		// Deliberately instance-scoped: separate projects/build environments must
		// never share nearest-manifest decisions.
		this.manifestRuleCache = new Map();
		this.discoveryCache = null;
	}

	/** Clear cached manifest/discovery decisions after a watched path changes. */
	invalidate(path) {
		if (path == null) {
			this.manifestRuleCache.clear();
			this.discoveryCache = null;
			return;
		}
		const changed = resolve(cleanModuleId(path));
		for (const [directory, entry] of this.manifestRuleCache) {
			if (entry.dependencies.includes(changed) || entry.missingDependencies.includes(changed)) {
				this.manifestRuleCache.delete(directory);
			}
		}
		if (
			this.discoveryCache?.dependencies.includes(changed) ||
			this.discoveryCache?.missingDependencies.includes(changed)
		) {
			this.discoveryCache = null;
		}
	}

	_nearestOctanePackageRule(fileDir) {
		const dir = resolve(fileDir);
		const cached = this.manifestRuleCache.get(dir);
		if (cached !== undefined) return cached;

		const manifest = join(dir, 'package.json');
		let pkg = null;
		try {
			pkg = JSON.parse(readFileSync(manifest, 'utf8'));
		} catch {
			// An absent/unreadable/invalid manifest does not own the file. Continue
			// upward, while retaining the path as watch/cache metadata.
		}

		let result;
		if (pkg !== null) {
			const manual = pkg.octane?.hookSlots?.manual;
			result = {
				rule: {
					name: typeof pkg.name === 'string' ? pkg.name : null,
					root: dir,
					dirs: Array.isArray(manual) ? manual : [],
					runtimeDependencies: [
						...Object.keys(pkg.dependencies ?? {}),
						...Object.keys(pkg.optionalDependencies ?? {}),
					],
					usesOctane: packageUsesOctane(pkg),
				},
				...metadata([manifest]),
			};
		} else {
			const parent = dirname(dir);
			const inherited =
				parent === dir ? { rule: null, ...metadata() } : this._nearestOctanePackageRule(parent);
			result = {
				rule: inherited.rule,
				dependencies: existsSync(manifest)
					? [manifest, ...inherited.dependencies]
					: inherited.dependencies,
				missingDependencies: existsSync(manifest)
					? inherited.missingDependencies
					: [manifest, ...inherited.missingDependencies],
			};
		}

		this.manifestRuleCache.set(dir, result);
		return result;
	}

	_hasManualHookSlots(file, collected) {
		const lookup = this._nearestOctanePackageRule(dirname(file));
		addMetadata(collected, lookup);
		if (lookup.rule === null) return false;
		const relativeFile = relative(lookup.rule.root, file);
		return lookup.rule.dirs.some((directory) => {
			const relativeDirectory = directory
				.replace(/[\\/]+$/, '')
				.split(/[\\/]/)
				.join(sep);
			return (
				relativeDirectory !== '' &&
				(relativeFile === relativeDirectory || relativeFile.startsWith(relativeDirectory + sep))
			);
		});
	}

	_isInstalledOctaneSource(file, collected) {
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		const isInstalledPath = /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(absoluteFile);
		// Project-owned TS/JS/TSX is always eligible. A linked package is commonly
		// handed to bundlers as its real path, without a node_modules segment, so
		// external files must make the same manifest-declared Octane decision as an
		// installed package instead of being mistaken for application source.
		if (
			!isInstalledPath &&
			(isPathInside(this.root, absoluteFile) || isPathInside(this.realRoot, absoluteFile))
		) {
			return true;
		}
		const lookup = this._nearestOctanePackageRule(dirname(absoluteFile));
		addMetadata(collected, lookup);
		return lookup.rule?.usesOctane === true;
	}

	_profileModuleId(file, collected) {
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		const isInstalledPath = /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(absoluteFile);
		let containingRoot = null;
		if (!isInstalledPath) {
			if (isPathInside(this.root, absoluteFile)) containingRoot = this.root;
			else if (isPathInside(this.realRoot, absoluteFile)) containingRoot = this.realRoot;
		}
		if (containingRoot !== null) return canonicalModuleId(absoluteFile, containingRoot);

		// Linked and installed source packages need an ID portable across package
		// managers and machines. Their nearest package manifest supplies both the
		// public package name and the package-relative source path.
		const lookup = this._nearestOctanePackageRule(dirname(absoluteFile));
		addMetadata(collected, lookup);
		if (lookup.rule?.name) {
			const packagePath = normalizeModulePath(relative(lookup.rule.root, absoluteFile));
			return `/@package/${encodeURIComponent(lookup.rule.name)}/${packagePath}`;
		}

		// Never embed an arbitrary absolute host path in profiling metadata. The
		// basename fallback may collide, but remains useful and deliberately makes
		// that limitation visible through the reserved external namespace.
		return `/@external/${basename(absoluteFile)}`;
	}

	/**
	 * Resolve the privacy-safe source identity used by profiling metadata.
	 *
	 * Kept on the shared compiler instance so non-TSRX transforms (notably MDX)
	 * reuse the same real-root, package-manifest cache, and invalidation rules as
	 * the core compiler. Callers may register the returned manifest dependencies
	 * with their bundler watcher.
	 */
	resolveProfileModuleId(id) {
		const collected = {
			dependencies: new Set(),
			missingDependencies: new Set(),
		};
		return {
			id: this._profileModuleId(cleanModuleId(id), collected),
			...finishMetadata(collected),
		};
	}

	/**
	 * Discover installed source packages which consume Octane, recursively
	 * following runtime dependencies between those packages.
	 */
	discoverSourceDependencies() {
		if (this.discoveryCache !== null) return this.discoveryCache;
		const collected = {
			dependencies: new Set(),
			missingDependencies: new Set(),
		};
		const projectManifestPath = join(this.root, 'package.json');
		let projectManifest;
		try {
			projectManifest = JSON.parse(readFileSync(projectManifestPath, 'utf8'));
			collected.dependencies.add(projectManifestPath);
		} catch {
			if (existsSync(projectManifestPath)) collected.dependencies.add(projectManifestPath);
			else collected.missingDependencies.add(projectManifestPath);
			this.discoveryCache = { packages: [], ...finishMetadata(collected) };
			return this.discoveryCache;
		}

		const dependencyNames = new Set();
		for (const field of OCTANE_DEPENDENCY_FIELDS) {
			for (const name of Object.keys(projectManifest[field] ?? {})) dependencyNames.add(name);
		}
		const sourceDependencies = new Set();
		const visitedPackageRoots = new Set();
		const visit = (name, issuerRoot) => {
			const packageRequire = createRequire(join(issuerRoot, 'package.json'));
			try {
				const entry = packageRequire.resolve(name);
				const lookup = this._nearestOctanePackageRule(dirname(entry));
				addMetadata(collected, lookup);
				if (!lookup.rule?.usesOctane) return;
				sourceDependencies.add(name);
				let packageRoot = lookup.rule.root;
				try {
					packageRoot = realpathSync(packageRoot);
				} catch {
					// Keep the resolved/symlink path as the cycle key.
				}
				if (visitedPackageRoots.has(packageRoot)) return;
				visitedPackageRoots.add(packageRoot);
				for (const dependency of lookup.rule.runtimeDependencies) {
					visit(dependency, lookup.rule.root);
				}
			} catch {
				// Match Node's upward node_modules search: package managers commonly
				// satisfy a nested raw-source dependency by hoisting it to the project
				// root. Any candidate's creation can therefore make this request
				// resolvable and must invalidate a cached miss.
				let candidateRoot = resolve(issuerRoot);
				for (;;) {
					collected.missingDependencies.add(
						join(candidateRoot, 'node_modules', name, 'package.json'),
					);
					const parent = dirname(candidateRoot);
					if (parent === candidateRoot) break;
					candidateRoot = parent;
				}
			}
		};
		for (const name of dependencyNames) visit(name, this.root);

		this.discoveryCache = {
			packages: [...sourceDependencies].sort(),
			...finishMetadata(collected),
		};
		return this.discoveryCache;
	}

	resolveRuntimeRequest(request, environment = this.defaults.environment) {
		return resolveOctaneRuntimeRequest(request, environment);
	}

	_passThrough(code, collected) {
		if (collected.dependencies.size === 0 && collected.missingDependencies.size === 0) {
			return null;
		}
		return {
			code,
			map: null,
			kind: 'none',
			...finishMetadata(collected),
		};
	}

	transform(code, id, options = {}) {
		const file = cleanModuleId(id);
		const collected = {
			dependencies: new Set(),
			missingDependencies: new Set(),
		};
		const environment = options.environment ?? this.defaults.environment;
		if (environment !== 'client' && environment !== 'server') {
			throw new Error(
				`Unknown Octane environment ${JSON.stringify(environment)} — expected 'client' or 'server'.`,
			);
		}
		const requestedHmr = normalizeHmrDialect(options.hmr ?? this.defaults.hmr);
		const hmr = environment === 'server' ? false : requestedHmr;
		const dev = environment === 'server' ? false : (options.dev ?? this.defaults.dev ?? !!hmr);
		// Profiling is a client-runtime build specialization, deliberately independent
		// of both HMR and dev hydration diagnostics. Server transforms stay byte-for-
		// byte identical even when a shared client/server bundler configuration opts in.
		const profile = environment === 'client' && (options.profile ?? this.defaults.profile) === true;
		const parallelUse = options.parallelUse ?? this.defaults.parallelUse;
		const filename = canonicalModuleId(file, this.root);

		const fullCompile =
			file.endsWith('.tsrx') ||
			(file.endsWith('.tsx') && this._isInstalledOctaneSource(file, collected));
		if (fullCompile) {
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const renderer = resolveRendererForFile(this.renderers, filename);
			const hasRendererBoundaries = Object.keys(this.renderers.boundaries).length > 0;
			const out = compile(code, filename, {
				hmr,
				mode: environment,
				dev,
				profile,
				profileFilename,
				parallelUse: parallelUse !== false,
				// Keep the established DOM compiler call byte-for-byte equivalent. A
				// renderer descriptor is an orthogonal compiler input only for the
				// universal branch selected at this template boundary.
				...(renderer.target === 'dom' ? null : { renderer }),
				// Boundary metadata is a lexical compiler input even in a DOM-owned
				// module: a matching imported component can delegate one prop region to
				// another renderer. Keep the option absent for the normal empty-config
				// DOM path so its compiler invocation and output remain unchanged.
				...(hasRendererBoundaries ? { rendererBoundaries: this.renderers.boundaries } : null),
				...(hasRendererBoundaries ? { rendererRegistry: this.renderers.registry } : null),
			});
			return {
				code: out.code,
				map: out.map,
				kind: 'compile',
				renderer,
				...(environment === 'client' && options.collectVoidComponentExports === true
					? { voidComponentExports: findVoidComponentExports(code, filename) }
					: {}),
				...finishMetadata(collected),
			};
		}
		if (file.endsWith('.tsx')) return this._passThrough(code, collected);

		if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
			if (/\/\/\s*octane-no-slot\b/.test(code)) return null;
			if (this.exclude.some((path) => file.includes(path))) return null;
			if (!/from\s*['"]octane['"]/.test(code)) return null;
			if (!this._isInstalledOctaneSource(file, collected)) {
				return this._passThrough(code, collected);
			}
			if (this._hasManualHookSlots(file, collected)) {
				return this._passThrough(code, collected);
			}
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const specializeVoidRoot =
				environment === 'client' && hmr === false && dev === false && profile === false;
			const out = slotHooks(code, filename, {
				hmr: !!hmr,
				profile,
				profileFilename,
				...(specializeVoidRoot
					? {
							isVoidComponentImport: options.isVoidComponentImport,
						}
					: {}),
			});
			if (out === null) return this._passThrough(code, collected);
			return {
				code: out.code,
				map: out.map,
				kind: 'slots',
				...finishMetadata(collected),
			};
		}

		return null;
	}
}

export function createOctaneCompiler(options = {}) {
	return new OctaneBundlerCompiler(options);
}

/** Backwards-compatible convenience for callers that only need package names. */
export function discoverOctaneSourceDependencies(projectRoot) {
	return createOctaneCompiler({ root: projectRoot }).discoverSourceDependencies().packages;
}
