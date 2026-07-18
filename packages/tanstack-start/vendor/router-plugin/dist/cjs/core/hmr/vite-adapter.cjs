const require_runtime = require("../../_virtual/_rolldown/runtime.cjs");
const require_handle_route_update = require("./handle-route-update.cjs");
let _babel_template = require("@babel/template");
_babel_template = require_runtime.__toESM(_babel_template, 1);
//#region src/core/hmr/vite-adapter.ts
/**
* Emits HMR accept code for Vite / native ESM HMR: `import.meta.hot.accept`
* with a callback that receives the freshly re-imported module.
*
* Framework-specific component runtimes still own component body patching.
* The route signature only suppresses a redundant data invalidation when an
* Octane update changed extracted component code but not the route definition.
*/
function createViteHmrStatement(stableRouteOptionKeys, opts) {
	const handleRouteUpdateCode = require_handle_route_update.getHandleRouteUpdateCode(stableRouteOptionKeys);
	const routeIdFallback = typeof opts.routeId === "string" ? JSON.stringify(opts.routeId) : "Route.id";
	const routeSignature = typeof opts.routeSignature === "string" ? JSON.stringify(opts.routeSignature) : "undefined";
	const shouldInvalidateCurrentRoute = opts.targetFramework === "octane" ? `typeof routeSignature !== 'string' || previousRouteSignature !== routeSignature` : "true";
	const shouldInvalidateNextRoute = opts.targetFramework === "octane" ? `typeof routeSignature !== 'string' || nextRouteSignature !== routeSignature` : "true";
	return [_babel_template.statement(`
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = hot.data ??= {}
  const handleRouteUpdate = ${handleRouteUpdateCode}
  const routeSignatureKey = Symbol.for('tanstack.router.hmr.route-signature')
  const routeSignature = ${routeSignature}
  const previousRouteSignature = hotData['tsr-route-signature']
  const shouldInvalidateCurrentRoute = ${shouldInvalidateCurrentRoute}
  Route[routeSignatureKey] = routeSignature
  hotData['tsr-route-signature'] = routeSignature
  const initialRouteId = ${routeIdFallback} ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  const existingRoute =
    typeof window !== 'undefined' && initialRouteId
      ? window.__TSR_ROUTER__?.routesById?.[initialRouteId]
      : undefined
  if (initialRouteId && existingRoute && existingRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route, shouldInvalidateCurrentRoute)
    hotData['tsr-route-update-handled'] = Route
  }
  import.meta.hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? ${routeIdFallback}
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled']
        return
      }
      const nextRouteSignature = newModule.Route[routeSignatureKey]
      const shouldInvalidateNextRoute = ${shouldInvalidateNextRoute}
      handleRouteUpdate(routeId, newModule.Route, shouldInvalidateNextRoute)
    }
    })
}
`, { syntacticPlaceholders: true })()];
}
//#endregion
exports.createViteHmrStatement = createViteHmrStatement;

//# sourceMappingURL=vite-adapter.cjs.map