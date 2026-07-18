import { RuntimeWrapperWebpackPlugin } from '@lynx-js/runtime-wrapper-webpack-plugin';
import {
	LynxEncodePlugin,
	LynxTemplatePlugin,
	WebEncodePlugin,
} from '@lynx-js/template-webpack-plugin';

const TARGET_SDK_VERSION = '3.9';
const MAIN_THREAD_ASSET = /main-thread(?:\.[A-Fa-f0-9]+)?\.js$/;

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

function entryImports(values) {
	const imports = [];
	for (const value of values) {
		if (typeof value === 'string') {
			imports.push(value);
		} else if (Array.isArray(value)) {
			imports.push(...value);
		} else if (Array.isArray(value.import)) {
			imports.push(...value.import);
		} else {
			imports.push(value.import);
		}
	}
	return imports;
}

export function pluginOctaneLynxPhase0({ mainThreadEntries } = {}) {
	return {
		name: 'octane:lynx-phase-0',
		setup(api) {
			api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
				return mergeRsbuildConfig(
					{
						tools: {
							rspack: {
								output: { iife: false },
							},
						},
					},
					config,
				);
			});

			api.modifyBundlerChain((chain, { environment }) => {
				const entries = chain.entryPoints.entries() ?? {};
				const isLynx = environment.name === 'lynx';
				const isWeb = environment.name === 'web';
				if (!isLynx && !isWeb) return;

				chain.entryPoints.clear();
				for (const [entryName, entryPoint] of Object.entries(entries)) {
					const backgroundImports = entryImports(entryPoint.values());
					const configuredMainThreadEntry = mainThreadEntries?.[entryName];
					if (configuredMainThreadEntry === undefined) {
						throw new Error(`Octane Lynx Phase 0 requires a main-thread entry for ${entryName}.`);
					}
					const mainThreadImports = entryImports([configuredMainThreadEntry]);
					const mainThreadEntry = `${entryName}__main-thread`;
					const mainThreadFilename = isLynx
						? `.rspeedy/${entryName}/main-thread.js`
						: `${entryName}/main-thread.js`;
					const backgroundFilename = isLynx
						? `.rspeedy/${entryName}/background.js`
						: `${entryName}/background.js`;

					chain.entry(mainThreadEntry).add({
						filename: mainThreadFilename,
						import: mainThreadImports,
						layer: 'octane:main-thread',
					});
					chain.entry(entryName).add({
						filename: backgroundFilename,
						import: backgroundImports,
						layer: 'octane:background',
					});

					chain.plugin(`octane:lynx-template:${entryName}`).use(LynxTemplatePlugin, [
						{
							chunks: [mainThreadEntry, entryName],
							cssPlugins: [],
							dsl: 'react_nodiff',
							enableA11y: true,
							enableAccessibilityElement: false,
							enableCSSInheritance: false,
							enableCSSInvalidation: true,
							enableCSSSelector: true,
							enableNewGesture: false,
							enableRemoveCSSScope: true,
							filename: `${entryName}.${environment.name}.bundle`,
							intermediate: `.rspeedy/${entryName}`,
							removeDescendantSelectorScope: true,
							targetSdkVersion: TARGET_SDK_VERSION,
						},
					]);
				}

				chain.plugin('octane:mark-main-thread').use(MarkMainThreadAssetPlugin);
				if (isLynx) {
					chain.plugin('octane:runtime-wrapper').use(RuntimeWrapperWebpackPlugin, [
						{
							targetSdkVersion: TARGET_SDK_VERSION,
							test: /^(?!.*main-thread(?:\.[A-Fa-f0-9]+)?\.js$).*\.js$/,
						},
					]);
					chain.plugin('octane:lynx-encode').use(LynxEncodePlugin, [{ inlineScripts: true }]);
				} else {
					chain.plugin('octane:web-encode').use(WebEncodePlugin);
				}
			});
		},
	};
}
