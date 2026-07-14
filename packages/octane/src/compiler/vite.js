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

export function octane(options = {}) {
	let hmrEnabled = options.hmr;
	let projectRoot = resolve(process.cwd());
	let compiler = createOctaneCompiler({
		root: projectRoot,
		exclude: options.exclude,
		parallelUse: options.parallelUse,
	});
	// An explicit override of Vite's per-module SSR auto-detection.
	const forceSsr = options.ssr;

	const resetCompiler = (root) => {
		projectRoot = resolve(root);
		compiler = createOctaneCompiler({
			root: projectRoot,
			exclude: options.exclude,
			parallelUse: options.parallelUse,
		});
	};

	return {
		name: 'octane',
		enforce: 'pre',
		config(config) {
			resetCompiler(config.root ?? process.cwd());
			const sourceDependencies = compiler.discoverSourceDependencies().packages;
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
				parallelUse: options.parallelUse,
			});
			if (result === null) return null;
			for (const dependency of result.dependencies) this.addWatchFile?.(dependency);
			if (result.kind === 'none') return null;
			return { code: result.code, map: result.map };
		},
	};
}
