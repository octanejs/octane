import { createRequire } from 'node:module';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { RuntimeWrapperWebpackPlugin } from '@lynx-js/runtime-wrapper-webpack-plugin';
import {
	LynxEncodePlugin,
	LynxTemplatePlugin,
	WebEncodePlugin,
} from '@lynx-js/template-webpack-plugin';

import { LYNX_BACKGROUND_LAYER, LYNX_MAIN_THREAD_LAYER } from './layers.js';

const PLUGIN_NAME = '@octanejs/rspeedy-plugin';
const DEFAULT_BUNDLE_FILENAME = '[name].[platform].bundle';
const DEFAULT_FILENAME_HASH = '.[contenthash:8]';
const TRAILING_FILENAME_HASHES =
	/((?:\.\[(?:fullhash|chunkhash|contenthash|hash)(?::[^\]]+)?\])+)$/;
const MAIN_THREAD_SUFFIX = '__octane_main_thread';
const MAIN_THREAD_ASSET = /main-thread(?:\.[A-Fa-f0-9]+)?\.js$/;
const ENTRY_METADATA_KEYS = new Set([
	'asyncChunks',
	'baseUri',
	'chunkLoading',
	'library',
	'publicPath',
	'runtime',
	'wasmLoading',
]);
const pluginRequire = createRequire(import.meta.url);
const mainThreadEntry = fileURLToPath(new URL('./main-thread-entry.js', import.meta.url));
const mainThreadCSSHMR = pluginRequire.resolve(
	'@lynx-js/css-extract-webpack-plugin/runtime/hotModuleReplacement.lepus.cjs',
);

export const LYNX_TARGET_SDK_VERSION = '3.9';

/** Let Rspeedy's framework-neutral diagnostics observe encoded template hooks. */
export function exposeLynxTemplatePlugin(api) {
	api.expose?.(Symbol.for('LynxTemplatePlugin'), {
		LynxTemplatePlugin: {
			getLynxTemplatePluginHooks:
				LynxTemplatePlugin.getLynxTemplatePluginHooks.bind(LynxTemplatePlugin),
		},
	});
}

class MarkMainThreadAssetPlugin {
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: this.constructor.name,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				() => {
					for (const asset of compilation.getAssets()) {
						if (!MAIN_THREAD_ASSET.test(asset.name)) continue;
						compilation.updateAsset(asset.name, asset.source, {
							...asset.info,
							'lynx:main-thread': true,
						});
					}
				},
			);
		});
	}
}

function environmentKind(name) {
	if (name === 'lynx' || name.startsWith('lynx-')) return 'lynx';
	if (name === 'web' || name.startsWith('web-')) return 'web';
	return null;
}

function entryConfiguration(entryName, values) {
	const imports = [];
	const metadata = {};
	for (const value of values) {
		if (typeof value === 'string') {
			imports.push(value);
			continue;
		}
		if (Array.isArray(value)) {
			if (value.some((item) => typeof item !== 'string')) {
				throw new TypeError(
					`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} has invalid imports.`,
				);
			}
			imports.push(...value);
			continue;
		}
		if (value === null || typeof value !== 'object') {
			throw new TypeError(`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} is invalid.`);
		}
		const configuredImports = value.import;
		if (typeof configuredImports === 'string') imports.push(configuredImports);
		else if (
			Array.isArray(configuredImports) &&
			configuredImports.every((item) => typeof item === 'string')
		) {
			imports.push(...configuredImports);
		} else {
			throw new TypeError(
				`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} has invalid imports.`,
			);
		}
		const dependOn = value.dependOn;
		if (dependOn !== undefined) {
			throw new Error(
				`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} cannot use dependOn because each native bundle must contain its complete background graph.`,
			);
		}
		for (const [key, configuredValue] of Object.entries(value)) {
			if (key === 'import' || key === 'dependOn') continue;
			if (key === 'filename' && configuredValue !== undefined) {
				throw new Error(
					`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} cannot set filename; configure output.filename.js instead.`,
				);
			}
			if (key === 'layer' && configuredValue !== undefined && configuredValue !== null) {
				if (configuredValue !== LYNX_BACKGROUND_LAYER) {
					throw new Error(
						`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} cannot use layer ${JSON.stringify(configuredValue)}; application entries run on ${JSON.stringify(LYNX_BACKGROUND_LAYER)}.`,
					);
				}
				continue;
			}
			if (key === 'filename' || key === 'layer') continue;
			if (!ENTRY_METADATA_KEYS.has(key)) {
				throw new Error(
					`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} uses unsupported option ${JSON.stringify(key)}.`,
				);
			}
			if (Object.hasOwn(metadata, key) && !isDeepStrictEqual(metadata[key], configuredValue)) {
				throw new Error(
					`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} has conflicting ${JSON.stringify(key)} options.`,
				);
			}
			metadata[key] = configuredValue;
		}
	}
	if (imports.length === 0) {
		throw new Error(`${PLUGIN_NAME}: entry ${JSON.stringify(entryName)} has no imports.`);
	}
	return {
		imports,
		metadata,
	};
}

