/**
 * Bundler-neutral Octane source integration.
 *
 * This module owns every decision shared by Vite, Rspack, and future bundlers:
 * source eligibility, package-manifest rules, canonical compiler IDs, compiler
 * target/HMR options, raw-source dependency discovery, and runtime requests.
 * Bundler adapters are responsible only for translating their own lifecycle and
 * watch APIs to this small surface.
 */
// Namespace imports of node builtins — same browser-evaluation contract as
// vite.js: keep `octane/compiler`'s pure `compile` entry loadable in
// browser dev servers, where these resolve to an externalized shim.
import * as nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodeModule from 'node:module';
import * as nodePath from 'node:path';
import { parseModule } from '@tsrx/core';
export { DOM_BINDING_COMPILER_ABI_VERSION } from './dom-bindings.js';
import {
	compile,
	compileForBundler,
	createJsxReturnBranchClassifier,
	hasOnlyLowerableNullishExits,
	isVoidJsxCodeBlockFunction,
} from './compile.js';
import { validateRendererModuleSource } from './compile-universal.js';
import { collectReassignedBindings } from './hook-deps.js';
import { HYDRATE_QUERY_PARAM, hydrateBoundaryPathFromId } from './hydrate-boundaries.js';
import {
	formatDomBindingIslandRequest,
	formatDomBindingRequest,
	HYDRATE_ISLAND_RENDERER_QUERY,
	isHydrateIslandRendererRequest,
	parseDomBindingIslandRequest,
	parseDomBindingRequest,
} from './dom-binding-request.js';
import {
	DOM_RENDERER_MODULE,
	normalizeRendererConfig,
	resolveRendererForFile,
} from './renderers.js';
import { findLeadingJsxImportSourcePragma } from './pragma.js';
import { normalizeUniversalRuntime } from './universal-runtime.js';
import { formatCompileDiagnostic } from './native-change-diagnostics.js';
import {
	findVoidComponentImports,
	findVoidRootImports,
	parseHookSource,
	slotHooks,
} from './slot-hooks.js';
import { parseModule as parseAuthoredModule } from '#octane/compiler-parser';
import { declaresStrongMode } from './strong-mode.js';
import { lexStaticImportRequests, rewriteServerRuntimeRequests } from './runtime-requests.js';
import { assertNativeReadOptions } from './native-read-diagnostics.js';
import { findCssModuleImportRequests } from './css-module-imports.js';
import {
	assertNoLiveClientOnlyImports,
	createClientOnlyServerStub,
	createClientReference,
	findStaticRuntimeImportRequests,
} from './client-only-server.js';

export { findVoidComponentImports, findVoidRootImports };
// Tooling that decides module ownership the way `transform` does (the CLI's
// Strong coverage check) reads the pragma with the same scanner.
export { findLeadingJsxImportSourcePragma };
export {
	isPlainCssModuleId,
	readCssModuleExports,
	validateCssModuleConstants,
} from './css-module-imports.js';
export { HYDRATE_QUERY_PARAM } from './hydrate-boundaries.js';
export { analyzeIslandsShell } from './islands-shell.js';
export {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	CLIENT_REFERENCE_MANIFEST_VERSION,
	createClientReferenceManifest,
} from './client-only-server.js';
export const INDEPENDENT_HYDRATION_MANIFEST_FILENAME = 'octane-independent-hydration.json';
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

// Vite can classify descriptor exports from its transform-local preflight AST,
// but the neutral compiler must never trust caller-supplied facts or a naked
// authored AST. Only opaque objects registered here can bypass the established
// string classifier. An analysis receipt records this compiler's classification
// of one exact source digest and id, so the authority may reuse it across
// environments without retaining the source or AST. Each transform still gets a
// fresh proof, consumed once for its exact source/id.
const descriptorChildrenExportAnalyses = new WeakMap();
const descriptorChildrenExportProofs = new WeakMap();
const descriptorChildrenExportAuthorities = new WeakMap();

function descriptorSourceDigest(source) {
	return nodeCrypto.createHash('sha256').update(source).digest('base64url');
}

function consumeDescriptorChildrenExportProof(proof, source, id) {
	if (proof === null || typeof proof !== 'object') return null;
	const prepared = descriptorChildrenExportProofs.get(proof);
	descriptorChildrenExportProofs.delete(proof);
	if (prepared?.source !== source || prepared.id !== id) return null;
	return prepared.exports;
}

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
	const relativeFile = nodePath.relative(root, file);
	return (
		relativeFile !== '..' &&
		!relativeFile.startsWith('..' + nodePath.sep) &&
		!nodePath.isAbsolute(relativeFile)
	);
}

function normalizeModulePath(file) {
	return file.split(/[\\/]/).join('/');
}

/**
 * Return the stable ID embedded in hook keys and dev source metadata. Files
 * inside the project root use a root-relative POSIX path; files outside it use
 * a `../`-relative path, so builds do not depend on the checkout location.
 * Bundler query suffixes never enter compiler output or cache keys.
 */
export function canonicalModuleId(id, projectRoot) {
	const file = cleanModuleId(id);
	if (!projectRoot || !nodePath.isAbsolute(file)) return normalizeModulePath(file);
	const root = nodePath.resolve(projectRoot);
	const relativeFile = nodePath.relative(root, file);
	if (nodePath.isAbsolute(relativeFile)) return normalizeModulePath(file); // another Windows drive
	return (isPathInside(root, file) ? '/' : '') + normalizeModulePath(relativeFile);
}

export function resolveOctaneRuntimeRequest(request, environment) {
	if (request !== 'octane' && request !== 'octane/signals/client') return null;
	if (environment !== 'client' && environment !== 'server') {
		throw new Error(
			`Unknown Octane environment ${JSON.stringify(environment)} — expected 'client' or 'server'.`,
		);
	}
	return request === 'octane/signals/client'
		? environment === 'server'
			? 'octane/signals/server'
			: request
		: OCTANE_RUNTIME_REQUESTS[environment];
}

function packageDeclaresOctane(pkg) {
	return (
		pkg.name === 'octane' ||
		['dependencies', 'optionalDependencies', 'peerDependencies'].some(
			(field) => typeof pkg[field]?.octane === 'string',
		)
	);
}

