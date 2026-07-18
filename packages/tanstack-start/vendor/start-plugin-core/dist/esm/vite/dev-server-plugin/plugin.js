import { ENTRY_POINTS, VITE_ENVIRONMENT_NAMES } from "../../constants.js";
import { CSS_MODULES_REGEX, collectDevStyles, normalizeCssModuleCacheKey } from "./dev-styles.js";
import { isRunnableDevEnvironment } from "vite";
import { NodeRequest, sendNodeResponse } from "srvx/node";
//#region src/vite/dev-server-plugin/plugin.ts
function devServerPlugin({ getConfig: _getConfig, devSsrStylesEnabled, installDevServerMiddleware }) {
	let isTest = false;
	const cssModulesCache = {};
	return [{
		name: "tanstack-start-core:dev-server",
		config(_userConfig, { mode }) {
			isTest = isTest ? isTest : mode === "test";
		},
		transform: {
			filter: { id: CSS_MODULES_REGEX },
			handler(code, id) {
				cssModulesCache[normalizeCssModuleCacheKey(id)] = code;
			}
		},
		configureServer(viteDevServer) {
			if (isTest) return;
			if (devSsrStylesEnabled) viteDevServer.middlewares.use(async (req, res, next) => {
				const url = req.url ?? "";
				if (!url.split("?")[0]?.endsWith("/@tanstack-start/styles.css")) return next();
				try {
					const routesParam = new URL(url, "http://localhost").searchParams.get("routes");
					const routeIds = routesParam ? routesParam.split(",") : [];
					const entries = [];
					const routesManifest = globalThis.TSS_ROUTES_MANIFEST;
					if (routesManifest && routeIds.length > 0) for (const routeId of routeIds) {
						const route = routesManifest[routeId];
						if (route?.filePath) entries.push(route.filePath);
					}
					const css = entries.length > 0 ? await collectDevStyles({
						viteDevServer,
						entries,
						cssModulesCache
					}) : void 0;
					res.setHeader("Content-Type", "text/css");
					res.setHeader("Cache-Control", "no-store");
					res.end(css ?? "");
				} catch (e) {
					console.error("[tanstack-start] Error collecting dev styles:", e);
					res.setHeader("Content-Type", "text/css");
					res.setHeader("Cache-Control", "no-store");
					res.end(`/* Error collecting styles: ${e instanceof Error ? e.message : String(e)} */`);
				}
			});
			if (viteDevServer.config.experimental.bundledDev) viteDevServer.watcher.add(viteDevServer.config.root);
			return () => {
				const serverEnv = viteDevServer.environments[VITE_ENVIRONMENT_NAMES.server];
				if (!serverEnv) throw new Error(`Server environment ${VITE_ENVIRONMENT_NAMES.server} not found`);
				const clientEnv = viteDevServer.environments[VITE_ENVIRONMENT_NAMES.client];
				const installMiddleware = installDevServerMiddleware;
				if (installMiddleware === false) return;
				if (installMiddleware == void 0) {
					if (viteDevServer.config.server.middlewareMode) return;
					if (!isRunnableDevEnvironment(serverEnv) || "dispatchFetch" in serverEnv) return;
				}
				if (!isRunnableDevEnvironment(serverEnv)) throw new Error("cannot install vite dev server middleware for TanStack Start since the SSR environment is not a RunnableDevEnvironment");
				viteDevServer.middlewares.use(async (req, res) => {
					if (req.originalUrl) req.url = req.originalUrl;
					const webReq = new NodeRequest({
						req,
						res
					});
					try {
						const serverRunner = serverEnv.runner;
						/**
						* export default {
						*  fetch(req: Request): Promise<Response>
						* }
						*/
						if (viteDevServer.config.experimental.bundledDev) {
							await clientEnv?.devEngine?.ensureLatestBuildOutput?.();
							serverEnv.moduleGraph.invalidateAll();
							serverRunner.clearCache();
						}
						return sendNodeResponse(res, await (await serverRunner.import(ENTRY_POINTS.server))["default"].fetch(webReq));
					} catch (e) {
						console.error(e);
						try {
							viteDevServer.ssrFixStacktrace(e);
						} catch {}
						if (webReq.headers.get("content-type")?.includes("application/json")) return sendNodeResponse(res, new Response(JSON.stringify({
							status: 500,
							error: "Internal Server Error",
							message: "An unexpected error occurred. Please try again later.",
							timestamp: (/* @__PURE__ */ new Date()).toISOString()
						}, null, 2), {
							status: 500,
							headers: { "Content-Type": "application/json" }
						}));
						return sendNodeResponse(res, new Response(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(prepareError(req, e)).replace(/</g, "\\u003c")}))
                  <\/script>
                </head>
                <body>
                </body>
              </html>
            `, {
							status: 500,
							headers: { "Content-Type": "text/html" }
						}));
					}
				});
			};
		}
	}];
}
/**
* Formats error for SSR message in error overlay
* @param req
* @param error
* @returns
*/
function prepareError(req, error) {
	const e = error;
	return {
		message: `An error occurred while server rendering ${req.url}:\n\n\t${typeof e === "string" ? e : e.message} `,
		stack: typeof e === "string" ? "" : e.stack
	};
}
//#endregion
export { devServerPlugin };

//# sourceMappingURL=plugin.js.map