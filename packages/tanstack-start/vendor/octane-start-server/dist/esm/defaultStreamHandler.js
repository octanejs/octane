import { StartServer } from "./StartServer.js";
import { defineHandlerCallback } from "@tanstack/start-server-core";
import { renderRouterToStream } from "@tanstack/octane-router/ssr/server";
//#region src/defaultStreamHandler.ts
var defaultStreamHandler = defineHandlerCallback(async ({ request, router, responseHeaders }) => await renderRouterToStream({
	request,
	router,
	responseHeaders,
	App: StartServer
}));
//#endregion
export { defaultStreamHandler };

//# sourceMappingURL=defaultStreamHandler.js.map