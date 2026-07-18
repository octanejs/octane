import { loadEnv } from "vite";
//#region src/vite/load-env-plugin/plugin.ts
function loadEnvPlugin() {
	return {
		name: "tanstack-start-core:load-env",
		enforce: "pre",
		configResolved(config) {
			Object.assign(process.env, loadEnv(config.mode, config.root, ""));
		}
	};
}
//#endregion
export { loadEnvPlugin };

//# sourceMappingURL=plugin.js.map