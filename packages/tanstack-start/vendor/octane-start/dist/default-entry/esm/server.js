import { createStartHandler, defaultStreamHandler } from "@tanstack/octane-start/server";
//#region src/default-entry/server.ts
var fetch = createStartHandler(defaultStreamHandler);
function createServerEntry(entry) {
	return { async fetch(...args) {
		return await entry.fetch(...args);
	} };
}
var server_default = createServerEntry({ fetch });
//#endregion
export { createServerEntry, server_default as default };

//# sourceMappingURL=server.js.map