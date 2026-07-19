import { RSBUILD_RSC_LAYERS } from "./planning.js";
//#region src/rsbuild/swc-rsc.ts
/**
* Walk the rspack config's module.rules and inject
* `rspackExperiments.reactServerComponents: true` into SWC loaders.
*
* Recurses into `oneOf` arrays because rsbuild nests the main SWC loader
* inside a `oneOf` rule (e.g. separate branches for asset/source vs
* javascript/auto). Without recursion, only the mimetype-based fallback
* SWC rule gets the flag, leaving most .js/.ts files without RSC
* directive detection.
*/
function enableSwcReactServerComponents(config, scope) {
	const isRspackRule = (rule) => !!rule && rule !== "...";
	const getRuleLoaders = (rule) => {
		const { use } = rule;
		if (!use) return [];
		return typeof use === "function" ? [] : Array.isArray(use) ? use : [use];
	};
	const getLoaderPath = (loader) => typeof loader === "string" ? loader : loader.loader;
	const cloneLoader = (loader) => {
		if (typeof loader === "string") return loader;
		const options = loader.options;
		return {
			...loader,
			...options && typeof options === "object" && !Array.isArray(options) ? { options: {
				...options,
				...options.rspackExperiments && typeof options.rspackExperiments === "object" && !Array.isArray(options.rspackExperiments) ? { rspackExperiments: { ...options.rspackExperiments } } : {}
			} } : {}
		};
	};
	const cloneRuleUse = (use) => {
		if (!use || typeof use === "function") return use;
		if (Array.isArray(use)) return use.map((loader) => cloneLoader(loader));
		return cloneLoader(use);
	};
	const cloneRspackRule = (rule) => {
		return {
			...rule,
			use: cloneRuleUse(rule.use),
			resolve: rule.resolve ? { ...rule.resolve } : rule.resolve,
			oneOf: Array.isArray(rule.oneOf) ? rule.oneOf.map((childRule) => isRspackRule(childRule) ? cloneRspackRule(childRule) : childRule) : rule.oneOf
		};
	};
	const rootRules = (config.module.rules ??= []).filter(isRspackRule);
	function processRules(rules = rootRules) {
		for (const rule of rules) {
			processRules(Array.isArray(rule.oneOf) ? rule.oneOf.filter(isRspackRule) : []);
			if (!getRuleLoaders(rule).some((loader) => Boolean(getLoaderPath(loader)?.includes("swc-loader")))) continue;
			const enableReactServerComponentsOnRule = (nextRule) => {
				for (const loader of getRuleLoaders(nextRule)) {
					if (typeof loader === "string") continue;
					const loaderPath = getLoaderPath(loader);
					if (!loaderPath || !loaderPath.includes("swc-loader")) continue;
					const options = loader.options && typeof loader.options === "object" ? loader.options : loader.options = {};
					const experiments = options.rspackExperiments && typeof options.rspackExperiments === "object" ? options.rspackExperiments : options.rspackExperiments = {};
					const current = experiments.reactServerComponents;
					experiments.reactServerComponents = current === true || current == null ? {} : typeof current === "object" && current !== null && !Array.isArray(current) ? { ...current } : {};
				}
			};
			if (scope === "all") {
				enableReactServerComponentsOnRule(rule);
				continue;
			}
			const originalRule = cloneRspackRule(rule);
			const providerRule = cloneRspackRule(originalRule);
			providerRule.resourceQuery = /(?:^|[?&])tss-serverfn-split(?:&|$)/;
			enableReactServerComponentsOnRule(providerRule);
			const routeSplitRule = cloneRspackRule(originalRule);
			routeSplitRule.resourceQuery = /(?:^|[?&])tsr-split(?:=|&|$)/;
			const routeSplitConditionNames = originalRule.resolve?.conditionNames;
			routeSplitRule.resolve = {
				...originalRule.resolve,
				conditionNames: Array.isArray(routeSplitConditionNames) ? routeSplitConditionNames.includes("...") ? [...routeSplitConditionNames] : ["...", ...routeSplitConditionNames] : ["..."]
			};
			const subtreeRule = cloneRspackRule(originalRule);
			subtreeRule.issuerLayer = RSBUILD_RSC_LAYERS.rsc;
			enableReactServerComponentsOnRule(subtreeRule);
			for (const key of Object.keys(rule)) delete rule[key];
			rule.oneOf = [
				providerRule,
				routeSplitRule,
				subtreeRule,
				originalRule
			];
		}
	}
	processRules();
}
//#endregion
export { enableSwcReactServerComponents };

//# sourceMappingURL=swc-rsc.js.map