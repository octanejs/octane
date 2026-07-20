/**
 * Vite adapter for the bundler-neutral Octane compiler integration.
 *
 * Per-module target is chosen from Vite's SSR signal: a module compiled for the
 * server environment uses SSR codegen, while every other module uses the client
 * DOM runtime. Source eligibility, manifests, canonical IDs, dependency
 * discovery, and transforms live in ./bundler.js so other integrations share
 * exactly the same behavior.
 */
// Namespace (not named) imports of node builtins: the pure `compile` entry
// re-exported next to this module must stay importable from BROWSER dev
// servers (the website playground compiles in-page), where bundler-less
// module graphs evaluate this file against an externalized `node:*` shim.
// Named imports trip the shim at evaluation; namespace member access only
// throws if a Node-only code path actually runs.
import * as nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	cleanModuleId,
	createClientReferenceManifest,
	createOctaneCompiler,
	discoverOctaneSourceDependencies,
	findVoidComponentImports,
} from './bundler.js';

export { discoverOctaneSourceDependencies };

const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';
const DEVTOOLS_DEFINE = '__OCTANE_DEVTOOLS_ENABLED__';
const VOID_EXPORTS_META = 'octane:void-component-exports';
const CLIENT_REFERENCE_META = 'octane:client-reference';

function realRoot(path) {
	try {
		return nodeFs.realpathSync(path);
	} catch {
		return path;
	}
}

/**
 * @param {{ getModuleInfo(id: string): { meta?: Record<string, unknown> } | null }} context
 * @param {Record<string, { type: string, fileName?: string, modules?: Record<string, unknown> }>} bundle
 */
function clientReferenceManifest(context, bundle) {
	const entries = [];
	for (const output of Object.values(bundle)) {
		if (output.type !== 'chunk' || output.fileName === undefined || output.modules === undefined) {
			continue;
		}
		for (const moduleId of Object.keys(output.modules)) {
			const reference = context.getModuleInfo(moduleId)?.meta?.[CLIENT_REFERENCE_META];
			if (reference !== undefined) entries.push({ reference, chunks: [output.fileName] });
		}
	}
	return createClientReferenceManifest(entries);
}

function voidImportKey(request, imported) {
	return `${request}\0${imported}`;
}

function compiledCodeFingerprint(code) {
	return nodeCrypto.createHash('sha256').update(code).digest('base64url');
}

async function loadVoidComponentImports(context, imports, importer) {
	if (typeof context.resolve !== 'function' || typeof context.load !== 'function') return new Set();
	const proven = new Set();
	await Promise.all(
		imports.map(async ({ request, imported }) => {
			let resolved;
			try {
				resolved = await context.resolve(request, importer, { skipSelf: true });
			} catch {
				return;
			}
			if (
				resolved == null ||
				resolved.external === true ||
				resolved.external === 'absolute' ||
				cleanModuleId(resolved.id) === cleanModuleId(importer)
			) {
				return;
			}
			let moduleInfo;
			try {
				// Loading through the module graph runs the resolved module's real load
				// and transform hooks. `resolveDependencies: false` avoids recursively
				// walking its imports just to read Octane's compile metadata.
				moduleInfo = await context.load({ id: resolved.id, resolveDependencies: false });
			} catch {
				return;
			}
			const metadata = moduleInfo?.meta?.[VOID_EXPORTS_META];
			if (
				metadata !== null &&
				typeof metadata === 'object' &&
				Array.isArray(metadata.exports) &&
				metadata.exports.includes(imported) &&
				typeof moduleInfo.code === 'string' &&
				metadata.fingerprint === compiledCodeFingerprint(moduleInfo.code)
			) {
				proven.add(voidImportKey(request, imported));
			}
		}),
	);
	return proven;
}

async function loadClientOnlyImports(context, compiler, code, importer) {
	if (typeof context.resolve !== 'function') return [];
	const requests = compiler.findServerImportRequests(code, importer);
	const classified = [];
	await Promise.all(
		requests.map(async (request) => {
			let resolved;
			try {
				resolved = await context.resolve(request, importer, { skipSelf: true });
			} catch {
				return;
			}
			if (resolved == null || resolved.external === true || resolved.external === 'absolute') {
				return;
			}
			const reference = compiler.clientReferenceForFile(resolved.id);
			if (reference !== null) classified.push({ request, resolvedId: resolved.id, reference });
		}),
	);
	return classified.sort((left, right) =>
		left.request < right.request ? -1 : left.request > right.request ? 1 : 0,
	);
}