/**
 * Does this package compile as Octane source?
 *
 * A declared `octane` dependency is the fast path and the only signal accepted
 * for an installed package, whose real path lies under `node_modules`, where a
 * hoisted copy of Octane says nothing about the package's own intent.
 *
 * A workspace or linked package outside `node_modules` may instead set
 * `octane.source` in its manifest. Such a repository pins Octane once in a
 * shared toolkit manifest and receives it transitively, so a version range in
 * every consumer was a compiler marker for a dependency the consumer does not
 * own the version of. The marker carries no version and stays an explicit
 * per-package decision, which is what exempts these packages from the
 * requireDirective ownership gate.
 */
function packageUsesOctane(pkg, dir) {
	if (packageDeclaresOctane(pkg)) return true;
	if (pkg.octane?.source !== true) return false;
	return !/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(realPathOrSelf(dir));
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

/**
 * Locate an installed package's manifest when `require.resolve` cannot open the
 * package entry. Workspace/source packages may advertise a `require` condition
 * that points at a prepack-only CommonJS build; discovery still needs the
 * package root so Vite can compile their authored source.
 */
function resolveInstalledPackageManifest(name, issuerRoot, collected) {
	let candidateRoot = nodePath.resolve(issuerRoot);
	for (;;) {
		const manifestPath = nodePath.join(candidateRoot, 'node_modules', name, 'package.json');
		if (nodeFs.existsSync(manifestPath)) {
			collected.dependencies.add(manifestPath);
			return manifestPath;
		}
		collected.missingDependencies.add(manifestPath);
		const parent = nodePath.dirname(candidateRoot);
		if (parent === candidateRoot) return null;
		candidateRoot = parent;
	}
}

function realPathOrSelf(dir) {
	try {
		return nodeFs.realpathSync(dir);
	} catch {
		return nodePath.resolve(dir);
	}
}

function metadata(dependencies = [], missingDependencies = []) {
	return { dependencies, missingDependencies };
}

const OCTANE_NO_SLOT = /\/\/\s*octane-no-slot\b/;

function isPlainHelperSource(file) {
	return (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts');
}

function importsHookRuntime(code) {
	return (
		/from\s*['"]octane['"]/.test(code) ||
		/from\s*['"]octane\/server['"]/.test(code) ||
		/from\s*['"]octane\/signals\/(?:client|server)['"]/.test(code) ||
		/from\s*['"]octane\/signals['"]/.test(code)
	);
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
	if (source && typeof source === 'object' && source.type === 'Program') {
		ast = source;
	} else {
		try {
			ast = parseModule(source, id);
		} catch {
			return [];
		}
	}
	// A live function export can change its return ABI through an authored write
	// or direct eval even without HMR. Share the lexical write proof used by memo
	// inference instead of treating a declaration's initial body as permanent.
	const reassigned = collectReassignedBindings(ast);
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
	const memoDependents = new Map();
	const hasLowerableJsxReturnBranches = createJsxReturnBranchClassifier(ast.body || []);
	// Mirrors the compile-time lowering decisions exactly (nullish-guard @{}
	// bodies AND React-style conditional JSX returns), so cross-module call-site
	// classification agrees with what each module actually compiled to.
	const isVoidFunction = (node) =>
		isVoidJsxCodeBlockFunction(node) ||
		hasOnlyLowerableNullishExits(node) ||
		hasLowerableJsxReturnBranches(node);
	for (const declaration of declarations) {
		if (declaration.type === 'FunctionDeclaration' && declaration.id?.name) {
			if (!reassigned.has(declaration.id) && isVoidFunction(declaration)) {
				voidBindings.add(declaration.id.name);
			}
			continue;
		}
		if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		// Resolve only the exact, immutable `const Export = memo(Local)` form. The
		// imported memo identity is lexical proof; method calls, comparators, and
		// arbitrary wrappers stay unknown. Index the reverse edges once so a chain
		// declared outermost-first does not rescan every declaration per link.
		for (const item of declaration.declarations || []) {
			const init = item.init;
			if (
				item.id?.type === 'Identifier' &&
				!reassigned.has(item.id) &&
				(init?.type === 'FunctionExpression' || init?.type === 'ArrowFunctionExpression') &&
				isVoidFunction(init)
			) {
				voidBindings.add(item.id.name);
			}
			if (
				item.id?.type !== 'Identifier' ||
				reassigned.has(item.id) ||
				init?.type !== 'CallExpression' ||
				init.callee?.type !== 'Identifier' ||
				!memoLocals.has(init.callee.name) ||
				init.arguments?.length !== 1 ||
				init.arguments[0]?.type !== 'Identifier'
			)
				continue;
			const target = init.arguments[0].name;
			let dependents = memoDependents.get(target);
			if (dependents === undefined) memoDependents.set(target, (dependents = []));
			dependents.push(item.id.name);
		}
	}
	const pending = [...voidBindings];
	for (let index = 0; index < pending.length; index++) {
		for (const dependent of memoDependents.get(pending[index]) ?? []) {
			if (voidBindings.has(dependent)) continue;
			voidBindings.add(dependent);
			pending.push(dependent);
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
				(declaration.id == null || !reassigned.has(declaration.id)) &&
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

// Runtime wrappers that return a component with their first argument's render
// ABI, by arity: the compiled single-root, warm-plan and presentation-view
// stamps, and a comparator-free `memo`. Compiled output imports them from the
// client runtime entry or its internal re-export.
const VOID_PRESERVING_WRAPPERS = new Map([
	['__s', 1],
	['bindPresentationView', 2],
	['markWarm', 2],
	['memo', 1],
]);
const VOID_WRAPPER_REQUESTS = new Set(['octane', 'octane/internal/client']);

// The value a parameterless IIFE evaluates to: compiled initializers run setup
// (style injection, event delegation) as `(() => (setup, Component))()`, which
// transpilers lower to `(function () { return setup, Component; })()`.
function immediateResult(call) {
	const callee = call.callee;
	if (
		call.optional === true ||
		call.arguments?.length !== 0 ||
		(callee?.type !== 'ArrowFunctionExpression' && callee?.type !== 'FunctionExpression') ||
		callee.async ||
		callee.generator ||
		callee.params?.length !== 0 ||
		// A named function expression can rebind its own name inside the body.
		callee.id != null
	)
		return null;
	if (callee.body?.type !== 'BlockStatement') return callee.body;
	const [statement, ...rest] = callee.body.body;
	return rest.length === 0 && statement?.type === 'ReturnStatement' ? statement.argument : null;
}

// Whether a function body can complete with a value. Nested functions and
// classes own their own returns.
function hasValueReturn(node) {
	if (!node || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some(hasValueReturn);
	switch (node.type) {
		case 'ReturnStatement':
			return node.argument != null;
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'ClassDeclaration':
		case 'ClassExpression':
			return false;
	}
	for (const key in node) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'range' || key === 'parent')
			continue;
		const value = node[key];
		if (value && typeof value === 'object' && hasValueReturn(value)) return true;
	}
	return false;
}

// The exports of a module's final JavaScript whose value is still a function
// that never returns a value: a synchronous function with no value `return`,
// directly, through a runtime wrapper above, or as a setup IIFE's result, and
// bound by a lexical binding nothing reassigns. Re-exports, namespace objects
// and every other shape stay unknown.
function compiledVoidExports(ast) {
	const reassigned = collectReassignedBindings(ast);
	const wrappers = new Map();
	// Top-level value bindings with a statically known value. Imports and other
	// declarations stay absent, so a reference to them is never void.
	const values = new Map();
	for (const node of ast.body || []) {
		if (node.type === 'ImportDeclaration') {
			if (!VOID_WRAPPER_REQUESTS.has(node.source?.value) || node.importKind === 'type') continue;
			for (const specifier of node.specifiers || []) {
				const imported = specifier.imported?.name ?? specifier.imported?.value;
				if (
					specifier.type === 'ImportSpecifier' &&
					specifier.importKind !== 'type' &&
					VOID_PRESERVING_WRAPPERS.has(imported)
				)
					wrappers.set(specifier.local.name, VOID_PRESERVING_WRAPPERS.get(imported));
			}
			continue;
		}
		const declaration =
			node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
				? node.declaration
				: node;
		if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
			if (!reassigned.has(declaration.id)) values.set(declaration.id.name, declaration);
		} else if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations || []) {
				if (item.id?.type === 'Identifier' && item.init != null && !reassigned.has(item.id))
					values.set(item.id.name, item.init);
			}
		}
	}

	const isVoid = (node, seen) => {
		switch (node?.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
				return !node.async && !node.generator && !hasValueReturn(node.body);
			case 'ArrowFunctionExpression':
				return !node.async && node.body?.type === 'BlockStatement' && !hasValueReturn(node.body);
			case 'Identifier': {
				if (seen.has(node.name)) return false;
				seen.add(node.name);
				return isVoid(values.get(node.name), seen);
			}
			case 'SequenceExpression':
				return isVoid(node.expressions?.at(-1), seen);
			case 'CallExpression': {
				if (node.optional === true) return false;
				if (node.callee?.type === 'Identifier') {
					const arity = wrappers.get(node.callee.name);
					return (
						arity !== undefined &&
						node.arguments?.length === arity &&
						node.arguments[0].type !== 'SpreadElement' &&
						isVoid(node.arguments[0], seen)
					);
				}
				const result = immediateResult(node);
				return result != null && isVoid(result, seen);
			}
		}
		return false;
	};

	const exports = [];
	for (const node of ast.body || []) {
		if (node.type === 'ExportDefaultDeclaration') {
			const declaration = node.declaration;
			// A named default function is a binding like any other.
			const value =
				declaration?.type === 'FunctionDeclaration' && declaration.id?.name
					? values.get(declaration.id.name)
					: declaration;
			if (isVoid(value, new Set())) exports.push('default');
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration' || node.source != null || node.exportKind === 'type')
			continue;
		const declaration = node.declaration;
		if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
			if (isVoid(values.get(declaration.id.name), new Set())) exports.push(declaration.id.name);
		} else if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations || []) {
				if (item.id?.type === 'Identifier' && isVoid(values.get(item.id.name), new Set()))
					exports.push(item.id.name);
			}
		} else if (declaration == null) {
			for (const specifier of node.specifiers || []) {
				const local = specifier.local?.name ?? specifier.local?.value;
				const exported = specifier.exported?.name ?? specifier.exported?.value;
				if (
					specifier.exportKind !== 'type' &&
					typeof exported === 'string' &&
					isVoid(values.get(local), new Set())
				)
					exports.push(exported);
			}
		}
	}
	return exports;
}

// The value bindings a module's static import declarations create.
function moduleImportBindings(ast) {
	const bindings = [];
	for (const node of ast.body || []) {
		if (
			node.type !== 'ImportDeclaration' ||
			node.importKind === 'type' ||
			typeof node.source?.value !== 'string'
		)
			continue;
		for (const specifier of node.specifiers || []) {
			if (specifier.importKind === 'type' || !specifier.local?.name) continue;
			const imported =
				specifier.type === 'ImportDefaultSpecifier'
					? 'default'
					: specifier.type === 'ImportNamespaceSpecifier'
						? '*'
						: (specifier.imported?.name ?? specifier.imported?.value);
			if (typeof imported === 'string')
				bindings.push({ local: specifier.local.name, request: node.source.value, imported });
		}
	}
	return bindings;
}

/**
 * Facts about a module's final JavaScript, after every bundler transform that
 * ran over Octane's output, or null when it does not parse:
 *
 * - `voidComponentExports`: exports that still cannot return a value. That is
 *   the whole runtime contract of a void root or void component call, which
 *   discards a return value such a function cannot produce. An adapter whose
 *   transforms can rewrite compiled output (transpiler lowering, other
 *   loaders) pairs {@link findVoidComponentExports}, the authored contract,
 *   with this check of the code that actually runs.
 * - `importBindings`: each value import binding as `{ local, request,
 *   imported }` (`imported` is `default` or `*` for those forms). Comparing
 *   the bindings Octane's output read a proof through with the final code's
 *   keeps a transform that rebinds an import from redirecting a specialized
 *   call.
 */
export function analyzeCompiledModule(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return null;
	}
	return {
		voidComponentExports: compiledVoidExports(ast),
		importBindings: moduleImportBindings(ast),
	};
}

export function findDescriptorChildrenExports(source, id) {
	let ast;
	try {
		ast = source && typeof source === 'object' ? source : parseModule(source, id);
	} catch {
		return [];
	}
	const markers = new Set();
	const bindings = new Set();
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		for (const specifier of node.specifiers || []) {
			if ((specifier.imported?.name ?? specifier.imported?.value) === 'descriptorChildren') {
				markers.add(specifier.local.name);
			}
		}
	}
	for (const node of ast.body || []) {
		const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			if (
				item.id?.type === 'Identifier' &&
				item.init?.type === 'CallExpression' &&
				item.init.callee?.type === 'Identifier' &&
				markers.has(item.init.callee.name) &&
				item.init.arguments?.length === 1
			)
				bindings.add(item.id.name);
		}
	}
	const exports = [];
	for (const node of ast.body || []) {
		if (node.type === 'ExportDefaultDeclaration') {
			const declaration = node.declaration;
			if (
				(declaration?.type === 'Identifier' && bindings.has(declaration.name)) ||
				(declaration?.type === 'CallExpression' &&
					declaration.callee?.type === 'Identifier' &&
					markers.has(declaration.callee.name) &&
					declaration.arguments?.length === 1)
			) {
				exports.push('default');
			}
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration') continue;
		if (node.declaration?.type === 'VariableDeclaration') {
			for (const item of node.declaration.declarations || []) {
				if (item.id?.type === 'Identifier' && bindings.has(item.id.name))
					exports.push(item.id.name);
			}
		}
		for (const specifier of node.specifiers || []) {
			if (bindings.has(specifier.local?.name))
				exports.push(specifier.exported?.name ?? specifier.exported?.value);
		}
	}
	return exports;
}

export function findDescriptorChildrenImports(source, id) {
	let ast;
	try {
		ast = source && typeof source === 'object' ? source : parseModule(source, id);
	} catch {
		return [];
	}
	const importedBindings = new Map();
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue;
		for (const specifier of node.specifiers || []) {
			if (specifier.type === 'ImportSpecifier') {
				importedBindings.set(specifier.local.name, {
					request: node.source.value,
					imported: specifier.imported?.name ?? specifier.imported?.value,
				});
			} else if (specifier.type === 'ImportDefaultSpecifier') {
				importedBindings.set(specifier.local.name, {
					request: node.source.value,
					imported: 'default',
				});
			}
		}
	}
	const jsxBindings = new Set();
	const visited = new WeakSet();
	const pending = [ast];
	while (pending.length > 0) {
		const value = pending.pop();
		if (value === null || typeof value !== 'object' || visited.has(value)) continue;
		visited.add(value);
		// Match void-import discovery: JSX tags use openingElement.name
		// (JSXIdentifier), while TSRX Element nodes expose the tag as id/name
		// (Identifier). Only JSXOpeningElement/JSXIdentifier missed the latter.
		if (value.type === 'JSXElement' || value.type === 'Element') {
			const tag = value.openingElement?.name || value.id || value.name;
			if (tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') {
				jsxBindings.add(tag.name);
			}
		}
		for (const [key, child] of Object.entries(value)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(child)) pending.push(...child);
			else pending.push(child);
		}
	}
	const candidates = [];
	for (const [local, imported] of importedBindings) {
		if (jsxBindings.has(local)) candidates.push({ ...imported, local });
	}
	for (const node of ast.body || []) {
		if (node.type === 'ExportDefaultDeclaration') {
			if (node.declaration?.type === 'Identifier') {
				const imported = importedBindings.get(node.declaration.name);
				if (imported !== undefined) candidates.push({ ...imported, exported: 'default' });
			}
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration') continue;
		for (const specifier of node.specifiers || []) {
			const exported = specifier.exported?.name ?? specifier.exported?.value;
			if (node.source?.value) {
				candidates.push({
					request: node.source.value,
					imported: specifier.local?.name ?? specifier.local?.value,
					exported,
				});
				continue;
			}
			const imported = importedBindings.get(specifier.local?.name);
			if (imported !== undefined) candidates.push({ ...imported, exported });
		}
	}
	return candidates;
}

