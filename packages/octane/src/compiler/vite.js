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
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	cleanModuleId,
	createClientReferenceManifest,
	createOctaneCompiler,
	discoverOctaneSourceDependencies,
	findDescriptorChildrenExports,
	findDescriptorChildrenImports,
	findVoidComponentImports,
} from './bundler.js';

export { discoverOctaneSourceDependencies };

const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';
const VOID_EXPORTS_META = 'octane:void-component-exports';
const DESCRIPTOR_CHILDREN_EXPORTS_META = 'octane:descriptor-children-exports';
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

async function loadImportMetadata(
	context,
	imports,
	importer,
	metadataKey,
	{ failLoud = false, descriptorSourceCache } = {},
) {
	if (typeof context.resolve !== 'function' || typeof context.load !== 'function') return new Set();
	const proven = new Set();
	const byRequest = new Map();
	for (const candidate of imports) {
		const candidates = byRequest.get(candidate.request) ?? [];
		candidates.push(candidate);
		byRequest.set(candidate.request, candidates);
	}
	await Promise.all(
		[...byRequest].map(async ([request, candidates]) => {
			let resolved;
			try {
				resolved = await context.resolve(request, importer, { skipSelf: true });
			} catch (error) {
				if (failLoud)
					throw new Error(
						`Failed to resolve descriptor-children metadata for ${request} from ${importer}`,
						{
							cause: error,
						},
					);
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
			let loadedModuleInfo;
			try {
				// Avoid recursively walking the dependency graph merely to classify one
				// imported JSX binding. A pre-transform snapshot is handled below by the
				// live-graph and exact-filesystem fallbacks.
				loadedModuleInfo = await context.load({ id: resolved.id, resolveDependencies: false });
			} catch (error) {
				if (failLoud)
					throw new Error(
						`Failed to load descriptor-children metadata for ${request} from ${importer}`,
						{
							cause: error,
						},
					);
				return;
			}
			// Rollup/Vite may return the pre-transform ModuleInfo snapshot from
			// `this.load()` while publishing transform metadata to the live graph
			// record. Read that record after the awaited load without touching the
			// unsupported `ModuleInfo.code` accessor.
			const moduleInfo = context.getModuleInfo?.(resolved.id) ?? loadedModuleInfo;
			let metadata = moduleInfo?.meta?.[metadataKey];
			if (metadata == null && metadataKey === DESCRIPTOR_CHILDREN_EXPORTS_META) {
				// `this.load()` is allowed to expose a pre-transform snapshot. For a
				// real filesystem module, classify direct markers from the exact source
				// rather than silently making lowering depend on traversal order.
				const sourceId = cleanModuleId(resolved.id);
				let classification = descriptorSourceCache?.get(sourceId);
				if (!classification) {
					classification = nodeFs.promises
						.readFile(sourceId, 'utf8')
						.then((source) => findDescriptorChildrenExports(source, resolved.id))
						.catch(() => []);
					descriptorSourceCache?.set(sourceId, classification);
				}
				const exports = await classification;
				if (exports.length > 0) metadata = { exports };
			}
			if (metadata == null) return;
			const valid =
				metadata !== null &&
				typeof metadata === 'object' &&
				Array.isArray(metadata.exports) &&
				metadata.exports.every((value) => typeof value === 'string');
			if (!valid) {
				if (failLoud)
					throw new Error(`Invalid descriptor-children metadata for ${request} from ${importer}`);
				return;
			}
			for (const { imported, exported } of candidates) {
				if (!metadata.exports.includes(imported)) continue;
				proven.add(voidImportKey(request, imported));
				if (exported !== undefined) proven.add(`export\0${exported}`);
			}
		}),
	);
	return proven;
}

async function loadVoidComponentImports(context, imports, importer) {
	return loadImportMetadata(context, imports, importer, VOID_EXPORTS_META);
}

async function loadDescriptorChildrenImports(context, imports, importer, descriptorSourceCache) {
	return loadImportMetadata(context, imports, importer, DESCRIPTOR_CHILDREN_EXPORTS_META, {
		failLoud: true,
		descriptorSourceCache,
	});
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

function assertProfilingDefineAvailable(definitions, enabled) {
	if (
		definitions === null ||
		typeof definitions !== 'object' ||
		!Object.prototype.hasOwnProperty.call(definitions, PROFILE_DEFINE)
	) {
		return;
	}
	const value = definitions[PROFILE_DEFINE];
	if (value !== enabled && value !== JSON.stringify(enabled)) {
		throw new TypeError(
			`octane/compiler/vite: ${PROFILE_DEFINE} is reserved by Octane and conflicts with \`profile: ${enabled}\`. Remove the custom Vite define and configure profiling through octane().`,
		);
	}
}

export function octane(options = {}) {
	if (options.strong !== undefined && typeof options.strong !== 'boolean') {
		throw new TypeError('octane/compiler/vite: `strong` must be a boolean when provided.');
	}
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
	//
	// `profile` accepts `true`/`false` (command-independent, unchanged) and the
	// command-aware `'auto'` sentinel — the DEV-only devtools signal the meta
	// plugin maps `devtools: true` to: profiling on in `vite dev`
	// (command === 'serve'), off in `vite build` so production tree-shakes it.
	// Like `hmrEnabled`, the effective value is resolved LAZILY once Vite's
	// command is known (the `config`/`configResolved` hooks), then feeds the
	// compiler, the transform gating, and the reserved define consistently.
	const profileOption = options.profile;
	const resolveProfileEnabled = (command) => {
		if (options.ssr === true) return false;
		if (profileOption === 'auto') return command === 'serve';
		return profileOption === true;
	};
	// Conservative pre-command default: explicit `profile: true` is honored
	// immediately; `'auto'` stays off until the serve command is observed.
	let profileEnabled = resolveProfileEnabled(undefined);
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
	const descriptorSourceCache = new Map();
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		profile: profileEnabled,
		strong: options.strong,
		renderers: options.renderers,
		requireDirective,
		warn,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		descriptorSourceCache.clear();
		projectRoot = nodePath.resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			profile: profileEnabled,
			strong: options.strong,
			renderers: options.renderers,
			requireDirective,
			warn,
		});
	};

	return {
		name: 'octane',
		enforce: 'pre',
		config(config, env) {
			// Resolve the command-aware profile signal before recreating the
			// compiler or emitting the define, so `'auto'` (devtools) picks up
			// serve→on / build→off from Vite's command.
			profileEnabled = resolveProfileEnabled(env?.command);
			assertProfilingDefineAvailable(config.define, profileEnabled);
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
			// Re-resolve from the finalized command (ResolvedConfig.command) so a
			// command-aware `'auto'` signal stays correct even if `config` ran
			// without an env, keeping the compiler, transform gating, and define in
			// lockstep.
			profileEnabled = resolveProfileEnabled(config.command);
			// Re-check the final merged value so a later plugin cannot silently win the
			// reserved definition and desynchronize compiler metadata from the runtime.
			assertProfilingDefineAvailable(config.define, profileEnabled);
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
			descriptorSourceCache.delete(cleanModuleId(id));
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
			const transformWithProof = (proven, descriptorProven = new Set(), clientOnlyImports = []) => {
				const propagatedExports = [...descriptorProven]
					.filter((key) => key.startsWith('export\0'))
					.map((key) => key.slice('export\0'.length));
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
					...(descriptorProven.size
						? {
								isDescriptorChildrenImport: (request, imported) =>
									descriptorProven.has(voidImportKey(request, imported)),
							}
						: {}),
				});
				if (result === null) {
					if (propagatedExports.length === 0) return null;
					return {
						code,
						map: null,
						meta: {
							[DESCRIPTOR_CHILDREN_EXPORTS_META]: {
								exports: [...new Set(propagatedExports)],
							},
						},
					};
				}
				for (const dependency of result.dependencies) this.addWatchFile?.(dependency);
				const meta = {};
				if (result.clientReference !== undefined) {
					meta[CLIENT_REFERENCE_META] = result.clientReference;
				}
				if (result.kind === 'compile' && Array.isArray(result.voidComponentExports)) {
					meta[VOID_EXPORTS_META] = {
						exports: result.voidComponentExports ?? [],
					};
				}
				if (
					(result.kind === 'compile' && Array.isArray(result.descriptorChildrenExports)) ||
					propagatedExports.length > 0
				) {
					meta[DESCRIPTOR_CHILDREN_EXPORTS_META] = {
						exports: [
							...new Set([...(result.descriptorChildrenExports ?? []), ...propagatedExports]),
						],
					};
				}
				if (result.kind === 'none' && Object.keys(meta).length === 0) return null;
				return {
					code: result.code,
					map: result.map,
					...(Object.keys(meta).length === 0 ? null : { meta }),
				};
			};

			if (server) {
				const descriptorImports = findDescriptorChildrenImports(code, id);
				return Promise.all([
					loadClientOnlyImports(this, compiler, code, id),
					loadDescriptorChildrenImports(this, descriptorImports, id, descriptorSourceCache),
				]).then(([imports, descriptorProven]) =>
					transformWithProof(null, descriptorProven, imports),
				);
			}

			const voidImports =
				specializeProductionRoots && !server && !hmrEnabled && !profileEnabled
					? findVoidComponentImports(code, id)
					: [];
			const descriptorImports = findDescriptorChildrenImports(code, id);
			return Promise.all([
				loadVoidComponentImports(this, voidImports, id),
				loadDescriptorChildrenImports(this, descriptorImports, id, descriptorSourceCache),
			]).then(([proven, descriptorProven]) => transformWithProof(proven, descriptorProven));
		},
	};
}
