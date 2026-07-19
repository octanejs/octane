import { RSBUILD_ENVIRONMENT_NAMES } from "./planning.js";
import { resolve } from "node:path";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import { pathToFileURL } from "node:url";
import { joinURL } from "ufo";
//#region src/rsbuild/server-middleware.ts
function resolveFetchHandler(serverEntry) {
	if (typeof serverEntry === "function") return serverEntry;
	if (typeof serverEntry.fetch === "function") return serverEntry.fetch.bind(serverEntry);
	throw new Error("Unable to resolve a request handler from Rsbuild server bundle");
}
function getPublicBasePathname(publicBase) {
	try {
		return new URL(publicBase, "http://localhost").pathname;
	} catch {
		return publicBase;
	}
}
function restorePreviewUrl(opts) {
	if (opts.req.originalUrl) opts.req.url = opts.req.originalUrl;
	const publicBasePathname = getPublicBasePathname(opts.publicBase);
	if (publicBasePathname === "/") return;
	const url = opts.req.url ?? "/";
	if (url.startsWith(publicBasePathname)) return;
	opts.req.url = joinURL(publicBasePathname, url);
}
async function loadDevFetchHandler(context) {
	if (context.action !== "dev") throw new Error("Cannot load Rsbuild dev SSR bundle outside dev mode");
	const ssrEnv = context.server.environments[RSBUILD_ENVIRONMENT_NAMES.server];
	if (!ssrEnv) throw new Error(`SSR environment "${RSBUILD_ENVIRONMENT_NAMES.server}" not found`);
	return resolveFetchHandler((await ssrEnv.loadBundle("index")).default);
}
/**
* Returns a `server.setup` function for rsbuild v2.
*
* Two middleware positions are used:
*
* 1. **Setup body** (BEFORE built-ins): Intercepts `/_serverFn/` URLs so
*    they never reach rsbuild's htmlFallback/htmlCompletion middleware,
*    which can swallow long base64 function IDs.
*
* 2. **Returned callback** (AFTER built-ins, BEFORE fallback): Handles
*    all remaining SSR requests (page navigations). This position lets
*    rsbuild's asset middleware serve compiled JS/CSS first.
*
* The middleware choreography is shared by dev and preview. The server entry
* loader differs: dev reads from Rsbuild's in-memory environment so rebuilds
* are reflected immediately, while preview lazy-imports the production server
* bundle from disk.
*
* See rsbuild source: devMiddlewares.ts `applyDefaultMiddlewares()` and
* previewServer.ts `startPreviewServer()`.
*/
function createServerSetup(opts) {
	let previewFetchHandlerPromise;
	const getPreviewFetchHandler = () => {
		if (!previewFetchHandlerPromise) previewFetchHandlerPromise = loadPreviewFetchHandler(opts.serverOutputDirectory);
		return previewFetchHandlerPromise;
	};
	return (context) => {
		const serverFnBase = opts.serverFnBasePath;
		const handleSSR = async (req, res, next) => {
			try {
				const fetchHandler = context.action === "dev" ? await loadDevFetchHandler(context) : await getPreviewFetchHandler();
				if (context.action === "preview") restorePreviewUrl({
					req,
					publicBase: opts.publicBase
				});
				else if (req.originalUrl) req.url = req.originalUrl;
				return sendNodeResponse(res, await fetchHandler(new NodeRequest({
					req,
					res
				})));
			} catch (e) {
				console.error("[tanstack-start] SSR error:", e);
				if (new NodeRequest({
					req,
					res
				}).headers.get("content-type")?.includes("application/json")) return sendNodeResponse(res, new Response(JSON.stringify({
					status: 500,
					error: "Internal Server Error",
					message: "An unexpected error occurred. Please try again later.",
					timestamp: (/* @__PURE__ */ new Date()).toISOString()
				}, null, 2), {
					status: 500,
					headers: { "Content-Type": "application/json" }
				}));
				return next(e);
			}
		};
		context.server.middlewares.use(async (req, res, next) => {
			if ((req.url || "/").startsWith(serverFnBase)) return handleSSR(req, res, next);
			return next();
		});
		return () => {
			context.server.middlewares.use(handleSSR);
		};
	};
}
async function loadPreviewFetchHandler(serverOutputDirectory) {
	const serverEntryPath = resolve(serverOutputDirectory, "index.js");
	const imported = await import(pathToFileURL(serverEntryPath).toString());
	try {
		return resolveFetchHandler(imported.default);
	} catch (error) {
		throw new Error(`Unable to resolve a request handler from Rsbuild server bundle at ${serverEntryPath}`, { cause: error });
	}
}
//#endregion
export { createServerSetup };

//# sourceMappingURL=server-middleware.js.map