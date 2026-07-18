import { HYDRATION_RANGE_BOUNDARY, createElement, hookSlots, useEffect } from "octane";
import { RouterProvider } from "@tanstack/octane-router";
//#region src/StartClient.ts
function StartClient({ router }) {
	useEffect(() => {
		window.$_TSR?.h();
	}, [], _h$0);
	return createElement(RouterProvider, { router });
}
StartClient[HYDRATION_RANGE_BOUNDARY] = "passthrough";
var _h$0 = Symbol(/* @__PURE__ */ hookSlots(1));
//#endregion
export { StartClient };

//# sourceMappingURL=StartClient.js.map