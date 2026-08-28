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
	findDescriptorChildrenExports,
	findDescriptorChildrenImports,
	findVoidComponentImports,
} from './bundler.js';
import {
	isPlainCssModuleId,
	readCssModuleExports,
	validateCssModuleConstants,
} from './css-module-imports.js';

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

function compiledCodeFingerprint(code) {
	return nodeCrypto.createHash('sha256').update(code).digest('base64url');
}

function createCssModuleProofState() {
	return { modules: new Map(), inFlight: new Set(), consumed: new Map() };
}

async function loadCssModuleProof(context, id, environment, provider, state) {
	// A virtual CSS provider may itself pass through Octane and import its
	// caller. Never await the same proof promise through that in-flight graph.
	// A concurrent first importer can conservatively miss this optimization;
	// completed module proofs remain reusable for the rest of the build.
	if (state.inFlight.has(id)) return null;
	let proof = state.modules.get(id);
	if (proof === undefined) {
		state.inFlight.add(id);
		proof = (async () => {
			let loaded;
			try {
				// Only the module itself is needed. Walking its imports here would
				// make a CSS provider's virtual graph capable of deadlocking an
				// importer that is still in its pre-transform hook.
				loaded = await context.load({ id, resolveDependencies: false });
			} catch {
				return null;
			}
			const moduleInfo = context.getModuleInfo(id) ?? loaded;
			if (moduleInfo?.id !== id || typeof moduleInfo.code !== 'string') return null;
			const code = moduleInfo.code;
			const exports = readCssModuleExports(code);
			const supplied =
				provider === undefined
					? null
					: validateCssModuleConstants(
							provider(Object.freeze({ id, code, meta: moduleInfo.meta ?? {}, environment })),
							exports,
							id,
						);
			// Vite's normal CSS-module output has immutable named const strings,
			// but its default object is mutable. Only the explicit host contract
			// can make a default-map member a constant.
			const named = isPlainCssModuleId(id) && exports?.pure ? new Map(exports.named) : new Map();
			for (const [name, value] of supplied?.named ?? []) named.set(name, value);
			const defaultMap = supplied?.default ?? new Map();
			if (named.size === 0 && defaultMap.size === 0) return null;
			return { id, fingerprint: compiledCodeFingerprint(code), named, default: defaultMap };
		})().finally(() => state.inFlight.delete(id));
		state.modules.set(id, proof);
	}
	return proof;
}

async function loadCssModuleImports(context, requests, importer, environment, provider, state) {
	if (
		requests.length === 0 ||
		typeof context.resolve !== 'function' ||
		typeof context.load !== 'function' ||
		typeof context.getModuleInfo !== 'function'
	) {
		return null;
	}
	const imports = new Map();
	const resolvedImports = await Promise.all(
		requests.map(async (request) => {
			let resolved;
			try {
				resolved = await context.resolve(request, importer, { skipSelf: true });
			} catch {
				return;
			}
			if (
				resolved == null ||
				resolved.external ||
				typeof resolved.id !== 'string' ||
				cleanModuleId(resolved.id) === cleanModuleId(importer)
			) {
				return;
			}
			const proof = await loadCssModuleProof(context, resolved.id, environment, provider, state);
			return proof === null ? undefined : [request, proof];
		}),
	);
	for (const entry of resolvedImports) {
		if (entry !== undefined) imports.set(entry[0], entry[1]);
	}
	if (imports.size === 0) return null;
	return {
		requests: [...imports.keys()],
		resolve(request, imported, property) {
			const proof = imports.get(request);
			if (proof === undefined) return undefined;
			if (property === null) return proof.named.get(imported);
			if (imported === '*') return proof.named.get(property);
			if (imported === 'default') return proof.default.get(property);
			return undefined;
		},
		consume(requests) {
			for (const request of requests ?? []) {
				const proof = imports.get(request);
				if (proof === undefined || state.consumed.has(proof.id)) continue;
				const moduleInfo = context.getModuleInfo(proof.id);
				if (
					moduleInfo == null ||
					typeof moduleInfo.code !== 'string' ||
					compiledCodeFingerprint(moduleInfo.code) !== proof.fingerprint
				) {
					throw new Error(`CSS-module constant proof changed for ${JSON.stringify(proof.id)}.`);
				}
				state.consumed.set(proof.id, proof.fingerprint);
			}
		},
	};
}

