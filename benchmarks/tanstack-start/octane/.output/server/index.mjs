globalThis.__nitro_main__ = import.meta.url;
import { a as toEventHandler, c as serve, i as defineLazyEventHandler, n as HTTPError, r as defineHandler, s as NodeResponse, t as H3Core } from "./_libs/h3+rou3+srvx.mjs";
import "./_libs/hookable.mjs";
import { i as withoutTrailingSlash, n as joinURL, r as withLeadingSlash, t as decodePath } from "./_libs/ufo.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
//#region #nitro-vite-setup
function lazyService(loader) {
	let promise, mod;
	return { fetch(req) {
		if (mod) return mod.fetch(req);
		if (!promise) promise = loader().then((_mod) => mod = _mod.default || _mod);
		return promise.then((mod) => mod.fetch(req));
	} };
}
var services = { ["ssr"]: lazyService(() => import("./_ssr/ssr.mjs")) };
globalThis.__nitro_vite_envs__ = services;
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/route-rules.mjs
var headers = ((m) => function headersRouteRule(event) {
	for (const [key, value] of Object.entries(m.options || {})) event.res.headers.set(key, value);
});
//#endregion
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/android-chrome-192x192.png": {
		"type": "image/png",
		"etag": "\"750c-oU2mem0jjZ8XbVMelLzRr7WdVPI\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 29964,
		"path": "../public/android-chrome-192x192.png"
	},
	"/favicon.ico": {
		"type": "image/vnd.microsoft.icon",
		"etag": "\"3c2e-R2UvDwRFCsnzRE8fcnOLMp5+Svo\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 15406,
		"path": "../public/favicon.ico"
	},
	"/favicon-16x16.png": {
		"type": "image/png",
		"etag": "\"340-GSBMkU3R13NnICO2UG+wPm8sJhM\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 832,
		"path": "../public/favicon-16x16.png"
	},
	"/favicon.png": {
		"type": "image/png",
		"etag": "\"5e3-23JXQ+bzISswdmRT9DhqqHtr9xM\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 1507,
		"path": "../public/favicon.png"
	},
	"/site.webmanifest": {
		"type": "application/manifest+json",
		"etag": "\"147-XcScPVbgE2SGHXgiOYIqN9LItC4\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 327,
		"path": "../public/site.webmanifest"
	},
	"/favicon-32x32.png": {
		"type": "image/png",
		"etag": "\"843-o7V/FkCz36zCpGs0pydBZ+gbsCw\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 2115,
		"path": "../public/favicon-32x32.png"
	},
	"/android-chrome-512x512.png": {
		"type": "image/png",
		"etag": "\"1aad7-TxqzM3JFMTytpE8GX+/4lMPNyzQ\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 109271,
		"path": "../public/android-chrome-512x512.png"
	},
	"/apple-touch-icon.png": {
		"type": "image/png",
		"etag": "\"6a6e-DDBGYLGi+sElNLs2+1QICHz5lS4\"",
		"mtime": "2026-07-20T10:23:49.790Z",
		"size": 27246,
		"path": "../public/apple-touch-icon.png"
	},
	"/assets/deferred-CvwqzKvQ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"7ef-VMfyTae3iG/SUXLsIUYvLIitpS8\"",
		"mtime": "2026-07-20T10:23:49.305Z",
		"size": 2031,
		"path": "../public/assets/deferred-CvwqzKvQ.js"
	},
	"/assets/index-Ch9eZn3x.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"30-872XguGt08g5XC7HP0KxH1pN93c\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 48,
		"path": "../public/assets/index-Ch9eZn3x.css"
	},
	"/assets/createServerFn-BeN-8zPR.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"10484-k39IAtnyvbJCHC1HEltxaFDqbZY\"",
		"mtime": "2026-07-20T10:23:49.305Z",
		"size": 66692,
		"path": "../public/assets/createServerFn-BeN-8zPR.js"
	},
	"/assets/index-DqLkhGSk.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"13b3d-g24CmZ5hXO9CaSBOe5aj/Ppag3w\"",
		"mtime": "2026-07-20T10:23:49.305Z",
		"size": 80701,
		"path": "../public/assets/index-DqLkhGSk.js"
	},
	"/assets/posts-C4tCPMwZ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"655-WxekL/2DbTYHWLPwCe5iizeAiSc\"",
		"mtime": "2026-07-20T10:23:49.305Z",
		"size": 1621,
		"path": "../public/assets/posts-C4tCPMwZ.js"
	},
	"/assets/posts._postId-C0lWKS80.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"3f5-C7qxYl3g7SL1fULIAj0jalxTLMA\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 1013,
		"path": "../public/assets/posts._postId-C0lWKS80.js"
	},
	"/assets/posts._postId-C8diJ8_r.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"57d-5NJNy0bt9bvt3S3O77K6ZZCkBBg\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 1405,
		"path": "../public/assets/posts._postId-C8diJ8_r.js"
	},
	"/assets/posts._postId-BRQEYO5w.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"3fa-s+h1aLb9wawzD9OBIjevactPeDA\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 1018,
		"path": "../public/assets/posts._postId-BRQEYO5w.js"
	},
	"/assets/posts.index-BoZBgtwK.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"f7-Yk191cbKOInVCkxX2qkJ7jOrv8U\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 247,
		"path": "../public/assets/posts.index-BoZBgtwK.js"
	},
	"/assets/routes-hfZh2q96.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"241-cSCX97Y09dvwnuVVbD+G54y6oTs\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 577,
		"path": "../public/assets/routes-hfZh2q96.js"
	},
	"/assets/runtime-Cd_kM1Y5.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1ece5-/kJ/CzjGQqwGUJ2+hloC4tTh0pI\"",
		"mtime": "2026-07-20T10:23:49.306Z",
		"size": 126181,
		"path": "../public/assets/runtime-Cd_kM1Y5.js"
	}
};
//#endregion
//#region #nitro/virtual/public-assets-node
function readAsset(id) {
	const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
	return promises.readFile(resolve(serverDir, public_assets_data_default[id].path));
}
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
function getAsset(id) {
	return public_assets_data_default[id];
}
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/static.mjs
var METHODS = new Set(["HEAD", "GET"]);
var EncodingMap = {
	gzip: ".gz",
	br: ".br",
	zstd: ".zst"
};
var static_default = defineHandler((event) => {
	if (event.req.method && !METHODS.has(event.req.method)) return;
	let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
	let asset;
	const encodings = [...(event.req.headers.get("accept-encoding") || "").split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
	for (const encoding of encodings) for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
		const _asset = getAsset(_id);
		if (_asset) {
			asset = _asset;
			id = _id;
			break;
		}
	}
	if (!asset) {
		if (isPublicAssetURL(id)) {
			event.res.headers.delete("Cache-Control");
			throw new HTTPError({ status: 404 });
		}
		return;
	}
	if (encodings.length > 1) event.res.headers.append("Vary", "Accept-Encoding");
	if (event.req.headers.get("if-none-match") === asset.etag) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	const ifModifiedSinceH = event.req.headers.get("if-modified-since");
	const mtimeDate = new Date(asset.mtime);
	if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	if (asset.type) event.res.headers.set("Content-Type", asset.type);
	if (asset.etag && !event.res.headers.has("ETag")) event.res.headers.set("ETag", asset.etag);
	if (asset.mtime && !event.res.headers.has("Last-Modified")) event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
	if (asset.encoding && !event.res.headers.has("Content-Encoding")) event.res.headers.set("Content-Encoding", asset.encoding);
	if (asset.size > 0 && !event.res.headers.has("Content-Length")) event.res.headers.set("Content-Length", asset.size.toString());
	return readAsset(id);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = [{
		name: "headers",
		route: "/assets/**",
		handler: headers,
		options: { "cache-control": "public, max-age=31536000, immutable" }
	}];
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
		let s = p.split("/");
		if (s.length > 1) {
			if (s[1] === "assets") r.unshift({
				data: $0,
				params: { "_": s.slice(2).join("/") }
			});
		}
		return r;
	};
})();
var _lazy_Eq_Uc_ = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const data = {
		route: "/**",
		handler: _lazy_Eq_Uc_
	};
	return ((_m, p) => {
		return {
			data,
			params: { "_": p.slice(1) }
		};
	});
})();
var globalMiddleware = [toEventHandler(static_default)].filter(Boolean);
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	return instance;
}
function createNitroApp() {
	const hooks = void 0;
	const captureError = (error, errorCtx) => {
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
		}
	};
	const h3App = createH3App({ onError(error, event) {
		return error_handler_default(error, event);
	} });
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks,
		captureError
	};
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
	h3App["~middleware"].push(...globalMiddleware);
	h3App["~getMiddleware"] = (event, route) => {
		const pathname = event.url.pathname;
		const method = event.req.method;
		const middleware = [];
		{
			const routeRules = getRouteRules(method, pathname);
			event.context.routeRules = routeRules?.routeRules;
			if (routeRules?.routeRuleMiddleware.length) middleware.push(...routeRules.routeRuleMiddleware);
		}
		middleware.push(...h3App["~middleware"]);
		if (route?.data?.middleware?.length) middleware.push(...route.data.middleware);
		return middleware;
	};
	return h3App;
}
function getRouteRules(method, pathname) {
	const m = findRouteRules(method, pathname);
	if (!m?.length) return { routeRuleMiddleware: [] };
	const routeRules = {};
	for (const layer of m) for (const rule of layer.data) {
		const currentRule = routeRules[rule.name];
		if (currentRule) {
			if (rule.options === false) {
				delete routeRules[rule.name];
				continue;
			}
			if (typeof currentRule.options === "object" && typeof rule.options === "object") currentRule.options = {
				...currentRule.options,
				...rule.options
			};
			else currentRule.options = rule.options;
			currentRule.route = rule.route;
			currentRule.params = {
				...currentRule.params,
				...layer.params
			};
		} else if (rule.options !== false) routeRules[rule.name] = {
			...rule,
			params: layer.params
		};
	}
	const middleware = [];
	for (const rule of Object.values(routeRules)) {
		if (rule.options === false || !rule.handler) continue;
		middleware.push(rule.handler(rule));
	}
	return {
		routeRules,
		routeRuleMiddleware: middleware
	};
}
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/runtime/internal/error/hooks.mjs
function _captureError(error, type) {
	console.error(`[${type}]`, error);
	useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
	process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
	process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
//#endregion
//#region ../../../node_modules/.pnpm/nitro@3.0.260311-beta_chokidar@5.0.0_dotenv@8.6.0_jiti@2.7.0_lru-cache@11.5.1_vite@8.0._d4a7806e8dd469c884a23b33a5d0bd0a/node_modules/nitro/dist/presets/node/runtime/node-server.mjs
var _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
var port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
var host = process.env.NITRO_HOST || process.env.HOST;
var cert = process.env.NITRO_SSL_CERT;
var key = process.env.NITRO_SSL_KEY;
var nitroApp = useNitroApp();
serve({
	port,
	hostname: host,
	tls: cert && key ? {
		cert,
		key
	} : void 0,
	fetch: nitroApp.fetch
});
trapUnhandledErrors();
var node_server_default = {};
//#endregion
export { node_server_default as default };
