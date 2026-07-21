import { resolve } from 'node:path';

import {
	lynxRspeedyBackgroundRenderers,
	lynxRspeedyMainThreadRenderers,
} from '@octanejs/lynx/config';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';

import { applyLynxApplication, exposeLynxTemplatePlugin } from './application.js';
import { configureLynxCSS } from './css.js';
import {
	applyLynxEntryLayer,
	LYNX_MAIN_THREAD_LAYER,
	LYNX_MAIN_THREAD_RUNTIME,
	resolveLynxLayer,
} from './layers.js';
import { assertLynxToolchain } from './toolchain.js';

const PLUGIN_NAME = '@octanejs/rspeedy-plugin';
const MAIN_THREAD_FACADE_PLUGIN = `${PLUGIN_NAME}:main-thread-facade`;
const LYNX_PACKAGE_ROOT = /^@octanejs\/lynx$/;
const APPLICATION_LAYER_SPECIALIZATIONS = Object.freeze({
	[LYNX_MAIN_THREAD_LAYER]: Object.freeze({
		renderers: lynxRspeedyMainThreadRenderers,
		runtime: '@octanejs/lynx/main-renderer',
		universalRuntime: LYNX_MAIN_THREAD_RUNTIME,
	}),
});

class LynxMainThreadFacadePlugin {
	apply(compiler) {
		const NormalModuleReplacementPlugin = compiler.webpack?.NormalModuleReplacementPlugin;
		if (typeof NormalModuleReplacementPlugin !== 'function') {
			throw new TypeError(
				`${PLUGIN_NAME}: this Rspack compiler does not expose webpack.NormalModuleReplacementPlugin.`,
			);
		}
		new NormalModuleReplacementPlugin(LYNX_PACKAGE_ROOT, (resource) => {
			if (resource.contextInfo?.issuerLayer === LYNX_MAIN_THREAD_LAYER) {
				resource.request = '@octanejs/lynx/first-screen';
			}
		}).apply(compiler);
	}
}

function normalizeStringArray(value, name) {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new TypeError(`${PLUGIN_NAME}: \`${name}\` must be an array of strings.`);
	}
	return Object.freeze([...new Set(value)]);
}

function normalizeOptions(value) {
	const options = value ?? {};
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError(`${PLUGIN_NAME}: options must be an object.`);
	}
	const allowed = new Set([
		'dev',
		'environments',
		'exclude',
		'hmr',
		'profile',
		'requireDirective',
		'thread',
	]);
	for (const key of Object.keys(options)) {
		if (!allowed.has(key)) throw new TypeError(`${PLUGIN_NAME}: unknown option \`${key}\`.`);
	}
	for (const key of ['dev', 'hmr', 'profile', 'requireDirective']) {
		if (options[key] !== undefined && typeof options[key] !== 'boolean') {
			throw new TypeError(`${PLUGIN_NAME}: \`${key}\` must be a boolean.`);
		}
	}
	const application = options.thread === undefined;
	const thread = options.thread ?? 'background';
	const layer = resolveLynxLayer(thread);
	return Object.freeze({
		...layer,
		application,
		thread,
		renderers:
			thread === 'main-thread' ? lynxRspeedyMainThreadRenderers : lynxRspeedyBackgroundRenderers,
		...(application ? { layerSpecializations: APPLICATION_LAYER_SPECIALIZATIONS } : null),
		...(options.dev === undefined ? null : { dev: options.dev }),
		...(options.hmr === undefined ? null : { hmr: options.hmr }),
		...(options.profile === undefined ? null : { profile: options.profile }),
		...(options.requireDirective === undefined
			? null
			: { requireDirective: options.requireDirective }),
		...(options.environments === undefined
			? null
			: { environments: normalizeStringArray(options.environments, 'environments') }),
		...(options.exclude === undefined
			? null
			: { exclude: normalizeStringArray(options.exclude, 'exclude') }),
	});
}

/**
 * Build an Octane Lynx application, or compile one isolated thread graph when
 * `thread` is selected explicitly for diagnostics and source-level testing.
 *
 * @returns {import('@rsbuild/core').RsbuildPlugin}
 */
export function pluginOctane(value) {
	const options = normalizeOptions(value);
	return {
		name: PLUGIN_NAME,
		enforce: 'pre',
		setup(api) {
			const root = resolve(api.context.rootPath);
			assertLynxToolchain(root);
			const appliesToEnvironment = (environment) =>
				(options.environments === undefined || options.environments.includes(environment.name)) &&
				(!options.application || /^(?:lynx|web)(?:-|$)/.test(environment.name));
			if (options.application) {
				exposeLynxTemplatePlugin(api);
				configureLynxCSS(api, options.environments);
				api.modifyEnvironmentConfig?.((config, { name, mergeEnvironmentConfig }) => {
					if (!appliesToEnvironment({ name })) return;
					return mergeEnvironmentConfig(config, {
						...(config.splitChunks === undefined ? { splitChunks: false } : null),
						tools: { rspack: { output: { iife: false } } },
					});
				});
			}
			api.modifyBundlerChain((chain, { environment }) => {
				if (!appliesToEnvironment(environment)) return;
				const extensionAlias = chain.resolve.extensionAlias;
				const configuredAliases = extensionAlias.has('.js') ? extensionAlias.get('.js') : ['.js'];
				const aliases = Array.isArray(configuredAliases) ? configuredAliases : [configuredAliases];
				if (!aliases.includes('.ts')) extensionAlias.set('.js', ['.ts', ...aliases]);
				chain.plugin(`${PLUGIN_NAME}:compiler`).use(OctaneRspackPlugin, [
					{
						environment: 'client',
						renderers: options.renderers,
						runtime: '@octanejs/lynx/renderer',
						universalRuntime: options.universalRuntime,
						...(options.layerSpecializations === undefined
							? null
							: { layerSpecializations: options.layerSpecializations }),
						...(options.dev === undefined ? null : { dev: options.dev }),
						...(options.hmr === undefined ? null : { hmr: options.hmr }),
						...(options.profile === undefined ? null : { profile: options.profile }),
						...(options.exclude === undefined ? null : { exclude: [...options.exclude] }),
						...(options.requireDirective === undefined
							? null
							: { requireDirective: options.requireDirective }),
					},
				]);
				if (options.application) {
					chain.plugin(MAIN_THREAD_FACADE_PLUGIN).use(LynxMainThreadFacadePlugin, []);
				}
			});
			api.modifyBundlerChain({
				order: 'post',
				handler(chain, context) {
					const { environment } = context;
					if (!appliesToEnvironment(environment)) return;
					if (options.application) {
						const rspeedyConfig =
							api.useExposed?.(Symbol.for('rspeedy.api'))?.config ?? api.getRsbuildConfig?.() ?? {};
						applyLynxApplication(chain, context, rspeedyConfig, options);
					} else {
						applyLynxEntryLayer(chain, options.layer);
					}
				},
			});
		},
	};
}

export const octane = pluginOctane;
