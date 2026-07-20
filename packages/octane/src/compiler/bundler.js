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
import { compile, hasOnlyLowerableNullishExits, isVoidJsxCodeBlockFunction } from './compile.js';
import {
	addSourceMapNeedles,
	composeSourceMaps,
	validateRendererModuleSource,
} from './compile-universal.js';
import {
	hydrateBoundaryPathFromId,
	prepareHydrateBoundaries,
	prepareServerHydrateBoundaries,
} from './hydrate-boundaries.js';
import {
	DOM_RENDERER_MODULE,
	normalizeRendererConfig,
	resolveRendererForFile,
} from './renderers.js';
import { findLeadingJsxImportSourcePragma } from './pragma.js';
import {
	isExactPackageName,
	normalizePackageStateModel,
	normalizeStateModelConfig,
} from './state-model.js';
import { normalizeUniversalRuntime } from './universal-runtime.js';
import {
	analyzeNativeChangeDiagnostics,
	formatCompileDiagnostic,
} from './native-change-diagnostics.js';
import { findVoidComponentImports, findVoidRootImports, slotHooks } from './slot-hooks.js';
import {
	assertNoLiveClientOnlyImports,
	createClientOnlyServerStub,
	createClientReference,
	findStaticRuntimeImportRequests,
} from './client-only-server.js';

export { findVoidComponentImports, findVoidRootImports };
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
export {
	DEFAULT_STATE_MODEL,
	STATE_MODEL_CONFIG_VERSION,
	normalizeStateModelConfig,
} from './state-model.js';

const OCTANE_DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
];

function packagePathSegments(name) {
	return isExactPackageName(name) ? name.split('/') : null;
}

/**
 * Find an installed package's owning directory without requiring its root
 * export to exist. Raw-source packages may intentionally expose only named
 * subpaths, but their root package.json is still the discovery boundary.
 */
function resolvePackageLookupDirectory(name, issuerRoot, packageRequire) {
	const segments = packagePathSegments(name);
	if (segments !== null) {
		let candidateRoot = resolve(issuerRoot);
		for (;;) {
			const manifest = join(candidateRoot, 'node_modules', ...segments, 'package.json');
			if (existsSync(manifest)) {
				const packageRoot = dirname(manifest);
				try {
					// Match require.resolve's realpath behavior so dependency/watch
					// metadata remains canonical on macOS (/var -> /private/var) and
					// for linked packages.
					return realpathSync(packageRoot);
				} catch {
					return packageRoot;
				}
			}
			const parent = dirname(candidateRoot);
			if (parent === candidateRoot) break;
			candidateRoot = parent;
		}
	}

	// Keep compatibility with resolvers that do not expose a physical
	// node_modules layout. The manifest subpath is preferable when available;
	// the package root export is only a final fallback for older behavior.
	try {
		return dirname(packageRequire.resolve(`${name}/package.json`));
	} catch {
		try {
			return dirname(packageRequire.resolve(name));
		} catch {
			return null;
		}
	}
}

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
		pkg.octane?.stateModel !== undefined ||
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
 * Classify direct function exports whose production TSRX body has no renderable
 * JavaScript return. A direct `memo(LocalComponent)` export preserves that
 * contract, as do null-only early-return guards that compile to template
 * control flow. Bundler adapters attach this fact after compiling the exact
 * source they loaded. Re-exports and indirect bindings remain deliberately
 * unknown.
 */
