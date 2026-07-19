import path from "pathe";
//#region src/start-router-plugin/route-tree-footer.ts
function buildRouteTreeFileFooter(opts) {
	function getImportPath(absolutePath) {
		let relativePath = path.relative(path.dirname(opts.generatedRouteTreePath), absolutePath);
		if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
		return relativePath.split(path.sep).join("/");
	}
	function appendFooterBlock(lines, block) {
		if (!block) return;
		if (lines.length > 0) {
			lines[lines.length - 1] += `\n${block}`;
			return;
		}
		lines.push(block);
	}
	const footer = [];
	appendFooterBlock(footer, `import type { getRouter } from '${getImportPath(opts.routerFilePath)}'`);
	if (opts.startFilePath) appendFooterBlock(footer, `import type { startInstance } from '${getImportPath(opts.startFilePath)}'`);
	else appendFooterBlock(footer, `import type { createStart } from '@tanstack/${opts.framework}-start'`);
	appendFooterBlock(footer, `declare module '@tanstack/${opts.framework}-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>`);
	if (opts.startFilePath) appendFooterBlock(footer, `    config: Awaited<ReturnType<typeof startInstance.getOptions>>`);
	appendFooterBlock(footer, `  }
}`);
	if (opts.userFooter) footer.push(...Array.isArray(opts.userFooter) ? opts.userFooter : opts.userFooter());
	return footer;
}
function buildRouteTreeFileFooterFromConfig(opts) {
	const { startConfig, resolvedStartConfig } = opts.getConfig();
	return buildRouteTreeFileFooter({
		generatedRouteTreePath: opts.generatedRouteTreePath,
		startFilePath: resolvedStartConfig.startFilePath,
		routerFilePath: resolvedStartConfig.routerFilePath,
		framework: opts.corePluginOpts.framework,
		userFooter: startConfig.router.routeTreeFileFooter
	});
}
//#endregion
export { buildRouteTreeFileFooterFromConfig };

//# sourceMappingURL=route-tree-footer.js.map