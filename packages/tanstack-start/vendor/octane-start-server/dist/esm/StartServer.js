import { createElement } from "octane/server";
import { RouterProvider } from "@tanstack/octane-router";
//#region src/StartServer.ts
function StartServer({ router }) {
	return createElement(RouterProvider, { router });
}
//#endregion
export { StartServer };

//# sourceMappingURL=StartServer.js.map