class OctaneBundlerCompiler {
	constructor(options) {
		assertNativeReadOptions(options);
		if (options.strong !== undefined && typeof options.strong !== 'boolean') {
			throw new TypeError('Octane compiler `strong` must be a boolean when provided.');
		}
		this.root = nodePath.resolve(options.root ?? process.cwd());
		try {
			this.realRoot = nodeFs.realpathSync(this.root);
		} catch {
			this.realRoot = this.root;
		}
		this.exclude = [...(options.exclude ?? [])];
		this.defaults = {
			environment: options.environment ?? 'client',
			hmr: normalizeHmrDialect(options.hmr),
			dev: options.dev,
			profile: options.profile === true,
			inlineHookMemo: options.inlineHookMemo !== false,
			strong: options.strong === true,
			knownAttributeSpreads: options.knownAttributeSpreads,
			domBindingFixedProps: options.domBindingFixedProps,
			opaqueSignalHandles: options.opaqueSignalHandles === true,
			universalRuntime: normalizeUniversalRuntime(options.universalRuntime),
		};
		this.renderers = normalizeRendererConfig(options.renderers);
		// Ownership gate for mixed-toolchain projects (e.g. a React app hosting
		// Octane islands): when enabled, a project `.tsrx` is Octane's by
		// extension (nothing else compiles the syntax), and a project
		// `.tsx`/`.ts`/`.js` is Octane's only if it opens with a leading
		// `/** @jsxImportSource octane */` pragma (the `octane/strong` type
		// surface and registered renderer intrinsics also count) — full
		// compilation for `.tsx`, hook slotting for plain `.ts`/`.js`. A leading
		// pragma naming a foreign source (`react`, …) does NOT claim the file. Unmarked project
		// modules pass through to the host toolchain. Installed/linked
		// packages keep their manifest `usesOctane` decision. The pragma
		// always ships unchanged — it is meaningful to TypeScript and
		// downstream tools (in a JSX-less `.ts`/`.js` module TypeScript
		// ignores it, so there it acts purely as the ownership marker).
		this.requireDirective = options.requireDirective === true;
		this.pragmaOwnedModules = new Set([DOM_RENDERER_MODULE, 'octane/strong']);
		for (const renderer of Object.values(this.renderers.registry)) {
			if (renderer.intrinsics !== undefined) this.pragmaOwnedModules.add(renderer.intrinsics);
		}
		this.warn = typeof options.warn === 'function' ? options.warn : null;
		descriptorChildrenExportAuthorities.set(this, options._descriptorPreflightAuthority ?? null);
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
		const changed = nodePath.resolve(cleanModuleId(path));
		// Both cache families retain only present or missing package manifests.
		// Ordinary source edits still start a diagnostic generation above, but
		// cannot invalidate either cache.
		if (nodePath.basename(changed) !== 'package.json') return;
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
		const dir = nodePath.resolve(fileDir);
		const cached = this.manifestRuleCache.get(dir);
		if (cached !== undefined) return cached;

		// Node's package scope lookup stops at a `node_modules` directory, so a
		// file that reaches one without a manifest belongs to no package. That
		// covers build caches such as `node_modules/.vite`, `.nitro`, and
		// `.cache`, whose already-compiled output must not inherit the
		// application manifest that installed them.
		if (nodePath.basename(dir) === 'node_modules') {
			const result = { rule: null, ...metadata() };
			this.manifestRuleCache.set(dir, result);
			return result;
		}

		const manifest = nodePath.join(dir, 'package.json');
		let pkg = null;
		try {
			pkg = JSON.parse(nodeFs.readFileSync(manifest, 'utf8'));
		} catch {
			// An absent/unreadable/invalid manifest does not own the file. Continue
			// upward, while retaining the path as watch/cache metadata.
		}

		let result;
		if (pkg !== null) {
			const manual = pkg.octane?.hookSlots?.manual;
			const usesOctane = packageUsesOctane(pkg, dir);
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
					usesOctane,
				},
				...metadata([manifest]),
			};
		} else {
			const parent = nodePath.dirname(dir);
			const inherited =
				parent === dir ? { rule: null, ...metadata() } : this._nearestOctanePackageRule(parent);
			result = {
				rule: inherited.rule,
				dependencies: nodeFs.existsSync(manifest)
					? [manifest, ...inherited.dependencies]
					: inherited.dependencies,
				missingDependencies: nodeFs.existsSync(manifest)
					? inherited.missingDependencies
					: [manifest, ...inherited.missingDependencies],
			};
		}

		this.manifestRuleCache.set(dir, result);
		return result;
	}

	_hasManualHookSlots(file, collected) {
		const lookup = this._nearestOctanePackageRule(nodePath.dirname(file));
		addMetadata(collected, lookup);
		if (lookup.rule === null) return false;
		const relativeFile = nodePath.relative(lookup.rule.root, file);
		return lookup.rule.dirs.some((directory) => {
			const relativeDirectory = directory
				.replace(/[\\/]+$/, '')
				.split(/[\\/]/)
				.join(nodePath.sep);
			return (
				relativeDirectory !== '' &&
				(relativeFile === relativeDirectory ||
					relativeFile.startsWith(relativeDirectory + nodePath.sep))
			);
		});
	}

	_isProjectOwnedSource(file) {
		const absoluteFile = nodePath.isAbsolute(file)
			? nodePath.resolve(file)
			: nodePath.resolve(this.root, file);
		if (/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(absoluteFile)) return false;
		return isPathInside(this.root, absoluteFile) || isPathInside(this.realRoot, absoluteFile);
	}

	_hasApplicationStrongPolicy(file, collected) {
		if (!this._isProjectOwnedSource(file)) return false;
		const absoluteFile = nodePath.isAbsolute(file)
			? nodePath.resolve(file)
			: nodePath.resolve(this.root, file);
		const application = this._nearestOctanePackageRule(this.root);
		const source = this._nearestOctanePackageRule(nodePath.dirname(absoluteFile));
		addMetadata(collected, application);
		addMetadata(collected, source);
		return (
			application.rule === null ||
			source.rule === null ||
			application.rule.root === source.rule.root
		);
	}

	/**
	 * How Strong mode reaches one module that Octane compiles: through its own
	 * `"use strong"` directive, through this compiler's application `strong`
	 * policy, both, or neither. `transform` makes the same decision inline;
	 * tooling reads it here (`octane analyze` builds its Strong coverage check
	 * on it) so the policy is never re-derived outside the compiler. Whether
	 * Octane compiles the module at all (`exclude`, `requireDirective`) is a
	 * separate question this does not answer.
	 *
	 * @param {string} code
	 * @param {string} id
	 * @returns {{ strong: boolean, directive: boolean, config: boolean }}
	 */
	strongModuleStatus(code, id) {
		const file = cleanModuleId(id);
		const config =
			this.defaults.strong === true &&
			this._hasApplicationStrongPolicy(file, {
				dependencies: new Set(),
				missingDependencies: new Set(),
			});
		const directive =
			code.includes('use strong') &&
			declaresStrongMode(
				/\.(?:tsrx|tsx|jsx)$/.test(file)
					? parseAuthoredModule(code, file)
					: parseHookSource(code, file).ast,
			);
		return { strong: config || directive, directive, config };
	}

	_isInstalledOctaneSource(file, collected) {
		// Project-owned TS/JS/TSX is always eligible. A linked package is commonly
		// handed to bundlers as its real path, without a node_modules segment, so
		// external files must make the same manifest-declared Octane decision as an
		// installed package instead of being mistaken for application source.
		if (this._isProjectOwnedSource(file)) return true;
		const absoluteFile = nodePath.isAbsolute(file)
			? nodePath.resolve(file)
			: nodePath.resolve(this.root, file);
		const lookup = this._nearestOctanePackageRule(nodePath.dirname(absoluteFile));
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
	 * Does a leading `@jsxImportSource` pragma claim this module for Octane?
	 * `octane`, its Strong type surface, and registered renderer intrinsics count;
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
	 * leading `@jsxImportSource` pragma names octane, octane/strong, or a
	 * registered renderer's intrinsics module). This gate covers full compilation;
	 * the plain `.ts`/`.js` hook-slotting branch of `transform` applies the same
	 * pragma rule inline.
	 * Two carve-outs: installed and linked packages are exempt (their
	 * manifest `usesOctane` rule — a declared `octane` dependency, or
	 * `octane.source` for a package outside `node_modules` — is already the
	 * explicit per-package decision), and `exclude` path fragments are never
	 * Octane's — tsrx
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
		if (!/from\s*['"]octane(?:\/signals\/(?:client|server))?['"]/.test(code)) return;
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
		const absoluteFile = nodePath.isAbsolute(file)
			? nodePath.resolve(file)
			: nodePath.resolve(this.root, file);
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
		const lookup = this._nearestOctanePackageRule(nodePath.dirname(absoluteFile));
		addMetadata(collected, lookup);
		if (lookup.rule?.name) {
			const packagePath = normalizeModulePath(nodePath.relative(lookup.rule.root, absoluteFile));
			return `/@package/${encodeURIComponent(lookup.rule.name)}/${packagePath}`;
		}

		// Never embed an arbitrary absolute host path in profiling metadata. The
		// basename fallback may collide, but remains useful and deliberately makes
		// that limitation visible through the reserved external namespace.
		return `/@external/${nodePath.basename(absoluteFile)}`;
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
			const candidate = nodePath.join(candidateRoot, 'package.json');
			if (nodeFs.existsSync(candidate)) {
				collected.dependencies.add(candidate);
				projectManifestPath = candidate;
				projectManifestRoot = candidateRoot;
				try {
					projectManifest = JSON.parse(nodeFs.readFileSync(candidate, 'utf8'));
				} catch {
					// The nearest manifest owns this root even when it is temporarily
					// unreadable or invalid. Do not silently inherit a parent package.
				}
				break;
			}
			collected.missingDependencies.add(candidate);
			const parent = nodePath.dirname(candidateRoot);
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
			const packageRequire = nodeModule.createRequire(nodePath.join(issuerRoot, 'package.json'));
			let entry;
			try {
				entry = packageRequire.resolve(name);
			} catch {
				// Match Node's upward node_modules search: package managers commonly
				// satisfy a nested raw-source dependency by hoisting it to the project
				// root. Prefer the installed manifest when the package entry itself is
				// unresolvable (for example a require condition targeting a missing
				// prepack-only CommonJS build).
				entry = resolveInstalledPackageManifest(name, issuerRoot, collected);
				if (entry === null) return;
			}
			const lookup = this._nearestOctanePackageRule(nodePath.dirname(entry));
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
				packageRoot = nodeFs.realpathSync(packageRoot);
			} catch {
				// Keep the resolved/symlink path as the cycle key.
			}
			if (visitedPackageRoots.has(packageRoot)) return;
			visitedPackageRoots.add(packageRoot);
			for (const dependency of lookup.rule.runtimeDependencies) {
				visit(dependency, lookup.rule.root);
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
		if (
			nodePath.isAbsolute(file) &&
			!isPathInside(this.root, file) &&
			isPathInside(this.realRoot, file)
		) {
			return canonicalModuleId(file, this.realRoot);
		}
		return canonicalModuleId(file, this.root);
	}

	/** Static requests adapters resolve before a server transform. */
	findServerImportRequests(code, id) {
		const filename = this._canonicalModuleId(id);
		// Plain JavaScript spells every runtime request as module syntax, so the
		// lexer reads them without a full parse. It can also report a Flow
		// `import type`, which the client-only live-use check already skips.
		if (typeof code === 'string' && /\.[cm]?js$/.test(filename)) {
			const requests = lexStaticImportRequests(code, filename);
			if (requests !== null) return requests;
		}
		return findStaticRuntimeImportRequests(code, filename);
	}

	/**
	 * @internal How much of a module an adapter preflight must classify, decided
	 * from its id, manifests, and text without parsing it. `'compile'`: Octane
	 * may compile it, and compilation reads every authored fact. `'slots'`: a
	 * plain module that may be hook-slotted, which reads only its void-component
	 * imports. `'none'`: `transform` passes it through without reading any of
	 * them. Server client-only classification and a virtual barrel's descriptor
	 * re-exports apply to every module whatever its scope.
	 */
	_preflightScope(code, id) {
		const file = cleanModuleId(id);
		const collected = { dependencies: new Set(), missingDependencies: new Set() };
		if (this._isFullCompileSource(file, collected)) return 'compile';
		return isPlainHelperSource(file) && this._mayHookSlot(code, file, collected) ? 'slots' : 'none';
	}

	/**
	 * The parse-free gates in front of plain `.ts`/`.js` hook slotting, in the
	 * order `transform` applies them. A module failing one always passes
	 * through; one passing them all can still be declined by the ownership,
	 * manual-slot, and pragma checks that follow.
	 */
	_mayHookSlot(code, file, collected) {
		return (
			!OCTANE_NO_SLOT.test(code) &&
			!this.exclude.some((path) => file.includes(path)) &&
			// Manual factories can import only other binding helpers, so their
			// escaping hooks still need a provider boundary. Unrelated helpers keep
			// their cheap pass-through without collecting unused manifest watches.
			(importsHookRuntime(code) || /(?:\b|_)use[A-Z]/.test(code)) &&
			this._isInstalledOctaneSource(file, collected)
		);
	}

	/** @internal Classify descriptor exports from a read-only AST into a reusable receipt. */
	_analyzeDescriptorChildrenExports(authority, source, id, ast) {
		if (
			authority === null ||
			authority !== descriptorChildrenExportAuthorities.get(this) ||
			typeof source !== 'string' ||
			typeof id !== 'string' ||
			ast === null ||
			typeof ast !== 'object' ||
			ast.type !== 'Program'
		) {
			throw new TypeError('Invalid descriptor-children preflight input.');
		}
		const exports = findDescriptorChildrenExports(ast, id);
		const receipt = Object.freeze({});
		descriptorChildrenExportAnalyses.set(receipt, {
			compiler: this,
			digest: descriptorSourceDigest(source),
			id,
			// Parser names can be V8 slices of the whole source; copy them so a
			// cached receipt never keeps that source alive.
			exports: Object.freeze(exports.length === 0 ? exports : structuredClone(exports)),
		});
		return receipt;
	}

	/** @internal Mint a one-transform proof from a receipt for this exact source/id. */
	_prepareDescriptorChildrenExports(authority, receipt, source, id) {
		if (
			authority === null ||
			authority !== descriptorChildrenExportAuthorities.get(this) ||
			typeof source !== 'string' ||
			typeof id !== 'string'
		) {
			throw new TypeError('Invalid descriptor-children preflight input.');
		}
		const analysis = descriptorChildrenExportAnalyses.get(receipt);
		// A receipt from another compiler, module query, or source falls back to
		// the compiler's own string classifier rather than transferring facts.
		if (
			analysis?.compiler !== this ||
			analysis.id !== id ||
			analysis.digest !== descriptorSourceDigest(source)
		) {
			return null;
		}
		const proof = Object.freeze({});
		descriptorChildrenExportProofs.set(proof, { source, id, exports: analysis.exports });
		return proof;
	}

	/** CSS proof discovery uses the same ownership gate as the eventual compile. */
	findCssModuleImportRequests(code, id, environment = 'client', parsedAst = null) {
		if (typeof code !== 'string' || !code.includes('.module.')) return [];
		// The live-read witness currently follows DOM host ownership only. Even
		// a DOM-owned module can delegate a JSX-valued prop to another renderer.
		if (Object.keys(this.renderers.boundaries).length > 0) return [];
		const file = cleanModuleId(id);
		const collected = { dependencies: new Set(), missingDependencies: new Set() };
		if (!this._isFullCompileSource(file, collected)) return [];
		const filename = this._canonicalModuleId(file);
		const pragmaOwned =
			this.requireDirective &&
			file.endsWith('.tsx') &&
			this._isProjectOwnedSource(file) &&
			this._pragmaClaimsOwnership(code);
		if (!this._passesOwnershipGate(file, filename, pragmaOwned)) return [];
		const renderer = resolveRendererForFile(this.renderers, filename);
		if (
			renderer.target !== 'dom' ||
			(environment === 'server' && renderer.server === 'client-only')
		) {
			return [];
		}
		return findCssModuleImportRequests(parsedAst ?? code, filename);
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
			code = nodeFs.readFileSync(
				nodePath.isAbsolute(file) ? nodePath.resolve(file) : nodePath.resolve(this.root, file),
				'utf8',
			);
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
		assertNativeReadOptions(options);
		const preparedDescriptorChildrenExports = consumeDescriptorChildrenExportProof(
			options._descriptorChildrenExportsProof,
			code,
			id,
		);
		const file = cleanModuleId(id);
		const hydrateBoundaryPath = hydrateBoundaryPathFromId(id);
		const bindingRequest = parseDomBindingRequest(id);
		const islandRequest = parseDomBindingIslandRequest(id);
		if ((bindingRequest !== null || islandRequest !== null) && hydrateBoundaryPath !== null) {
			throw new Error('Octane DOM binding and Hydrate queries cannot be combined.');
		}
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
		const inlineHookMemo = (options.inlineHookMemo ?? this.defaults.inlineHookMemo) !== false;
		// An application's global policy never leaks into installed or linked
		// compatibility packages, including workspace packages nested inside the
		// project root. Modules may still opt themselves in with their own
		// directive, which the authored-source compiler resolves separately.
		const strong =
			(options.strong ?? this.defaults.strong) === true &&
			this._hasApplicationStrongPolicy(file, collected);
		const universalRuntime = normalizeUniversalRuntime(
			options.universalRuntime ?? this.defaults.universalRuntime,
		);
		const filename = this._canonicalModuleId(file);
		const targetRuntimeRequests = (source, kind, streamedSignals = false) => {
			if (environment !== 'server' || options.explicitRuntimeRequests !== true) return null;
			const runtimeResult = rewriteServerRuntimeRequests(source, filename);
			if (runtimeResult === null) return null;
			return {
				code: runtimeResult.code,
				map: runtimeResult.map,
				kind,
				...(streamedSignals ? { streamedSignals: true } : null),
				...finishMetadata(collected),
			};
		};
		const passThrough = () => {
			return targetRuntimeRequests(code, 'runtime-requests') ?? this._passThrough(code, collected);
		};
		const clientOnlyImports =
			environment === 'server' && Array.isArray(options.clientOnlyImports)
				? options.clientOnlyImports
				: [];

		const renderer = resolveRendererForFile(this.renderers, filename);
		const plainHelperSource = isPlainHelperSource(file);
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
		if ((bindingRequest !== null || islandRequest !== null) && !fullCompile) {
			throw new Error('Octane DOM binding queries require a compiler-owned .tsrx/.tsx view.');
		}
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
			(renderer.target === 'universal' || renderer.target === 'valdi') &&
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
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const clientReference =
				renderer.server === 'client-only' ? createClientReference(renderer.id, filename) : null;
			if (environment === 'server' && clientReference !== null) {
				const stub = createClientOnlyServerStub(code, filename, renderer.id);
				return {
					ast: stub.ast,
					code: stub.code,
					map: stub.map,
					kind: 'client-only-stub',
					renderer,
					clientReference,
					clientOnlyExports: stub.exports,
					...finishMetadata(collected),
				};
			}
			const hasRendererBoundaries = Object.keys(this.renderers.boundaries).length > 0;
			const collectCssModuleConstants =
				renderer.target === 'dom' &&
				!hasRendererBoundaries &&
				typeof options.resolveCssModuleConstant === 'function';
			const compileFilename =
				islandRequest !== null
					? formatDomBindingIslandRequest(filename, islandRequest)
					: bindingRequest !== null
						? formatDomBindingRequest(filename, bindingRequest)
						: hydrateBoundaryPath === null
							? filename
							: `${filename}?${HYDRATE_QUERY_PARAM}=${encodeURIComponent(hydrateBoundaryPath)}${
									isHydrateIslandRendererRequest(id) ? `&${HYDRATE_ISLAND_RENDERER_QUERY}=1` : ''
								}`;
			const compileOptions = {
				hmr,
				mode: environment,
				dev,
				...(renderer.target === 'dom' &&
				(options.knownAttributeSpreads ?? this.defaults.knownAttributeSpreads) !== undefined
					? {
							knownAttributeSpreads:
								options.knownAttributeSpreads ?? this.defaults.knownAttributeSpreads,
						}
					: null),
				...(renderer.target === 'dom' && options.textTypeFacts !== undefined
					? { textTypeFacts: options.textTypeFacts }
					: null),
				...(renderer.target === 'dom' &&
				(options.domBindingFixedProps ?? this.defaults.domBindingFixedProps) !== undefined
					? {
							domBindingFixedProps:
								options.domBindingFixedProps ?? this.defaults.domBindingFixedProps,
						}
					: null),
				...(renderer.target === 'dom' &&
				(options.opaqueSignalHandles ?? this.defaults.opaqueSignalHandles) === true
					? { opaqueSignalHandles: true }
					: null),
				profile,
				profileFilename,
				...(inlineHookMemo ? null : { inlineHookMemo: false }),
				...(strong ? { strong: true } : null),
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
				...(typeof options.isDescriptorChildrenImport === 'function'
					? { isDescriptorChildrenImport: options.isDescriptorChildrenImport }
					: null),
				...(collectCssModuleConstants
					? {
							resolveCssModuleConstant: options.resolveCssModuleConstant,
							...(options.preserveCssModuleReferences === undefined
								? null
								: { preserveCssModuleReferences: options.preserveCssModuleReferences }),
						}
					: null),
			};
			const collectVoidComponentExports =
				environment === 'client' && options.collectVoidComponentExports === true;
			let out;
			let voidComponentAst = null;
			let cssModuleConstantImports;
			let independentWidgets;
			const collectIndependentWidgets = code.includes('Hydrate') && code.includes('independent');
			if (collectVoidComponentExports || collectCssModuleConstants || collectIndependentWidgets) {
				const compilation = compileForBundler(code, compileFilename, compileOptions);
				out = compilation.result;
				if (collectIndependentWidgets) independentWidgets = compilation.independentWidgets;
				if (collectVoidComponentExports) voidComponentAst = compilation.hydrateAst;
				if (collectCssModuleConstants) {
					cssModuleConstantImports = compilation.cssModuleConstantImports;
				}
			} else {
				out = compile(code, compileFilename, compileOptions);
			}
			this._forwardCompileDiagnostics(out.diagnostics);
			return {
				code: out.code,
				map: out.map,
				diagnostics: out.diagnostics,
				kind: 'compile',
				...(out.streamedSignals === true ? { streamedSignals: true } : null),
				...(out.bindingConstants === undefined ? null : { bindingConstants: out.bindingConstants }),
				renderer,
				...(out.universalRuntime === undefined ? null : { universalRuntime: out.universalRuntime }),
				...(clientReference === null ? null : { clientReference }),
				...(voidComponentAst === null
					? null
					: {
							voidComponentExports: findVoidComponentExports(voidComponentAst, filename),
						}),
				...(cssModuleConstantImports === undefined ? null : { cssModuleConstantImports }),
				...(independentWidgets === undefined ? null : { independentWidgets }),
				descriptorChildrenExports:
					preparedDescriptorChildrenExports === null
						? findDescriptorChildrenExports(code, filename)
						: [...preparedDescriptorChildrenExports],
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
			return passThrough();
		}

		if (plainHelperSource) {
			if (!this._mayHookSlot(code, file, collected)) {
				// Same conflict diagnostic as the full-compile gate: an ownership
				// pragma inside an excluded path must not fail silent.
				if (
					this.requireDirective &&
					!OCTANE_NO_SLOT.test(code) &&
					this.exclude.some((path) => file.includes(path))
				) {
					this._warnExcludedPragmaConflict(file, filename, pragmaOwned);
				}
				return passThrough();
			}
			const hasHookRuntimeImport = importsHookRuntime(code);
			// Hook slotting is an Octane-ownership rewrite, so the ownership
			// gate applies to it exactly as to full compilation: an unmarked
			// project module stays with the host pipeline (with the forgotten-
			// pragma diagnostic), a pragma-marked one gets its hook slots.
			if (this.requireDirective && !pragmaOwned && this._isProjectOwnedSource(file)) {
				this._warnUnmarkedOctaneImport(code, filename);
				return passThrough();
			}
			const manualSlots = this._hasManualHookSlots(file, collected);
			if (
				!hasHookRuntimeImport &&
				!manualSlots &&
				!pragmaOwned &&
				!this._pragmaClaimsOwnership(code)
			)
				return passThrough();
			const inlinePlainMemo =
				inlineHookMemo &&
				environment === 'client' &&
				hmr === false &&
				dev === false &&
				profile === false &&
				renderer.target === 'dom' &&
				universalRuntime === undefined;
			// Manual modules still need observed tuple capabilities. slotHooks keeps
			// their authored slots and dependencies while selecting getter helpers.
			const profileFilename = profile ? this._profileModuleId(file, collected) : undefined;
			const specializeVoidRoot =
				!manualSlots &&
				environment === 'client' &&
				hmr === false &&
				dev === false &&
				profile === false;
			const out = slotHooks(code, filename, {
				environment,
				hmr: !!hmr,
				dev,
				profile,
				profileFilename,
				inlineHookMemo: inlinePlainMemo,
				...(manualSlots ? { manualSlots: true } : null),
				...(strong ? { strong: true } : null),
				renderer,
				...(specializeVoidRoot
					? {
							isVoidComponentImport: options.isVoidComponentImport,
						}
					: {}),
			});
			if (out === null) return passThrough();
			// Strong plain modules report nonfatal hints like compiled modules do.
			this._forwardCompileDiagnostics(out.diagnostics);
			const slotted = targetRuntimeRequests(out.code, 'slots', out.streamedSignals) ?? {
				code: out.code,
				map: out.map,
				kind: 'slots',
				...(out.streamedSignals === true ? { streamedSignals: true } : null),
				...finishMetadata(collected),
			};
			return out.diagnostics === undefined ? slotted : { ...slotted, diagnostics: out.diagnostics };
		}

		return passThrough();
	}
}

export function createOctaneCompiler(options = {}) {
	return new OctaneBundlerCompiler(options);
}

/** Backwards-compatible convenience for callers that only need package names. */
export function discoverOctaneSourceDependencies(projectRoot) {
	return createOctaneCompiler({ root: projectRoot }).discoverSourceDependencies().packages;
}
