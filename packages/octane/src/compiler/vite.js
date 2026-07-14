/**
 * Vite adapter for the bundler-neutral Octane compiler integration.
 *
 * Per-module target is chosen from Vite's SSR signal: a module compiled for the
 * server environment uses SSR codegen, while every other module uses the client
 * DOM runtime. Source eligibility, manifests, canonical IDs, dependency
 * discovery, and transforms live in ./bundler.js so other integrations share
 * exactly the same behavior.
 */
import { resolve } from 'node:path';
import { createOctaneCompiler, discoverOctaneSourceDependencies } from './bundler.js';

export { discoverOctaneSourceDependencies };

const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';

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
	let hmrEnabled = options.hmr;
	// Profiling is intentionally independent of serve/HMR. `ssr: true` is the
	// adapter's explicit server-only override, where client profiling must stay off.
	const profileEnabled = options.profile === true && options.ssr !== true;
	let projectRoot = resolve(process.cwd());
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		profile: profileEnabled,
		parallelUse: options.parallelUse,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		projectRoot = resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			profile: profileEnabled,
			parallelUse: options.parallelUse,
		});
	};

	return {
		name: 'octane',
		enforce: 'pre',
		config(config) {
			assertProfilingDefineAvailable(config.define, profileEnabled);
			resetCompiler(config.root ?? process.cwd());
			const sourceDependencies = compiler.discoverSourceDependencies().packages;
			return {
				// The runtime uses this reserved constant to make normal builds erase
				// profiling branches completely. Keep it defined in both modes so Vite's
				// production optimizer never has to preserve a runtime feature check.
				define: {
					__OCTANE_PROFILE_ENABLED__: JSON.stringify(profileEnabled),
				},
				// Raw Octane dependencies must reach this plugin, never esbuild's dep
				// prebundle or Node's SSR external loader. Dedupe the runtime as an
				// additional guard for linked/local package layouts.
				optimizeDeps: { exclude: sourceDependencies },
				resolve: { dedupe: ['octane'] },
				ssr: { noExternal: sourceDependencies },
			};
		},
		configResolved(config) {
			// Re-check the final merged value so a later plugin cannot silently win the
			// reserved definition and desynchronize compiler metadata from the runtime.
			assertProfilingDefineAvailable(config.define, profileEnabled);
			if (resolve(config.root) !== projectRoot) resetCompiler(config.root);
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		watchChange(id) {
			compiler.invalidate(id);
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
			const result = compiler.transform(code, id, {
				environment: server ? 'server' : 'client',
				hmr: !server && hmrEnabled ? 'vite' : false,
				// Preserve the existing Vite gate: source locations are emitted only
				// for a client serve transform where HMR is active.
				dev: !server && !!hmrEnabled,
				profile: !server && profileEnabled,
				parallelUse: options.parallelUse,
			});
			if (result === null) return null;
			for (const dependency of result.dependencies) this.addWatchFile?.(dependency);
			if (result.kind === 'none') return null;
			return { code: result.code, map: result.map };
		},
	};
}