function replaceBundlePlaceholders(filename, entryName, platform) {
	return filename.replaceAll('[name]', entryName).replaceAll('[platform]', platform);
}

function resolveBundleFilename(config, entryName, platform) {
	const configured = config?.output?.filename;
	const bundle =
		configured !== null && typeof configured === 'object'
			? (configured.bundle ?? configured.template)
			: configured;
	const filename =
		typeof bundle === 'function'
			? bundle({ entryName, lazyBundle: false, platform })
			: (bundle ?? DEFAULT_BUNDLE_FILENAME);
	if (typeof filename !== 'string' || filename.length === 0) {
		throw new TypeError(`${PLUGIN_NAME}: output.filename.bundle must resolve to a filename.`);
	}
	return replaceBundlePlaceholders(filename, entryName, platform);
}

function filenameHash(config, isProd) {
	const configured = config?.output?.filenameHash;
	if (configured === false || configured === '') return '';
	if (configured === true || configured === undefined) {
		return isProd ? DEFAULT_FILENAME_HASH : '';
	}
	if (typeof configured === 'string') {
		return isProd ? `.[${configured}]` : '';
	}
	if (configured === null || typeof configured !== 'object' || Array.isArray(configured)) {
		throw new TypeError(`${PLUGIN_NAME}: output.filenameHash is invalid.`);
	}
	const enable = configured.enable ?? true;
	if (enable !== true && enable !== false && enable !== 'always') {
		throw new TypeError(`${PLUGIN_NAME}: output.filenameHash.enable is invalid.`);
	}
	const format = configured.format ?? DEFAULT_FILENAME_HASH.slice(2, -1);
	if (typeof format !== 'string' || format.length === 0) {
		throw new TypeError(`${PLUGIN_NAME}: output.filenameHash.format must be a non-empty string.`);
	}
	return enable === 'always' || (enable === true && isProd) ? `.[${format}]` : '';
}

function resolveBackgroundFilename(entryName, config, isProd) {
	const configured = config?.output?.filename?.js;
	const asBackgroundFilename = (filename) => {
		if (!filename.endsWith('.js')) return `${filename}/background.js`;
		const stem = filename.slice(0, -3);
		const hashSuffix = stem.match(TRAILING_FILENAME_HASHES)?.[1];
		return hashSuffix === undefined
			? `${stem}/background.js`
			: posix.join(stem.slice(0, -hashSuffix.length), `background${hashSuffix}.js`);
	};
	if (typeof configured === 'string') {
		return asBackgroundFilename(configured.replaceAll('[name]', entryName));
	}
	if (typeof configured === 'function') {
		return (pathData, assetInfo) => {
			const filename = configured(pathData, assetInfo);
			if (typeof filename !== 'string' || filename.length === 0) {
				throw new TypeError(`${PLUGIN_NAME}: output.filename.js must resolve to a filename.`);
			}
			return asBackgroundFilename(filename);
		};
	}
	return `${entryName}/background${filenameHash(config, isProd)}.js`;
}

function prepend(entry, value) {
	if (typeof entry.prepend === 'function') entry.prepend(value);
	else entry.add(value);
}

function prefixFilename(prefix, filename) {
	if (prefix.length === 0) return filename;
	return typeof filename === 'function'
		? (pathData, assetInfo) => posix.join(prefix, filename(pathData, assetInfo))
		: posix.join(prefix, filename);
}