function verifyCssModuleProofs(context, state) {
	for (const [id, fingerprint] of state.consumed) {
		const moduleInfo = context.getModuleInfo?.(id);
		if (
			moduleInfo == null ||
			typeof moduleInfo.code !== 'string' ||
			compiledCodeFingerprint(moduleInfo.code) !== fingerprint
		) {
			throw new Error(`CSS-module constant proof changed for ${JSON.stringify(id)}.`);
		}
	}
}

async function loadImportMetadata(
	context,
	imports,
	importer,
	metadataKey,
	{ failLoud = false } = {},
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
			const metadata = moduleInfo?.meta?.[metadataKey];
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
			if (
				metadataKey === VOID_EXPORTS_META &&
				(typeof loadedModuleInfo?.code !== 'string' ||
					metadata.fingerprint !== compiledCodeFingerprint(loadedModuleInfo.code))
			) {
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

async function readDescriptorSourceAnalysis(id, descriptorSourceCache) {
	const sourceId = cleanModuleId(id);
	let analysis = descriptorSourceCache.get(sourceId);
	if (analysis === undefined) {
		analysis = nodeFs.promises
			.readFile(sourceId, 'utf8')
			.then((source) => ({
				exports: new Set(findDescriptorChildrenExports(source, id)),
				reexports: findDescriptorChildrenImports(source, id).filter(
					(candidate) => candidate.exported !== undefined,
				),
			}))
			.catch(() => null);
		descriptorSourceCache.set(sourceId, analysis);
	}
	return analysis;
}

async function loadDescriptorGraphMetadata(
	context,
	resolvedId,
	request,
	importer,
	descriptorGraphCache,
	allowGraphLoad,
) {
	const cacheKey = `${allowGraphLoad ? 'load' : 'live'}\0${resolvedId}`;
	let metadataExports = descriptorGraphCache.get(cacheKey);
	if (metadataExports === undefined) {
		metadataExports = (async () => {
			let moduleInfo = context.getModuleInfo?.(resolvedId);
			let metadata = moduleInfo?.meta?.[DESCRIPTOR_CHILDREN_EXPORTS_META];
			if (metadata == null && allowGraphLoad && typeof context.load === 'function') {
				let loadedModuleInfo;
				try {
					loadedModuleInfo = await context.load({ id: resolvedId, resolveDependencies: false });
				} catch (error) {
					throw new Error(
						`Failed to load descriptor-children metadata for ${request} from ${importer}`,
						{ cause: error },
					);
				}
				moduleInfo = context.getModuleInfo?.(resolvedId) ?? loadedModuleInfo;
				metadata = moduleInfo?.meta?.[DESCRIPTOR_CHILDREN_EXPORTS_META];
			}
			if (metadata == null) return [];
			const valid =
				metadata !== null &&
				typeof metadata === 'object' &&
				Array.isArray(metadata.exports) &&
				metadata.exports.every((value) => typeof value === 'string');
			if (!valid) {
				throw new Error(`Invalid descriptor-children metadata for ${request} from ${importer}`);
			}
			return metadata.exports;
		})();
		descriptorGraphCache.set(cacheKey, metadataExports);
	}
	return metadataExports;
}

async function isDescriptorChildrenExport(
	context,
	resolvedId,
	imported,
	request,
	importer,
	descriptorSourceCache,
	descriptorExportCache,
	descriptorGraphCache,
	allowGraphLoad,
	ancestors = new Set(),
) {
	const cacheKey = `${cleanModuleId(resolvedId)}\0${imported}`;
	if (ancestors.has(cacheKey)) return false;
	let classification = descriptorExportCache.get(cacheKey);
	if (classification === undefined) {
		classification = (async () => {
			const analysis = await readDescriptorSourceAnalysis(resolvedId, descriptorSourceCache);
			if (analysis === null) {
				const exports = await loadDescriptorGraphMetadata(
					context,
					resolvedId,
					request,
					importer,
					descriptorGraphCache,
					allowGraphLoad,
				);
				return exports.includes(imported);
			}
			if (analysis.exports.has(imported)) return true;

			const nextAncestors = new Set(ancestors);
			nextAncestors.add(cacheKey);
			for (const candidate of analysis.reexports) {
				if (candidate.exported !== imported) continue;
				let resolved;
				try {
					resolved = await context.resolve(candidate.request, resolvedId, { skipSelf: true });
				} catch (error) {
					throw new Error(
						`Failed to resolve descriptor-children metadata for ${candidate.request} from ${resolvedId}`,
						{ cause: error },
					);
				}
				if (
					resolved == null ||
					resolved.external === true ||
					resolved.external === 'absolute' ||
					cleanModuleId(resolved.id) === cleanModuleId(resolvedId)
				) {
					continue;
				}
				if (
					await isDescriptorChildrenExport(
						context,
						resolved.id,
						candidate.imported,
						candidate.request,
						resolvedId,
						descriptorSourceCache,
						descriptorExportCache,
						descriptorGraphCache,
						allowGraphLoad,
						nextAncestors,
					)
				) {
					return true;
				}
			}
			return false;
		})();
		// A nested traversal can be false only because one of its ancestors is
		// already active. Cache only root classifications so that a cycle cannot
		// poison a later independent lookup of the same export.
		if (ancestors.size === 0) descriptorExportCache.set(cacheKey, classification);
	}
	return classification;
}

async function loadDescriptorChildrenImports(
	context,
	imports,
	importer,
	descriptorSourceCache,
	descriptorExportCache,
	descriptorGraphCache,
	allowGraphLoad,
) {
	if (typeof context.resolve !== 'function') return new Set();
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
				throw new Error(
					`Failed to resolve descriptor-children metadata for ${request} from ${importer}`,
					{ cause: error },
				);
			}
			if (
				resolved == null ||
				resolved.external === true ||
				resolved.external === 'absolute' ||
				cleanModuleId(resolved.id) === cleanModuleId(importer)
			) {
				return;
			}
			await Promise.all(
				candidates.map(async ({ imported, exported }) => {
					if (
						!(await isDescriptorChildrenExport(
							context,
							resolved.id,
							imported,
							request,
							importer,
							descriptorSourceCache,
							descriptorExportCache,
							descriptorGraphCache,
							allowGraphLoad,
						))
					) {
						return;
					}
					proven.add(voidImportKey(request, imported));
					if (exported !== undefined) proven.add(`export\0${exported}`);
				}),
			);
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
	if (options.nativeReads !== undefined && typeof options.nativeReads !== 'boolean') {
		throw new TypeError('octane/compiler/vite: nativeReads must be a boolean when provided.');
	}
	if (options.strong !== undefined && typeof options.strong !== 'boolean') {
		throw new TypeError('octane/compiler/vite: `strong` must be a boolean when provided.');
	}
	if (
		options.cssModuleConstants !== undefined &&
		typeof options.cssModuleConstants !== 'function'
	) {
		throw new TypeError(
			'octane/compiler/vite: `cssModuleConstants` must be a function when provided.',
		);
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
	let specializeCssModuleConstants = false;
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
	const descriptorExportCache = new Map();
	const descriptorGraphCache = new Map();
	// Vite can share a plugin instance between client and server environments.
	// CSS naming/virtual providers can differ between them, so never key a proof
	// merely by its path or share a previous build's final-module snapshot.
	const cssModuleProofStates = new Map();
	const cssModuleProofState = (context, environment) => {
		const key = context.environment ?? environment;
		let state = cssModuleProofStates.get(key);
		if (state === undefined) {
			state = createCssModuleProofState();
			cssModuleProofStates.set(key, state);
		}
		return state;
	};
	// Rollup's one-shot build graph can safely load an unresolved virtual module
	// to collect its transform metadata. Vite's dev plugin container cannot: a
	// transform awaiting `this.load()` for a virtual dependency can wait on the
	// same in-flight transform graph forever. Dev uses already-published graph
	// metadata and exact filesystem source, then fails closed for a still-unseen
	// virtual module until its own transform publishes metadata.
	let allowDescriptorGraphLoad = true;
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		profile: profileEnabled,
		strong: options.strong,
		nativeReads: options.nativeReads,
		renderers: options.renderers,
		requireDirective,
		warn,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		descriptorSourceCache.clear();
		descriptorExportCache.clear();
		descriptorGraphCache.clear();
		cssModuleProofStates.clear();
		projectRoot = nodePath.resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			profile: profileEnabled,
			strong: options.strong,
			nativeReads: options.nativeReads,
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
			if (env?.command !== undefined) allowDescriptorGraphLoad = env.command !== 'serve';
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
			allowDescriptorGraphLoad = config.command !== 'serve';
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
			specializeCssModuleConstants = specializeProductionRoots && !hmrEnabled;
		},
		buildStart() {
			if (this.environment === undefined) cssModuleProofStates.clear();
			else cssModuleProofStates.delete(this.environment);
		},
		buildEnd(error) {
			const keys = this.environment === undefined ? ['client', 'server'] : [this.environment];
			for (const key of keys) {
				const state = cssModuleProofStates.get(key);
				if (state === undefined) continue;
				try {
					if (!error) verifyCssModuleProofs(this, state);
				} finally {
					cssModuleProofStates.delete(key);
				}
			}
		},
		watchChange(id) {
			compiler.invalidate(id);
			// A barrel can cache a classification reached through this source, so
			// invalidate the small descriptor graph as a unit on authored edits.
			descriptorSourceCache.clear();
			descriptorExportCache.clear();
			descriptorGraphCache.clear();
			cssModuleProofStates.clear();
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
			const environment = server ? 'server' : 'client';
			const cssRequests = specializeCssModuleConstants
				? compiler.findCssModuleImportRequests(code, id, environment)
				: [];
			const loadCssImports = () =>
				loadCssModuleImports(
					this,
					cssRequests,
					id,
					environment,
					options.cssModuleConstants,
					cssModuleProofState(this, environment),
				);
			const transformWithProof = (
				proven,
				descriptorProven = new Set(),
				clientOnlyImports = [],
				cssImports = null,
			) => {
				const propagatedExports = [...descriptorProven]
					.filter((key) => key.startsWith('export\0'))
					.map((key) => key.slice('export\0'.length));
				const result = compiler.transform(code, id, {
					environment,
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
					...(cssImports === null
						? null
						: {
								resolveCssModuleConstant: cssImports.resolve,
								// A real class read must survive in each independently retained
								// template. A global side-effect override would make styles from
								// an unused exported component newly eager.
								preserveCssModuleReferences: cssImports.requests,
							}),
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
				cssImports?.consume(result.cssModuleConstantImports);
				for (const dependency of result.dependencies) this.addWatchFile?.(dependency);
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
				const descriptorImports = findDescriptorChildrenImports(code, id).filter(
					(candidate) => candidate.local !== undefined || !nodeFs.existsSync(cleanModuleId(id)),
				);
				return Promise.all([
					loadClientOnlyImports(this, compiler, code, id),
					loadDescriptorChildrenImports(
						this,
						descriptorImports,
						id,
						descriptorSourceCache,
						descriptorExportCache,
						descriptorGraphCache,
						allowDescriptorGraphLoad,
					),
					loadCssImports(),
				]).then(([imports, descriptorProven, cssImports]) =>
					transformWithProof(null, descriptorProven, imports, cssImports),
				);
			}

			const voidImports =
				specializeProductionRoots && !server && !hmrEnabled && !profileEnabled
					? findVoidComponentImports(code, id)
					: [];
			const descriptorImports = findDescriptorChildrenImports(code, id).filter(
				(candidate) => candidate.local !== undefined || !nodeFs.existsSync(cleanModuleId(id)),
			);
			if (voidImports.length === 0 && descriptorImports.length === 0 && cssRequests.length === 0) {
				return transformWithProof(null);
			}
			return Promise.all([
				loadVoidComponentImports(this, voidImports, id),
				loadDescriptorChildrenImports(
					this,
					descriptorImports,
					id,
					descriptorSourceCache,
					descriptorExportCache,
					descriptorGraphCache,
					allowDescriptorGraphLoad,
				),
				loadCssImports(),
			]).then(([proven, descriptorProven, cssImports]) =>
				transformWithProof(proven, descriptorProven, [], cssImports),
			);
		},
	};
}