export function findVoidComponentExports(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return [];
	}
	const memoLocals = new Set();
	const declarations = [];
	for (const node of ast.body || []) {
		if (node.type === 'ImportDeclaration' && node.source?.value === 'octane') {
			for (const specifier of node.specifiers || []) {
				if (
					specifier.type === 'ImportSpecifier' &&
					(specifier.imported?.name ?? specifier.imported?.value) === 'memo' &&
					specifier.local?.name
				) {
					memoLocals.add(specifier.local.name);
				}
			}
		}
		const declaration =
			node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
				? node.declaration
				: node;
		if (declaration) declarations.push(declaration);
	}

	const voidBindings = new Set();
	const isVoidFunction = (node) =>
		isVoidJsxCodeBlockFunction(node) || hasOnlyLowerableNullishExits(node);
	for (const declaration of declarations) {
		if (declaration.type === 'FunctionDeclaration' && declaration.id?.name) {
			if (isVoidFunction(declaration)) voidBindings.add(declaration.id.name);
			continue;
		}
		if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			if (
				item.id?.type === 'Identifier' &&
				(item.init?.type === 'FunctionExpression' ||
					item.init?.type === 'ArrowFunctionExpression') &&
				isVoidFunction(item.init)
			) {
				voidBindings.add(item.id.name);
			}
		}
	}
	// Resolve only the exact, immutable `const Export = memo(Local)` form. The
	// imported memo identity is lexical proof; method calls, comparators, and
	// arbitrary wrappers stay unknown.
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of declarations) {
			if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
			for (const item of declaration.declarations || []) {
				const init = item.init;
				if (
					item.id?.type !== 'Identifier' ||
					voidBindings.has(item.id.name) ||
					init?.type !== 'CallExpression' ||
					init.callee?.type !== 'Identifier' ||
					!memoLocals.has(init.callee.name) ||
					init.arguments?.length !== 1 ||
					init.arguments[0]?.type !== 'Identifier' ||
					!voidBindings.has(init.arguments[0].name)
				)
					continue;
				voidBindings.add(item.id.name);
				changed = true;
			}
		}
	}

	const exports = [];
	for (const node of ast.body || []) {
		if (node.type === 'ExportDefaultDeclaration') {
			const declaration = node.declaration;
			if (
				(declaration?.type === 'FunctionDeclaration' ||
					declaration?.type === 'FunctionExpression' ||
					declaration?.type === 'ArrowFunctionExpression') &&
				isVoidFunction(declaration)
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
			voidBindings.has(declaration.id.name)
		) {
			exports.push(declaration.id.name);
			continue;
		}
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			if (item.id?.type === 'Identifier' && voidBindings.has(item.id.name)) {
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
			universalRuntime: normalizeUniversalRuntime(options.universalRuntime),
		};
		this.renderers = normalizeRendererConfig(options.renderers);
		this.stateModel = normalizeStateModelConfig(options.stateModel);
		// Ownership gate for mixed-toolchain projects (e.g. a React app hosting
		// Octane islands): when enabled, a project `.tsrx` is Octane's by
		// extension (nothing else compiles the syntax), and a project
		// `.tsx`/`.ts`/`.js` is Octane's only if it opens with a leading
		// `/** @jsxImportSource octane */` pragma (any registered renderer's
		// intrinsics module also counts) — full compilation for `.tsx`, hook
		// slotting for plain `.ts`/`.js`. A leading pragma naming a foreign
		// source (`react`, …) does NOT claim the file. Unmarked project
		// modules pass through to the host toolchain. Installed/linked
		// packages keep their manifest `usesOctane` decision. The pragma
		// always ships unchanged — it is meaningful to TypeScript and
		// downstream tools (in a JSX-less `.ts`/`.js` module TypeScript
		// ignores it, so there it acts purely as the ownership marker).
		this.requireDirective = options.requireDirective === true;
		this.pragmaOwnedModules = new Set([DOM_RENDERER_MODULE]);
		for (const renderer of Object.values(this.renderers.registry)) {
			if (renderer.intrinsics !== undefined) this.pragmaOwnedModules.add(renderer.intrinsics);
		}
		this.warn = typeof options.warn === 'function' ? options.warn : null;
		this.warnedOwnership = new Set();
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
			let canonicalRoot = dir;
			try {
				canonicalRoot = realpathSync(dir);
			} catch {
				// The manifest was readable, so this is only a defensive fallback for
				// unusual virtual filesystems. The resolved path is still stable locally.
			}
			result = {
				rule: {
					name: typeof pkg.name === 'string' ? pkg.name : null,
					root: dir,
					canonicalRoot,
					dirs: Array.isArray(manual) ? manual : [],
					runtimeDependencies: [
						...Object.keys(pkg.dependencies ?? {}),
						...Object.keys(pkg.optionalDependencies ?? {}),
					],
					viteOptimizeDepsExclusions: packageViteOptimizeDepsExclusions(pkg),
					usesOctane: packageUsesOctane(pkg),
					stateModel: pkg.octane?.stateModel,
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

	_applicationPackageRule(collected) {
		const application = this._nearestOctanePackageRule(this.root);
		if (collected !== undefined) addMetadata(collected, application);
		const name = application.rule?.name ?? null;
		if (name !== null && Object.hasOwn(this.stateModel.packages, name)) {
			const error = new Error(
				`compiler.stateModel.packages cannot select the application package ${JSON.stringify(name)}. Remove that package entry and use compiler.stateModel.default to select the application's model.`,
			);
			error.code = 'OCTANE_APPLICATION_STATE_MODEL_OVERRIDE';
			throw error;
		}
		return application;
	}

	_isApplicationPackageSource(file, lookup, application) {
		if (lookup.rule === null || application.rule === null) return false;
		if (lookup.rule.canonicalRoot !== application.rule.canonicalRoot) return false;
		// A malformed package nested under node_modules can otherwise inherit the
		// application's manifest. It is still a dependency boundary, never app code.
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		let packageRelative = null;
		if (isPathInside(application.rule.root, absoluteFile)) {
			packageRelative = relative(application.rule.root, absoluteFile);
		} else if (isPathInside(application.rule.canonicalRoot, absoluteFile)) {
			packageRelative = relative(application.rule.canonicalRoot, absoluteFile);
		} else {
			try {
				const canonicalFile = realpathSync(absoluteFile);
				if (isPathInside(application.rule.canonicalRoot, canonicalFile)) {
					packageRelative = relative(application.rule.canonicalRoot, canonicalFile);
				}
			} catch {
				// A virtual/nonexistent ID cannot prove same-package containment.
			}
		}
		return packageRelative !== null && !/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(packageRelative);
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

	_stateModelForSource(file, filename, collected) {
		// The package map is a dependency boundary, never a way to weaken the
		// application's own package. A nested workspace package remains its own
		// boundary even when its physical root sits below Vite's project root.
		const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(this.root, file);
		const lookup = this._nearestOctanePackageRule(dirname(absoluteFile));
		addMetadata(collected, lookup);
		const application = this._applicationPackageRule(collected);
		if (this._isApplicationPackageSource(file, lookup, application)) {
			return this.stateModel.default;
		}
		if (this._isProjectOwnedSource(file)) {
			// With no owning manifest, everything below the configured project root is
			// application source. A nearer manifest is the only way to establish a
			// nested package boundary.
			if (application.rule === null && lookup.rule === null) return this.stateModel.default;
		}
		const name = lookup.rule?.name ?? null;
		const declared = normalizePackageStateModel(lookup.rule?.stateModel, name);
		const configured =
			name !== null && Object.hasOwn(this.stateModel.packages, name)
				? this.stateModel.packages[name]
				: undefined;

		if (declared === 'permissive' && configured !== 'permissive') {
			const approval =
				name === null
					? 'Give the package an exact `name` in package.json, then approve that name in the consuming compiler configuration.'
					: `Approve it explicitly in the consuming configuration with \`compiler: { stateModel: { packages: { ${JSON.stringify(name)}: "permissive" } } }\`.`;
			const error = new Error(
				`${filename} belongs to ${name === null ? 'a dependency' : `dependency ${JSON.stringify(name)}`} that declares \`"octane": { "stateModel": "permissive" }\`, but permissive dependency code requires consumer approval. ${approval}`,
			);
			error.code = 'OCTANE_PERMISSIVE_PACKAGE_APPROVAL_REQUIRED';
			error.filename = filename;
			throw error;
		}

		return configured ?? declared ?? this.stateModel.default;
	}

	_isFullCompileSource(file, collected) {
		return (
			file.endsWith('.tsrx') ||
			(file.endsWith('.tsx') && this._isInstalledOctaneSource(file, collected))
		);
	}

	/**
	 * Does a leading `@jsxImportSource` pragma claim this module for Octane?
	 * `octane` itself and every registered renderer's intrinsics module count;
	 * a pragma naming a FOREIGN source (`react`, `@emotion/react`, …) does not
	 * claim the file — under the requireDirective gate the module behaves
	 * exactly like an unmarked one.
	 */
	_pragmaClaimsOwnership(code) {
		const pragmaModule = findLeadingJsxImportSourcePragma(code);
		return pragmaModule !== null && this.pragmaOwnedModules.has(pragmaModule);
	}

	/**
	 * The requireDirective ownership gate for one project-owned module.
	 * A project `.tsrx` is Octane's by extension — in an Octane pipeline
	 * nothing else compiles the syntax, so there is nothing to opt into;
	 * every other project module is Octane's only when `pragmaOwned` (its
	 * leading `@jsxImportSource` pragma names octane or a registered
	 * renderer's intrinsics module). This gate covers full compilation; the
	 * plain `.ts`/`.js` hook-slotting branch of `transform` applies the same
	 * pragma rule inline.
	 * Two carve-outs: installed and linked packages are exempt (their
	 * manifest `usesOctane` rule is already the explicit per-package
	 * decision), and `exclude` path fragments are never Octane's — tsrx
	 * syntax can target other renderers (e.g. `@tsrx/react`), so a project
	 * routing part of its `.tsrx` through a different tsrx compiler lists
	 * those paths in `exclude`, and the exclusion wins even over an
	 * ownership pragma.
	 */
	_passesOwnershipGate(file, filename, pragmaOwned) {
		if (!this.requireDirective) return true;
		if (!this._isProjectOwnedSource(file)) return true;
		if (this.exclude.some((path) => file.includes(path))) {
			this._warnExcludedPragmaConflict(file, filename, pragmaOwned);
			return false;
		}
		return file.endsWith('.tsrx') || pragmaOwned;
	}

	/**
	 * requireDirective diagnostic: an exclusion beats an ownership pragma,
	 * and the module stays with its excluded-path owner. Warn once so the
	 * conflicting signals never resolve as a silent no-op. Shared by the
	 * full-compile gate and the `.ts`/`.js` hook-slot exclusion. An excluded
	 * `.tsrx` is NOT a conflict — pairing extension ownership with `exclude`
	 * is exactly how a project routes `.tsrx` to another tsrx compiler.
	 */
	_warnExcludedPragmaConflict(file, filename, pragmaOwned) {
		if (!pragmaOwned || this.warn === null) return;
		if (!this._isProjectOwnedSource(file) || this.warnedOwnership.has(filename)) return;
		this.warnedOwnership.add(filename);
		this.warn(
			`${filename} declares Octane ownership with a leading @jsxImportSource pragma but matches an excluded path — the exclusion wins and Octane will not compile it.`,
		);
	}

	/**
	 * requireDirective diagnostic: a project-owned module (`.tsx`, `.ts`, or
	 * `.js`) imports from 'octane' but declared no ownership, so Octane
	 * leaves it to the host toolchain untouched — no compilation, no hook
	 * slotting. Usually a forgotten pragma; occasionally an intentional
	 * type-only or hook-free import — hence a warning, never an error.
	 */
	_warnUnmarkedOctaneImport(code, filename) {
		if (this.warn === null || this.warnedOwnership.has(filename)) return;
		if (!/from\s*['"]octane['"]/.test(code)) return;
		this.warnedOwnership.add(filename);
		this.warn(
			`${filename} imports from 'octane' but has no leading /** @jsxImportSource octane */ pragma — with requireDirective enabled, Octane will not compile or transform it. Add the pragma at the top of the module if Octane should own it.`,
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
	 * Resolve the effective authored-state policy for a source file.
	 *
	 * Non-TSRX transforms (notably MDX) use this boundary so package
	 * declarations, consumer approvals, linked dependencies, and watch metadata
	 * cannot diverge from the core compiler's classification.
	 */
	resolveStateModelForSource(id) {
		const file = cleanModuleId(id);
		const collected = {
			dependencies: new Set(),
			missingDependencies: new Set(),
		};
		return {
			stateModel: this._stateModelForSource(file, this._canonicalModuleId(file), collected),
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
		// Validate application-package overrides only after the bundler has supplied
		// its definitive root. Vite creates plugins before its config hook resolves
		// `config.root`, so constructor-time validation would inspect process.cwd().
		this._applicationPackageRule(collected);
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
			const lookupDirectory = resolvePackageLookupDirectory(name, issuerRoot, packageRequire);
			if (lookupDirectory !== null) {
				const lookup = this._nearestOctanePackageRule(lookupDirectory);
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
			} else {
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
	 * requireDirective ownership for code-less classification: a project
	 * `.tsrx` is Octane's by extension; any other project module needs its
	 * leading @jsxImportSource pragma read from disk. The transform (which
	 * receives real code) remains the authoritative gate; an unreadable file
	 * is conservatively not Octane's, so importers can never hold a client
	 * reference for a module whose own transform passes through to the host
	 * toolchain.
	 */
	_ownershipForFile(file) {
		if (!this.requireDirective) return true;
		if (!this._isProjectOwnedSource(file)) return true;
		if (this.exclude.some((path) => file.includes(path))) return false;
		if (file.endsWith('.tsrx')) return true;
		let code;
		try {
			code = readFileSync(isAbsolute(file) ? resolve(file) : resolve(this.root, file), 'utf8');
		} catch {
			return false;
		}
		return this._pragmaClaimsOwnership(code);
	}

	/** Classify a bundler-resolved module without loading or evaluating it. */
	clientReferenceForFile(id) {
		const file = cleanModuleId(id);
		const filename = this._canonicalModuleId(file);
		const renderer = resolveRendererForFile(this.renderers, filename);
		// A renderer rule can only claim modules Octane owns. Under the
		// requireDirective gate an unmarked project module belongs to the
		// host toolchain: no client reference, matching its pass-through
		// transform (server-graph identity must not split from output).
		if (renderer.server === 'client-only' && !this._ownershipForFile(file)) return null;
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
		const universalRuntime = normalizeUniversalRuntime(
			options.universalRuntime ?? this.defaults.universalRuntime,
		);
		const filename = this._canonicalModuleId(file);
		const clientOnlyImports =
			environment === 'server' && Array.isArray(options.clientOnlyImports)
				? options.clientOnlyImports
				: [];

		const renderer = resolveRendererForFile(this.renderers, filename);
		const plainHelperSource =
			(file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts');
		// Ownership is checked only where it can matter: outside the
		// requireDirective gate every eligible module already compiles, and a
		// project `.tsrx` is Octane's by extension — so only project `.tsx`
		// and plain `.ts`/`.js` are scanned for the leading pragma.
		const pragmaOwned =
			this.requireDirective &&
			(file.endsWith('.tsx') || plainHelperSource) &&
			this._isProjectOwnedSource(file) &&
			this._pragmaClaimsOwnership(code);
		const octaneMarked = file.endsWith('.tsrx') || pragmaOwned;
		const fullCompile =
			this._isFullCompileSource(file, collected) &&
			this._passesOwnershipGate(file, filename, pragmaOwned);
		// The narrow-the-rule config error concerns modules Octane owns. Under
		// the ownership gate a host-owned project module (unmarked, or in an
		// excluded path) may legitimately sit inside a client-only include in a
		// mixed repo — it passes through here, and clientReferenceForFile
		// returns no reference for it, so classification and transform agree.
		const hostOwned =
			this.requireDirective &&
			this._isProjectOwnedSource(file) &&
			(!octaneMarked || this.exclude.some((path) => file.includes(path)));
		if (!hostOwned) this._assertClientOnlySourceSupported(file, filename, renderer, collected);
		if (
			plainHelperSource &&
			renderer.target === 'universal' &&
			renderer.validation !== undefined &&
			this._isProjectOwnedSource(file) &&
			!this.exclude.some((path) => file.includes(path)) &&
			!hostOwned
		) {
			// Renderer rules also own the runtime assumptions of their project-local
			// helper modules. Validate those assumptions without claiming their output:
			// the existing hook-slot/pass-through branch below remains authoritative.
			validateRendererModuleSource(code, filename, renderer);
		}
		if (fullCompile) {
			const stateModel = this._stateModelForSource(file, filename, collected);
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
					stateModel,
					...finishMetadata(collected),
				};
			}
			const hasRendererBoundaries = Object.keys(this.renderers.boundaries).length > 0;
			const nativeChangeAnalysis = analyzeNativeChangeDiagnostics(
				parseModule(code, filename),
				code,
				filename,
				{
					dom: renderer.target === 'dom',
					renderer,
					rendererBoundaries: this.renderers.boundaries,
					rendererRegistry: this.renderers.registry,
				},
			);
			const nativeChangeDiagnostics = nativeChangeAnalysis.diagnostics;
			const hydratePreparation =
				environment === 'client'
					? prepareHydrateBoundaries(code, filename, hydrateBoundaryPath)
					: prepareServerHydrateBoundaries(code, filename);
			const compileSource = hydratePreparation?.source ?? code;
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
					? { __styleRemap: { authored: code, origins: hydratePreparation.origins } }
					: null),
				hmr,
				mode: environment,
				dev,
				profile,
				profileFilename,
				stateModel,
				...(universalRuntime === undefined ? null : { universalRuntime }),
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
				...(environment === 'client' && typeof options.isVoidComponentImport === 'function'
					? { isVoidComponentImport: options.isVoidComponentImport }
					: null),
			});
			if (hydratePreparation?.map && out.map) {
				out.map = composeSourceMaps(out.map, hydratePreparation.map);
				out.map = addSourceMapNeedles(out.map, out.code, code, hydratePreparation.mappingNeedles);
			}
			this._forwardCompileDiagnostics(out.diagnostics);
			return {
				code: out.code,
				map: out.map,
				diagnostics: out.diagnostics,
				kind: 'compile',
				stateModel,
				renderer,
				...(out.universalRuntime === undefined ? null : { universalRuntime: out.universalRuntime }),
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
			// Either not Octane-eligible, or an unmarked project module in a
			// requireDirective build — the host toolchain's JSX pipeline owns it.
			if (this.requireDirective && !pragmaOwned && this._isProjectOwnedSource(file)) {
				this._warnUnmarkedOctaneImport(code, filename);
			}
			return this._passThrough(code, collected);
		}

		if (plainHelperSource) {
			const importsOctane = /from\s*['"]octane['"]/.test(code);
			const noSlot = /\/\/\s*octane-no-slot\b/.test(code);
			const excluded = this.exclude.some((path) => file.includes(path));
			if (!this._isInstalledOctaneSource(file, collected)) {
				return !excluded && importsOctane ? this._passThrough(code, collected) : null;
			}
			// Hook slotting is an Octane-ownership rewrite, so the ownership
			// gate applies to it exactly as to full compilation: an unmarked
			// project module stays with the host pipeline (with the forgotten-
			// pragma diagnostic), a pragma-marked one gets its hook slots.
			if (this.requireDirective && !pragmaOwned && this._isProjectOwnedSource(file)) {
				if (importsOctane && !excluded) this._warnUnmarkedOctaneImport(code, filename);
				return null;
			}
			const stateModel = this._stateModelForSource(file, filename, collected);
			if (excluded && stateModel !== 'causal') {
				if (this.requireDirective) {
					this._warnExcludedPragmaConflict(file, filename, pragmaOwned);
				}
				return null;
			}
			// Causal provenance is definition-owned, so a plain custom-hook module
			// cannot escape stamping merely by importing only another custom hook (or
			// by accepting a setter) instead of importing a base hook from `octane`.
			// Permissive source preserves the historical direct-import eligibility gate.
			if (!importsOctane && stateModel !== 'causal') return null;
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const specializeVoidRoot =
				environment === 'client' && hmr === false && dev === false && profile === false;
			let slotsCompiled = false;
			let slotsOutput;
			const compileSlots = () => {
				if (slotsCompiled) return slotsOutput;
				slotsCompiled = true;
				slotsOutput = slotHooks(code, filename, {
					environment,
					hmr: !!hmr,
					profile,
					profileFilename,
					stateModel,
					...(specializeVoidRoot
						? {
								isVoidComponentImport: options.isVoidComponentImport,
							}
						: {}),
				});
				return slotsOutput;
			};
			if (excluded) {
				// `exclude` remains an ownership escape for permissive helpers and for
				// full-source modules routed through another TSRX toolchain. It cannot
				// silently turn an otherwise Octane-owned causal helper into unmarked
				// output when the causal slot pass proves component/custom-hook
				// provenance work. An unused or type-only import does not need that ABI.
				if (compileSlots() === null) {
					if (this.requireDirective) {
						this._warnExcludedPragmaConflict(file, filename, pragmaOwned);
					}
					return null;
				}
				const error = new Error(
					`${filename} matches compiler.exclude, so Octane cannot emit the causal-state provenance ABI required by this Octane-owned plain module. Remove the exclusion and let Octane slot the file. For third-party compatibility, declare and explicitly approve the owning package as permissive instead of excluding its path.`,
				);
				error.code = 'OCTANE_CAUSAL_EXCLUDE_UNSUPPORTED';
				error.filename = filename;
				throw error;
			}
			if (noSlot) {
				// Probe causal definition instrumentation before honoring the historical
				// opt-out. An unrelated plain module still passes through untouched, while
				// a custom-hook/component definition cannot silently lose its source model.
				if (stateModel !== 'causal' || compileSlots() === null) return null;
				const error = new Error(
					`${filename} uses // octane-no-slot, so the compiler cannot emit the causal-state provenance ABI for it. Remove the opt-out and let Octane slot the file, or keep the owning dependency at an explicitly approved permissive boundary while it migrates.`,
				);
				error.code = 'OCTANE_CAUSAL_NO_SLOT_UNSUPPORTED';
				error.filename = filename;
				throw error;
			}
			// From here the module is Octane-owned even when nothing gets
			// rewritten (manual slots, or no hooks to slot).
			if (this._hasManualHookSlots(file, collected)) {
				if (stateModel === 'causal') {
					// A direct base-hook import has always made this an Octane helper. For
					// newly admitted no-import source, reject only when there is causal ABI
					// work to suppress, so unrelated utilities in a manual directory remain
					// outside the compiler's ownership boundary.
					if (!importsOctane && compileSlots() === null) {
						return this._passThrough(code, collected);
					}
					const error = new Error(
						`${filename} is covered by an octane.hookSlots.manual declaration, so the compiler cannot emit the causal-state provenance ABI for it. Remove the manual-slot declaration and let Octane slot the file, or keep the owning dependency at the explicitly approved permissive boundary while it migrates.`,
					);
					error.code = 'OCTANE_CAUSAL_MANUAL_SLOTS_UNSUPPORTED';
					error.filename = filename;
					throw error;
				}
				return { ...this._passThrough(code, collected), stateModel };
			}
			const out = compileSlots();
			if (out === null) return this._passThrough(code, collected);
			this._forwardCompileDiagnostics(out.diagnostics);
			return {
				code: out.code,
				map: out.map,
				diagnostics: out.diagnostics,
				kind: 'slots',
				stateModel,
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
