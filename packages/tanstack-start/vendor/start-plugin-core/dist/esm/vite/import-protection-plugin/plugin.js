import { VITE_ENVIRONMENT_NAMES } from "../../constants.js";
import { escapeRegExp, resolveViteId } from "../../utils.js";
import { IMPORT_PROTECTION_DEBUG, MOCK_BUILD_PREFIX, SERVER_FN_LOOKUP_QUERY, VITE_BROWSER_VIRTUAL_PREFIX } from "../../import-protection/constants.js";
import { buildResolutionCandidates, buildSourceCandidates, canonicalizeResolvedId, checkFileDenial, clearNormalizeFilePathCache, debugLog, dedupePatterns, dedupeViolationKey, getOrCreate, isFileExcluded, isInsideDirectory, matchesDebugFilter, normalizeFilePath, relativizePath, shouldDeferViolation } from "../../import-protection/utils.js";
import { ImportGraph, buildTrace, formatViolation } from "../../import-protection/trace.js";
import { getDefaultImportProtectionRules, getMarkerSpecifiers } from "../../import-protection/defaults.js";
import { compileMatchers, matchesAny } from "../../import-protection/matchers.js";
import { getImportProtectionEnvType, getImportProtectionRelativePath, getImportProtectionRulesForEnvironment, shouldCheckImportProtectionImporter } from "../../import-protection/adapterUtils.js";
import { ImportLocCache, addTraceImportLocations, buildCodeSnippet, createImportSpecifierLocationIndex, findImportStatementLocationFromTransformed, findOriginalUsageLocation, findPostCompileUsageLocation, normalizeSourceMap } from "../../import-protection/sourceLocation.js";
import { getImportSourcesFromResult, getMockExportNamesBySource, getNamedExports } from "../../import-protection/analysis.js";
import { rewriteDeniedImports } from "../../import-protection/rewrite.js";
import { ExtensionlessAbsoluteIdResolver } from "../../import-protection/extensionlessAbsoluteIdResolver.js";
import { generateDevSelfDenialModule, generateSelfContainedMockModule, makeMockEdgeModuleId, mockRuntimeModuleIdFromViolation } from "../../import-protection/virtualModules.js";
import { getResolvedVirtualModuleMatchers, loadResolvedVirtualModule, resolveInternalVirtualModuleId, resolvedMarkerVirtualModuleId } from "./virtualModules.js";
import { dirname, relative } from "pathe";
import { writeFileSync } from "node:fs";
import { normalizePath } from "vite";
//#region src/vite/import-protection-plugin/plugin.ts
function isPerfEnabled() {
	return process.env.TSR_IMPORT_PROTECTION_PERF === "1" || process.env.TSR_IMPORT_PROTECTION_PERF === "true";
}
function createPerfCollector() {
	const counters = /* @__PURE__ */ new Map();
	const timings = /* @__PURE__ */ new Map();
	const flushEnvironments = /* @__PURE__ */ new Set();
	let flushCount = 0;
	return {
		count(name, value = 1) {
			counters.set(name, (counters.get(name) ?? 0) + value);
		},
		time(name, startedAt) {
			const duration = performance.now() - startedAt;
			const timing = timings.get(name);
			if (timing) {
				timing.count++;
				timing.totalMs += duration;
				timing.maxMs = Math.max(timing.maxMs, duration);
			} else timings.set(name, {
				count: 1,
				totalMs: duration,
				maxMs: duration
			});
		},
		flush(root, envName) {
			flushCount++;
			flushEnvironments.add(envName);
			const payload = {
				root,
				flushCount,
				flushEnvironments: Array.from(flushEnvironments).sort(),
				counters: Object.fromEntries(counters),
				timings: Object.fromEntries(Array.from(timings, ([name, timing]) => [name, {
					count: timing.count,
					totalMs: Number(timing.totalMs.toFixed(3)),
					avgMs: Number((timing.totalMs / timing.count).toFixed(3)),
					maxMs: Number(timing.maxMs.toFixed(3))
				}]))
			};
			const file = process.env.TSR_IMPORT_PROTECTION_PERF_FILE;
			if (file) writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
			else console.warn(`[import-protection:perf] ${JSON.stringify(payload, null, 2)}`);
		}
	};
}
function importProtectionPlugin(opts) {
	let devServer = null;
	const perf = isPerfEnabled() ? createPerfCollector() : void 0;
	const extensionlessIdResolver = new ExtensionlessAbsoluteIdResolver();
	const resolveExtensionlessAbsoluteId = (id) => extensionlessIdResolver.resolve(id);
	const importSpecifierLocationIndex = createImportSpecifierLocationIndex();
	/**
	* Build an import trace using Vite's per-environment module graph, which
	* is authoritative even on warm starts when the plugin's own ImportGraph
	* may be incomplete (Vite skips resolveId for cached modules).
	*/
	function buildTraceFromModuleGraph(envName, env, targetFile) {
		if (!devServer) return null;
		const environment = devServer.environments[envName];
		if (!environment) return null;
		const file = normalizeFilePath(targetFile);
		const start = environment.moduleGraph.getModuleById(file);
		if (!start) return null;
		const nodeIds = /* @__PURE__ */ new Map();
		function nodeId(n) {
			let cached = nodeIds.get(n);
			if (cached === void 0) {
				cached = n.id ? normalizeFilePath(n.id) : n.url ? normalizeFilePath(n.url) : "";
				nodeIds.set(n, cached);
			}
			return cached;
		}
		const queue = [start];
		const visited = new Set([start]);
		const parent = /* @__PURE__ */ new Map();
		let entryRoot = null;
		let fallbackRoot = null;
		let qi = 0;
		while (qi < queue.length) {
			const node = queue[qi++];
			const id = nodeId(node);
			if (id && env.graph.entries.has(id)) {
				entryRoot = node;
				break;
			}
			const importers = node.importers;
			if (importers.size === 0) {
				if (!fallbackRoot) fallbackRoot = node;
				continue;
			}
			for (const imp of importers) {
				if (visited.has(imp)) continue;
				visited.add(imp);
				parent.set(imp, node);
				queue.push(imp);
			}
		}
		const root = entryRoot ?? fallbackRoot;
		if (!root) return null;
		const chain = [];
		let cur = root;
		for (let i = 0; i < config.maxTraceDepth + 2 && cur; i++) {
			chain.push(cur);
			if (cur === start) break;
			cur = parent.get(cur);
		}
		const steps = [];
		for (let i = 0; i < chain.length; i++) {
			const id = nodeId(chain[i]);
			if (!id) continue;
			let specifier;
			if (i + 1 < chain.length) {
				const nextId = nodeId(chain[i + 1]);
				if (nextId) specifier = env.graph.reverseEdges.get(nextId)?.get(id);
			}
			steps.push(specifier ? {
				file: id,
				specifier
			} : { file: id });
		}
		return steps.length ? steps : null;
	}
	const config = {
		enabled: true,
		root: "",
		command: "build",
		bundledDev: false,
		srcDirectory: "",
		framework: opts.framework,
		effectiveBehavior: "error",
		mockAccess: "error",
		logMode: "once",
		maxTraceDepth: 20,
		compiledRules: {
			client: {
				specifiers: [],
				files: [],
				excludeFiles: []
			},
			server: {
				specifiers: [],
				files: [],
				excludeFiles: []
			}
		},
		includeMatchers: [],
		excludeMatchers: [],
		ignoreImporterMatchers: [],
		markerSpecifiers: {
			serverOnly: /* @__PURE__ */ new Set(),
			clientOnly: /* @__PURE__ */ new Set()
		},
		envTypeMap: new Map(opts.environments.map((e) => [e.name, e.type])),
		onViolation: void 0
	};
	const envStates = /* @__PURE__ */ new Map();
	const shared = { fileMarkerKind: /* @__PURE__ */ new Map() };
	function shouldCaptureDiagnosticSourceMap(code, envType, matchers) {
		if (!(code.includes("import") || code.includes("export"))) return false;
		const boundaryToken = envType === "client" ? ".server" : ".client";
		if (code.includes(boundaryToken)) return true;
		for (const marker of config.markerSpecifiers.serverOnly) if (code.includes(marker)) return true;
		for (const marker of config.markerSpecifiers.clientOnly) if (code.includes(marker)) return true;
		let needsSourceScan = false;
		for (const matcher of matchers.specifiers) {
			if (matcher.literal !== void 0) {
				if (code.includes(matcher.literal)) return true;
				continue;
			}
			needsSourceScan = true;
		}
		for (const matcher of matchers.files) if (matcher.pattern instanceof RegExp || !matcher.pattern.includes(boundaryToken)) {
			needsSourceScan = true;
			break;
		}
		return needsSourceScan;
	}
	function captureDiagnosticSourceMap(result, getCombinedSourcemap, reason) {
		if (result.map) return;
		const startedAt = perf ? performance.now() : 0;
		try {
			const map = getCombinedSourcemap();
			if (map) {
				result.map = map;
				perf?.count(`sourcemap.captured.${reason}`);
			}
		} catch {
			perf?.count(`sourcemap.captureFailed.${reason}`);
		} finally {
			if (perf) perf.time("sourcemap.capture", startedAt);
		}
	}
	/**
	* Build the best available source trace for a module and enrich each step
	* with line/column locations.  The plugin's own ImportGraph is preferred;
	* Vite's moduleGraph is only a dev fallback for warm starts where Vite may
	* skip resolveId for cached modules.
	*
	* Shared by {@link buildViolationInfo} and {@link processPendingViolations}.
	*/
	async function rebuildAndAnnotateTrace(provider, env, envName, normalizedImporter, specifier, importerLoc, traceOverride) {
		let trace = traceOverride ?? buildTrace(env.graph, normalizedImporter, config.maxTraceDepth);
		if (config.command === "serve") {
			const mgTrace = buildTraceFromModuleGraph(envName, env, normalizedImporter);
			if (mgTrace && mgTrace.length > trace.length) trace = mgTrace;
		}
		await addTraceImportLocations(provider, trace, env.importLocCache, importSpecifierLocationIndex.find);
		if (trace.length > 0) {
			const last = trace[trace.length - 1];
			if (!last.specifier) last.specifier = specifier;
			if (importerLoc && last.line == null) {
				last.line = importerLoc.line;
				last.column = importerLoc.column;
			}
		}
		return trace;
	}
	/**
	* Build a lightweight {@link ViolationInfo} record.
	*
	* Diagnostic-only work (trace, source-map lookup, snippets, AST usage
	* analysis) is intentionally deferred until the violation is about to be
	* reported.
	*/
	function buildViolationInfo(envName, envType, normalizedImporter, source, overrides, traceOverride) {
		perf?.count("violations.detected");
		return {
			env: envName,
			envType,
			behavior: config.effectiveBehavior,
			specifier: source,
			importer: normalizedImporter,
			trace: traceOverride ?? [],
			...overrides
		};
	}
	async function enrichViolationInfo(provider, env, envName, envType, importer, info, traceOverride) {
		const startedAt = perf ? performance.now() : 0;
		perf?.count("violations.enriched");
		const resolved = info.resolved;
		const sourceCandidates = buildSourceCandidates(info.specifier, resolved, config.root);
		addImporterRelativeSourceCandidates(sourceCandidates, importer, resolved);
		if (!info.importerLoc) {
			const loc = await resolveImporterLocation(provider, env, envType, importer, sourceCandidates);
			if (loc) {
				info.importerLoc = loc;
				info.snippet = buildCodeSnippet(provider, importer, loc, void 0, config.root);
			}
		} else if (!info.snippet) info.snippet = buildCodeSnippet(provider, importer, info.importerLoc, void 0, config.root);
		if (traceOverride || info.trace.length === 0) info.trace = await rebuildAndAnnotateTrace(provider, env, envName, info.importer, info.specifier, info.importerLoc, traceOverride);
		if (perf) perf.time("violation.enrich", startedAt);
	}
	async function resolveImporterLocation(provider, env, envType, importer, sourceCandidates) {
		for (const candidate of sourceCandidates) {
			const loc = await findPostCompileUsageLocation(provider, importer, candidate) || findOriginalUsageLocation(provider, importer, candidate, envType, config.root) || await findImportStatementLocationFromTransformed(provider, importer, candidate, env.importLocCache, importSpecifierLocationIndex.find);
			if (loc) return loc;
		}
	}
	function addImporterRelativeSourceCandidates(candidates, importer, resolved) {
		if (!resolved) return;
		const importerFile = normalizeFilePath(importer);
		const resolvedFile = normalizeFilePath(resolved);
		const relativeSource = normalizePath(relative(dirname(importerFile), resolvedFile));
		if (!relativeSource) return;
		const importSource = relativeSource.startsWith(".") ? relativeSource : `./${relativeSource}`;
		for (const candidate of buildSourceCandidates(importSource, void 0, config.root)) candidates.add(candidate);
	}
	/**
	* Check if a resolved import violates marker restrictions (e.g. importing
	* a server-only module in the client env).  If so, build and return the
	* {@link ViolationInfo} — the caller is responsible for reporting/deferring.
	*
	* Returns `undefined` when the resolved import has no marker conflict.
	*/
	function buildMarkerViolationFromResolvedImport(envName, envType, importer, source, resolvedId, traceOverride) {
		const normalizedResolvedId = normalizeFilePath(resolvedId);
		const markerKind = shared.fileMarkerKind.get(normalizedResolvedId);
		if (!(envType === "client" && markerKind === "server" || envType === "server" && markerKind === "client")) return void 0;
		return buildViolationInfo(envName, envType, normalizeFilePath(importer), source, {
			type: "marker",
			resolved: normalizedResolvedId
		}, traceOverride);
	}
	function buildFileViolationInfo(envName, envType, normalizedImporter, source, resolvedPath, pattern, traceOverride) {
		return buildViolationInfo(envName, envType, normalizedImporter, source, {
			type: "file",
			pattern,
			resolved: resolvedPath
		}, traceOverride);
	}
	function getRulesForEnvironment(envName) {
		return getImportProtectionRulesForEnvironment(config, envName);
	}
	const environmentNames = new Set([VITE_ENVIRONMENT_NAMES.client, VITE_ENVIRONMENT_NAMES.server]);
	if (opts.providerEnvName !== VITE_ENVIRONMENT_NAMES.server) environmentNames.add(opts.providerEnvName);
	/** Get (or lazily create) the per-env state for the given environment name. */
	function getEnv(envName) {
		let envState = envStates.get(envName);
		if (!envState) {
			const transformResultCache = /* @__PURE__ */ new Map();
			envState = {
				graph: new ImportGraph(),
				mockExportsByImporter: /* @__PURE__ */ new Map(),
				resolveCache: /* @__PURE__ */ new Map(),
				resolveCacheByFile: /* @__PURE__ */ new Map(),
				importLocCache: new ImportLocCache(),
				seenViolations: /* @__PURE__ */ new Set(),
				transformResultCache,
				transformResultKeysByFile: /* @__PURE__ */ new Map(),
				transformResultProvider: { getTransformResult(id) {
					const fullKey = normalizePath(id);
					const exact = transformResultCache.get(fullKey);
					if (exact) return exact;
					const strippedKey = normalizeFilePath(id);
					return strippedKey !== fullKey ? transformResultCache.get(strippedKey) : void 0;
				} },
				postTransformImports: /* @__PURE__ */ new Map(),
				serverFnLookupModules: /* @__PURE__ */ new Set(),
				pendingViolations: /* @__PURE__ */ new Map(),
				deferredBuildViolations: []
			};
			envStates.set(envName, envState);
		}
		return envState;
	}
	/**
	* Search a parsed export-names map for an entry matching any of the
	* specifier candidates.  Returns matching names or empty array.
	*/
	function findExportsInMap(exportMap, candidates) {
		for (const candidate of candidates) {
			const hit = exportMap.get(candidate);
			if (hit && hit.length > 0) return hit;
		}
		return [];
	}
	/**
	* Build deduped resolution candidates for a module ID, including the
	* extensionless absolute path when the ID looks like a file path.
	*/
	function buildIdCandidates(id, extra) {
		const set = new Set(buildResolutionCandidates(id));
		if (extra) {
			for (const c of buildResolutionCandidates(extra)) set.add(c);
			set.add(resolveExtensionlessAbsoluteId(extra));
		}
		return Array.from(set);
	}
	/**
	* Resolve which named exports the importer needs from a denied specifier,
	* so mock-edge modules can provide explicit ESM named exports.
	*
	* Tries multiple strategies: cached export maps, AST parsing, and
	* resolver-based comparison.
	*/
	async function resolveExportsForDeniedSpecifier(env, ctx, info, importerIdHint) {
		const importerFile = normalizeFilePath(info.importer);
		const specifierCandidates = buildIdCandidates(info.specifier, info.resolved);
		let parsedBySource = env.mockExportsByImporter.get(importerFile);
		if (!parsedBySource) {
			const importerCode = env.transformResultProvider.getTransformResult(importerFile)?.code ?? (importerIdHint && ctx.getModuleInfo ? ctx.getModuleInfo(importerIdHint)?.code ?? void 0 : void 0);
			if (typeof importerCode !== "string" || importerCode.length === 0) return [];
			try {
				parsedBySource = getMockExportNamesBySource(importerCode, importerFile, perf);
				await recordMockExportsForImporter(env, importerFile, parsedBySource, async (src) => {
					const cacheKey = `${importerFile}:${src}`;
					if (env.resolveCache.has(cacheKey)) return env.resolveCache.get(cacheKey) ?? void 0;
					if (!ctx.resolve) return void 0;
					const resolved = await ctx.resolve(src, info.importer, { skipSelf: true });
					if (!resolved || resolved.external) return void 0;
					return resolved.id;
				});
				parsedBySource = env.mockExportsByImporter.get(importerFile) ?? parsedBySource;
			} catch {
				return [];
			}
		}
		const direct = findExportsInMap(parsedBySource, specifierCandidates);
		if (direct.length > 0) return direct;
		const candidateSet = new Set(specifierCandidates);
		for (const [sourceKey, names] of parsedBySource) {
			if (!names.length) continue;
			const resolvedId = await resolveSourceKey(env, ctx, importerFile, sourceKey, info.importer);
			if (!resolvedId) continue;
			const resolvedCandidates = buildIdCandidates(resolvedId);
			resolvedCandidates.push(resolveExtensionlessAbsoluteId(resolvedId));
			if (resolvedCandidates.some((v) => candidateSet.has(v))) return names;
		}
		return [];
	}
	/** Best-effort resolve a source key using the cache or ctx.resolve. */
	async function resolveSourceKey(env, ctx, importerFile, sourceKey, importerId) {
		const cacheKey = `${importerFile}:${sourceKey}`;
		if (env.resolveCache.has(cacheKey)) return env.resolveCache.get(cacheKey) ?? void 0;
		if (!ctx.resolve) return void 0;
		try {
			const resolved = await ctx.resolve(sourceKey, importerId, { skipSelf: true });
			if (!resolved || resolved.external) return void 0;
			return resolved.id;
		} catch {
			return;
		}
	}
	async function recordMockExportsForImporter(env, importerId, namesBySource, resolveSource) {
		const importerFile = normalizeFilePath(importerId);
		if (namesBySource.size === 0) return;
		const resolvedAliases = /* @__PURE__ */ new Map();
		for (const [source, names] of namesBySource) try {
			const resolvedId = await resolveSource(source);
			if (!resolvedId) continue;
			resolvedAliases.set(normalizeFilePath(resolvedId), names);
			resolvedAliases.set(resolveExtensionlessAbsoluteId(resolvedId), names);
		} catch {}
		for (const [source, names] of resolvedAliases) namesBySource.set(source, names);
		const existing = env.mockExportsByImporter.get(importerFile);
		if (!existing) {
			env.mockExportsByImporter.set(importerFile, namesBySource);
			return;
		}
		for (const [source, names] of namesBySource) {
			const prev = existing.get(source);
			if (!prev) {
				existing.set(source, names);
				continue;
			}
			const union = new Set([...prev, ...names]);
			existing.set(source, Array.from(union).sort());
		}
	}
	const shouldCheckImporterCache = /* @__PURE__ */ new Map();
	function shouldCheckImporter(importer) {
		return shouldCheckImportProtectionImporter(config, importer, shouldCheckImporterCache);
	}
	function dedupeKey(info) {
		return dedupeViolationKey(info);
	}
	function hasSeen(env, key) {
		if (config.logMode === "always") return false;
		if (env.seenViolations.has(key)) return true;
		env.seenViolations.add(key);
		return false;
	}
	function getRelativePath(absolutePath) {
		return getImportProtectionRelativePath(config.root, absolutePath);
	}
	/** Reset all caches on an EnvState (called from buildStart). */
	function clearEnvState(envState) {
		envState.resolveCache.clear();
		envState.resolveCacheByFile.clear();
		envState.importLocCache.clear();
		envState.seenViolations.clear();
		envState.transformResultCache.clear();
		envState.transformResultKeysByFile.clear();
		envState.postTransformImports.clear();
		envState.serverFnLookupModules.clear();
		envState.pendingViolations.clear();
		envState.deferredBuildViolations.length = 0;
		envState.graph.clear();
		envState.mockExportsByImporter.clear();
	}
	/** Invalidate all env-level caches that reference a specific file. */
	function invalidateFileFromEnv(envState, file) {
		envState.importLocCache.deleteByFile(file);
		const resolveKeys = envState.resolveCacheByFile.get(file);
		if (resolveKeys) {
			for (const key of resolveKeys) envState.resolveCache.delete(key);
			envState.resolveCacheByFile.delete(file);
		}
		envState.graph.invalidate(file);
		envState.mockExportsByImporter.delete(file);
		envState.serverFnLookupModules.delete(file);
		envState.pendingViolations.delete(file);
		const transformKeys = envState.transformResultKeysByFile.get(file);
		if (transformKeys) {
			for (const key of transformKeys) {
				envState.transformResultCache.delete(key);
				envState.postTransformImports.delete(key);
			}
			envState.transformResultKeysByFile.delete(file);
		} else {
			envState.transformResultCache.delete(file);
			envState.postTransformImports.delete(file);
		}
	}
	/** Store a transform result under both the cacheKey and physical file path. */
	function cacheTransformResult(envState, file, cacheKey, result) {
		envState.transformResultCache.set(cacheKey, result);
		const keySet = getOrCreate(envState.transformResultKeysByFile, file, () => /* @__PURE__ */ new Set());
		keySet.add(cacheKey);
		if (cacheKey !== file) {
			envState.transformResultCache.set(file, result);
			keySet.add(file);
		}
	}
	/** Register known Start entrypoints as trace roots for all environments. */
	function registerEntries() {
		const { resolvedStartConfig } = opts.getConfig();
		for (const envDef of opts.environments) {
			const envState = getEnv(envDef.name);
			if (resolvedStartConfig.routerFilePath) envState.graph.addEntry(normalizePath(resolvedStartConfig.routerFilePath));
			if (resolvedStartConfig.startFilePath) envState.graph.addEntry(normalizePath(resolvedStartConfig.startFilePath));
		}
	}
	/**
	* Get the merged set of post-transform imports for a file, checking all
	* code-split variants.  Returns `null` if no post-transform data exists
	* yet (transform hasn't run).
	*
	* Skips `SERVER_FN_LOOKUP` variants because they contain untransformed
	* code — the Start compiler excludes them.
	*/
	function getPostTransformImports(env, file) {
		const keySet = env.transformResultKeysByFile.get(file);
		let merged = null;
		if (keySet) for (const k of keySet) {
			if (k.includes(SERVER_FN_LOOKUP_QUERY)) continue;
			const imports = env.postTransformImports.get(k);
			if (imports) if (!merged) merged = new Set(imports);
			else for (const v of imports) merged.add(v);
		}
		if (!merged) {
			const imports = env.postTransformImports.get(file);
			if (imports) merged = new Set(imports);
		}
		return merged;
	}
	/**
	* Check whether an import edge from `parent` to `target` survived
	* post-transform compilation.
	*
	* Returns:
	*   - `'live'`    — target appears in a non-lookup variant's post-transform imports
	*   - `'dead'`    — post-transform data exists but target is absent (compiler stripped it)
	*   - `'pending'` — transform ran but import data not yet posted
	*   - `'no-data'` — transform never ran (warm-start cached module)
	*/
	function checkEdgeLiveness(env, parent, target) {
		const keySet = env.transformResultKeysByFile.get(parent);
		let anyVariantCached = false;
		if (keySet) for (const k of keySet) {
			if (k.includes(SERVER_FN_LOOKUP_QUERY)) continue;
			const imports = env.postTransformImports.get(k);
			if (imports) {
				anyVariantCached = true;
				if (imports.has(target)) return "live";
			}
		}
		if (!anyVariantCached) {
			const imports = env.postTransformImports.get(parent);
			if (imports) return imports.has(target) ? "live" : "dead";
			return env.transformResultCache.has(parent) || (keySet ? keySet.size > 0 : false) ? "pending" : "no-data";
		}
		return "dead";
	}
	function checkPostTransformReachability(env, file) {
		const visited = /* @__PURE__ */ new Set();
		const queue = [file];
		let hasUnknownEdge = false;
		let qi = 0;
		while (qi < queue.length) {
			const current = queue[qi++];
			if (visited.has(current)) continue;
			visited.add(current);
			if (env.graph.entries.has(current)) return "reachable";
			const importers = env.graph.reverseEdges.get(current);
			if (!importers) continue;
			for (const [parent] of importers) {
				if (visited.has(parent)) continue;
				const liveness = checkEdgeLiveness(env, parent, current);
				if (liveness === "live" || liveness === "no-data") queue.push(parent);
				else if (liveness === "pending") hasUnknownEdge = true;
			}
		}
		return hasUnknownEdge ? "unknown" : "unreachable";
	}
	function checkSourceGraphReachability(env, file) {
		const visited = /* @__PURE__ */ new Set();
		const queue = [file];
		let qi = 0;
		while (qi < queue.length) {
			const current = queue[qi++];
			if (visited.has(current)) continue;
			visited.add(current);
			if (env.graph.entries.has(current)) return "reachable";
			const importers = env.graph.reverseEdges.get(current);
			if (!importers) continue;
			if (importers.size === 0) {
				const routesDirectory = normalizePath(`${config.srcDirectory}/routes`);
				if (current === file || isInsideDirectory(current, routesDirectory)) return "reachable";
				continue;
			}
			for (const [parent] of importers) if (!visited.has(parent)) queue.push(parent);
		}
		return "unreachable";
	}
	/**
	* Filter pending violations using edge-survival data.  Returns the subset
	* of violations whose resolved import survived the Start compiler (or all
	* violations when no post-transform data is available yet).
	*
	* Returns `undefined` when all violations were stripped or when we must wait
	* for post-transform data before proceeding.
	*/
	function filterEdgeSurvival(env, file, violations) {
		const postTransform = getPostTransformImports(env, file);
		if (postTransform) {
			const surviving = violations.filter((pv) => !pv.info.resolved || postTransform.has(pv.info.resolved));
			if (surviving.length === 0) return "all-stripped";
			env.pendingViolations.set(file, surviving);
			return {
				active: surviving,
				edgeSurvivalApplied: true
			};
		}
		if (violations.some((pv) => pv.fromPreTransformResolve)) return "await-transform";
		return {
			active: violations,
			edgeSurvivalApplied: false
		};
	}
	/**
	* Process pending violations for the given environment.  Called from the
	* transform-cache hook after each module transform is cached, because new
	* transform data may allow us to confirm or discard pending violations.
	*
	* @param warnFn - `this.warn` from the transform hook context
	*/
	async function processPendingViolations(env, warnFn) {
		if (env.pendingViolations.size === 0) return;
		const toDelete = [];
		for (const [file, violations] of env.pendingViolations) {
			const filtered = filterEdgeSurvival(env, file, violations);
			if (filtered === "all-stripped") {
				toDelete.push(file);
				continue;
			}
			if (filtered === "await-transform") continue;
			const { active, edgeSurvivalApplied } = filtered;
			const isBundledClientDev = config.command === "serve" && config.bundledDev && active.some((pv) => pv.info.envType === "client");
			let status;
			if (isBundledClientDev && edgeSurvivalApplied) status = checkSourceGraphReachability(env, file);
			else if (env.graph.entries.size > 0) status = checkPostTransformReachability(env, file);
			else status = "unknown";
			if (status === "reachable") {
				for (const pv of active) await emitPendingViolation(env, warnFn, pv);
				toDelete.push(file);
			} else if (status === "unreachable") {
				if (isBundledClientDev) continue;
				toDelete.push(file);
			} else if (config.command === "serve") {
				let emittedAny = false;
				for (const pv of active) {
					if (pv.fromPreTransformResolve) continue;
					if (edgeSurvivalApplied || pv.info.type === "file" && !!pv.info.resolved && isInsideDirectory(pv.info.resolved, config.srcDirectory)) emittedAny = await emitPendingViolation(env, warnFn, pv) || emittedAny;
				}
				if (emittedAny) toDelete.push(file);
			}
		}
		for (const file of toDelete) env.pendingViolations.delete(file);
	}
	async function emitPendingViolation(env, warnFn, pv) {
		if (hasSeen(env, dedupeKey(pv.info))) return false;
		await enrichViolationInfo(env.transformResultProvider, env, pv.info.env, pv.info.envType, pv.info.importer, pv.info);
		if (config.onViolation) {
			if (await config.onViolation(pv.info) === false) return false;
		}
		warnFn(formatViolation(pv.info, config.root));
		return true;
	}
	/**
	* Record a violation as pending for later confirmation via graph
	* reachability.  Called from `resolveId` when `shouldDefer` is true.
	*/
	function deferViolation(env, importerFile, info, isPreTransformResolve) {
		getOrCreate(env.pendingViolations, importerFile, () => []).push({
			info,
			fromPreTransformResolve: isPreTransformResolve
		});
	}
	/** Counter for generating unique per-violation mock module IDs in build mode. */
	let buildViolationCounter = 0;
	async function handleViolation(ctx, env, info, importerIdHint, violationOpts) {
		if (!violationOpts?.silent) {
			await enrichViolationInfo(env.transformResultProvider, env, info.env, info.envType, importerIdHint ?? info.importer, info);
			if (config.onViolation) {
				if (await config.onViolation(info) === false) return void 0;
			}
			if (config.effectiveBehavior === "error") return ctx.error(formatViolation(info, config.root));
			if (!hasSeen(env, dedupeKey(info))) ctx.warn(formatViolation(info, config.root));
		} else if (config.effectiveBehavior === "error" && config.command !== "build") return;
		if (info.type === "file") return info.resolved;
		return resolveViteId(makeMockEdgeModuleId(await resolveExportsForDeniedSpecifier(env, ctx, info, importerIdHint), config.command === "serve" ? mockRuntimeModuleIdFromViolation(info, config.mockAccess, config.root) : `${MOCK_BUILD_PREFIX}${buildViolationCounter++}`));
	}
	/**
	* Unified violation dispatch: either defers or reports immediately.
	*
	* When `shouldDefer` is true (dev mock + build modes), calls
	* `handleViolation` silently to obtain the mock module ID, then stores
	* the violation for later verification:
	*   - Dev mock mode: all violations are deferred to `pendingViolations`
	*     for edge-survival and graph-reachability checking via
	*     `processPendingViolations`.
	*   - Build mode (mock + error): defers to `deferredBuildViolations` for
	*     tree-shaking verification in `generateBundle`.
	*
	* Otherwise reports immediately (dev error mode).  Pre-transform
	* resolves are silenced in error mode because they fire before the
	* compiler runs and there is no deferred verification path.
	*
	* Returns the mock module ID / resolve result from `handleViolation`.
	*/
	async function reportOrDeferViolation(ctx, env, importerFile, importerIdHint, info, shouldDefer, isPreTransformResolve) {
		if (shouldDefer) {
			const result = await handleViolation(ctx, env, info, importerIdHint, { silent: true });
			if (config.command === "build") {
				const mockId = result ?? "";
				env.deferredBuildViolations.push({
					info,
					mockModuleId: mockId,
					checkModuleId: info.type === "marker" ? info.importer : void 0
				});
			} else {
				deferViolation(env, importerFile, info, isPreTransformResolve);
				await processPendingViolations(env, ctx.warn.bind(ctx));
			}
			return result;
		}
		return handleViolation(ctx, env, info, importerIdHint, { silent: isPreTransformResolve });
	}
	return [{
		name: "tanstack-start-core:import-protection",
		enforce: "pre",
		applyToEnvironment(env) {
			if (!config.enabled) return false;
			return environmentNames.has(env.name);
		},
		configResolved(viteConfig) {
			config.root = viteConfig.root;
			config.command = viteConfig.command;
			config.bundledDev = !!viteConfig.experimental.bundledDev;
			const { startConfig, resolvedStartConfig } = opts.getConfig();
			config.srcDirectory = resolvedStartConfig.srcDirectory;
			const userOpts = startConfig.importProtection;
			if (userOpts?.enabled === false) {
				config.enabled = false;
				return;
			}
			config.enabled = true;
			const behavior = userOpts?.behavior;
			if (typeof behavior === "string") config.effectiveBehavior = behavior;
			else config.effectiveBehavior = viteConfig.command === "serve" ? behavior?.dev ?? "mock" : behavior?.build ?? "error";
			config.logMode = userOpts?.log ?? "once";
			config.mockAccess = userOpts?.mockAccess ?? "error";
			config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20;
			if (userOpts?.onViolation) {
				const fn = userOpts.onViolation;
				config.onViolation = (info) => fn(info);
			}
			const defaults = getDefaultImportProtectionRules();
			const pick = (user, fallback) => user ? [...user] : [...fallback];
			const clientSpecifiers = dedupePatterns([...defaults.client.specifiers, ...userOpts?.client?.specifiers ?? []]);
			config.compiledRules.client = {
				specifiers: compileMatchers(clientSpecifiers),
				files: compileMatchers(pick(userOpts?.client?.files, defaults.client.files)),
				excludeFiles: compileMatchers(pick(userOpts?.client?.excludeFiles, defaults.client.excludeFiles))
			};
			config.compiledRules.server = {
				specifiers: compileMatchers(dedupePatterns(pick(userOpts?.server?.specifiers, defaults.server.specifiers))),
				files: compileMatchers(pick(userOpts?.server?.files, defaults.server.files)),
				excludeFiles: compileMatchers(pick(userOpts?.server?.excludeFiles, defaults.server.excludeFiles))
			};
			config.includeMatchers = compileMatchers(userOpts?.include ?? []);
			config.excludeMatchers = compileMatchers(userOpts?.exclude ?? []);
			config.ignoreImporterMatchers = compileMatchers(userOpts?.ignoreImporters ?? []);
			const markers = getMarkerSpecifiers();
			config.markerSpecifiers = {
				serverOnly: new Set(markers.serverOnly),
				clientOnly: new Set(markers.clientOnly)
			};
		},
		configureServer(server) {
			devServer = server;
		},
		buildStart() {
			if (!config.enabled) return;
			clearNormalizeFilePathCache();
			extensionlessIdResolver.clear();
			shouldCheckImporterCache.clear();
			for (const envState of envStates.values()) clearEnvState(envState);
			shared.fileMarkerKind.clear();
			registerEntries();
		},
		hotUpdate(ctx) {
			if (!config.enabled) return;
			for (const mod of ctx.modules) if (mod.id) {
				const id = mod.id;
				const importerFile = normalizeFilePath(id);
				extensionlessIdResolver.invalidateByFile(importerFile);
				shared.fileMarkerKind.delete(importerFile);
				for (const envState of envStates.values()) invalidateFileFromEnv(envState, importerFile);
			}
		},
		resolveId: {
			filter: { id: { exclude: [/^\0(?!tanstack-start-import-protection:)/, /^virtual:(?!tanstack-start-import-protection:)/] } },
			async handler(source, importer, _options) {
				perf?.count("resolveId.calls");
				const envName = this.environment.name;
				const env = getEnv(envName);
				const envType = getImportProtectionEnvType(config, envName);
				const isScanResolve = !!_options.scan;
				if (IMPORT_PROTECTION_DEBUG) {
					const importerPath = importer ? normalizeFilePath(importer) : "(entry)";
					const isEntryResolve = !importer;
					if (process.env.TSR_IMPORT_PROTECTION_DEBUG_FILTER === "entry" ? isEntryResolve : matchesDebugFilter(source, importerPath)) debugLog("resolveId", {
						env: envName,
						envType,
						source,
						importer: importerPath,
						isEntryResolve,
						command: config.command
					});
				}
				const internalVirtualId = resolveInternalVirtualModuleId(source);
				if (internalVirtualId) return internalVirtualId;
				if (!importer) {
					const normalizedSource = normalizeFilePath(source);
					if (!(config.command === "serve" && config.bundledDev && envType === "client" && isInsideDirectory(normalizedSource, config.srcDirectory))) env.graph.addEntry(source);
					await processPendingViolations(env, this.warn.bind(this));
					return;
				}
				if (source.startsWith("\0") || source.startsWith("virtual:")) return;
				const normalizedImporter = normalizeFilePath(importer);
				const isDirectLookup = importer.includes(SERVER_FN_LOOKUP_QUERY);
				if (config.command === "serve" && config.bundledDev && envType === "client") {
					if (isInsideDirectory(normalizedImporter, normalizePath(`${config.srcDirectory}/routes`))) env.graph.addEntry(normalizedImporter);
				}
				if (isDirectLookup) env.serverFnLookupModules.add(normalizedImporter);
				const isServerFnPreTransformResolve = isDirectLookup || env.serverFnLookupModules.has(normalizedImporter);
				const isPreTransformResolve = isServerFnPreTransformResolve || isScanResolve;
				const shouldRecordGraphEdge = !isServerFnPreTransformResolve;
				const isDevMock = config.command === "serve" && config.effectiveBehavior === "mock";
				const isBuild = config.command === "build";
				const shouldDefer = shouldDeferViolation({
					isBuild,
					isDevMock
				});
				const resolveAgainstImporter = async () => {
					const startedAt = perf ? performance.now() : 0;
					perf?.count("thisResolve.calls");
					let primary = null;
					try {
						const resolveOptions = {
							custom: _options.custom,
							isEntry: _options.isEntry,
							skipSelf: true
						};
						if ("attributes" in _options) {
							const resolveOptionsWithAttributes = resolveOptions;
							resolveOptionsWithAttributes.attributes = _options.attributes;
						}
						primary = await this.resolve(source, importer, resolveOptions);
					} finally {
						if (perf) perf.time("thisResolve", startedAt);
					}
					if (primary) return {
						id: canonicalizeResolvedId(primary.id, config.root, resolveExtensionlessAbsoluteId),
						result: primary
					};
					return null;
				};
				const markerKind = config.markerSpecifiers.serverOnly.has(source) ? "server" : config.markerSpecifiers.clientOnly.has(source) ? "client" : void 0;
				if (markerKind) {
					const existing = shared.fileMarkerKind.get(normalizedImporter);
					if (existing && existing !== markerKind) this.error(`[import-protection] File "${getRelativePath(normalizedImporter)}" has both server-only and client-only markers. This is not allowed.`);
					shared.fileMarkerKind.set(normalizedImporter, markerKind);
					const violatesEnv = envType === "client" && markerKind === "server" || envType === "server" && markerKind === "client";
					if (violatesEnv) {
						const info = buildViolationInfo(envName, envType, normalizedImporter, source, { type: "marker" });
						const markerResult = await reportOrDeferViolation(this, env, normalizedImporter, importer, info, shouldDefer, isPreTransformResolve);
						if (isBuild && markerResult != null) return markerResult;
					}
					const envRetroKey = `retro-marker:${normalizedImporter}`;
					if (violatesEnv && !env.seenViolations.has(envRetroKey)) {
						env.seenViolations.add(envRetroKey);
						let retroDeferred = false;
						const importersMap = env.graph.reverseEdges.get(normalizedImporter);
						if (importersMap && importersMap.size > 0) for (const [importerFile, specifier] of importersMap) {
							if (!specifier) continue;
							if (!shouldCheckImporter(importerFile)) continue;
							const markerInfo = buildMarkerViolationFromResolvedImport(envName, envType, importerFile, specifier, normalizedImporter);
							if (markerInfo) {
								deferViolation(env, importerFile, markerInfo, isPreTransformResolve);
								retroDeferred = true;
							}
						}
						if (retroDeferred) await processPendingViolations(env, this.warn.bind(this));
					}
					return markerKind === "server" ? resolvedMarkerVirtualModuleId("server") : resolvedMarkerVirtualModuleId("client");
				}
				if (!shouldCheckImporter(normalizedImporter)) return;
				const matchers = getRulesForEnvironment(envName);
				const specifierMatch = matchesAny(source, matchers.specifiers);
				if (specifierMatch) {
					if (shouldRecordGraphEdge) env.graph.addEdge(source, normalizedImporter, source);
					const info = buildViolationInfo(envName, envType, normalizedImporter, source, {
						type: "specifier",
						pattern: specifierMatch.pattern
					});
					if (shouldDefer && !info.resolved) try {
						const resolvedForInfo = await resolveAgainstImporter();
						if (resolvedForInfo) info.resolved = resolvedForInfo.id;
					} catch {}
					return reportOrDeferViolation(this, env, normalizedImporter, importer, info, shouldDefer, isPreTransformResolve);
				}
				const cacheKey = `${normalizedImporter}:${source}`;
				let resolved;
				let passThroughResult = null;
				if (env.resolveCache.has(cacheKey)) resolved = env.resolveCache.get(cacheKey) ?? null;
				else {
					const resolution = await resolveAgainstImporter();
					resolved = resolution?.id ?? null;
					passThroughResult = resolution?.result ?? null;
					if (resolved !== null) {
						env.resolveCache.set(cacheKey, resolved);
						getOrCreate(env.resolveCacheByFile, normalizedImporter, () => /* @__PURE__ */ new Set()).add(cacheKey);
					}
				}
				if (resolved) {
					const relativePath = getRelativePath(resolved);
					if (isServerFnPreTransformResolve) env.serverFnLookupModules.add(resolved);
					if (shouldRecordGraphEdge) env.graph.addEdge(resolved, normalizedImporter, source);
					if (!isFileExcluded(relativePath, matchers)) {
						const fileMatch = matchers.files.find((matcher) => matcher.test(relativePath));
						if (fileMatch) {
							const info = buildFileViolationInfo(envName, envType, normalizedImporter, source, resolved, fileMatch.pattern);
							return reportOrDeferViolation(this, env, normalizedImporter, importer, info, shouldDefer, isPreTransformResolve);
						}
						const markerInfo = buildMarkerViolationFromResolvedImport(envName, envType, importer, source, resolved);
						if (markerInfo) return reportOrDeferViolation(this, env, normalizedImporter, importer, markerInfo, shouldDefer, isPreTransformResolve);
					}
					if (passThroughResult) return passThroughResult;
				}
			}
		},
		load: {
			filter: { id: new RegExp(getResolvedVirtualModuleMatchers().map(escapeRegExp).join("|")) },
			handler(id) {
				if (IMPORT_PROTECTION_DEBUG) {
					if (matchesDebugFilter(id)) debugLog("load:handler", {
						env: this.environment.name,
						id: normalizePath(id)
					});
				}
				return loadResolvedVirtualModule(id);
			}
		},
		async generateBundle(_options, bundle) {
			const envName = this.environment.name;
			const env = envStates.get(envName);
			if (!env || env.deferredBuildViolations.length === 0) return;
			const candidateCache = /* @__PURE__ */ new Map();
			const toModuleIdCandidates = (id) => {
				let cached = candidateCache.get(id);
				if (cached) return cached;
				const out = /* @__PURE__ */ new Set();
				const normalized = normalizeFilePath(id);
				out.add(id);
				out.add(normalized);
				out.add(relativizePath(normalized, config.root));
				if (normalized.startsWith("/@id/__x00__")) {
					const internal = `\0${normalized.slice(VITE_BROWSER_VIRTUAL_PREFIX.length)}`;
					out.add(internal);
					out.add(relativizePath(normalizeFilePath(internal), config.root));
				}
				if (normalized.startsWith("\0")) {
					const browser = `${VITE_BROWSER_VIRTUAL_PREFIX}${normalized.slice(1)}`;
					out.add(browser);
					out.add(relativizePath(normalizeFilePath(browser), config.root));
				}
				cached = Array.from(out);
				candidateCache.set(id, cached);
				return cached;
			};
			const survivingModules = /* @__PURE__ */ new Set();
			for (const chunk of Object.values(bundle)) if (chunk.type === "chunk") for (const moduleId of Object.keys(chunk.modules)) for (const candidate of toModuleIdCandidates(moduleId)) survivingModules.add(candidate);
			const didModuleSurvive = (moduleId) => toModuleIdCandidates(moduleId).some((candidate) => survivingModules.has(candidate));
			const realViolations = [];
			for (const { info, mockModuleId, checkModuleId } of env.deferredBuildViolations) {
				let survived;
				if (checkModuleId != null) {
					const importerVariantIds = new Set([info.importer]);
					const importerKeys = env.transformResultKeysByFile.get(normalizeFilePath(info.importer));
					if (importerKeys) for (const key of importerKeys) importerVariantIds.add(key);
					survived = false;
					for (const importerId of importerVariantIds) if (didModuleSurvive(importerId)) {
						survived = true;
						break;
					}
				} else survived = didModuleSurvive(mockModuleId);
				if (!survived) continue;
				await enrichViolationInfo(env.transformResultProvider, env, info.env, info.envType, info.importer, info);
				if (config.onViolation) {
					if (await config.onViolation(info) === false) continue;
				}
				realViolations.push(info);
			}
			if (realViolations.length === 0) return;
			if (config.effectiveBehavior === "error") this.error(formatViolation(realViolations[0], config.root));
			else {
				const seen = /* @__PURE__ */ new Set();
				for (const info of realViolations) {
					const key = dedupeKey(info);
					if (!seen.has(key)) {
						seen.add(key);
						this.warn(formatViolation(info, config.root));
					}
				}
			}
		},
		closeBundle() {
			const envName = this.environment.name;
			perf?.count("closeBundle.calls");
			perf?.count(`closeBundle.env.${envName}`);
			perf?.flush(config.root, envName);
		}
	}, {
		name: "tanstack-start-core:import-protection-transform-cache",
		applyToEnvironment(env) {
			if (!config.enabled) return false;
			return environmentNames.has(env.name);
		},
		transform: {
			filter: { id: { include: [/\.[cm]?[tj]sx?($|\?)/] } },
			async handler(code, id) {
				perf?.count("transform.calls");
				const envName = this.environment.name;
				const file = normalizeFilePath(id);
				const envType = getImportProtectionEnvType(config, envName);
				const matchers = getRulesForEnvironment(envName);
				const isBuild = config.command === "build";
				if (IMPORT_PROTECTION_DEBUG) {
					if (matchesDebugFilter(file)) debugLog("transform-cache", {
						env: envName,
						id: normalizePath(id),
						file
					});
				}
				if (!shouldCheckImporter(file)) return;
				const selfFileMatch = checkFileDenial(getRelativePath(file), matchers);
				if (selfFileMatch) {
					let exportNames = [];
					try {
						exportNames = getNamedExports(code, file, perf);
					} catch {}
					if (isBuild) return generateSelfContainedMockModule(exportNames);
					const runtimeId = mockRuntimeModuleIdFromViolation({
						type: "file",
						env: envType,
						envType,
						behavior: config.effectiveBehavior === "error" ? "error" : "mock",
						importer: file,
						specifier: relativizePath(file, config.root),
						resolved: file,
						pattern: selfFileMatch.pattern,
						trace: []
					}, config.mockAccess, config.root);
					return generateDevSelfDenialModule(exportNames, runtimeId);
				}
				const cacheKey = normalizePath(id);
				const envState = getEnv(envName);
				const isServerFnLookup = id.includes(SERVER_FN_LOOKUP_QUERY);
				if (isServerFnLookup) envState.serverFnLookupModules.add(file);
				const result = {
					code,
					filename: file,
					map: void 0,
					originalCode: void 0
				};
				if (perf) result.perf = perf;
				if (shouldCaptureDiagnosticSourceMap(code, envType, matchers)) captureDiagnosticSourceMap(result, () => this.getCombinedSourcemap(), "candidate");
				cacheTransformResult(envState, file, cacheKey, result);
				if (isBuild) return void 0;
				const isDevMock = config.effectiveBehavior === "mock";
				const importAnalysisStartedAt = perf ? performance.now() : 0;
				const importSources = getImportSourcesFromResult(result);
				if (perf) perf.time("transform.importAnalysis", importAnalysisStartedAt);
				perf?.count("transform.importSources", importSources.length);
				const resolvedChildren = /* @__PURE__ */ new Set();
				const deniedSourceReplacements = /* @__PURE__ */ new Map();
				for (const src of importSources) try {
					const startedAt = perf ? performance.now() : 0;
					perf?.count("transform.thisResolve.calls");
					const resolved = await this.resolve(src, id, { skipSelf: true });
					if (perf) perf.time("transform.thisResolve", startedAt);
					if (resolved && !resolved.external) {
						const resolvedPath = canonicalizeResolvedId(resolved.id, config.root, resolveExtensionlessAbsoluteId);
						resolvedChildren.add(resolvedPath);
						if (resolved.id.includes("tanstack-start-import-protection:")) {
							let physicalPath;
							const pending = envState.pendingViolations.get(file);
							if (pending) {
								const match = pending.find((pv) => pv.info.specifier === src && pv.info.resolved);
								if (match) physicalPath = match.info.resolved;
							}
							if (physicalPath && physicalPath !== resolvedPath) {
								resolvedChildren.add(physicalPath);
								envState.graph.addEdge(physicalPath, file, src);
							}
						}
						envState.graph.addEdge(resolvedPath, file, src);
						if (isDevMock) {
							const fileMatch = checkFileDenial(getRelativePath(resolvedPath), matchers);
							if (fileMatch) {
								captureDiagnosticSourceMap(result, () => this.getCombinedSourcemap(), "devViolation");
								const info = buildFileViolationInfo(envName, envType, file, src, resolvedPath, fileMatch.pattern);
								const replacement = await reportOrDeferViolation(this, envState, file, id, info, isDevMock, isServerFnLookup);
								if (replacement) deniedSourceReplacements.set(src, replacement.startsWith("\0") ? VITE_BROWSER_VIRTUAL_PREFIX + replacement.slice(1) : replacement);
							}
						}
					}
				} catch {}
				envState.postTransformImports.set(cacheKey, resolvedChildren);
				if (cacheKey !== file && !isServerFnLookup) envState.postTransformImports.set(file, resolvedChildren);
				await processPendingViolations(envState, this.warn.bind(this));
				if (deniedSourceReplacements.size > 0) try {
					const rewritten = rewriteDeniedImports(code, id, new Set(deniedSourceReplacements.keys()), (source) => deniedSourceReplacements.get(source) ?? source);
					if (!rewritten) return;
					const normalizedMap = rewritten.map ? normalizeSourceMap(rewritten.map) : {
						version: 3,
						file: id,
						names: [],
						sources: [id],
						sourcesContent: [code],
						mappings: ""
					};
					return {
						code: rewritten.code,
						map: normalizedMap
					};
				} catch {}
			}
		}
	}];
}
//#endregion
export { importProtectionPlugin };

//# sourceMappingURL=plugin.js.map