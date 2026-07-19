import { StartServer } from "./StartServer.js";
import { defineHandlerCallback } from "@tanstack/start-server-core";
import { renderRouterToString } from "@tanstack/octane-router/ssr/server";
//#region src/defaultRenderHandler.ts
var defaultRenderHandler = defineHandlerCallback(({ router, responseHeaders }) => renderRouterToString({
	router,
	responseHeaders,
	App: StartServer
}));
//#endregion
export { defaultRenderHandler };

//# sourceMappingURL=defaultRenderHandler.js.map