const require_router_plugin_context = require("./router-plugin-context.cjs");
const require_router_code_splitter_plugin = require("./router-code-splitter-plugin.cjs");
const require_router_generator_plugin = require("./router-generator-plugin.cjs");
const require_router_hmr_plugin = require("./router-hmr-plugin.cjs");
let _tanstack_router_generator = require("@tanstack/router-generator");
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
	const userConfig = (0, _tanstack_router_generator.getConfig)(typeof options === "function" ? options() : options, ROOT);
	const routerPluginContext = require_router_plugin_context.createRouterPluginContext();
	const getPlugin = (plugin) => {
		if (!Array.isArray(plugin)) return [plugin];
		return plugin;
	};
	const routerGenerator = getPlugin(require_router_generator_plugin.createRouterGeneratorPlugin(options, routerPluginContext));
	const routerCodeSplitter = getPlugin(require_router_code_splitter_plugin.createRouterCodeSplitterPlugin(options, routerPluginContext));
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
		const routerHmr = getPlugin(require_router_hmr_plugin.createRouterHmrPlugin(options, routerPluginContext));
		result.push(...routerHmr);
	}
	return result;
};
//#endregion
exports.unpluginRouterComposedFactory = unpluginRouterComposedFactory;

//# sourceMappingURL=router-composed-plugin.cjs.map