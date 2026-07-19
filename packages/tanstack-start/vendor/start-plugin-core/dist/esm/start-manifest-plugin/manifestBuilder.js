import { processInlineCssUrls } from "./inlineCss.js";
import { getStylesheetHref, resolveManifestAssetLink, resolveManifestCssLink, rootRouteId } from "@tanstack/router-core";
import { joinURL } from "ufo";
import { serialize } from "seroval";
//#region src/start-manifest-plugin/manifestBuilder.ts
var VISITING_CHUNK = 1;
function appendUniqueStrings(target, source) {
	if (source.length === 0) return target;
	if (!target || target.length === 0) return source;
	const seen = new Set(target);
	let result;
	for (const value of source) {
		if (seen.has(value)) continue;
		seen.add(value);
		if (!result) result = target.slice();
		result.push(value);
	}
	return result ?? target;
}
function appendUniqueStylesheets(target, source) {
	if (source.length === 0) return target;
	if (!target || target.length === 0) return source;
	const seen = new Set(target.map(getStylesheetIdentity));
	let result;
	for (const stylesheet of source) {
		const identity = getStylesheetIdentity(stylesheet);
		if (seen.has(identity)) continue;
		seen.add(identity);
		if (!result) result = target.slice();
		result.push(stylesheet);
	}
	return result ?? target;
}
function getStylesheetIdentity(attrs) {
	const resolved = resolveManifestCssLink(attrs);
	return `${resolved.href}\0${resolved.crossOrigin ?? ""}`;
}
function getScriptIdentity(script) {
	return JSON.stringify({
		attrs: normalizeAttrs(script.attrs),
		children: script.children ?? null
	});
}
function normalizeAttrs(attrs) {
	if (!attrs) return null;
	const entries = Object.entries(attrs);
	if (entries.length === 0) return null;
	entries.sort(([left], [right]) => left.localeCompare(right));
	return Object.fromEntries(entries);
}
function mergeRouteChunkData(options) {
	const stylesheets = options.getChunkCssAssets(options.chunk);
	const chunkPreloads = options.getChunkPreloads(options.chunk);
	appendRouteStylesheets(options.route, stylesheets);
	options.route.preloads = appendUniqueStrings(options.route.preloads, chunkPreloads);
}
function appendRouteStylesheets(route, stylesheets) {
	if (stylesheets.length === 0) return;
	route.css = appendUniqueStylesheets(route.css, stylesheets);
}
function appendRouteScripts(route, scripts) {
	if (scripts.length === 0) return;
	route.scripts = [...route.scripts ?? [], ...scripts];
}
function buildScript(src, scriptFormat) {
	return { attrs: {
		...scriptFormat === "module" ? { type: "module" } : {},
		async: true,
		src
	} };
}
function appendEntryChunkScripts(options) {
	const scripts = [];
	if (options.scriptFormat === "iife") for (let i = 0; i < options.chunk.imports.length; i++) scripts.push(buildScript(options.getAssetPath(options.chunk.imports[i]), options.scriptFormat));
	scripts.push(buildScript(options.getAssetPath(options.chunk.fileName), options.scriptFormat));
	appendRouteScripts(options.route, scripts);
}
function appendAdditionalRouteEntries(route, entries) {
	if (entries.length === 0) return;
	const stylesheets = [];
	const scripts = [];
	for (const entry of entries) if (typeof entry === "string" || "href" in entry) stylesheets.push(entry);
	else scripts.push(entry);
	appendRouteStylesheets(route, stylesheets);
	appendRouteScripts(route, scripts);
}
function buildStartManifest(options) {
	const scannedChunks = scanClientChunks(options.clientBuild);
	const assetResolvers = createManifestAssetResolvers(options.basePath);
	const routes = buildRouteManifestRoutes({
		routeTreeRoutes: options.routeTreeRoutes,
		routeChunksByFilePath: scannedChunks.routeChunksByFilePath,
		chunksByFileName: scannedChunks.chunksByFileName,
		entryChunk: scannedChunks.entryChunk,
		assetResolvers,
		additionalRouteAssets: options.additionalRouteAssets
	});
	appendEntryChunkScripts({
		route: routes[rootRouteId],
		chunk: scannedChunks.entryChunk,
		scriptFormat: options.scriptFormat ?? "module",
		getAssetPath: assetResolvers.getAssetPath
	});
	dedupeNestedRouteManifestEntries(rootRouteId, routes[rootRouteId], routes);
	for (const routeId in routes) {
		const route = routes[routeId];
		const hasScripts = route.scripts && route.scripts.length > 0;
		const hasCssLinks = route.css && route.css.length > 0;
		const hasPreloads = route.preloads && route.preloads.length > 0;
		if (!hasScripts && !hasCssLinks && !hasPreloads) delete routes[routeId];
	}
	const result = { routes };
	if (options.scriptFormat === "iife") result.scriptFormat = "iife";
	if (options.inlineCss?.enabled) result.inlineCss = buildInlineCssManifestData({
		routes,
		basePath: options.basePath,
		cssContentByFileName: options.clientBuild.cssContentByFileName,
		transformAssets: options.inlineCss.transformAssets
	});
	return result;
}
function serializeStartManifest(startManifest) {
	return serialize(startManifest);
}
function scanClientChunks(clientBuild) {
	const entryChunk = clientBuild.chunksByFileName.get(clientBuild.entryChunkFileName);
	if (!entryChunk) throw new Error(`Missing entry chunk: ${clientBuild.entryChunkFileName}`);
	const routeChunksByFilePath = /* @__PURE__ */ new Map();
	for (const chunk of clientBuild.chunksByFileName.values()) if (chunk.routeFilePaths.length > 0) for (const routeFilePath of chunk.routeFilePaths) {
		let chunks = routeChunksByFilePath.get(routeFilePath);
		if (chunks === void 0) {
			chunks = [];
			routeChunksByFilePath.set(routeFilePath, chunks);
		}
		chunks.push(chunk);
	}
	return {
		entryChunk,
		chunksByFileName: clientBuild.chunksByFileName,
		routeChunksByFilePath
	};
}
function createManifestAssetResolvers(basePath) {
	const assetPathByFileName = /* @__PURE__ */ new Map();
	const stylesheetLinkByFileName = /* @__PURE__ */ new Map();
	const preloadsByChunk = /* @__PURE__ */ new Map();
	const getAssetPath = (fileName) => {
		const cachedPath = assetPathByFileName.get(fileName);
		if (cachedPath) return cachedPath;
		const assetPath = joinURL(basePath, fileName);
		assetPathByFileName.set(fileName, assetPath);
		return assetPath;
	};
	const getStylesheetLink = (cssFile) => {
		const cachedLink = stylesheetLinkByFileName.get(cssFile);
		if (cachedLink) return cachedLink;
		const link = getAssetPath(cssFile);
		stylesheetLinkByFileName.set(cssFile, link);
		return link;
	};
	const getChunkPreloads = (chunk) => {
		const cachedPreloads = preloadsByChunk.get(chunk);
		if (cachedPreloads) return cachedPreloads;
		const preloads = [getAssetPath(chunk.fileName)];
		for (let i = 0; i < chunk.imports.length; i++) preloads.push(getAssetPath(chunk.imports[i]));
		preloadsByChunk.set(chunk, preloads);
		return preloads;
	};
	return {
		getAssetPath,
		getChunkPreloads,
		getStylesheetLink
	};
}
function createChunkCssAssetCollector(options) {
	const linksByChunk = /* @__PURE__ */ new Map();
	const stateByChunk = /* @__PURE__ */ new Map();
	const appendAsset = (links, seenLinks, link) => {
		if (seenLinks.has(link)) return;
		seenLinks.add(link);
		links.push(link);
	};
	const getChunkCssAssets = (chunk) => {
		const cachedLinks = linksByChunk.get(chunk);
		if (cachedLinks) return cachedLinks;
		if (stateByChunk.get(chunk) === VISITING_CHUNK) return [];
		stateByChunk.set(chunk, VISITING_CHUNK);
		const links = [];
		const seenLinks = /* @__PURE__ */ new Set();
		for (let i = 0; i < chunk.imports.length; i++) {
			const importedChunk = options.chunksByFileName.get(chunk.imports[i]);
			if (!importedChunk) continue;
			const importedLinks = getChunkCssAssets(importedChunk);
			for (let j = 0; j < importedLinks.length; j++) appendAsset(links, seenLinks, importedLinks[j]);
		}
		for (const cssFile of chunk.css) appendAsset(links, seenLinks, options.getStylesheetLink(cssFile));
		stateByChunk.delete(chunk);
		linksByChunk.set(chunk, links);
		return links;
	};
	return { getChunkCssAssets };
}
function buildInlineCssManifestData(options) {
	const stylesheetHrefs = /* @__PURE__ */ new Set();
	for (const route of Object.values(options.routes)) for (const link of route.css ?? []) stylesheetHrefs.add(getStylesheetHref(link));
	if (stylesheetHrefs.size === 0) return { styles: {} };
	if (!options.cssContentByFileName) throw new Error("TanStack Start inlineCss is enabled, but the client build did not provide CSS content");
	const { getAssetPath } = createManifestAssetResolvers(options.basePath);
	const styles = {};
	let templates;
	const missingHrefs = new Set(stylesheetHrefs);
	for (const [cssFile, css] of options.cssContentByFileName) {
		const cssHref = getAssetPath(cssFile);
		if (!stylesheetHrefs.has(cssHref)) continue;
		const result = processInlineCssUrls({
			css,
			cssHref,
			templates: options.transformAssets
		});
		styles[cssHref] = result.css;
		if (result.template) {
			templates ||= {};
			templates[cssHref] = result.template;
		}
		missingHrefs.delete(cssHref);
	}
	if (missingHrefs.size > 0) throw new Error(`TanStack Start inlineCss could not find CSS content for: ${Array.from(missingHrefs).join(", ")}`);
	return {
		styles,
		...templates ? { templates } : {}
	};
}
function buildRouteManifestRoutes(options) {
	const routes = {};
	const getChunkCssAssets = createChunkCssAssetCollector({
		chunksByFileName: options.chunksByFileName,
		getStylesheetLink: options.assetResolvers.getStylesheetLink
	}).getChunkCssAssets;
	for (const [routeId, route] of Object.entries(options.routeTreeRoutes)) {
		if (!route.filePath) {
			if (routeId === rootRouteId) {
				routes[routeId] = { ...route };
				continue;
			}
			throw new Error(`expected filePath to be set for ${routeId}`);
		}
		const chunks = options.routeChunksByFilePath.get(route.filePath);
		if (!chunks) {
			routes[routeId] = { ...route };
			continue;
		}
		const existing = routes[routeId];
		const targetRoute = routes[routeId] = existing ? existing : { ...route };
		for (const chunk of chunks) {
			mergeRouteChunkData({
				route: targetRoute,
				chunk,
				getChunkCssAssets,
				getChunkPreloads: options.assetResolvers.getChunkPreloads
			});
			if (routeId !== rootRouteId) mergeReachableHydrationChunkData({
				route: targetRoute,
				chunk,
				chunksByFileName: options.chunksByFileName,
				getChunkCssAssets
			});
		}
	}
	const rootRoute = routes[rootRouteId] = routes[rootRouteId] || {};
	const rootRouteTreeRoute = options.routeTreeRoutes[rootRouteId];
	const rootRouteChunks = rootRouteTreeRoute?.filePath ? options.routeChunksByFilePath.get(rootRouteTreeRoute.filePath) : void 0;
	if (rootRouteChunks) for (const chunk of rootRouteChunks) mergeReachableHydrationChunkData({
		route: rootRoute,
		chunk,
		chunksByFileName: options.chunksByFileName,
		getChunkCssAssets
	});
	mergeRouteChunkData({
		route: rootRoute,
		chunk: options.entryChunk,
		getChunkCssAssets,
		getChunkPreloads: options.assetResolvers.getChunkPreloads
	});
	if (options.additionalRouteAssets) for (const [routeId, assets] of Object.entries(options.additionalRouteAssets)) {
		if (!assets || assets.length === 0) continue;
		if (!(routeId in options.routeTreeRoutes)) throw new Error(`expected additionalRouteAssets routeId to exist in routeTreeRoutes: ${routeId}`);
		appendAdditionalRouteEntries(routes[routeId] = routes[routeId] || {}, assets);
	}
	return routes;
}
function mergeReachableHydrationChunkData(options) {
	const visitedStaticChunks = /* @__PURE__ */ new Set();
	const mergedHydrationChunks = /* @__PURE__ */ new Set();
	const mergeHydrationChunk = (chunk) => {
		if (mergedHydrationChunks.has(chunk.fileName)) return;
		mergedHydrationChunks.add(chunk.fileName);
		appendRouteStylesheets(options.route, options.getChunkCssAssets(chunk));
		for (const dynamicImport of chunk.dynamicImports) {
			const dynamicChunk = options.chunksByFileName.get(dynamicImport);
			if (dynamicChunk?.hydrationIds.length) mergeHydrationChunk(dynamicChunk);
		}
	};
	const visitStaticChunk = (chunk) => {
		if (visitedStaticChunks.has(chunk.fileName)) return;
		visitedStaticChunks.add(chunk.fileName);
		for (const importedFileName of chunk.imports) {
			const importedChunk = options.chunksByFileName.get(importedFileName);
			if (importedChunk) visitStaticChunk(importedChunk);
		}
		for (const dynamicImport of chunk.dynamicImports) {
			const dynamicChunk = options.chunksByFileName.get(dynamicImport);
			if (dynamicChunk?.hydrationIds.length) mergeHydrationChunk(dynamicChunk);
		}
	};
	visitStaticChunk(options.chunk);
}
function dedupeNestedRouteManifestEntries(routeId, route, routesById, seenPreloads = /* @__PURE__ */ new Set(), seenScripts = /* @__PURE__ */ new Set(), seenStylesheets = /* @__PURE__ */ new Set()) {
	let routePreloads = route.preloads;
	let routeScripts = route.scripts;
	let routeStylesheets = route.css;
	if (routePreloads && routePreloads.length > 0) {
		let dedupedPreloads;
		for (let i = 0; i < routePreloads.length; i++) {
			const preload = routePreloads[i];
			const preloadHref = resolveManifestAssetLink(preload).href;
			if (seenPreloads.has(preloadHref)) {
				if (dedupedPreloads === void 0) dedupedPreloads = routePreloads.slice(0, i);
				continue;
			}
			seenPreloads.add(preloadHref);
			if (dedupedPreloads) dedupedPreloads.push(preload);
		}
		if (dedupedPreloads) {
			routePreloads = dedupedPreloads;
			route.preloads = dedupedPreloads;
		}
	}
	if (routeScripts && routeScripts.length > 0) {
		let dedupedScripts;
		for (let i = 0; i < routeScripts.length; i++) {
			const script = routeScripts[i];
			const identity = getScriptIdentity(script);
			if (seenScripts.has(identity)) {
				if (dedupedScripts === void 0) dedupedScripts = routeScripts.slice(0, i);
				continue;
			}
			seenScripts.add(identity);
			if (dedupedScripts) dedupedScripts.push(script);
		}
		if (dedupedScripts) {
			routeScripts = dedupedScripts;
			if (dedupedScripts.length > 0) route.scripts = dedupedScripts;
			else delete route.scripts;
		}
	}
	if (routeStylesheets && routeStylesheets.length > 0) {
		let dedupedStylesheets;
		for (let i = 0; i < routeStylesheets.length; i++) {
			const stylesheet = routeStylesheets[i];
			const identity = getStylesheetIdentity(stylesheet);
			if (seenStylesheets.has(identity)) {
				if (dedupedStylesheets === void 0) dedupedStylesheets = routeStylesheets.slice(0, i);
				continue;
			}
			seenStylesheets.add(identity);
			if (dedupedStylesheets) dedupedStylesheets.push(stylesheet);
		}
		if (dedupedStylesheets) {
			routeStylesheets = dedupedStylesheets;
			if (dedupedStylesheets.length > 0) route.css = dedupedStylesheets;
			else delete route.css;
		}
	}
	if (route.children) for (const childRouteId of route.children) {
		const childRoute = routesById[childRouteId];
		if (!childRoute) throw new Error(`Route tree references child route ${childRouteId} from ${routeId}, but no route entry was found`);
		dedupeNestedRouteManifestEntries(childRouteId, childRoute, routesById, seenPreloads, seenScripts, seenStylesheets);
	}
	if (routePreloads) for (let i = routePreloads.length - 1; i >= 0; i--) seenPreloads.delete(resolveManifestAssetLink(routePreloads[i]).href);
	if (routeScripts) for (let i = routeScripts.length - 1; i >= 0; i--) seenScripts.delete(getScriptIdentity(routeScripts[i]));
	if (routeStylesheets) for (let i = routeStylesheets.length - 1; i >= 0; i--) seenStylesheets.delete(getStylesheetIdentity(routeStylesheets[i]));
}
//#endregion
export { buildStartManifest, createManifestAssetResolvers, serializeStartManifest };

//# sourceMappingURL=manifestBuilder.js.map