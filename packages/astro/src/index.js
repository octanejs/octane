import * as devalue from 'devalue';
import { octane as octaneVite } from 'octane/compiler/vite';
import { compileFilterPatterns } from './compile-filter-patterns.js';
import { getRenderer } from './container-renderer.js';
import { createOwnershipFilter } from './ownership-filter.js';
import {
	isInstalledOctaneCompilerTarget,
	shouldSkipOctaneTransform,
} from './should-skip-transform.js';

/**
 * @typedef {import('../types/index.d.ts').OctaneAstroOptions} OctaneAstroOptions
 * @typedef {import('../types/index.d.ts').VirtualModuleOptions} VirtualModuleOptions
 */

/**
 * @param {OctaneAstroOptions} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function octane(options = {}) {
	const {
		include,
		exclude,
		requireDirective = true,
		profile,
		hmr,
		experimentalDisableStreaming = false,
	} = options;

	return {
		name: '@octanejs/astro',
		hooks: {
			'astro:config:setup': ({ updateConfig, addRenderer }) => {
				addRenderer(getRenderer());
				updateConfig({
					vite: getViteConfiguration({
						include,
						exclude,
						requireDirective,
						profile,
						hmr,
						experimentalDisableStreaming,
					}),
				});
			},
			'astro:config:done': ({ logger, config }) => {
				const knownJsxRenderers = [
					'@astrojs/react',
					'@astrojs/preact',
					'@astrojs/solid-js',
					'@octanejs/astro',
				];
				const enabledKnownJsxRenderers = config.integrations.filter((renderer) =>
					knownJsxRenderers.includes(renderer.name),
				);

				if (enabledKnownJsxRenderers.length > 1 && include == null && exclude == null) {
					logger.warn(
						'More than one JSX renderer is enabled. Set `include` or `exclude` on @octanejs/astro (and the other integration) so each owns a distinct set of modules. See https://docs.astro.build/en/guides/integrations-guide/react/#combining-multiple-jsx-frameworks',
					);
				}
			},
		},
	};
}

export { getContainerRenderer } from './container-renderer.js';

/**
 * @param {OctaneAstroOptions & { requireDirective: boolean; experimentalDisableStreaming: boolean }} options
 */
function getViteConfiguration({
	include,
	exclude,
	requireDirective,
	profile,
	hmr,
	experimentalDisableStreaming,
}) {
	const ownershipFilter = createOwnershipFilter(include, exclude);

	return {
		plugins: [
			astroScopedOctanePlugin(
				octaneVite({
					// Literal fragments only — the compiler uses `file.includes(...)`.
					// Astro globs / RegExp ownership live in `ownershipFilter` below.
					exclude: ['.astro'],
					requireDirective,
					profile,
					hmr,
				}),
				ownershipFilter,
			),
			optionsPlugin({
				include,
				exclude,
				experimentalDisableStreaming,
			}),
		],
		resolve: {
			dedupe: ['octane'],
		},
		optimizeDeps: {
			// Client hydrator only — leave `octane` to octane/compiler/vite's
			// optimizeDeps.exclude so the runtime is not double-classified.
			include: ['@octanejs/astro/client.js'],
		},
		ssr: {
			// Keep the integration in the SSR graph so `astro:octane:opts` resolves.
			// Do not force-bundle `octane` itself — that pulls Astro's SSR app graph
			// through the compiler's async transform path and deadlocks Rollup.
			noExternal: ['@octanejs/astro'],
		},
	};
}

/**
 * Skip Astro virtual modules / ordinary node_modules, then apply Astro
 * include/exclude ownership before the Octane compiler's SSR `transform`
 * schedule (which may `load()` importers and deadlock Rollup when applied to
 * Astro's own runtime graph). Published Octane bindings under node_modules
 * bypass ownership — project `include` globs must not block them.
 *
 * @param {import('vite').Plugin} plugin
 * @param {((id: string) => boolean) | null} ownershipFilter
 * @returns {import('vite').Plugin}
 */
function astroScopedOctanePlugin(plugin, ownershipFilter) {
	const transform = plugin.transform;
	if (typeof transform !== 'function') return plugin;
	return {
		...plugin,
		transform(code, id, options) {
			if (shouldSkipOctaneTransform(id)) return null;
			if (ownershipFilter && !isInstalledOctaneCompilerTarget(id) && !ownershipFilter(id)) {
				return null;
			}
			return transform.call(this, code, id, options);
		},
	};
}

/**
 * @param {{
 *   include?: OctaneAstroOptions['include'];
 *   exclude?: OctaneAstroOptions['exclude'];
 *   experimentalDisableStreaming: boolean;
 * }} opts
 */
function optionsPlugin({ include, exclude, experimentalDisableStreaming }) {
	const virtualModule = 'astro:octane:opts';
	const virtualModuleId = '\0' + virtualModule;
	/** @type {VirtualModuleOptions} */
	const serialized = {
		include: compileFilterPatterns(include),
		exclude: compileFilterPatterns(exclude),
		experimentalDisableStreaming,
	};
	return {
		name: '@octanejs/astro:opts',
		enforce: 'pre',
		/**
		 * Classic function hooks — Astro 5's Vite pipeline does not reliably
		 * invoke the object-form `filter`/`handler` resolveId/load shape.
		 * @param {string} id
		 */
		resolveId(id) {
			if (id === virtualModule) return virtualModuleId;
		},
		/**
		 * @param {string} id
		 */
		load(id) {
			if (id === virtualModuleId) {
				return `export default ${devalue.uneval(serialized)}`;
			}
		},
	};
}
