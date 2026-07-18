import { createRouterPluginContext } from "./router-plugin-context.js";
import { createRouterCodeSplitterPlugin } from "./router-code-splitter-plugin.js";
import { createRouterGeneratorPlugin } from "./router-generator-plugin.js";
import { createRouterHmrPlugin } from "./router-hmr-plugin.js";
import { getConfig } from "@tanstack/router-generator";
//#region src/core/router-composed-plugin.ts
var INLINE_CSS_DEFAULT_DEFINES = {
	"process.env.TSS_INLINE_CSS_ENABLED": JSON.stringify("false"),
	"import.meta.env.TSS_INLINE_CSS_ENABLED": JSON.stringify("false")
};
function applyWebpackInlineCssDefaultDefinePlugin(compiler) {
	new compiler.webpack.DefinePlugin(INLINE_CSS_DEFAULT_DEFINES).apply(compiler);
}
function applyRspackInlineCssDefaultDefinePlugin(compiler) {
	new compiler.webpack.DefinePlugin(INLINE_CSS_DEFAULT_DEFINES).apply(compiler);
}
var unpluginRouterComposedFactory = (options = {}, _meta) => {
	const ROOT = process.cwd();
	const userConfig = getConfig(typeof options === "function" ? options() : options, ROOT);
	const routerPluginContext = createRouterPluginContext();
	const getPlugin = (plugin) => {
		if (!Array.isArray(plugin)) return [plugin];
		return plugin;
	};
	const routerGenerator = getPlugin(createRouterGeneratorPlugin(options, routerPluginContext));
	const routerCodeSplitter = getPlugin(createRouterCodeSplitterPlugin(options, routerPluginContext));
	const result = [{
		name: "tanstack:router-inline-css-defaults",
		vite: { config() {
			return { define: { ...INLINE_CSS_DEFAULT_DEFINES } };
		} },
		webpack(compiler) {
			applyWebpackInlineCssDefaultDefinePlugin(compiler);
		},
		rspack(compiler) {
			applyRspackInlineCssDefaultDefinePlugin(compiler);
		},
		esbuild: { config(options) {
			options.define = {
				...INLINE_CSS_DEFAULT_DEFINES,
				...options.define
			};
		} }
	}, ...routerGenerator];
	if (userConfig.autoCodeSplitting) result.push(...routerCodeSplitter);
	if (!(process.env.NODE_ENV === "production") && !userConfig.autoCodeSplitting) {
		const routerHmr = getPlugin(createRouterHmrPlugin(options, routerPluginContext));
		result.push(...routerHmr);
	}
	return result;
};
//#endregion
export { unpluginRouterComposedFactory };

//# sourceMappingURL=router-composed-plugin.js.map