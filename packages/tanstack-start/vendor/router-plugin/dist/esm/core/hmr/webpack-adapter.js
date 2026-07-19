import { getHandleRouteUpdateCode } from "./handle-route-update.js";
import * as template from "@babel/template";
//#region src/core/hmr/webpack-adapter.ts
/**
* Emits HMR accept code for bundlers with webpack-compatible `module.hot`
* semantics (classic webpack via `import.meta.webpackHot`, and Rspack).
*
* Unlike Vite's `hot.accept((newModule) => {...})` — where the callback receives
* the freshly re-imported module — webpack re-executes the module factory on
* accept, so our HMR logic must live at module top level and read the previous
* `routeId` out of `hot.data`. `hot.dispose` stashes it for the next run, and
* `hot.accept()` (no callback) enrolls us as a self-accepting boundary.
*
* Returns an array of statements that patches route definitions during HMR.
*/
function createWebpackHmrStatement(stableRouteOptionKeys, opts) {
	const handleRouteUpdateCode = getHandleRouteUpdateCode(stableRouteOptionKeys);
	const staticRouteIdLiteral = typeof opts.routeId === "string" ? JSON.stringify(opts.routeId) : "undefined";
	const routeSignature = typeof opts.routeSignature === "string" ? JSON.stringify(opts.routeSignature) : "undefined";
	const shouldInvalidateRoute = opts.targetFramework === "octane" ? `typeof routeSignature !== 'string' || previousRouteSignature !== routeSignature` : "true";
	const reactRefreshCall = opts.targetFramework === "react" ? `
    try {
      const tsrReactRefreshUtils =
        typeof __react_refresh_utils__ !== 'undefined'
          ? __react_refresh_utils__
          : undefined
      const tsrEnqueueUpdate =
        tsrReactRefreshUtils && typeof tsrReactRefreshUtils.enqueueUpdate === 'function'
          ? tsrReactRefreshUtils.enqueueUpdate
          : undefined
      if (tsrEnqueueUpdate) {
        tsrEnqueueUpdate(() => {})
      }
    } catch (_err) { /* noop */ }` : "";
	return [template.statement(`
if (import.meta.webpackHot) {
  const hot = import.meta.webpackHot
  const hotData = hot.data ??= {}
  const routeSignature = ${routeSignature}
  const previousRouteSignature = hotData['tsr-route-signature']
  const shouldInvalidateRoute = ${shouldInvalidateRoute}
  hotData['tsr-route-signature'] = routeSignature
  const routeId = hotData['tsr-route-id'] ?? Route.id ?? (Route.isRoot ? '__root__' : ${staticRouteIdLiteral})
  if (routeId) {
    hotData['tsr-route-id'] = routeId
  }
  const existingRoute =
    typeof window !== 'undefined' && routeId
      ? window.__TSR_ROUTER__?.routesById?.[routeId]
      : undefined
  if (routeId && existingRoute && existingRoute !== Route) {
    (${handleRouteUpdateCode})(routeId, Route, shouldInvalidateRoute)${reactRefreshCall}
  }
  hot.dispose((data) => {
    if (routeId) {
      data['tsr-route-id'] = routeId
    }
    data['tsr-route-signature'] = routeSignature
  })
  hot.accept()
}
`, { syntacticPlaceholders: true })()];
}
//#endregion
export { createWebpackHmrStatement };

//# sourceMappingURL=webpack-adapter.js.map