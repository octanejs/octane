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
import { addSourceMapNeedles, composeSourceMaps } from './compile-universal.js';
import {
	hydrateBoundaryPathFromId,
	prepareHydrateBoundaries,
	prepareServerHydrateBoundaries,
} from './hydrate-boundaries.js';
import { normalizeRendererConfig, resolveRendererForFile } from './renderers.js';
import {
	analyzeNativeChangeDiagnostics,
	formatCompileDiagnostic,
} from './native-change-diagnostics.js';
import { findVoidRootImports, slotHooks } from './slot-hooks.js';
import {
	assertNoLiveClientOnlyImports,
	createClientOnlyServerStub,
	createClientReference,
	findStaticRuntimeImportRequests,
} from './client-only-server.js';

export { findVoidRootImports };
export { HYDRATE_QUERY_PARAM } from './hydrate-boundaries.js';
export {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	CLIENT_REFERENCE_MANIFEST_VERSION,
	createClientReferenceManifest,
} from './client-only-server.js';
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
	// A leading `#` is a Node package-import alias, not a URL fragment.
	const hash = id.indexOf('#', id.startsWith('#') ? 1 : 0);
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

function packageViteOptimizeDepsExclusions(pkg) {
	const configured = pkg.octane?.vite?.optimizeDeps?.exclude;
	if (!Array.isArray(configured)) return [];
	return [
		...new Set(
			configured.filter(
				(dependency) =>
					typeof dependency === 'string' &&
					dependency.length > 0 &&
					dependency.trim() === dependency,
			),
		),
	];
}

