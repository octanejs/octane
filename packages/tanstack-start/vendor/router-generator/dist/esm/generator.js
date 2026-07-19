import { logging } from "./logger.js";
import { rootPathId } from "./filesystem/physical/rootPathId.js";
import { RoutePrefixMap, buildFileRoutesByPathInterface, buildImportString, buildRouteTreeConfig, checkFileExists, checkRouteFullPathUniqueness, countRoutePathSegments, countSlashSeparatedParts, createRouteNodesByFullPath, createRouteNodesById, createRouteNodesByTo, createTokenRegex, determineNodePath, findParent, format, getImportForRouteNode, getResolvedRouteNodeVariableName, hasParentRoute, isSegmentPathless, mergeImportDeclarations, multiSortBy, removeExt, removeGroups, removeLastSegmentFromPath, removeLayoutSegmentsAndUnderscoresWithEscape, removeTrailingSlash, replaceBackslash, sortRouteNodes, trimPathLeft } from "./utils.js";
import { getRouteNodes } from "./filesystem/virtual/getRouteNodes.js";
import { getRouteNodes as getRouteNodes$1, isVirtualConfigFile } from "./filesystem/physical/getRouteNodes.js";
import { fillTemplate, getTargetTemplate } from "./template.js";
import { transform } from "./transform/transform.js";
import { validateRouteParams } from "./validate-route-params.js";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import * as fsp from "node:fs/promises";
import crypto from "node:crypto";
import { rootRouteId } from "@tanstack/router-core";
//#region src/generator.ts
function getRootRouteFileExtension(config) {
	switch (config.target) {
		case "vue": return "vue";
		case "octane": return "tsrx";
		default: return config.disableTypes ? "js" : "tsx";
	}
}
function getRoutePathSegmentMetadataForPath(node, routePath, parentRoutePath) {
	if (!node._routePathSegmentMetadata) return void 0;
	const segments = routePath.split("/");
	const result = new Array(segments.length);
	const parentSegmentCount = countRoutePathSegments(parentRoutePath);
	let hasMetadata = false;
	let segmentCount = 0;
	for (let i = 0; i < segments.length; i++) {
		if (!segments[i]) continue;
		const sourceIndex = parentSegmentCount + segmentCount + 1;
		result[i] = node._routePathSegmentMetadata[sourceIndex];
		hasMetadata ||= !!result[i];
		segmentCount++;
	}
	return hasMetadata ? result : void 0;
}
var DefaultFileSystem = {
	stat: async (filePath) => {
		const res = await fsp.stat(filePath, { bigint: true });
		return {
			mtimeMs: res.mtimeMs,
			mode: Number(res.mode),
			uid: Number(res.uid),
			gid: Number(res.gid)
		};
	},
	rename: (oldPath, newPath) => fsp.rename(oldPath, newPath),
	writeFile: (filePath, content) => fsp.writeFile(filePath, content),
	readFile: async (filePath) => {
		try {
			const fileHandle = await fsp.open(filePath, "r");
			const stat = await fileHandle.stat({ bigint: true });
			const fileContent = (await fileHandle.readFile()).toString();
			await fileHandle.close();
			return {
				stat,
				fileContent
			};
		} catch (e) {
			if ("code" in e) {
				if (e.code === "ENOENT") return "file-not-existing";
			}
			throw e;
		}
	},
	chmod: (filePath, mode) => fsp.chmod(filePath, mode),
	chown: (filePath, uid, gid) => fsp.chown(filePath, uid, gid)
};
function rerun(opts) {
	const { event, ...rest } = opts;
	return {
		rerun: true,
		event: event ?? { type: "rerun" },
		...rest
	};
}
function isRerun(result) {
	return typeof result === "object" && result !== null && "rerun" in result && result.rerun === true;
}
var Generator = class Generator {
	static {
		this.routeGroupPatternRegex = /\(.+\)/;
	}
	static {
		this.componentPieceRegex = /[./](component|errorComponent|notFoundComponent|pendingComponent|loader|lazy)[.]/;
	}
	constructor(opts) {
		this.routeNodeCache = /* @__PURE__ */ new Map();
		this.routeNodeShadowCache = /* @__PURE__ */ new Map();
		this.fileEventQueue = [];
		this.plugins = [];
		this.physicalDirectories = [];
		this.config = opts.config;
		this.logger = logging({ disabled: this.config.disableLogging });
		this.root = opts.root;
		this.fs = opts.fs || DefaultFileSystem;
		this.generatedRouteTreePath = this.getGeneratedRouteTreePath();
		this.targetTemplate = getTargetTemplate(this.config);
		this.routesDirectoryPath = this.getRoutesDirectoryPath();
		this.plugins.push(...opts.config.plugins || []);
		this.indexTokenFilenameRegex = createTokenRegex(this.config.indexToken, { type: "filename" });
		this.routeTokenFilenameRegex = createTokenRegex(this.config.routeToken, { type: "filename" });
		this.indexTokenSegmentRegex = createTokenRegex(this.config.indexToken, { type: "segment" });
		this.routeTokenSegmentRegex = createTokenRegex(this.config.routeToken, { type: "segment" });
		for (const plugin of this.plugins) plugin.init?.({ generator: this });
	}
	getGeneratedRouteTreePath() {
		const generatedRouteTreePath = path.isAbsolute(this.config.generatedRouteTree) ? this.config.generatedRouteTree : path.resolve(this.root, this.config.generatedRouteTree);
		const generatedRouteTreeDir = path.dirname(generatedRouteTreePath);
		if (!existsSync(generatedRouteTreeDir)) mkdirSync(generatedRouteTreeDir, { recursive: true });
		return generatedRouteTreePath;
	}
	getRoutesDirectoryPath() {
		return path.isAbsolute(this.config.routesDirectory) ? this.config.routesDirectory : path.resolve(this.root, this.config.routesDirectory);
	}
	getRoutesByFileMap() {
		return new Map([...this.routeNodeCache.entries()].map(([filePath, cacheEntry]) => [filePath, { routeId: cacheEntry.routeId }]));
	}
	async fillRouteTemplate(node, template, values) {
		return fillTemplate(this.config, template, values, async (source) => {
			let result = source;
			let wasFormatted = false;
			for (const plugin of this.plugins) {
				const pluginResult = await plugin.formatRoute?.({
					source: result,
					node
				});
				if (pluginResult !== void 0) {
					result = pluginResult;
					wasFormatted = true;
				}
			}
			return wasFormatted ? result : format(source, this.config);
		});
	}
	async getParseSource(opts) {
		let result = opts.source;
		let wasTransformed = false;
		for (const plugin of this.plugins) {
			const pluginResult = await plugin.transformRouteSource?.({
				source: result,
				filename: opts.filename ?? opts.node.fullPath,
				node: opts.node
			});
			if (pluginResult !== void 0) {
				result = pluginResult;
				wasTransformed = true;
			}
		}
		return wasTransformed ? result : void 0;
	}
	async run(event) {
		if (event && event.type !== "rerun" && !this.isFileRelevantForRouteTreeGeneration(event.path)) return;
		this.fileEventQueue.push(event ?? { type: "rerun" });
		if (this.runPromise) return this.runPromise;
		this.runPromise = (async () => {
			do {
				const tempQueue = this.fileEventQueue;
				this.fileEventQueue = [];
				if ((await Promise.all(tempQueue.map(async (e) => {
					if (e.type === "update") {
						let cacheEntry;
						if (e.path === this.generatedRouteTreePath) cacheEntry = this.routeTreeFileCache;
						else cacheEntry = this.routeNodeCache.get(e.path);
						if ((await this.didFileChangeComparedToCache({ path: e.path }, cacheEntry)).result === false) return null;
					}
					return e;
				}))).filter((e) => e !== null).length === 0) break;
				try {
					await this.generatorInternal();
				} catch (err) {
					const errArray = !Array.isArray(err) ? [err] : err;
					const recoverableErrors = errArray.filter((e) => isRerun(e));
					if (recoverableErrors.length === errArray.length) {
						this.fileEventQueue.push(...recoverableErrors.map((e) => e.event));
						recoverableErrors.forEach((e) => {
							if (e.msg) this.logger.info(e.msg);
						});
					} else {
						const unrecoverableErrors = errArray.filter((e) => !isRerun(e));
						this.runPromise = void 0;
						throw new Error(unrecoverableErrors.map((e) => e.message).join());
					}
				}
			} while (this.fileEventQueue.length);
			this.runPromise = void 0;
		})();
		return this.runPromise;
	}
	async generatorInternal() {
		let writeRouteTreeFile = false;
		let getRouteNodesResult;
		if (this.config.virtualRouteConfig) getRouteNodesResult = await getRouteNodes(this.config, this.root, {
			indexTokenSegmentRegex: this.indexTokenSegmentRegex,
			routeTokenSegmentRegex: this.routeTokenSegmentRegex
		});
		else getRouteNodesResult = await getRouteNodes$1(this.config, this.root, {
			indexTokenSegmentRegex: this.indexTokenSegmentRegex,
			routeTokenSegmentRegex: this.routeTokenSegmentRegex
		});
		const { rootRouteNode, routeNodes: beforeRouteNodes, physicalDirectories } = getRouteNodesResult;
		if (rootRouteNode === void 0) {
			let errorMessage = `rootRouteNode must not be undefined. Make sure you've added your root route into the route-tree.`;
			if (!this.config.virtualRouteConfig) {
				const rootRouteExtension = getRootRouteFileExtension(this.config);
				errorMessage += `\nMake sure that you add a "${rootPathId}.${rootRouteExtension}" file to your routes directory.\nAdd the file in: "${this.config.routesDirectory}/${rootPathId}.${rootRouteExtension}"`;
			}
			throw new Error(errorMessage);
		}
		this.physicalDirectories = physicalDirectories;
		await this.handleRootNode(rootRouteNode);
		const preRouteNodes = multiSortBy(beforeRouteNodes, [
			(d) => d.routePath === "/" ? -1 : 1,
			(d) => d.routePath === void 0 ? void 0 : countSlashSeparatedParts(d.routePath),
			(d) => d.filePath.match(this.indexTokenFilenameRegex) ? 1 : -1,
			(d) => d.filePath.match(Generator.componentPieceRegex) ? 1 : -1,
			(d) => d.filePath.match(this.routeTokenFilenameRegex) ? -1 : 1,
			(d) => d.routePath?.endsWith("/") ? -1 : 1,
			(d) => d.routePath
		]).filter((d) => {
			if (d.routePath === `/__root`) return [
				"component",
				"errorComponent",
				"notFoundComponent",
				"pendingComponent",
				"loader",
				"lazy"
			].includes(d._fsRouteType);
			return true;
		});
		const routeFileAllResult = await Promise.allSettled(preRouteNodes.filter((n) => !n.isVirtualParentRoute && !n.isVirtual).map((n) => this.processRouteNodeFile(n)));
		const rejections = routeFileAllResult.filter((result) => result.status === "rejected");
		if (rejections.length > 0) throw rejections.map((e) => e.reason);
		const routeFileResult = routeFileAllResult.flatMap((result) => {
			if (result.status === "fulfilled" && result.value !== null) {
				if (result.value.shouldWriteTree) writeRouteTreeFile = true;
				return result.value.node;
			}
			return [];
		});
		routeFileResult.forEach((r) => r.children = void 0);
		const acc = {
			routeTree: [],
			routeNodes: [],
			routePiecesByPath: {},
			routeNodesByPath: /* @__PURE__ */ new Map()
		};
		const prefixMap = new RoutePrefixMap(routeFileResult);
		for (const node of routeFileResult) Generator.handleNode(node, acc, prefixMap, this.config);
		this.crawlingResult = {
			rootRouteNode,
			routeFileResult,
			acc
		};
		if (!this.routeTreeFileCache) {
			const routeTreeFile = await this.fs.readFile(this.generatedRouteTreePath);
			if (routeTreeFile !== "file-not-existing") this.routeTreeFileCache = {
				fileContent: routeTreeFile.fileContent,
				mtimeMs: routeTreeFile.stat.mtimeMs
			};
			writeRouteTreeFile = true;
		} else {
			const routeTreeFileChange = await this.didFileChangeComparedToCache({ path: this.generatedRouteTreePath }, this.routeTreeFileCache);
			if (routeTreeFileChange.result !== false) {
				writeRouteTreeFile = "force";
				if (routeTreeFileChange.result === true) {
					const routeTreeFile = await this.fs.readFile(this.generatedRouteTreePath);
					if (routeTreeFile !== "file-not-existing") this.routeTreeFileCache = {
						fileContent: routeTreeFile.fileContent,
						mtimeMs: routeTreeFile.stat.mtimeMs
					};
				}
			}
		}
		if (!writeRouteTreeFile) {
			if (this.routeNodeCache.size !== this.routeNodeShadowCache.size) writeRouteTreeFile = true;
			else for (const fullPath of this.routeNodeCache.keys()) if (!this.routeNodeShadowCache.has(fullPath)) {
				writeRouteTreeFile = true;
				break;
			}
		}
		if (!writeRouteTreeFile) {
			this.swapCaches();
			return;
		}
		const buildResult = this.buildRouteTree({
			rootRouteNode,
			acc,
			routeFileResult
		});
		let routeTreeContent = buildResult.routeTreeContent;
		routeTreeContent = this.config.enableRouteTreeFormatting ? await format(routeTreeContent, this.config) : routeTreeContent;
		let newMtimeMs;
		if (this.routeTreeFileCache) if (this.routeTreeFileCache.fileContent === routeTreeContent) {} else newMtimeMs = (await this.safeFileWrite({
			filePath: this.generatedRouteTreePath,
			newContent: routeTreeContent,
			strategy: {
				type: "mtime",
				expectedMtimeMs: this.routeTreeFileCache.mtimeMs
			}
		})).mtimeMs;
		else newMtimeMs = (await this.safeFileWrite({
			filePath: this.generatedRouteTreePath,
			newContent: routeTreeContent,
			strategy: { type: "new-file" }
		})).mtimeMs;
		if (newMtimeMs !== void 0) this.routeTreeFileCache = {
			fileContent: routeTreeContent,
			mtimeMs: newMtimeMs
		};
		this.plugins.map((plugin) => {
			return plugin.onRouteTreeChanged?.({
				routeTree: buildResult.routeTree,
				routeNodes: buildResult.routeNodes,
				acc,
				rootRouteNode
			});
		});
		this.swapCaches();
	}
	swapCaches() {
		this.routeNodeCache = this.routeNodeShadowCache;
		this.routeNodeShadowCache = /* @__PURE__ */ new Map();
	}
	buildRouteTree(opts) {
		const config = {
			...this.config,
			...opts.config || {}
		};
		const { rootRouteNode, acc } = opts;
		const indexTokenSegmentRegex = config.indexToken === this.config.indexToken ? this.indexTokenSegmentRegex : createTokenRegex(config.indexToken, { type: "segment" });
		const sortedRouteNodes = sortRouteNodes(acc.routeNodes, indexTokenSegmentRegex);
		const routeImports = [];
		const virtualRouteNodes = [];
		for (const node of sortedRouteNodes) if (node.isVirtual) virtualRouteNodes.push(`const ${node.variableName}RouteImport = createFileRoute('${node.routePath}')()`);
		else routeImports.push(getImportForRouteNode(node, config, this.generatedRouteTreePath, this.root));
		const imports = [];
		if (virtualRouteNodes.length > 0) imports.push({
			specifiers: [{ imported: "createFileRoute" }],
			source: this.targetTemplate.fullPkg
		});
		let hasComponentPieces = false;
		let hasLoaderPieces = false;
		for (const node of sortedRouteNodes) {
			const pieces = acc.routePiecesByPath[node.routePath];
			if (pieces) {
				if (pieces.component || pieces.errorComponent || pieces.notFoundComponent || pieces.pendingComponent) hasComponentPieces = true;
				if (pieces.loader) hasLoaderPieces = true;
				if (hasComponentPieces && hasLoaderPieces) break;
			}
		}
		if (hasComponentPieces || hasLoaderPieces) {
			const runtimeImport = {
				specifiers: [],
				source: this.targetTemplate.fullPkg
			};
			if (hasComponentPieces) runtimeImport.specifiers.push({ imported: "lazyRouteComponent" });
			if (hasLoaderPieces) runtimeImport.specifiers.push({ imported: "lazyFn" });
			imports.push(runtimeImport);
		}
		const routeTreeConfig = buildRouteTreeConfig(acc.routeTree, config.disableTypes);
		const createUpdateRoutes = sortedRouteNodes.map((node) => {
			const pieces = acc.routePiecesByPath[node.routePath];
			const loaderNode = pieces?.loader;
			const componentNode = pieces?.component;
			const errorComponentNode = pieces?.errorComponent;
			const notFoundComponentNode = pieces?.notFoundComponent;
			const pendingComponentNode = pieces?.pendingComponent;
			const lazyComponentNode = pieces?.lazy;
			return [[
				`const ${node.variableName}Route = ${node.variableName}RouteImport.update({
            ${[
					`id: '${node.path}'`,
					!node.isNonPath || node._fsRouteType === "pathless_layout" && node.cleanedPath ? `path: '${node.cleanedPath}'` : void 0,
					`getParentRoute: () => ${findParent(node)}`
				].filter(Boolean).join(",")}
          }${config.disableTypes ? "" : "as any"})`,
				loaderNode ? `.updateLoader({ loader: lazyFn(() => import('./${replaceBackslash(removeExt(path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, loaderNode.filePath)), config.addExtensions))}'), 'loader') })` : "",
				componentNode || errorComponentNode || notFoundComponentNode || pendingComponentNode ? `.update({
                ${[
					["component", componentNode],
					["errorComponent", errorComponentNode],
					["notFoundComponent", notFoundComponentNode],
					["pendingComponent", pendingComponentNode]
				].filter((d) => d[1]).map((d) => {
					const isVueFile = d[1].filePath.endsWith(".vue");
					const exportName = isVueFile ? "default" : d[0];
					const importPath = replaceBackslash(isVueFile ? path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, d[1].filePath)) : removeExt(path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, d[1].filePath)), config.addExtensions));
					return `${d[0]}: lazyRouteComponent(() => import('./${importPath}'), '${exportName}')`;
				}).join("\n,")}
              })` : "",
				lazyComponentNode ? (() => {
					const isVueFile = lazyComponentNode.filePath.endsWith(".vue");
					const exportAccessor = isVueFile ? "d.default" : "d.Route";
					return `.lazy(() => import('./${replaceBackslash(isVueFile ? path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, lazyComponentNode.filePath)) : removeExt(path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, lazyComponentNode.filePath)), config.addExtensions))}').then((d) => ${exportAccessor}))`;
				})() : ""
			].join("")].join("\n\n");
		});
		const rootRoutePath = `/${rootPathId}`;
		const rootPieces = acc.routePiecesByPath[rootRoutePath];
		const rootComponentNode = rootPieces?.component;
		const rootErrorComponentNode = rootPieces?.errorComponent;
		const rootNotFoundComponentNode = rootPieces?.notFoundComponent;
		const rootPendingComponentNode = rootPieces?.pendingComponent;
		let rootRouteUpdate = "";
		if (rootComponentNode || rootErrorComponentNode || rootNotFoundComponentNode || rootPendingComponentNode) rootRouteUpdate = `const rootRouteWithChildren = rootRouteImport${rootComponentNode || rootErrorComponentNode || rootNotFoundComponentNode || rootPendingComponentNode ? `.update({
              ${[
			["component", rootComponentNode],
			["errorComponent", rootErrorComponentNode],
			["notFoundComponent", rootNotFoundComponentNode],
			["pendingComponent", rootPendingComponentNode]
		].filter((d) => d[1]).map((d) => {
			const isVueFile = d[1].filePath.endsWith(".vue");
			const exportName = isVueFile ? "default" : d[0];
			const importPath = replaceBackslash(isVueFile ? path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, d[1].filePath)) : removeExt(path.relative(path.dirname(config.generatedRouteTree), path.resolve(config.routesDirectory, d[1].filePath)), config.addExtensions));
			return `${d[0]}: lazyRouteComponent(() => import('./${importPath}'), '${exportName}')`;
		}).join("\n,")}
            })` : ""}._addFileChildren(rootRouteChildren)${config.disableTypes ? "" : `._addFileTypes<FileRouteTypes>()`}`;
		let fileRoutesByPathInterface = "";
		let fileRoutesByFullPath = "";
		if (!config.disableTypes) {
			const routeNodesByFullPath = createRouteNodesByFullPath(acc.routeNodes);
			const routeNodesByTo = createRouteNodesByTo(acc.routeNodes);
			const routeNodesById = createRouteNodesById(acc.routeNodes);
			fileRoutesByFullPath = [
				`export interface FileRoutesByFullPath {
${[...routeNodesByFullPath.entries()].filter(([fullPath]) => fullPath).map(([fullPath, routeNode]) => {
					return `'${fullPath}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`;
				})}
}`,
				`export interface FileRoutesByTo {
${[...routeNodesByTo.entries()].filter(([to]) => to).map(([to, routeNode]) => {
					return `'${to}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`;
				})}
}`,
				`export interface FileRoutesById {
'${rootRouteId}': typeof rootRouteImport,
${[...routeNodesById.entries()].map(([id, routeNode]) => {
					return `'${id}': typeof ${getResolvedRouteNodeVariableName(routeNode)}`;
				})}
}`,
				`export interface FileRouteTypes {
fileRoutesByFullPath: FileRoutesByFullPath
fullPaths: ${acc.routeNodes.length > 0 ? [...routeNodesByFullPath.keys()].filter((fullPath) => fullPath).map((fullPath) => `'${fullPath}'`).join("|") : "never"}
fileRoutesByTo: FileRoutesByTo
to: ${acc.routeNodes.length > 0 ? [...routeNodesByTo.keys()].filter((to) => to).map((to) => `'${to}'`).join("|") : "never"}
id: ${[`'${rootRouteId}'`, ...[...routeNodesById.keys()].map((id) => `'${id}'`)].join("|")}
fileRoutesById: FileRoutesById
}`,
				`export interface RootRouteChildren {
${acc.routeTree.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(",")}
}`
			].join("\n");
			fileRoutesByPathInterface = buildFileRoutesByPathInterface({
				module: this.targetTemplate.fullPkg,
				interfaceName: "FileRoutesByPath",
				routeNodes: sortedRouteNodes,
				config
			});
		}
		const routeTree = [`const rootRouteChildren${config.disableTypes ? "" : `: RootRouteChildren`} = {
  ${acc.routeTree.map((child) => `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`).join(",")}
}`, rootRouteUpdate ? rootRouteUpdate.replace("const rootRouteWithChildren = ", "export const routeTree = ") : `export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)${config.disableTypes ? "" : `._addFileTypes<FileRouteTypes>()`}`].join("\n");
		checkRouteFullPathUniqueness(sortedRouteNodes.filter((d) => d.children === void 0 && "lazy" !== d._fsRouteType), config);
		let mergedImports = mergeImportDeclarations(imports);
		if (config.disableTypes) mergedImports = mergedImports.filter((d) => d.importKind !== "type");
		const importStatements = mergedImports.map(buildImportString);
		const rootRouteImport = getImportForRouteNode(rootRouteNode, config, this.generatedRouteTreePath, this.root);
		routeImports.unshift(rootRouteImport);
		let footer = [];
		if (config.routeTreeFileFooter) if (Array.isArray(config.routeTreeFileFooter)) footer = config.routeTreeFileFooter;
		else footer = config.routeTreeFileFooter();
		return {
			routeTreeContent: [
				...config.routeTreeFileHeader,
				`// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.`,
				[...importStatements].join("\n"),
				mergeImportDeclarations(routeImports).map(buildImportString).join("\n"),
				virtualRouteNodes.join("\n"),
				createUpdateRoutes.join("\n"),
				fileRoutesByFullPath,
				fileRoutesByPathInterface,
				routeTreeConfig.join("\n"),
				routeTree,
				...footer
			].filter(Boolean).join("\n\n"),
			routeTree: acc.routeTree,
			routeNodes: acc.routeNodes
		};
	}
	async processRouteNodeFile(node) {
		const result = await this.isRouteFileCacheFresh(node);
		if (result.status === "fresh") return {
			node: result.cacheEntry.node,
			shouldWriteTree: false,
			cacheEntry: result.cacheEntry
		};
		const previousCacheEntry = result.cacheEntry;
		const existingRouteFile = await this.fs.readFile(node.fullPath);
		if (existingRouteFile === "file-not-existing") throw new Error(`⚠️ File ${node.fullPath} does not exist`);
		if (node.routePath) validateRouteParams(node.routePath, node.filePath, this.logger);
		const updatedCacheEntry = {
			fileContent: existingRouteFile.fileContent,
			mtimeMs: existingRouteFile.stat.mtimeMs,
			routeId: node.routePath ?? "$$TSR_NO_ROUTE_PATH_ASSIGNED$$",
			node
		};
		const escapedRoutePath = node.routePath?.replaceAll("$", "$$") ?? "";
		let shouldWriteRouteFile = false;
		let shouldWriteTree = false;
		if (!existingRouteFile.fileContent) {
			shouldWriteRouteFile = true;
			shouldWriteTree = true;
			if (node._fsRouteType === "lazy") {
				const tLazyRouteTemplate = this.targetTemplate.lazyRoute;
				updatedCacheEntry.fileContent = await this.fillRouteTemplate(node, (this.config.customScaffolding?.lazyRouteTemplate || this.config.customScaffolding?.routeTemplate) ?? tLazyRouteTemplate.template(), {
					tsrImports: tLazyRouteTemplate.imports.tsrImports(),
					tsrPath: escapedRoutePath.replaceAll(/\{(.+?)\}/gm, "$1"),
					tsrExportStart: tLazyRouteTemplate.imports.tsrExportStart(escapedRoutePath),
					tsrExportEnd: tLazyRouteTemplate.imports.tsrExportEnd()
				});
			} else if (["layout", "static"].some((d) => d === node._fsRouteType) || [
				"component",
				"pendingComponent",
				"errorComponent",
				"notFoundComponent",
				"loader"
			].every((d) => d !== node._fsRouteType)) {
				const tRouteTemplate = this.targetTemplate.route;
				updatedCacheEntry.fileContent = await this.fillRouteTemplate(node, this.config.customScaffolding?.routeTemplate ?? tRouteTemplate.template(), {
					tsrImports: tRouteTemplate.imports.tsrImports(),
					tsrPath: escapedRoutePath.replaceAll(/\{(.+?)\}/gm, "$1"),
					tsrExportStart: tRouteTemplate.imports.tsrExportStart(escapedRoutePath),
					tsrExportEnd: tRouteTemplate.imports.tsrExportEnd()
				});
			} else return null;
		}
		if (!node.filePath.endsWith(".vue")) {
			const transformOptions = {
				source: updatedCacheEntry.fileContent,
				filename: node.fullPath,
				ctx: {
					target: this.config.target,
					routeId: escapedRoutePath,
					lazy: node._fsRouteType === "lazy"
				},
				node
			};
			const transformResult = await transform({
				...transformOptions,
				parseSource: await this.getParseSource(transformOptions)
			});
			if (transformResult.result === "no-route-export") {
				const fileName = path.basename(node.fullPath);
				const dirName = path.dirname(node.fullPath);
				const ignorePrefix = this.config.routeFileIgnorePrefix;
				const ignorePattern = this.config.routeFileIgnorePattern;
				const suggestedFileName = `${ignorePrefix}${fileName}`;
				const suggestedFullPath = path.join(dirName, suggestedFileName);
				let message = `Warning: Route file "${node.fullPath}" does not export a Route. This file will not be included in the route tree.`;
				message += `\n\nIf this file is not intended to be a route, you can exclude it using one of these options:`;
				message += `\n  1. Rename the file to "${suggestedFullPath}" (prefix with "${ignorePrefix}")`;
				message += `\n  2. Use 'routeFileIgnorePattern' in your config to match this file`;
				message += `\n\nCurrent configuration:`;
				message += `\n  routeFileIgnorePrefix: "${ignorePrefix}"`;
				message += `\n  routeFileIgnorePattern: ${ignorePattern ? `"${ignorePattern}"` : "undefined"}`;
				this.logger.warn(message);
				return null;
			}
			if (transformResult.result === "error") throw new Error(`Error transforming route file ${node.fullPath}: ${transformResult.error}`);
			if (transformResult.result === "modified") {
				updatedCacheEntry.fileContent = transformResult.output;
				shouldWriteRouteFile = true;
			}
		}
		for (const plugin of this.plugins) plugin.afterTransform?.({
			node,
			prevNode: previousCacheEntry?.node
		});
		if (shouldWriteRouteFile) updatedCacheEntry.mtimeMs = (await this.safeFileWrite({
			filePath: node.fullPath,
			newContent: updatedCacheEntry.fileContent,
			strategy: {
				type: "mtime",
				expectedMtimeMs: updatedCacheEntry.mtimeMs
			}
		})).mtimeMs;
		this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry);
		return {
			node,
			shouldWriteTree,
			cacheEntry: updatedCacheEntry
		};
	}
	async didRouteFileChangeComparedToCache(file, cache) {
		const cacheEntry = this[cache].get(file.path);
		return this.didFileChangeComparedToCache(file, cacheEntry);
	}
	async didFileChangeComparedToCache(file, cacheEntry) {
		if (!cacheEntry) return { result: "file-not-in-cache" };
		let mtimeMs = file.mtimeMs;
		if (mtimeMs === void 0) try {
			mtimeMs = (await this.fs.stat(file.path)).mtimeMs;
		} catch {
			return { result: "cannot-stat-file" };
		}
		return {
			result: mtimeMs !== cacheEntry.mtimeMs,
			mtimeMs,
			cacheEntry
		};
	}
	async safeFileWrite(opts) {
		const tmpPath = this.getTempFileName(opts.filePath);
		await this.fs.writeFile(tmpPath, opts.newContent);
		if (opts.strategy.type === "mtime") {
			const beforeStat = await this.fs.stat(opts.filePath);
			if (beforeStat.mtimeMs !== opts.strategy.expectedMtimeMs) throw rerun({
				msg: `File ${opts.filePath} was modified by another process during processing.`,
				event: {
					type: "update",
					path: opts.filePath
				}
			});
			const newFileState = await this.fs.stat(tmpPath);
			if (newFileState.mode !== beforeStat.mode) await this.fs.chmod(tmpPath, beforeStat.mode);
			if (newFileState.uid !== beforeStat.uid || newFileState.gid !== beforeStat.gid) try {
				await this.fs.chown(tmpPath, beforeStat.uid, beforeStat.gid);
			} catch (err) {
				if (typeof err === "object" && err !== null && "code" in err && err.code === "EPERM") console.warn(`[safeFileWrite] chown failed: ${err.message}`);
				else throw err;
			}
		} else if (await checkFileExists(opts.filePath)) throw rerun({
			msg: `File ${opts.filePath} already exists. Cannot overwrite.`,
			event: {
				type: "update",
				path: opts.filePath
			}
		});
		await this.fs.rename(tmpPath, opts.filePath);
		return await this.fs.stat(opts.filePath);
	}
	getTempFileName(filePath) {
		const absPath = path.resolve(filePath);
		const hash = crypto.createHash("md5").update(absPath).digest("hex");
		if (!this.sessionId) {
			mkdirSync(this.config.tmpDir, { recursive: true });
			this.sessionId = crypto.randomBytes(4).toString("hex");
		}
		return path.join(this.config.tmpDir, `${this.sessionId}-${hash}`);
	}
	async isRouteFileCacheFresh(node) {
		const fileChangedCache = await this.didRouteFileChangeComparedToCache({ path: node.fullPath }, "routeNodeCache");
		if (fileChangedCache.result === false) {
			this.routeNodeShadowCache.set(node.fullPath, fileChangedCache.cacheEntry);
			return {
				status: "fresh",
				cacheEntry: fileChangedCache.cacheEntry
			};
		}
		if (fileChangedCache.result === "cannot-stat-file") throw new Error(`⚠️ expected route file to exist at ${node.fullPath}`);
		const mtimeMs = fileChangedCache.result === true ? fileChangedCache.mtimeMs : void 0;
		const shadowCacheFileChange = await this.didRouteFileChangeComparedToCache({
			path: node.fullPath,
			mtimeMs
		}, "routeNodeShadowCache");
		if (shadowCacheFileChange.result === "cannot-stat-file") throw new Error(`⚠️ expected route file to exist at ${node.fullPath}`);
		if (shadowCacheFileChange.result === false) {
			if (fileChangedCache.result === true) return {
				status: "fresh",
				cacheEntry: shadowCacheFileChange.cacheEntry
			};
		}
		if (fileChangedCache.result === "file-not-in-cache") return { status: "stale" };
		return {
			status: "stale",
			cacheEntry: fileChangedCache.cacheEntry
		};
	}
	async handleRootNode(node) {
		const result = await this.isRouteFileCacheFresh(node);
		if (result.status === "fresh") this.routeNodeShadowCache.set(node.fullPath, result.cacheEntry);
		const rootNodeFile = await this.fs.readFile(node.fullPath);
		if (rootNodeFile === "file-not-existing") throw new Error(`⚠️ expected root route to exist at ${node.fullPath}`);
		const updatedCacheEntry = {
			fileContent: rootNodeFile.fileContent,
			mtimeMs: rootNodeFile.stat.mtimeMs,
			routeId: node.routePath ?? "$$TSR_NO_ROOT_ROUTE_PATH_ASSIGNED$$",
			node
		};
		if (!rootNodeFile.fileContent) {
			const rootTemplate = this.targetTemplate.rootRoute;
			const rootRouteContent = await this.fillRouteTemplate(node, rootTemplate.template(), {
				tsrImports: rootTemplate.imports.tsrImports(),
				tsrPath: rootPathId,
				tsrExportStart: rootTemplate.imports.tsrExportStart(),
				tsrExportEnd: rootTemplate.imports.tsrExportEnd()
			});
			this.logger.log(`🟡 Creating ${node.fullPath}`);
			const stats = await this.safeFileWrite({
				filePath: node.fullPath,
				newContent: rootRouteContent,
				strategy: {
					type: "mtime",
					expectedMtimeMs: rootNodeFile.stat.mtimeMs
				}
			});
			updatedCacheEntry.fileContent = rootRouteContent;
			updatedCacheEntry.mtimeMs = stats.mtimeMs;
		}
		this.routeNodeShadowCache.set(node.fullPath, updatedCacheEntry);
	}
	async getCrawlingResult() {
		await this.runPromise;
		return this.crawlingResult;
	}
	static handleNode(node, acc, prefixMap, config) {
		let parentRoute = hasParentRoute(prefixMap, node, node.routePath);
		if (node.routePath) {
			let searchPath = node.routePath;
			while (searchPath.length > 0) {
				const lastSlash = searchPath.lastIndexOf("/");
				if (lastSlash <= 0) break;
				searchPath = searchPath.substring(0, lastSlash);
				const candidate = acc.routeNodesByPath.get(searchPath);
				if (candidate && candidate.routePath !== node.routePath) {
					if (candidate !== parentRoute) {
						if (!parentRoute || (candidate.routePath?.length ?? 0) > (parentRoute.routePath?.length ?? 0)) parentRoute = candidate;
					}
					break;
				}
			}
		}
		if (node._virtualParentRoutePath !== void 0) {
			const explicitParent = acc.routeNodesByPath.get(node._virtualParentRoutePath);
			if (explicitParent) parentRoute = explicitParent;
			else if (node._virtualParentRoutePath === `/__root`) parentRoute = null;
		}
		if (parentRoute) node.parent = parentRoute;
		node.path = determineNodePath(node);
		const trimmedPath = trimPathLeft(node.path ?? "");
		const originalPath = node.originalRoutePath && node.parent?.originalRoutePath ? node.originalRoutePath.replace(node.parent.originalRoutePath, "") || "/" : node.originalRoutePath;
		const routePathSegmentMetadata = getRoutePathSegmentMetadataForPath(node, node.path ?? "/", node.parent?.routePath);
		const trimmedOriginalPath = trimPathLeft(originalPath ?? "");
		const split = trimmedPath.split("/");
		const pathSplit = (node.path ?? "").split("/");
		const originalSplit = trimmedOriginalPath.split("/");
		const lastRouteSegment = split[split.length - 1] ?? trimmedPath;
		const lastOriginalSegment = originalSplit[originalSplit.length - 1] ?? trimmedOriginalPath;
		node.isNonPath = !(routePathSegmentMetadata?.[pathSplit.length - 1])?.literalLeadingUnderscore && isSegmentPathless(lastRouteSegment, lastOriginalSegment) || split.every((part) => this.routeGroupPatternRegex.test(part));
		node.cleanedPath = removeGroups(removeLayoutSegmentsAndUnderscoresWithEscape(node.path, originalPath, routePathSegmentMetadata));
		if (node._fsRouteType === "layout" || node._fsRouteType === "pathless_layout") node.cleanedPath = removeTrailingSlash(node.cleanedPath);
		if (!node.isVirtual && [
			"lazy",
			"loader",
			"component",
			"pendingComponent",
			"errorComponent",
			"notFoundComponent"
		].some((d) => d === node._fsRouteType)) {
			acc.routePiecesByPath[node.routePath] = acc.routePiecesByPath[node.routePath] || {};
			const pieceKey = node._fsRouteType === "lazy" ? "lazy" : node._fsRouteType;
			acc.routePiecesByPath[node.routePath][pieceKey] = node;
			if (!acc.routeNodesByPath.get(node.routePath) && node.routePath !== `/__root`) this.handleNode({
				...node,
				isVirtual: true,
				_fsRouteType: "static"
			}, acc, prefixMap, config);
			return;
		}
		const isPathlessLayoutWithPath = node._fsRouteType === "pathless_layout" && node.cleanedPath && node.cleanedPath.length > 0;
		if (!node.isVirtual && isPathlessLayoutWithPath) {
			const immediateParentPath = removeLastSegmentFromPath(node.routePath) || "/";
			const immediateParentOriginalPath = removeLastSegmentFromPath(node.originalRoutePath) || "/";
			let searchPath = immediateParentPath;
			while (searchPath) {
				const candidate = acc.routeNodesByPath.get(searchPath);
				if (candidate && !candidate.isVirtual && candidate.path !== "/") {
					node.parent = candidate;
					node.path = node.routePath?.replace(candidate.routePath ?? "", "") || "/";
					const pathRelativeToParent = immediateParentPath.replace(candidate.routePath ?? "", "") || "/";
					node.cleanedPath = removeGroups(removeLayoutSegmentsAndUnderscoresWithEscape(pathRelativeToParent, immediateParentOriginalPath.replace(candidate.originalRoutePath ?? "", "") || "/", getRoutePathSegmentMetadataForPath(node, pathRelativeToParent, candidate.routePath)));
					break;
				}
				if (searchPath === "/") break;
				searchPath = removeLastSegmentFromPath(searchPath) || "/";
			}
		}
		if (node.parent) {
			node.parent.children = node.parent.children ?? [];
			node.parent.children.push(node);
		} else acc.routeTree.push(node);
		acc.routeNodes.push(node);
		if (node.routePath) acc.routeNodesByPath.set(node.routePath, node);
	}
	isFileRelevantForRouteTreeGeneration(filePath) {
		if (filePath === this.generatedRouteTreePath) return true;
		if (filePath.startsWith(this.routesDirectoryPath)) return true;
		if (typeof this.config.virtualRouteConfig === "string" && filePath === this.config.virtualRouteConfig) return true;
		if (this.routeNodeCache.has(filePath)) return true;
		if (isVirtualConfigFile(path.basename(filePath))) return true;
		if (this.physicalDirectories.some((dir) => filePath.startsWith(dir))) return true;
		return false;
	}
};
//#endregion
export { Generator };

//# sourceMappingURL=generator.js.map