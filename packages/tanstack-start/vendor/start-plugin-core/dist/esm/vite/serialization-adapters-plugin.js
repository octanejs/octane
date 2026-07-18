import { START_ENVIRONMENT_NAMES } from "../constants.js";
import { createIdFilter } from "../utils.js";
import { generateSerializationAdaptersModule } from "../serialization-adapters-module.js";
import { VIRTUAL_MODULES } from "@tanstack/start-server-core";
//#region src/vite/serialization-adapters-plugin.ts
var CLIENT_MODULE_ID = "virtual:tanstack-start-plugin-adapters/client";
var SERVER_MODULE_ID = "virtual:tanstack-start-plugin-adapters/server";
var BUILD_CLIENT_MODULE_ID = `\0${CLIENT_MODULE_ID}`;
var BUILD_SERVER_MODULE_ID = `\0${SERVER_MODULE_ID}`;
var MODULE_IDS = [
	CLIENT_MODULE_ID,
	SERVER_MODULE_ID,
	BUILD_CLIENT_MODULE_ID,
	BUILD_SERVER_MODULE_ID
];
var moduleIdFilter = createIdFilter(MODULE_IDS);
var resolveIdFilter = createIdFilter([VIRTUAL_MODULES.pluginAdapters, ...MODULE_IDS]);
function serializationAdaptersPlugin(opts) {
	return {
		name: "tanstack-start:plugin-adapters",
		enforce: "pre",
		resolveId: {
			filter: { id: resolveIdFilter },
			handler(id) {
				if (getRuntime(id)) return id;
				if (id !== VIRTUAL_MODULES.pluginAdapters) return;
				return getModuleId(this.environment.name === START_ENVIRONMENT_NAMES.client ? "client" : "server", this.environment.config.command);
			}
		},
		load: {
			filter: { id: moduleIdFilter },
			handler(id) {
				const runtime = getRuntime(id);
				if (!runtime) return;
				return generateSerializationAdaptersModule({
					adapters: opts.adapters,
					runtime
				});
			}
		}
	};
}
function getModuleId(runtime, command) {
	if (runtime === "client") return command === "serve" ? CLIENT_MODULE_ID : BUILD_CLIENT_MODULE_ID;
	return command === "serve" ? SERVER_MODULE_ID : BUILD_SERVER_MODULE_ID;
}
function getRuntime(id) {
	switch (id) {
		case CLIENT_MODULE_ID:
		case BUILD_CLIENT_MODULE_ID: return "client";
		case SERVER_MODULE_ID:
		case BUILD_SERVER_MODULE_ID: return "server";
		default: return;
	}
}
//#endregion
export { serializationAdaptersPlugin };

//# sourceMappingURL=serialization-adapters-plugin.js.map