// Vite does not expand globs in optimizeDeps.exclude. Resolve a terminal family
// rule against dependency names declared by the app and raw source packages so
// the adapter emits the exact package IDs Vite's resolver requires.
function expandViteOptimizeDepsExclusions(configured, dependencyNames) {
	const exclusions = new Set();
	for (const request of configured) {
		if (!request.endsWith('/*')) {
			exclusions.add(request);
			continue;
		}
		const prefix = request.slice(0, -1);
		for (const dependency of dependencyNames) {
			if (dependency.startsWith(prefix)) exclusions.add(dependency);
		}
	}
	return exclusions;
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

const USE_OCTANE_DIRECTIVE = 'use octane';

/**
 * Locate a `'use octane'` directive in the module's directive prologue.
 *
 * Directives are string-literal expression statements before any other
 * statement; comments, a BOM, and other directives (`'use client'`,
 * `'use strict'`, …) may precede it, in any order. Returns the directive's
 * `[start, end)` source span — including a same-line trailing semicolon — or
 * `null`. A string containing escape sequences is not a directive (spec
 * semantics) but still ends the candidate only if unterminated.
 */
export function findUseOctaneDirective(code) {
	const length = code.length;
	let i = code.charCodeAt(0) === 0xfeff ? 1 : 0;
	for (;;) {
		while (i < length && /\s/.test(code[i])) i++;
		if (code.startsWith('//', i)) {
			const newline = code.indexOf('\n', i);
			if (newline === -1) return null;
			i = newline + 1;
			continue;
		}
		if (code.startsWith('/*', i)) {
			const close = code.indexOf('*/', i + 2);
			if (close === -1) return null;
			i = close + 2;
			continue;
		}
		const quote = code[i];
		if (quote !== '"' && quote !== "'") return null;
		const start = i;
		let value = '';
		let escaped = false;
		let closed = false;
		for (i++; i < length; i++) {
			const ch = code[i];
			if (ch === '\\') {
				escaped = true;
				i++;
				continue;
			}
			if (ch === quote) {
				closed = true;
				i++;
				break;
			}
			if (ch === '\n' || ch === '\r') break;
			value += ch;
		}
		if (!closed) return null;
		let end = i;
		while (end < length && (code[end] === ' ' || code[end] === '\t')) end++;
		if (code[end] === ';') end++;
		if (!escaped && value === USE_OCTANE_DIRECTIVE) return { start, end };
		i = end;
	}
}

/**
 * Blank a directive span with equal-length whitespace so every later source
 * position — and therefore every source map — survives unchanged.
 */
function stripDirective(code, span) {
	return code.slice(0, span.start) + ' '.repeat(span.end - span.start) + code.slice(span.end);
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
		};
		this.renderers = normalizeRendererConfig(options.renderers);
		// Ownership gate for mixed-toolchain projects (e.g. a React app hosting
		// Octane islands): when enabled, a project-owned module is Octane's only
		// if it declares `'use octane'` in its directive prologue. Undirected
		// project `.tsx`/`.ts`/`.js` pass through to the host toolchain; an
		// undirected project `.tsrx` is a hard error. Installed/linked packages
		// keep their manifest `usesOctane` decision. The directive itself is
		// tolerated (and stripped from compiled output) in every mode.
		this.requireDirective = options.requireDirective === true;
		this.warn = typeof options.warn === 'function' ? options.warn : null;
		this.warnedUndirected = new Set();
		this.warnedCompileDiagnostics = new Set();
		// Deliberately instance-scoped: separate projects/build environments must
		// never share nearest-manifest decisions.
		this.manifestRuleCache = new Map();
		this.discoveryCache = null;
	}

	/** Clear cached manifest/discovery decisions after a watched path changes. */
	invalidate(path) {
		// Invalidation starts a new watch generation. Diagnostics are deduped
		// across client/server and hydrate-query transforms within one generation,
		// but a fixed and later reintroduced warning must be visible again.
		this.warnedCompileDiagnostics.clear();
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
					viteOptimizeDepsExclusions: packageViteOptimizeDepsExclusions(pkg),
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

	_isProjectOwnedSource(file) {
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		if (/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(absoluteFile)) return false;
		return isPathInside(this.root, absoluteFile) || isPathInside(this.realRoot, absoluteFile);
	}

	_isInstalledOctaneSource(file, collected) {
		// Project-owned TS/JS/TSX is always eligible. A linked package is commonly
		// handed to bundlers as its real path, without a node_modules segment, so
		// external files must make the same manifest-declared Octane decision as an
		// installed package instead of being mistaken for application source.
		if (this._isProjectOwnedSource(file)) return true;
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		const lookup = this._nearestOctanePackageRule(dirname(absoluteFile));
		addMetadata(collected, lookup);
		return lookup.rule?.usesOctane === true;
	}

	_isFullCompileSource(file, collected) {
		return (
			file.endsWith('.tsrx') ||
			(file.endsWith('.tsx') && this._isInstalledOctaneSource(file, collected))
		);
	}

	/**
	 * The requireDirective ownership gate for one project-owned module.
	 * Returns whether Octane owns the module; throws for an undirected
	 * project-owned `.tsrx` (in an Octane-only pipeline nothing else compiles
	 * the syntax, so a silent pass-through is a guaranteed confusing
	 * downstream parse error). Two carve-outs: installed and linked packages
	 * are exempt (their manifest `usesOctane` rule is already the explicit
	 * per-package decision), and `exclude` path fragments are never Octane's —
	 * tsrx syntax can target other renderers (e.g. `@tsrx/react`), so a
	 * project routing part of its `.tsrx` through a different tsrx compiler
	 * lists those paths in `exclude`, and the exclusion wins even over a
	 * directive.
	 */
	_passesDirectiveGate(file, filename, directive) {
		if (!this.requireDirective) return true;
		if (!this._isProjectOwnedSource(file)) return true;
		if (this.exclude.some((path) => file.includes(path))) {
			this._warnExcludedDirectiveConflict(file, filename, directive);
			return false;
		}
		if (directive !== null) return true;
		if (file.endsWith('.tsrx')) {
			const error = new Error(
				`${filename} is Octane source (.tsrx) but has no 'use octane' module directive, and this build enables requireDirective. Add 'use octane' at the top of the module (alongside any other directives, before imports), route the file to its owning tsrx compiler with the integration's \`exclude\` option, or disable requireDirective.`,
			);
			error.code = 'OCTANE_DIRECTIVE_REQUIRED';
			error.filename = filename;
			throw error;
		}
		return false;
	}

	/**
	 * requireDirective diagnostic: an exclusion beats a `'use octane'`
	 * directive, and the module stays with its excluded-path owner. Warn once
	 * so the conflicting signals never resolve as a silent no-op. Shared by
	 * the full-compile gate and the `.ts`/`.js` hook-slot exclusion.
	 */
	_warnExcludedDirectiveConflict(file, filename, directive) {
		if (directive === null || this.warn === null) return;
		if (!this._isProjectOwnedSource(file) || this.warnedUndirected.has(filename)) return;
		this.warnedUndirected.add(filename);
		this.warn(
			`${filename} declares 'use octane' but matches an excluded path — the exclusion wins and Octane will not compile it.`,
		);
	}

	/**
	 * requireDirective diagnostic: a project-owned module imports from
	 * 'octane' but declared no ownership, so Octane leaves it to the host
	 * toolchain untouched. Usually a forgotten directive; occasionally an
	 * intentional type-only import — hence a warning, never an error.
	 */
	_warnUndirectedOctaneImport(code, filename) {
		if (this.warn === null || this.warnedUndirected.has(filename)) return;
		if (!/from\s*['"]octane['"]/.test(code)) return;
		this.warnedUndirected.add(filename);
		this.warn(
			`${filename} imports from 'octane' but has no 'use octane' module directive — with requireDirective enabled, Octane will not compile or transform it. Add 'use octane' at the top of the module if Octane should own it.`,
		);
	}

	_forwardCompileDiagnostics(diagnostics) {
		if (this.warn === null) return;
		for (const diagnostic of diagnostics ?? []) {
			const key = `${diagnostic.code}\0${diagnostic.filename}\0${diagnostic.start.offset}\0${diagnostic.end.offset}`;
			if (this.warnedCompileDiagnostics.has(key)) continue;
			this.warnedCompileDiagnostics.add(key);
			this.warn(formatCompileDiagnostic(diagnostic));
		}
	}

	_assertClientOnlySourceSupported(file, filename, renderer, collected) {
		if (renderer.server !== 'client-only' || this._isFullCompileSource(file, collected)) return;
		const error = new Error(
			`Renderer rule ${JSON.stringify(renderer.id)} selects ${JSON.stringify(filename)} as server: "client-only", but export-preserving server stubs currently require an Octane-compiled .tsrx file or eligible raw .tsx source. Narrow the renderer rule so it cannot match ${JSON.stringify(filename)}.`,
		);
		error.code = 'OCTANE_CLIENT_ONLY_SOURCE_UNSUPPORTED';
		error.filename = filename;
		throw error;
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
		// Vite's root is the directory containing index.html, not necessarily the
		// package root. Multi-entry examples commonly keep one package.json above
		// sibling roots (for example `jsx/` and `tsrx/`). Walk upward to the nearest
		// owning manifest while watching every missing nearer path: creating a new
		// nested package boundary must invalidate discovery on the next rebuild.
		let projectManifestPath = null;
		let projectManifestRoot = null;
		let projectManifest = null;
		let candidateRoot = this.root;
		for (;;) {
			const candidate = join(candidateRoot, 'package.json');
			if (existsSync(candidate)) {
				collected.dependencies.add(candidate);
				projectManifestPath = candidate;
				projectManifestRoot = candidateRoot;
				try {
					projectManifest = JSON.parse(readFileSync(candidate, 'utf8'));
				} catch {
					// The nearest manifest owns this root even when it is temporarily
					// unreadable or invalid. Do not silently inherit a parent package.
				}
				break;
			}
			collected.missingDependencies.add(candidate);
			const parent = dirname(candidateRoot);
			if (parent === candidateRoot) break;
			candidateRoot = parent;
		}
		if (projectManifestPath === null || projectManifestRoot === null || projectManifest === null) {
			this.discoveryCache = {
				packages: [],
				viteOptimizeDepsExclusions: [],
				...finishMetadata(collected),
			};
			return this.discoveryCache;
		}

		const dependencyNames = new Set();
		for (const field of OCTANE_DEPENDENCY_FIELDS) {
			for (const name of Object.keys(projectManifest[field] ?? {})) dependencyNames.add(name);
		}
		const sourceDependencies = new Set();
		const viteOptimizeDepsExclusionRules = new Set();
		const viteOptimizeDepsCandidates = new Set(dependencyNames);
		const visitedPackageRoots = new Set();
		const visit = (name, issuerRoot) => {
			const packageRequire = createRequire(join(issuerRoot, 'package.json'));
			try {
				const entry = packageRequire.resolve(name);
				const lookup = this._nearestOctanePackageRule(dirname(entry));
				addMetadata(collected, lookup);
				if (!lookup.rule?.usesOctane) return;
				sourceDependencies.add(name);
				for (const dependency of lookup.rule.viteOptimizeDepsExclusions) {
					viteOptimizeDepsExclusionRules.add(dependency);
				}
				for (const dependency of lookup.rule.runtimeDependencies) {
					viteOptimizeDepsCandidates.add(dependency);
				}
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
		for (const name of dependencyNames) visit(name, projectManifestRoot);
		const viteOptimizeDepsExclusions = expandViteOptimizeDepsExclusions(
			viteOptimizeDepsExclusionRules,
			viteOptimizeDepsCandidates,
		);

		this.discoveryCache = {
			packages: [...sourceDependencies].sort(),
			viteOptimizeDepsExclusions: [...viteOptimizeDepsExclusions].sort(),
			...finishMetadata(collected),
		};
		return this.discoveryCache;
	}

	resolveRuntimeRequest(request, environment = this.defaults.environment) {
		return resolveOctaneRuntimeRequest(request, environment);
	}

	_canonicalModuleId(id) {
		const file = cleanModuleId(id);
		if (isAbsolute(file) && !isPathInside(this.root, file) && isPathInside(this.realRoot, file)) {
			return canonicalModuleId(file, this.realRoot);
		}
		return canonicalModuleId(file, this.root);
	}

	/** Static requests adapters resolve before a server transform. */
	findServerImportRequests(code, id) {
		return findStaticRuntimeImportRequests(code, this._canonicalModuleId(id));
	}

	/**
	 * requireDirective ownership for code-less classification: read the module
	 * prologue from disk. The transform (which receives real code) remains the
	 * authoritative gate; an unreadable file is conservatively not Octane's, so
	 * importers can never hold a client reference for a module whose own
	 * transform passes through to the host toolchain.
	 */
	_directiveOwnershipForFile(file) {
		if (!this.requireDirective) return true;
		if (!this._isProjectOwnedSource(file)) return true;
		if (this.exclude.some((path) => file.includes(path))) return false;
		let code;
		try {
			code = readFileSync(isAbsolute(file) ? resolve(file) : resolve(this.root, file), 'utf8');
		} catch {
			return false;
		}
		return findUseOctaneDirective(code) !== null;
	}

	/** Classify a bundler-resolved module without loading or evaluating it. */
	clientReferenceForFile(id) {
		const file = cleanModuleId(id);
		const filename = this._canonicalModuleId(file);
		const renderer = resolveRendererForFile(this.renderers, filename);
		// A renderer rule can only claim modules Octane owns. Under the
		// requireDirective gate an undirected project module belongs to the
		// host toolchain: no client reference, matching its pass-through
		// transform (server-graph identity must not split from output).
		if (renderer.server === 'client-only' && !this._directiveOwnershipForFile(file)) return null;
		const collected = { dependencies: new Set(), missingDependencies: new Set() };
		this._assertClientOnlySourceSupported(file, filename, renderer, collected);
		return renderer.server === 'client-only' ? createClientReference(renderer.id, filename) : null;
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
		const hydrateBoundaryPath = hydrateBoundaryPathFromId(id);
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
		// Server HMR stays disabled, but integrations may explicitly request DEV
		// server diagnostics (Vite does this for `serve`). With no explicit value,
		// server transforms retain their established production default.
		const dev = options.dev ?? this.defaults.dev ?? (environment === 'client' && !!hmr);
		// Profiling is a client-runtime build specialization, deliberately independent
		// of both HMR and dev hydration diagnostics. Server transforms stay byte-for-
		// byte identical even when a shared client/server bundler configuration opts in.
		const profile = environment === 'client' && (options.profile ?? this.defaults.profile) === true;
		const filename = this._canonicalModuleId(file);
		const clientOnlyImports =
			environment === 'server' && Array.isArray(options.clientOnlyImports)
				? options.clientOnlyImports
				: [];

		const renderer = resolveRendererForFile(this.renderers, filename);
		const directive = findUseOctaneDirective(code);
		const fullCompile =
			this._isFullCompileSource(file, collected) &&
			this._passesDirectiveGate(file, filename, directive);
		// The narrow-the-rule config error concerns modules Octane owns. Under
		// the directive gate a host-owned project module (undirected, or in an
		// excluded path) may legitimately sit inside a client-only include in a
		// mixed repo — it passes through here, and clientReferenceForFile
		// returns no reference for it, so classification and transform agree.
		const hostOwned =
			this.requireDirective &&
			this._isProjectOwnedSource(file) &&
			(directive === null || this.exclude.some((path) => file.includes(path)));
		if (!hostOwned) this._assertClientOnlySourceSupported(file, filename, renderer, collected);
		// The directive is a build-time ownership signal only — never ship it.
		// Blanking (not deleting) keeps positions stable for source maps.
		const source = directive === null ? code : stripDirective(code, directive);
		if (fullCompile) {
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const clientReference =
				renderer.server === 'client-only' ? createClientReference(renderer.id, filename) : null;
			if (environment === 'server' && clientReference !== null) {
				const stub = createClientOnlyServerStub(code, filename, renderer.id);
				return {
					code: stub.code,
					map: null,
					kind: 'client-only-stub',
					renderer,
					clientReference,
					clientOnlyExports: stub.exports,
					...finishMetadata(collected),
				};
			}
			const hasRendererBoundaries = Object.keys(this.renderers.boundaries).length > 0;
			const nativeChangeAnalysis = analyzeNativeChangeDiagnostics(
				parseModule(source, filename),
				source,
				filename,
				{
					dom: renderer.target === 'dom',
					renderer,
					rendererBoundaries: this.renderers.boundaries,
					rendererRegistry: this.renderers.registry,
				},
			);
			const nativeChangeDiagnostics = nativeChangeAnalysis.diagnostics;
			// Hydrate-boundary preparation consumes the directive-stripped source;
			// blanking preserved every position, so its maps stay consistent.
			const hydratePreparation =
				environment === 'client'
					? prepareHydrateBoundaries(source, filename, hydrateBoundaryPath)
					: prepareServerHydrateBoundaries(source, filename);
			const compileSource = hydratePreparation?.source ?? source;
			const out = compile(compileSource, filename, {
				__hydratePrepared: true,
				__hydrateBoundaryModule: typeof hydratePreparation?.boundaryPath === 'string',
				__nativeChangeDiagnostics: nativeChangeDiagnostics,
				...(hydratePreparation === null && !hasRendererBoundaries
					? { __nativeChangeAnalysis: nativeChangeAnalysis }
					: null),
				// Scoped-style hashes are position-derived; after the extraction
				// rewrite the compiler restamps them from these authored
				// coordinates so client and server compiles agree (compile.js).
				...(hydratePreparation?.origins != null
					? { __styleRemap: { authored: source, origins: hydratePreparation.origins } }
					: null),
				hmr,
				mode: environment,
				dev,
				profile,
				profileFilename,
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
				...(clientOnlyImports.length > 0 ? { clientOnlyImports } : null),
			});
			if (hydratePreparation?.map && out.map) {
				out.map = composeSourceMaps(out.map, hydratePreparation.map);
				out.map = addSourceMapNeedles(out.map, out.code, source, hydratePreparation.mappingNeedles);
			}
			this._forwardCompileDiagnostics(out.diagnostics);
			return {
				code: out.code,
				map: out.map,
				diagnostics: out.diagnostics,
				kind: 'compile',
				renderer,
				...(clientReference === null ? null : { clientReference }),
				...(environment === 'client' && options.collectVoidComponentExports === true
					? { voidComponentExports: findVoidComponentExports(compileSource, filename) }
					: {}),
				...finishMetadata(collected),
			};
		}
		if (clientOnlyImports.length > 0) {
			assertNoLiveClientOnlyImports(code, filename, clientOnlyImports);
		}
		if (file.endsWith('.tsx')) {
			// Either not Octane-eligible, or an undirected project module in a
			// requireDirective build — the host toolchain's JSX pipeline owns it.
			if (this.requireDirective && directive === null && this._isProjectOwnedSource(file)) {
				this._warnUndirectedOctaneImport(code, filename);
			}
			return this._passThrough(code, collected);
		}

		if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
			if (/\/\/\s*octane-no-slot\b/.test(code)) return null;
			if (this.exclude.some((path) => file.includes(path))) {
				// Same conflict diagnostic as the full-compile gate: a directive
				// inside an excluded path must not fail silent.
				if (this.requireDirective) {
					this._warnExcludedDirectiveConflict(file, filename, directive);
				}
				return null;
			}
			if (!/from\s*['"]octane['"]/.test(code)) return null;
			if (!this._isInstalledOctaneSource(file, collected)) {
				return this._passThrough(code, collected);
			}
			// Hook slotting is an Octane-ownership rewrite, so the directive gate
			// applies to it exactly as to full compilation.
			if (this.requireDirective && directive === null && this._isProjectOwnedSource(file)) {
				this._warnUndirectedOctaneImport(code, filename);
				return this._passThrough(code, collected);
			}
			// From here the module is Octane-owned even when nothing gets
			// rewritten (manual slots, or no hooks to slot) — the returned code
			// is Octane output, so the build-time directive never appears in it.
			if (this._hasManualHookSlots(file, collected)) {
				return this._passThrough(source, collected);
			}
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const specializeVoidRoot =
				environment === 'client' && hmr === false && dev === false && profile === false;
			const out = slotHooks(source, filename, {
				environment,
				hmr: !!hmr,
				profile,
				profileFilename,
				...(specializeVoidRoot
					? {
							isVoidComponentImport: options.isVoidComponentImport,
						}
					: {}),
			});
			if (out === null) return this._passThrough(source, collected);
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
