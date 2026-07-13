/**
 * Vite plugin for compiling .tsrx files via octane/compiler compiler.
 *
 * Per-module target is chosen from Vite's SSR signal: a module compiled for the
 * server environment uses `mode: 'server'` (SSR HTML output), everything else
 * uses `mode: 'client'` (template-clone DOM runtime). This auto-detection is
 * what a standard Vite SSR setup relies on — the SAME `.tsrx` is compiled to
 * client code for the browser bundle and to server code when loaded through
 * `ssrLoadModule` / an SSR build (see playground/octane-ssr).
 *
 * Options:
 *   - `ssr`: force the target for EVERY module — `true` always compiles server
 *     mode, `false` always client. Leave it unset (the default) to use the
 *     per-module auto-detection above. Useful for a dedicated server build.
 *   - `hmr`: defaults to on in serve mode and is always off for SSR; pass
 *     `true`/`false` to override the client default.
 *   - `parallelUse`: the parallel-`use()` pipeline (auto-memoized creations,
 *     hoisted parallel starts, batched unwrap, fetch-tree warming —
 *     docs/suspense-parallel-use-plan.md). ON by default (client mode); pass
 *     `false` to opt out and restore React-timing waterfall semantics.
 *   - `exclude`: ad-hoc path fragments the `.ts`/`.js` hook-slotting pass must
 *     skip. Rarely needed — a library whose sources hand-forward hook slots
 *     declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its own
 *     package.json and is skipped automatically (see hasManualHookSlots below).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { compile } from './compile.js';
import { slotHooks } from './slot-hooks.js';

// A binding whose `.ts`/`.js` sources hand-forward hook slots (explicit slot
// symbols / subSlot composition) declares it ONCE in its own package.json,
// listing the package-relative directories those sources live in:
//
//   "octane": { "hookSlots": { "manual": ["src"] } }
//
// The surgical slot pass walks up from each candidate file to the NEAREST
// package.json and skips the file when it sits under a declared directory — so
// the trait travels with the package into every consumer (root vitest
// projects, the website, examples, builds) instead of being repeated as
// per-config `exclude` path lists that can drift. The scope is a directory
// list (not the whole package) because the package's OWN test files must stay
// auto-slotted: hook callbacks written inline in tests rely on their
// call-site slots. Manifest lookups are cached per directory; the cache is
// module-level so all plugin instances (e.g. the many vitest projects) share
// it.
const manifestRuleCache = new Map();

const OCTANE_DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
];

function packageUsesOctane(pkg) {
	return (
		pkg.name === 'octane' ||
		['dependencies', 'optionalDependencies', 'peerDependencies'].some(
			(field) => typeof pkg[field]?.octane === 'string',
		)
	);
}

function nearestOctanePackageRule(fileDir) {
	const missed = [];
	let dir = fileDir;
	let rule = null;
	for (;;) {
		if (manifestRuleCache.has(dir)) {
			rule = manifestRuleCache.get(dir);
			break;
		}
		missed.push(dir);
		let pkg = null;
		try {
			pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
		} catch {
			// no manifest in this directory (or unreadable) — keep walking up
		}
		if (pkg !== null) {
			// Nearest manifest wins. Besides the manual-slot directories, retain
			// whether this is an installed Octane source package: published bindings
			// deliberately ship raw TS/TSRX and therefore still need Vite's transform.
			const manual = pkg.octane?.hookSlots?.manual;
			rule = {
				root: dir,
				dirs: Array.isArray(manual) ? manual : [],
				runtimeDependencies: [
					...Object.keys(pkg.dependencies ?? {}),
					...Object.keys(pkg.optionalDependencies ?? {}),
				],
				usesOctane: packageUsesOctane(pkg),
			};
			break;
		}
		const parent = dirname(dir);
		if (parent === dir) break; // filesystem root, no manifest anywhere
		dir = parent;
	}
	for (const d of missed) manifestRuleCache.set(d, rule);
	return rule;
}

function hasManualHookSlots(file) {
	const rule = nearestOctanePackageRule(dirname(file));
	if (rule === null) return false;
	const relativeFile = relative(rule.root, file);
	return rule.dirs.some((directory) => {
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

function isNodeModulesFile(file) {
	return /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(file);
}

function isInstalledOctaneSource(file) {
	if (!isNodeModulesFile(file)) return true;
	return nearestOctanePackageRule(dirname(file))?.usesOctane === true;
}

/**
 * Discover installed source packages which consume Octane, recursively
 * following dependencies between those packages. Their raw TS/TSRX must
 * bypass dependency prebundling and SSR externalization so this plugin can
 * lower JSX and assign hook slots in the consuming application.
 */