/** Split authored entries into a background application and generated receiver. */
export function applyLynxApplication(chain, context, rspeedyConfig, options) {
	const kind = environmentKind(context.environment.name);
	if (kind === null) return false;

	const entries = Object.entries(chain.entryPoints.entries() ?? {});
	const names = new Set(entries.map(([name]) => name));
	for (const [entryName] of entries) {
		const generatedName = `${entryName}${MAIN_THREAD_SUFFIX}`;
		if (names.has(generatedName)) {
			throw new Error(
				`${PLUGIN_NAME}: entry ${JSON.stringify(generatedName)} collides with the generated main-thread receiver for ${JSON.stringify(entryName)}.`,
			);
		}
	}

	const isDev = context.isDev === true;
	const isProd = context.isProd === true;
	const hmr = isDev && options.hmr !== false && context.environment.config?.dev?.hmr !== false;
	const liveReload = isDev && context.environment.config?.dev?.liveReload !== false;
	chain.entryPoints.clear();

	for (const [entryName, entryPoint] of entries) {
		const configuredEntry = entryConfiguration(entryName, entryPoint.values());
		const generatedName = `${entryName}${MAIN_THREAD_SUFFIX}`;
		const intermediate = posix.join('.rspeedy', entryName);
		const mainFilename = posix.join(kind === 'lynx' ? '.rspeedy' : '', entryName, 'main-thread.js');
		const backgroundFilename = prefixFilename(
			kind === 'lynx' ? '.rspeedy' : '',
			resolveBackgroundFilename(entryName, context.environment.config, isProd),
		);

		const receiver = chain.entry(generatedName);
		receiver.add({
			filename: mainFilename,
			import: [mainThreadEntry],
			layer: LYNX_MAIN_THREAD_LAYER,
		});
		if (hmr) {
			prepend(receiver, {
				import: [mainThreadCSSHMR],
				layer: LYNX_MAIN_THREAD_LAYER,
			});
		}

		const background = chain.entry(entryName);
		background.add({
			...configuredEntry.metadata,
			filename: backgroundFilename,
			import: configuredEntry.imports,
			layer: LYNX_BACKGROUND_LAYER,
		});
		if (hmr) {
			prepend(background, {
				import: ['@rspack/core/hot/dev-server'],
				layer: LYNX_BACKGROUND_LAYER,
			});
		}
		if (hmr || liveReload) {
			// Keep this request bare: Rspeedy aliases it to attach the dev-server connection query.
			prepend(background, {
				import: ['@lynx-js/webpack-dev-transport/client'],
				layer: LYNX_BACKGROUND_LAYER,
			});
		}

		chain.plugin(`${PLUGIN_NAME}:template:${entryName}`).use(LynxTemplatePlugin, [
			{
				chunks: [generatedName, entryName],
				cssPlugins: [],
				dsl: 'react_nodiff',
				enableA11y: true,
				enableAccessibilityElement: false,
				enableCSSInheritance: false,
				enableCSSInvalidation: true,
				enableCSSSelector: true,
				enableNewGesture: false,
				enableRemoveCSSScope: true,
				filename: resolveBundleFilename(rspeedyConfig, entryName, context.environment.name),
				intermediate,
				removeDescendantSelectorScope: true,
				targetSdkVersion: LYNX_TARGET_SDK_VERSION,
			},
		]);
	}

	chain.plugin(`${PLUGIN_NAME}:mark-main-thread`).use(MarkMainThreadAssetPlugin);
	if (kind === 'lynx') {
		chain.plugin(`${PLUGIN_NAME}:runtime-wrapper`).use(RuntimeWrapperWebpackPlugin, [
			{
				targetSdkVersion: LYNX_TARGET_SDK_VERSION,
				test: /^(?!.*main-thread(?:\.[A-Fa-f0-9]*)?\.js$).*\.js$/,
			},
		]);
		chain.plugin(`${PLUGIN_NAME}:lynx-encode`).use(LynxEncodePlugin, [
			{
				inlineScripts: context.environment.config?.output?.inlineScripts ?? true,
			},
		]);
	} else {
		chain.plugin(`${PLUGIN_NAME}:web-encode`).use(WebEncodePlugin);
	}
	return true;
}
