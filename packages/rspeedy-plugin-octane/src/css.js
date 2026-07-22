import { CssExtractRspackPlugin } from '@lynx-js/css-extract-webpack-plugin';

import { LYNX_TARGET_SDK_VERSION } from './application.js';

const PLUGIN_NAME = '@octanejs/rspeedy-plugin';

function removeLightningCSS(rule, useName) {
	if (rule?.uses?.has(useName)) rule.uses.delete(useName);
}

/** Install the framework-neutral Lynx CSS extractor over Rsbuild's web extractor. */
export function configureLynxCSS(api, environments) {
	api.modifyEnvironmentConfig?.((config, { name, mergeEnvironmentConfig }) => {
		if (
			(environments !== undefined && !environments.includes(name)) ||
			!/^(?:lynx|web)(?:-|$)/.test(name)
		) {
			return;
		}
		return mergeEnvironmentConfig(config, { output: { injectStyles: false } });
	});
	api.modifyBundlerChain((chain, { CHAIN_ID, environment }) => {
		if (
			CHAIN_ID === undefined ||
			chain.module === undefined ||
			(environments !== undefined && !environments.includes(environment.name)) ||
			!/^(?:lynx|web)(?:-|$)/.test(environment.name)
		) {
			return;
		}
		const cssRules = [
			CHAIN_ID.RULE.CSS,
			CHAIN_ID.RULE.SASS,
			CHAIN_ID.RULE.LESS,
			CHAIN_ID.RULE.STYLUS,
		];
		for (const ruleName of cssRules) {
			if (!ruleName || !chain.module.rules.has(ruleName)) continue;
			const rule = chain.module.rule(ruleName);
			const mainRuleName = ruleName === CHAIN_ID.RULE.CSS ? CHAIN_ID.ONE_OF.CSS_MAIN : ruleName;
			const mainRule = rule.oneOf(mainRuleName);
			removeLightningCSS(mainRule, CHAIN_ID.USE.LIGHTNINGCSS);
			mainRule.use(CHAIN_ID.USE.MINI_CSS_EXTRACT).loader(CssExtractRspackPlugin.loader);

			const inlineRuleName =
				ruleName === CHAIN_ID.RULE.CSS ? CHAIN_ID.ONE_OF.CSS_INLINE : `${ruleName}-inline`;
			removeLightningCSS(rule.oneOf(inlineRuleName), CHAIN_ID.USE.LIGHTNINGCSS);
		}

		if (!chain.plugins.has(CHAIN_ID.PLUGIN.MINI_CSS_EXTRACT)) {
			throw new Error(`${PLUGIN_NAME}: Rsbuild did not install its CSS extraction plugin.`);
		}
		chain
			.plugin(CHAIN_ID.PLUGIN.MINI_CSS_EXTRACT)
			.tap(([options]) => [
				{
					...options,
					cssPlugins: [],
					enableCSSInvalidation: true,
					enableCSSSelector: true,
					enableRemoveCSSScope: true,
					targetSdkVersion: LYNX_TARGET_SDK_VERSION,
				},
			])
			.init((_, args) => new CssExtractRspackPlugin(...args));
	});
}