export function discoverOctaneSourceDependencies(projectRoot) {
	const root = resolve(projectRoot);
	let projectManifest;
	try {
		projectManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	} catch {
		return [];
	}
	const dependencyNames = new Set();
	for (const field of OCTANE_DEPENDENCY_FIELDS) {
		for (const name of Object.keys(projectManifest[field] ?? {})) dependencyNames.add(name);
	}
	const projectRequire = createRequire(join(root, 'package.json'));
	const sourceDependencies = new Set();
	const visitedPackageRoots = new Set();
	const visit = (name, packageRequire) => {
		try {
			const entry = packageRequire.resolve(name);
			const rule = nearestOctanePackageRule(dirname(entry));
			if (!rule?.usesOctane) return;
			sourceDependencies.add(name);
			let packageRoot = rule.root;
			try {
				packageRoot = realpathSync(packageRoot);
			} catch {
				// Keep the resolved/symlink path as the cycle key.
			}
			if (visitedPackageRoots.has(packageRoot)) return;
			visitedPackageRoots.add(packageRoot);
			const childRequire = createRequire(join(rule.root, 'package.json'));
			for (const dependency of rule.runtimeDependencies) visit(dependency, childRequire);
		} catch {
			// Optional dependency not installed or an unresolvable export — it cannot
			// enter this Vite graph, so there is nothing to configure.
		}
	};
	for (const name of dependencyNames) visit(name, projectRequire);
	return [...sourceDependencies].sort();
}

export function octane(options = {}) {
	let hmrEnabled = options.hmr;
	let viteRoot = '';
	// An explicit override of the per-module SSR auto-detection (true → always
	// server, false → always client). `undefined` keeps auto-detection.
	const forceSsr = options.ssr;
	// Ad-hoc path fragments to skip in the plain `.ts`/`.js` hook-slotting pass.
	// Hand-slot-forwarding bindings should NOT need this: they self-declare via
	// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json (see
	// hasManualHookSlots above). Installed raw-source packages that consume
	// Octane are transformed automatically; this option remains as an escape
	// hatch for sources that cannot carry a manifest declaration.
	const excludePaths = options.exclude ?? [];
	return {
		name: 'octane',
		enforce: 'pre',
		config(config) {
			const projectRoot = resolve(config.root ?? process.cwd());
			const sourceDependencies = discoverOctaneSourceDependencies(projectRoot);
			return {
				// Raw Octane dependencies must reach this plugin, never esbuild's dep
				// prebundle or Node's SSR external loader. Dedupe the runtime as an
				// additional guard for linked/local package layouts.
				optimizeDeps: { exclude: sourceDependencies },
				resolve: { dedupe: ['octane'] },
				ssr: { noExternal: sourceDependencies },
			};
		},
		configResolved(config) {
			viteRoot = config.root;
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		async resolveId(source, importer, options) {
			if (!options?.ssr || source !== 'octane') return null;
			const resolved = await this.resolve('octane/server', importer, { skipSelf: true });
			return resolved?.id ?? null;
		},
		transform(code, id, transformOptions) {
			const file = id.split('?')[0]; // strip Vite's ?v=/?used query suffix

			// `.tsrx` and `.tsx` (TS + JSX) go through the FULL compiler — it lowers JSX
			// and slots hooks. A generic dependency's `.tsx` is left alone, while an
			// installed package whose manifest consumes Octane is compiled as published
			// raw source. `.tsrx` is Octane-specific and always compiles. Mirror
			// Ripple's mode decision: an explicit `options.ssr` override wins;
			// otherwise Vite's transform-level SSR flag OR the environment consumer
			// marks a server build.
			if (file.endsWith('.tsrx') || (file.endsWith('.tsx') && isInstalledOctaneSource(file))) {
				const ssr =
					forceSsr !== undefined
						? forceSsr
						: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
				const relativeFile = viteRoot ? relative(viteRoot, file) : '';
				const isWithinRoot =
					viteRoot !== '' &&
					relativeFile !== '..' &&
					!relativeFile.startsWith('..' + sep) &&
					!isAbsolute(relativeFile);
				const filename = isWithinRoot ? '/' + relativeFile.split(sep).join('/') : file;
				const out = compile(code, filename, {
					hmr: !ssr && !!hmrEnabled,
					mode: ssr ? 'server' : 'client',
					// Dev-only hydration source-LOC metadata — same serve+client gate as HMR.
					// Off in SSR + prod builds, so production output is byte-identical.
					dev: !ssr && !!hmrEnabled,
					parallelUse: options.parallelUse !== false,
				});
				return { code: out.code, map: out.map };
			}

			// Plain `.ts`/`.js` can't be re-emitted (esrap can't print arbitrary TS), so a
			// custom hook living there gets the SURGICAL, hook-only pass: only octane base
			// hook calls are edited; every other byte passes through. Installed packages
			// are eligible only when their nearest manifest consumes Octane (official
			// bindings ship raw source); explicit manual-slot directories, opt-outs, and
			// configured excludes still pass through untouched.
			if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
				if (/\/\/\s*octane-no-slot\b/.test(code)) return null;
				if (excludePaths.some((p) => file.includes(p))) return null;
				if (!/from\s*['"]octane['"]/.test(code)) return null;
				if (!isInstalledOctaneSource(file)) return null;
				if (hasManualHookSlots(file)) return null;
				// Same HMR gate as the full compiler: dev serve gets Symbol.for
				// (registry identity survives re-import), builds/SSR get Symbol().
				const ssr =
					forceSsr !== undefined
						? forceSsr
						: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
				return slotHooks(code, id, { hmr: !ssr && !!hmrEnabled });
			}

			return null;
		},
	};
}
