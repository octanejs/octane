/**
 * Vite adapter for the bundler-neutral Octane compiler integration.
 *
 * Per-module target is chosen from Vite's SSR signal: a module compiled for the
 * server environment uses SSR codegen, while every other module uses the client
 * DOM runtime. Source eligibility, manifests, canonical IDs, dependency
 * discovery, and transforms live in ./bundler.js so other integrations share
 * exactly the same behavior.
 */
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	cleanModuleId,
	createClientReferenceManifest,
	createOctaneCompiler,
	discoverOctaneSourceDependencies,
	findVoidRootImports,
} from './bundler.js';

export { discoverOctaneSourceDependencies };

const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';
const VOID_EXPORTS_META = 'octane:void-component-exports';
const CLIENT_REFERENCE_META = 'octane:client-reference';

function realRoot(path) {
	try {
		return realpathSync(path);
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
	return createHash('sha256').update(code).digest('base64url');
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
	const profileEnabled = options.profile === true && options.ssr !== true;
	let projectRoot = resolve(process.cwd());
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		profile: profileEnabled,
		renderers: options.renderers,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		projectRoot = resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			profile: profileEnabled,
			renderers: options.renderers,
		});
	};

	return {
		name: 'octane',
		enforce: 'pre',
		config(config) {
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
				resolve: { dedupe: ['octane'] },
				ssr: { noExternal: sourceDependencies },
			};
		},
		configResolved(config) {
			// Re-check the final merged value so a later plugin cannot silently win the
			// reserved definition and desynchronize compiler metadata from the runtime.
			assertProfilingDefineAvailable(config.define, profileEnabled);
			if (realRoot(resolve(config.root)) !== realRoot(projectRoot)) resetCompiler(config.root);
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
					? findVoidRootImports(code, id)
					: [];
			if (voidImports.length === 0) return transformWithProof(null);
			return loadVoidComponentImports(this, voidImports, id).then(transformWithProof);
		},
	};
}
