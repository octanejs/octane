import { tssHydrate } from "../hydration-constants.js";
import { getCssAssetSource } from "../start-manifest-plugin/inlineCss.js";
import { RSBUILD_ENVIRONMENT_NAMES } from "./planning.js";
import { tsrSplit } from "@tanstack/router-plugin";
//#region src/rsbuild/normalized-client-build.ts
/**
* Extract route file paths from rspack module identifiers.
*
* In rspack, module identifiers contain query params similar to Vite's moduleIds.
* We look for the `tsr-split` query to identify route-split chunks.
*/
function getRouteFilePathsFromModules(modules) {
	let routeFilePaths;
	let seen;
	for (const mod of modules) {
		const identifier = mod.identifier();
		const lastBangIndex = identifier.lastIndexOf("!");
		const resourcePart = lastBangIndex >= 0 ? identifier.slice(lastBangIndex + 1) : identifier;
		const queryIndex = resourcePart.indexOf("?");
		if (queryIndex < 0) continue;
		const query = resourcePart.slice(queryIndex + 1);
		if (!query.includes(tsrSplit)) continue;
		if (!new URLSearchParams(query).has(tsrSplit)) continue;
		const routeFilePath = mod.nameForCondition() ?? resourcePart.slice(0, queryIndex);
		if (seen?.has(routeFilePath)) continue;
		if (!routeFilePaths || !seen) {
			routeFilePaths = [];
			seen = /* @__PURE__ */ new Set();
		}
		routeFilePaths.push(routeFilePath);
		seen.add(routeFilePath);
	}
	return routeFilePaths ?? [];
}
function getHydrationIdsFromModules(modules) {
	let hydrationIds;
	let seen;
	for (const mod of modules) {
		const identifier = mod.identifier();
		const lastBangIndex = identifier.lastIndexOf("!");
		const resourcePart = lastBangIndex >= 0 ? identifier.slice(lastBangIndex + 1) : identifier;
		const queryIndex = resourcePart.indexOf("?");
		if (queryIndex < 0) continue;
		const query = resourcePart.slice(queryIndex + 1);
		if (!query.includes("tss-hydrate")) continue;
		const hydrationId = new URLSearchParams(query).get(tssHydrate);
		if (!hydrationId || seen?.has(hydrationId)) continue;
		if (!hydrationIds || !seen) {
			hydrationIds = [];
			seen = /* @__PURE__ */ new Set();
		}
		hydrationIds.push(hydrationId);
		seen.add(hydrationId);
	}
	return hydrationIds ?? [];
}
/**
* Returns true for Rspack/webpack HMR runtime chunks that should never be
* surfaced to the Start manifest. These files are emitted on every rebuild
* (e.g. `index.<hash>.hot-update.mjs`) and must not be treated as the entry
* chunk, route preloads, or sibling imports.
*/
function isHotUpdateAsset(file) {
	return file.includes(".hot-update.");
}
/**
* True for any JS/MJS asset that should be included in the manifest.
* Excludes HMR runtime patches.
*/
function isManifestJsAsset(file) {
	if (!file.endsWith(".js") && !file.endsWith(".mjs")) return false;
	return !isHotUpdateAsset(file);
}
/**
* Get all JS file names from a chunk.
*/
function getChunkJsFiles(chunk) {
	const jsFiles = [];
	for (const file of chunk.files) if (isManifestJsAsset(file)) jsFiles.push(file);
	return jsFiles;
}
/**
* Compute dynamicImports for a chunk by traversing its chunk groups'
* childrenIterable (async/dynamic import edges).
*
* In rspack, a chunk belongs to one or more ChunkGroups. Each ChunkGroup
* has childrenIterable — child ChunkGroups representing dynamic import()
* points. The JS files from those child groups' chunks are the
* dynamicImports (analogous to Rollup's OutputChunk.dynamicImports).
*/
function computeDynamicImports(chunk) {
	const dynamicImportFiles = [];
	const seen = /* @__PURE__ */ new Set();
	for (const group of chunk.groupsIterable) for (const childGroup of group.childrenIterable) for (const childChunk of childGroup.chunks) for (const file of childChunk.files) if (isManifestJsAsset(file) && !seen.has(file)) {
		seen.add(file);
		dynamicImportFiles.push(file);
	}
	return dynamicImportFiles;
}
/**
* Compute static imports (sibling chunks) for an async chunk.
*
* In rspack/webpack, an async chunk's ChunkGroup contains ALL chunks needed to
* satisfy that dynamic import — the async chunk itself plus any shared/vendor
* chunks it statically imports. This is analogous to Rollup's
* `OutputChunk.imports` for async chunks.
*
* We collect JS files from all sibling chunks in the group (excluding the
* current chunk's own file) to populate the `imports` field.
*/
function computeAsyncChunkImports(chunk, currentFile) {
	const imports = [];
	const seen = /* @__PURE__ */ new Set();
	seen.add(currentFile);
	for (const group of chunk.groupsIterable) for (const siblingChunk of group.chunks) for (const file of siblingChunk.files) if (isManifestJsAsset(file) && !seen.has(file)) {
		seen.add(file);
		imports.push(file);
	}
	return imports;
}
/**
* Normalize an rspack compilation into a NormalizedClientBuild.
*
* Iterates ALL chunks in the compilation (initial + async), not just
* entrypoint chunks, to ensure route-split async chunks are included.
*/
function normalizeRspackClientBuild(compilation) {
	const chunksByFileName = /* @__PURE__ */ new Map();
	const chunkFileNamesByRouteFilePath = /* @__PURE__ */ new Map();
	const cssFilesBySourcePath = /* @__PURE__ */ new Map();
	const cssContentByFileName = /* @__PURE__ */ new Map();
	let entryChunkFileName;
	const entrypoint = compilation.entrypoints.get("index");
	const initialJsFileNames = [];
	const entryChunkSet = /* @__PURE__ */ new Set();
	if (entrypoint) for (const chunk of entrypoint.chunks) {
		entryChunkSet.add(chunk);
		for (const file of chunk.files) if (isManifestJsAsset(file)) initialJsFileNames.push(file);
	}
	for (const chunk of compilation.chunks) {
		const modules = compilation.chunkGraph.getChunkModules(chunk);
		const routeFilePaths = getRouteFilePathsFromModules(modules);
		const hydrationIds = getHydrationIdsFromModules(modules);
		const cssFiles = [];
		const seenCssFiles = /* @__PURE__ */ new Set();
		for (const auxFile of chunk.auxiliaryFiles) if (auxFile.endsWith(".css") && !seenCssFiles.has(auxFile)) {
			seenCssFiles.add(auxFile);
			cssFiles.push(auxFile);
		}
		for (const mainFile of chunk.files) if (mainFile.endsWith(".css") && !seenCssFiles.has(mainFile)) {
			seenCssFiles.add(mainFile);
			cssFiles.push(mainFile);
		}
		if (cssFiles.length > 0) for (const mod of modules) {
			const sourcePath = mod.nameForCondition();
			if (!sourcePath) continue;
			const existing = cssFilesBySourcePath.get(sourcePath);
			cssFilesBySourcePath.set(sourcePath, existing ? appendUniqueStrings(existing, cssFiles) : cssFiles.slice());
		}
		const isEntryChunk = chunk.name === "index" && entryChunkSet.has(chunk);
		const jsFiles = getChunkJsFiles(chunk);
		if (jsFiles.length === 0) continue;
		const dynamicImports = computeDynamicImports(chunk);
		for (const file of jsFiles) {
			const normalizedChunk = {
				fileName: file,
				isEntry: isEntryChunk,
				imports: isEntryChunk ? initialJsFileNames.filter((f) => f !== file) : computeAsyncChunkImports(chunk, file),
				dynamicImports,
				css: [],
				routeFilePaths,
				hydrationIds
			};
			chunksByFileName.set(file, normalizedChunk);
			if (isEntryChunk && !entryChunkFileName) entryChunkFileName = file;
			for (const routeFilePath of routeFilePaths) {
				let chunkFileNames = chunkFileNamesByRouteFilePath.get(routeFilePath);
				if (!chunkFileNames) {
					chunkFileNames = [];
					chunkFileNamesByRouteFilePath.set(routeFilePath, chunkFileNames);
				}
				chunkFileNames.push(file);
			}
		}
		for (const cssFile of cssFiles) for (const file of jsFiles) {
			const existing = chunksByFileName.get(file);
			if (existing && !existing.css.includes(cssFile)) existing.css.push(cssFile);
		}
	}
	if (!entryChunkFileName) throw new Error("No entry file found in rspack client build");
	for (const asset of compilation.getAssets()) {
		if (!asset.name.endsWith(".css")) continue;
		const css = getCssAssetSource(asset.source.source());
		if (css !== void 0) cssContentByFileName.set(asset.name, css);
	}
	const rscEntrypoint = compilation.entrypoints.get("rsc");
	if (rscEntrypoint && entryChunkFileName) {
		const mainEntryChunk = chunksByFileName.get(entryChunkFileName);
		if (mainEntryChunk) for (const rscChunk of rscEntrypoint.chunks) {
			const allFiles = [...rscChunk.files, ...rscChunk.auxiliaryFiles];
			for (const file of allFiles) if (file.endsWith(".css") && !mainEntryChunk.css.includes(file)) mainEntryChunk.css.push(file);
		}
	}
	return {
		entryChunkFileName,
		chunksByFileName,
		chunkFileNamesByRouteFilePath,
		cssFilesBySourcePath,
		cssContentByFileName
	};
}
function appendUniqueStrings(target, source) {
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
/**
* Registers a processAssets hook to capture the client build stats
* after compilation. Returns a getter for the captured build.
*/
function registerClientBuildCapture(api) {
	let clientBuild;
	api.processAssets({
		stage: "report",
		environments: [RSBUILD_ENVIRONMENT_NAMES.client]
	}, (context) => {
		clientBuild = normalizeRspackClientBuild(context.compilation);
	});
	return { getClientBuild: () => clientBuild };
}
//#endregion
export { registerClientBuildCapture };

//# sourceMappingURL=normalized-client-build.js.map