function assertReservedDefineAvailable(definitions, define, enabled, option) {
	if (
		definitions === null ||
		typeof definitions !== 'object' ||
		!Object.prototype.hasOwnProperty.call(definitions, define)
	) {
		return;
	}
	const value = definitions[define];
	if (value !== enabled && value !== JSON.stringify(enabled)) {
		throw new TypeError(
			`octane/compiler/vite: ${define} is reserved by Octane and conflicts with \`${option}: ${enabled}\`. Remove the custom Vite define and configure it through octane().`,
		);
	}
}

function assertProfilingDefineAvailable(definitions, enabled) {
	assertReservedDefineAvailable(definitions, PROFILE_DEFINE, enabled, 'profile');
}

function assertDevtoolsDefineAvailable(definitions, enabled) {
	assertReservedDefineAvailable(definitions, DEVTOOLS_DEFINE, enabled, 'devtools');
}

export function octane(options = {}) {
	if (options.parallelUse !== undefined) {
		// Removed 2026-07-16: the parallel-use() pipeline is unconditional compiled
		// semantics (docs/suspense-parallel-use-plan.md). Warn instead of throwing
		// so existing configs keep building, but the timing change is not silent.
		console.warn(
			'octane/compiler/vite: the `parallelUse` option was removed — the parallel use() transform is always on and this option is ignored. Delete it from octane().',
		);
	}
	let hmrEnabled = options.hmr;
	let specializeProductionRoots = false;
	let emitClientReferenceManifest = options.ssr !== true;
	// Profiling is intentionally independent of serve/HMR. `ssr: true` is the
	// adapter's explicit server-only override, where client profiling must stay off.
	const profileRequested = options.profile === true && options.ssr !== true;
	// Devtools is a dev-server-only opt-in: it resolves against the command in
	// config() and stays off (define false, no metadata) for every build, so a
	// shared `octane({ devtools: true })` config ships clean production output.
	const devtoolsRequested = options.devtools === true && options.ssr !== true;
	let devtoolsEnabled = false;
	// Devtools implies profile metadata + recording: the inspector names
	// components/hooks and reads render timings through the profiler registries.
	let profileEnabled = profileRequested;
	let projectRoot = nodePath.resolve(process.cwd());
	// The mixed-toolchain ownership gate: with `requireDirective: true`, a
	// project `.tsrx` is Octane's by extension, and Octane compiles a project
	// `.tsx` (full compile) or plain `.ts`/`.js` (hook slotting) only when it
	// opens with a leading `/** @jsxImportSource octane */` pragma (unmarked
	// modules belong to the host framework's own pipeline — e.g. React's JSX
	// transform). Diagnostics route to Vite's logger once it exists.
	const requireDirective = options.requireDirective === true;
	let logger = null;
	const warn = (message) => (logger ?? console).warn(message);
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		profile: profileEnabled,
		renderers: options.renderers,
		requireDirective,
		warn,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		projectRoot = nodePath.resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			profile: profileEnabled,
			renderers: options.renderers,
			requireDirective,
			warn,
		});
	};

	return {
		name: 'octane',
		enforce: 'pre',
		config(config, env) {
			devtoolsEnabled = devtoolsRequested && env?.command === 'serve';
			profileEnabled = profileRequested || devtoolsEnabled;
			assertProfilingDefineAvailable(config.define, profileEnabled);
			assertDevtoolsDefineAvailable(config.define, devtoolsEnabled);
			resetCompiler(config.root ?? process.cwd());
			const discovery = compiler.discoverSourceDependencies();
			const sourceDependencies = discovery.packages;
			const optimizeDepsExclusions = [
				...new Set([...sourceDependencies, ...discovery.viteOptimizeDepsExclusions]),
			].sort();
			return {
				// The runtime uses this reserved constant to make normal builds erase
				// profiling branches completely. Keep it defined in both modes so Vite's
				// production optimizer never has to preserve a runtime feature check.
				define: {
					__OCTANE_PROFILE_ENABLED__: JSON.stringify(profileEnabled),
					__OCTANE_DEVTOOLS_ENABLED__: JSON.stringify(devtoolsEnabled),
				},
				// Raw Octane dependencies must reach this plugin, never esbuild's dep
				// prebundle or Node's SSR external loader. A raw package can also declare
				// exact dependencies or an installed `family/*` that must stay out of
				// Vite's rolling optimizer; this keeps module-identity-sensitive packages
				// from mixing cold-crawl generations.
				optimizeDeps: { exclude: optimizeDepsExclusions },
				resolve: {
					dedupe: ['octane'],
					// Vite's default extension list, plus .tsrx: extensionless imports
					// of octane components must resolve exactly like React's .tsx do
					// (faithful ports keep upstream's extensionless dynamic imports,
					// and Start's import-protection relies on the extensionless
					// specifier shape for its deferred client-module mocking).
					extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.tsrx'],
				},
				ssr: { noExternal: sourceDependencies },
			};
		},
		configResolved(config) {
			logger = config.logger ?? null;
			// Re-check the final merged value so a later plugin cannot silently win the
			// reserved definition and desynchronize compiler metadata from the runtime.
			assertProfilingDefineAvailable(config.define, profileEnabled);
			assertDevtoolsDefineAvailable(config.define, devtoolsEnabled);
			if (realRoot(nodePath.resolve(config.root)) !== realRoot(projectRoot))
				resetCompiler(config.root);
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
			emitClientReferenceManifest =
				options.ssr === false || (options.ssr !== true && !config.build?.ssr);
			// A watch rebuild does not guarantee that an importer's cached transform
			// reruns when only an imported module's output contract changes. Keep the
			// proof to one-shot production builds where the graph is compiled together.
			specializeProductionRoots = config.command === 'build' && config.build?.watch == null;
		},
		watchChange(id) {
			compiler.invalidate(id);
		},
		generateBundle(_outputOptions, bundle) {
			if (!emitClientReferenceManifest) return;
			const manifest = clientReferenceManifest(this, bundle);
			if (Object.keys(manifest.references).length === 0) return;
			this.emitFile({
				type: 'asset',
				fileName: CLIENT_REFERENCE_MANIFEST_FILENAME,
				source: JSON.stringify(manifest, null, 2) + '\n',
			});
		},
		async resolveId(source, importer, resolveOptions) {
			if (!resolveOptions?.ssr) return null;
			const runtimeRequest = compiler.resolveRuntimeRequest(source, 'server');
			if (runtimeRequest === null || runtimeRequest === source) return null;
			const resolved = await this.resolve(runtimeRequest, importer, { skipSelf: true });
			return resolved?.id ?? null;
		},
		transform(code, id, transformOptions) {
			const server =
				forceSsr !== undefined
					? forceSsr
					: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
			const transformWithProof = (proven, clientOnlyImports = []) => {
				const result = compiler.transform(code, id, {
					environment: server ? 'server' : 'client',
					hmr: !server && hmrEnabled ? 'vite' : false,
					// DEV server transforms also carry SSR-only diagnostics. HMR itself
					// remains client-only; an explicit `hmr: false` keeps both transforms
					// on the production compiler path.
					dev: !!hmrEnabled,
					profile: !server && profileEnabled,
					collectVoidComponentExports:
						specializeProductionRoots && !server && !hmrEnabled && !profileEnabled,
					...(clientOnlyImports.length > 0 ? { clientOnlyImports } : null),
					...(proven?.size
						? {
								isVoidComponentImport: (request, imported) =>
									proven.has(voidImportKey(request, imported)),
							}
						: {}),
				});
				if (result === null) return null;
				for (const dependency of result.dependencies) this.addWatchFile?.(dependency);
				if (result.kind === 'none') return null;
				const meta = {};
				if (result.clientReference !== undefined) {
					meta[CLIENT_REFERENCE_META] = result.clientReference;
				}
				if (result.kind === 'compile' && Array.isArray(result.voidComponentExports)) {
					meta[VOID_EXPORTS_META] = {
						exports: result.voidComponentExports ?? [],
						fingerprint: compiledCodeFingerprint(result.code),
					};
				}
				return {
					code: result.code,
					map: result.map,
					...(Object.keys(meta).length === 0 ? null : { meta }),
				};
			};

			if (server) {
				return loadClientOnlyImports(this, compiler, code, id).then((imports) =>
					transformWithProof(null, imports),
				);
			}

			const voidImports =
				specializeProductionRoots && !server && !hmrEnabled && !profileEnabled
					? findVoidComponentImports(code, id)
					: [];
			if (voidImports.length === 0) return transformWithProof(null);
			return loadVoidComponentImports(this, voidImports, id).then(transformWithProof);
		},
	};
}
