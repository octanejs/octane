import { tssHydrate } from "../../hydration-constants.js";
import { getCssAssetSource } from "../../start-manifest-plugin/inlineCss.js";
import { tsrSplit } from "@tanstack/router-plugin";
//#region src/vite/start-manifest-plugin/normalized-client-build.ts
function normalizeViteClientChunk(chunk) {
	return {
		fileName: chunk.fileName,
		isEntry: chunk.isEntry,
		imports: chunk.imports,
		dynamicImports: chunk.dynamicImports,
		css: Array.from(chunk.viteMetadata?.importedCss ?? []),
		routeFilePaths: getRouteFilePathsFromModuleIds(chunk.moduleIds),
		hydrationIds: getHydrationIdsFromModuleIds(chunk.moduleIds)
	};
}
function normalizeViteClientChunks(clientBundle) {
	const chunksByFileName = /* @__PURE__ */ new Map();
	for (const fileName in clientBundle) {
		const bundleEntry = clientBundle[fileName];
		if (bundleEntry.type !== "chunk") continue;
		const normalizedChunk = normalizeViteClientChunk(bundleEntry);
		chunksByFileName.set(normalizedChunk.fileName, normalizedChunk);
	}
	return chunksByFileName;
}
function normalizeViteClientBuild(clientBundle) {
	let entryChunkFileName;
	const chunksByFileName = normalizeViteClientChunks(clientBundle);
	const chunkFileNamesByRouteFilePath = /* @__PURE__ */ new Map();
	const cssFilesBySourcePath = /* @__PURE__ */ new Map();
	const cssContentByFileName = /* @__PURE__ */ new Map();
	for (const chunk of chunksByFileName.values()) {
		const bundleEntry = clientBundle[chunk.fileName];
		if (chunk.isEntry) {
			if (entryChunkFileName) throw new Error(`multiple entries detected: ${entryChunkFileName} ${chunk.fileName}`);
			entryChunkFileName = chunk.fileName;
		}
		for (const routeFilePath of chunk.routeFilePaths) {
			let chunkFileNames = chunkFileNamesByRouteFilePath.get(routeFilePath);
			if (chunkFileNames === void 0) {
				chunkFileNames = [];
				chunkFileNamesByRouteFilePath.set(routeFilePath, chunkFileNames);
			}
			chunkFileNames.push(chunk.fileName);
		}
		for (const moduleId of bundleEntry.moduleIds) {
			const queryIndex = moduleId.indexOf("?");
			const sourcePath = queryIndex >= 0 ? moduleId.slice(0, queryIndex) : moduleId;
			if (!sourcePath) continue;
			const existing = cssFilesBySourcePath.get(sourcePath);
			cssFilesBySourcePath.set(sourcePath, existing ? Array.from(new Set([...existing, ...chunk.css])) : chunk.css.slice());
		}
	}
	for (const fileName in clientBundle) {
		if (!fileName.endsWith(".css")) continue;
		const bundleEntry = clientBundle[fileName];
		if (bundleEntry.type !== "asset") continue;
		const css = getCssAssetSource(bundleEntry.source);
		if (css !== void 0) cssContentByFileName.set(fileName, css);
	}
	if (!entryChunkFileName) throw new Error("No entry file found");
	return {
		entryChunkFileName,
		chunksByFileName,
		chunkFileNamesByRouteFilePath,
		cssFilesBySourcePath,
		cssContentByFileName
	};
}
function getRouteFilePathsFromModuleIds(moduleIds) {
	let routeFilePaths;
	let seenRouteFilePaths;
	for (const moduleId of moduleIds) {
		const queryIndex = moduleId.indexOf("?");
		if (queryIndex < 0) continue;
		const query = moduleId.slice(queryIndex + 1);
		if (!query.includes(tsrSplit)) continue;
		if (!new URLSearchParams(query).has(tsrSplit)) continue;
		const routeFilePath = moduleId.slice(0, queryIndex);
		if (seenRouteFilePaths?.has(routeFilePath)) continue;
		if (routeFilePaths === void 0 || seenRouteFilePaths === void 0) {
			routeFilePaths = [];
			seenRouteFilePaths = /* @__PURE__ */ new Set();
		}
		routeFilePaths.push(routeFilePath);
		seenRouteFilePaths.add(routeFilePath);
	}
	return routeFilePaths ?? [];
}
function getHydrationIdsFromModuleIds(moduleIds) {
	let hydrationIds;
	let seen;
	for (const moduleId of moduleIds) {
		const queryIndex = moduleId.indexOf("?");
		if (queryIndex < 0) continue;
		const query = moduleId.slice(queryIndex + 1);
		if (!query.includes("tss-hydrate")) continue;
		const hydrationId = new URLSearchParams(query).get(tssHydrate);
		if (!hydrationId || seen?.has(hydrationId)) continue;
		if (hydrationIds === void 0 || seen === void 0) {
			hydrationIds = [];
			seen = /* @__PURE__ */ new Set();
		}
		hydrationIds.push(hydrationId);
		seen.add(hydrationId);
	}
	return hydrationIds ?? [];
}
//#endregion
export { normalizeViteClientBuild };

//# sourceMappingURL=normalized-client-build.js.map