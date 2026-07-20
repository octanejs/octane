//#region src/start-router-plugin/generator-plugins/compose-generator-plugins.ts
function composeGeneratorPlugins(opts) {
	return [...(opts.frameworkPlugins ?? []), ...(opts.userPlugins ?? []), ...opts.builtInPlugins];
}
//#endregion
export { composeGeneratorPlugins };
