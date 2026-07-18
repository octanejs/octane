import { normalizePath } from "../utils.js";
import { buildResolutionCandidates, buildSourceCandidates, canonicalizeResolvedId, checkFileDenial, clearNormalizeFilePathCache, dedupePatterns, dedupeViolationKey, isFileExcluded, normalizeFilePath } from "../import-protection/utils.js";
import { ImportGraph, buildTrace, formatViolation } from "../import-protection/trace.js";
import { getDefaultImportProtectionRules, getMarkerSpecifiers } from "../import-protection/defaults.js";
import { compileMatchers, matchesAny } from "../import-protection/matchers.js";
import { getImportProtectionEnvType, getImportProtectionRelativePath, getImportProtectionRulesForEnvironment, shouldCheckImportProtectionImporter } from "../import-protection/adapterUtils.js";
import { ImportLocCache, addTraceImportLocations, buildCodeSnippet, buildLineIndex, createImportSpecifierLocationIndex, findImportStatementLocationFromTransformed, findOriginalUsageLocation, findPostCompileUsageLocation, getOrCreateOriginalTransformResult, indexToLineColumn, normalizeSourceMap, pickOriginalCodeFromSourcesContent } from "../import-protection/sourceLocation.js";
import { findOriginalUnsafeUsagePosFromResult, getImportSources, getImportSourcesFromResult, getMockExportNamesBySourceFromResult, getNamedExportsFromResult } from "../import-protection/analysis.js";
import { rewriteDeniedImports } from "../import-protection/rewrite.js";
import { ExtensionlessAbsoluteIdResolver } from "../import-protection/extensionlessAbsoluteIdResolver.js";
import { generateDevSelfDenialModule, generateSelfContainedMockModule, loadMockEdgeModule, loadMockRuntimeModule, loadSilentMockModule } from "../import-protection/virtualModules.js";
import { extname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
//#region src/rsbuild/import-protection.ts
var importSpecifierLocationIndex = createImportSpecifierLocationIndex();
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
		flush(root, envName, phase) {
			flushCount++;
			flushEnvironments.add(envName);
			const payload = {
				adapter: "rsbuild",
				root,
				phase,
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
var IMPORT_PROTECTION_VIRTUAL_DIR = "node_modules/.virtual/import-protection";
var MOCK_EDGE_FILE_PREFIX = "mock-edge-";
var MOCK_RUNTIME_FILE_PREFIX = "mock-runtime-";
var MOCK_SILENT_FILE = "mock-silent.mjs";
function toBase64Url(input) {
	return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}
function fromBase64Url(input) {
	return JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
}
function getRulesForEnvironment(config, envName) {
	return getImportProtectionRulesForEnvironment(config, envName);
}
function serializePattern(pattern) {
	return typeof pattern === "string" ? pattern : pattern.toString();
}
function dedupeKey(info) {
	return dedupeViolationKey(info);
}
function getRsbuildResolvedImportProtectionCheck(relativeResolved, matchers) {
	if (isFileExcluded(relativeResolved, matchers)) return;
	const fileMatch = matchers.files.find((matcher) => matcher.test(relativeResolved));
	if (fileMatch) return {
		type: "file",
		fileMatch
	};
	return { type: "marker" };
}
function getOrCreateEnvState(envStates, envName) {
	let env = envStates.get(envName);
	if (!env) {
		env = {
			resolveCache: /* @__PURE__ */ new Map(),
			seenViolations: /* @__PURE__ */ new Set(),
			buildTransformResults: /* @__PURE__ */ new Map(),
			deferredFileViolations: [],
			deferredFileViolationKeys: /* @__PURE__ */ new Set()
		};
		envStates.set(envName, env);
	}
	return env;
}
function getVirtualModulePath(root, envName, filename) {
	return normalizePath(resolve(root, IMPORT_PROTECTION_VIRTUAL_DIR, envName, filename));
}
function queuePendingWrite(shared, envName, filePath, code) {
	let writes = shared.pendingWrites.get(envName);
	if (!writes) {
		writes = /* @__PURE__ */ new Map();
		shared.pendingWrites.set(envName, writes);
	}
	writes.set(filePath, code);
}
function tryWriteVirtualModule(shared, envName, filePath, code) {
	if (shared.virtualModules.get(filePath) === code) return filePath;
	shared.virtualModules.set(filePath, code);
	const vmPlugin = shared.vmPlugins[envName];
	if (!vmPlugin || !shared.readyVmPlugins[envName]) {
		queuePendingWrite(shared, envName, filePath, code);
		return filePath;
	}
	vmPlugin.writeModule(filePath, code);
	return filePath;
}
function flushPendingWrites(shared, envName) {
	const writes = shared.pendingWrites.get(envName);
	if (!writes?.size || !shared.readyVmPlugins[envName]) return;
	for (const [filePath, code] of writes) {
		shared.vmPlugins[envName]?.writeModule(filePath, code);
		writes.delete(filePath);
	}
	if (writes.size === 0) shared.pendingWrites.delete(envName);
}
function ensureSilentMockModule(shared, envName) {
	return tryWriteVirtualModule(shared, envName, getVirtualModulePath(shared.root, envName, MOCK_SILENT_FILE), loadSilentMockModule().code);
}
function ensureRuntimeMockModule(opts) {
	const encoded = toBase64Url({
		mode: opts.mode,
		env: opts.env,
		importer: opts.importer,
		specifier: opts.specifier,
		trace: []
	});
	return tryWriteVirtualModule(opts.shared, opts.envName, getVirtualModulePath(opts.shared.root, opts.envName, `${MOCK_RUNTIME_FILE_PREFIX}${encoded}.mjs`), loadMockRuntimeModule(encoded).code);
}
function ensureMockEdgeModule(opts) {
	const encoded = toBase64Url(opts.payload);
	return tryWriteVirtualModule(opts.shared, opts.envName, getVirtualModulePath(opts.shared.root, opts.envName, `${MOCK_EDGE_FILE_PREFIX}${encoded}.mjs`), loadMockEdgeModule(encoded).code);
}
function getMockEdgePayloadFromFile(filePath) {
	const match = /(?:^|[\\/])mock-edge-([^/\\]+)\.mjs$/.exec(filePath);
	if (!match) return;
	try {
		return fromBase64Url(match[1]);
	} catch {
		return;
	}
}
async function loadOriginalCode(cache, file, loader) {
	let result = cache.get(file);
	if (!result) {
		result = loader(file);
		cache.set(file, result);
	}
	return result;
}
async function loadOriginalCodeFromInputFileSystem(inputFileSystem, file) {
	return new Promise((resolve) => {
		inputFileSystem.readFile(file, (error, data) => {
			if (error || data == null) {
				resolve(void 0);
				return;
			}
			resolve(typeof data === "string" ? data : data.toString("utf8"));
		});
	});
}
async function resolveAgainstImporter(opts) {
	const importerDir = opts.ctx.context ?? opts.importerId.replace(/[/\\][^/\\]*$/, "");
	const cacheKey = `${normalizeFilePath(importerDir)}:${opts.source}`;
	if (opts.envState.resolveCache.has(cacheKey)) {
		opts.perf?.count("resolve.cached");
		return opts.envState.resolveCache.get(cacheKey) ?? null;
	}
	const startedAt = opts.perf ? performance.now() : 0;
	opts.perf?.count("resolve.calls");
	const resolved = await new Promise((resolve, reject) => {
		opts.ctx.resolve(importerDir, opts.source, (error, result) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(typeof result === "string" ? result : null);
		});
	}).catch(() => null).finally(() => {
		if (opts.perf) opts.perf.time("resolve", startedAt);
	});
	if (!resolved) {
		opts.envState.resolveCache.set(cacheKey, null);
		return null;
	}
	const canonical = canonicalizeResolvedId(resolved, opts.config.root, (value) => opts.extensionlessResolver.resolve(value));
	opts.envState.resolveCache.set(cacheKey, canonical);
	return canonical;
}
function getModuleResource(module) {
	const candidate = module;
	return candidate.nameForCondition() ?? candidate.resourceResolveData?.resource ?? candidate.resource ?? candidate.userRequest ?? candidate.request;
}
function getModuleFile(module) {
	return normalizeFilePath(getModuleResource(module) ?? module.identifier());
}
var IMPORT_PROTECTION_PARSEABLE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".tsrx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
function isImportProtectionSourceFile(file) {
	if (!file) return false;
	const extension = extname(normalizeFilePath(file));
	return extension.length > 0 && IMPORT_PROTECTION_PARSEABLE_EXTENSIONS.has(extension);
}
function isImportProtectionSourceModule(module) {
	return isImportProtectionSourceFile(getModuleResource(module));
}
function addTransformResult(cache, key, result) {
	cache.set(normalizePath(key), result);
	cache.set(normalizeFilePath(key), result);
}
function hasTransformResult(cache, key) {
	return cache.has(normalizePath(key)) || cache.has(normalizeFilePath(key));
}
function deferFileViolation(envState, violation) {
	const key = `${violation.importer}:${violation.specifier}:${violation.resolved}:${String(violation.pattern)}`;
	if (envState.deferredFileViolationKeys.has(key)) return;
	envState.deferredFileViolationKeys.add(key);
	envState.deferredFileViolations.push(violation);
}
function hasOriginalUnsafeUsage(result, source, envType) {
	if (!result) return false;
	const originalResult = getOrCreateOriginalTransformResult(result);
	if (!originalResult) return false;
	return !!findOriginalUnsafeUsagePosFromResult(originalResult, source, envType);
}
async function buildTransformResultProvider(opts) {
	const cache = /* @__PURE__ */ new Map();
	if (opts.preloaded) for (const [key, result] of opts.preloaded) cache.set(key, result);
	opts.perf?.count("processAssets.provider.modules", opts.modules.length);
	for (const module of opts.modules) {
		const source = module.originalSource();
		if (!source) continue;
		const sourceAndMapStartedAt = opts.perf ? performance.now() : 0;
		const sourceAndMap = source.sourceAndMap();
		if (opts.perf) opts.perf.time("processAssets.provider.sourceAndMap", sourceAndMapStartedAt);
		const code = String(sourceAndMap.source);
		const map = normalizeSourceMap(sourceAndMap.map);
		const file = getModuleFile(module);
		const resource = getModuleResource(module);
		const originalCodeStartedAt = opts.perf ? performance.now() : 0;
		const originalCode = map?.sourcesContent ? pickOriginalCodeFromSourcesContent(map, resource ?? file, opts.root) ?? (resource ? await opts.loadOriginalCode(resource) : void 0) : resource ? await opts.loadOriginalCode(resource) : void 0;
		if (opts.perf) opts.perf.time("processAssets.provider.originalCode", originalCodeStartedAt);
		const result = {
			code,
			filename: resource ?? file,
			map,
			originalCode,
			perf: opts.perf
		};
		if (!hasTransformResult(cache, file)) addTransformResult(cache, file, result);
		if (resource && !hasTransformResult(cache, resource)) addTransformResult(cache, resource, result);
	}
	return { getTransformResult(id) {
		return cache.get(normalizePath(id)) ?? cache.get(normalizeFilePath(id));
	} };
}
function getConnectionRequest(dependency) {
	const candidate = dependency;
	return typeof candidate.request === "string" ? candidate.request : void 0;
}
function addEntryModulesToGraph(opts) {
	for (const entry of opts.compilation.entries.values()) for (const dependency of entry.dependencies) {
		const module = opts.compilation.moduleGraph.getConnection(dependency)?.module;
		if (!module) continue;
		opts.graph.addEntry(getModuleFile(module));
	}
}
function buildCompilationGraph(opts) {
	const graph = new ImportGraph();
	const edges = [];
	const inactiveEdges = [];
	addEntryModulesToGraph({
		compilation: opts.compilation,
		graph
	});
	for (const module of opts.modules) {
		const importer = getModuleFile(module);
		const connections = opts.compilation.moduleGraph.getOutgoingConnectionsInOrder(module);
		for (const connection of connections) {
			if (!connection.module) continue;
			const resolved = getModuleFile(connection.module);
			const specifier = getConnectionRequest(connection.dependency);
			if (isActiveConnection(connection)) {
				graph.addEdge(resolved, importer, specifier);
				edges.push({
					importer,
					specifier,
					resolved
				});
			} else inactiveEdges.push({
				importer,
				specifier,
				resolved
			});
		}
	}
	return {
		graph,
		edges,
		inactiveEdges
	};
}
function isActiveConnection(connection) {
	if (typeof connection.getActiveState !== "function") return true;
	return connection.getActiveState(void 0) === true;
}
function findImportLocationInOriginalCode(provider, importer, source) {
	const result = provider.getTransformResult(importer);
	if (!result) return;
	const originalResult = getOrCreateOriginalTransformResult(result);
	if (!originalResult) return;
	const index = importSpecifierLocationIndex.find(originalResult, source);
	if (index === -1) return;
	const loc = indexToLineColumn(originalResult.lineIndex ?? (originalResult.lineIndex = buildLineIndex(originalResult.code)), index);
	return {
		file: normalizeFilePath(importer),
		line: loc.line,
		column: loc.column
	};
}
async function resolveImporterLocation(opts) {
	if (opts.preferOriginalCode) for (const candidate of opts.sourceCandidates) {
		const loc = findOriginalUsageLocation(opts.provider, opts.importer, candidate, opts.envType) ?? findImportLocationInOriginalCode(opts.provider, opts.importer, candidate);
		if (loc) return loc;
	}
	for (const candidate of opts.sourceCandidates) {
		const loc = await findPostCompileUsageLocation(opts.provider, opts.importer, candidate) || await findImportStatementLocationFromTransformed(opts.provider, opts.importer, candidate, opts.importLocCache, importSpecifierLocationIndex.find);
		if (loc) return loc;
	}
	if (!opts.preferOriginalCode) for (const candidate of opts.sourceCandidates) {
		const loc = findImportLocationInOriginalCode(opts.provider, opts.importer, candidate);
		if (loc) return loc;
	}
}
async function rebuildAndAnnotateTrace(opts) {
	const trace = buildTrace(opts.graph, opts.importer, opts.maxTraceDepth);
	await addTraceImportLocations(opts.provider, trace, opts.importLocCache, importSpecifierLocationIndex.find);
	if (trace.length > 0) {
		const last = trace[trace.length - 1];
		if (!last.specifier) last.specifier = opts.specifier;
		if (opts.importerLoc && last.line == null) {
			last.line = opts.importerLoc.line;
			last.column = opts.importerLoc.column;
		}
	}
	return trace;
}
async function buildViolationInfo(opts) {
	const startedAt = opts.perf ? performance.now() : 0;
	opts.perf?.count("violations.enriched");
	const importerLocStartedAt = opts.perf ? performance.now() : 0;
	const importerLoc = await resolveImporterLocation({
		provider: opts.provider,
		importLocCache: opts.importLocCache,
		importer: opts.importer,
		sourceCandidates: buildSourceCandidates(opts.source, opts.resolved, opts.config.root),
		preferOriginalCode: opts.preferOriginalCode,
		envType: opts.envType
	});
	if (opts.perf) opts.perf.time("violations.resolveImporterLocation", importerLocStartedAt);
	const traceStartedAt = opts.perf ? performance.now() : 0;
	const trace = await rebuildAndAnnotateTrace({
		provider: opts.provider,
		graph: opts.graph,
		importLocCache: opts.importLocCache,
		importer: opts.importer,
		specifier: opts.source,
		importerLoc,
		maxTraceDepth: opts.config.maxTraceDepth
	});
	if (opts.perf) opts.perf.time("violations.trace", traceStartedAt);
	const snippetStartedAt = opts.perf ? performance.now() : 0;
	const snippet = importerLoc ? buildCodeSnippet(opts.provider, opts.importer, importerLoc) : void 0;
	if (opts.perf && importerLoc) opts.perf.time("violations.snippet", snippetStartedAt);
	const info = {
		env: opts.envName,
		envType: opts.envType,
		behavior: opts.config.effectiveBehavior,
		type: opts.type,
		pattern: opts.pattern,
		specifier: opts.source,
		importer: opts.importer,
		...opts.resolved ? { resolved: opts.resolved } : {},
		...importerLoc ? { importerLoc } : {},
		trace,
		snippet
	};
	if (opts.perf) opts.perf.time("violations.enrich", startedAt);
	return info;
}
async function getMarkerKindForFile(opts) {
	if (!isImportProtectionSourceFile(opts.file)) return;
	let cached = opts.markerKindCache.get(opts.file);
	if (!cached) {
		cached = (async () => {
			const code = opts.provider.getTransformResult(opts.file)?.originalCode ?? await opts.loadOriginalCode(opts.file);
			if (!code) return;
			const imports = getImportSources(code, opts.file);
			const hasServerOnly = imports.some((source) => opts.config.markerSpecifiers.serverOnly.has(source));
			const hasClientOnly = imports.some((source) => opts.config.markerSpecifiers.clientOnly.has(source));
			if (hasServerOnly && !hasClientOnly) return "server";
			if (hasClientOnly && !hasServerOnly) return "client";
		})();
		opts.markerKindCache.set(opts.file, cached);
	}
	return cached;
}
async function reportViolation(opts) {
	const key = dedupeKey(opts.info);
	if (opts.config.logMode !== "always" && opts.envState.seenViolations.has(key)) {
		opts.perf?.count("violations.deduped");
		return;
	}
	opts.envState.seenViolations.add(key);
	opts.perf?.count("violations.reported");
	if (opts.config.onViolation) {
		const startedAt = opts.perf ? performance.now() : 0;
		const result = await opts.config.onViolation(opts.info);
		if (opts.perf) opts.perf.time("violations.onViolation", startedAt);
		if (result === false) {
			opts.perf?.count("violations.suppressed");
			return;
		}
	}
	const message = formatViolation(opts.info, opts.config.root);
	const error = new opts.rspack.WebpackError(message);
	if (opts.config.effectiveBehavior === "error") opts.compilation.errors.push(error);
	else opts.compilation.warnings.push(error);
}
function registerImportProtection(api, opts) {
	const perf = isPerfEnabled() ? createPerfCollector() : void 0;
	const extensionlessResolver = new ExtensionlessAbsoluteIdResolver();
	const envStates = /* @__PURE__ */ new Map();
	const fileReadCache = /* @__PURE__ */ new Map();
	const shouldCheckImporterCache = /* @__PURE__ */ new Map();
	const config = {
		enabled: true,
		root: "",
		command: api.context.action === "dev" ? "serve" : "build",
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
		envTypeMap: new Map(opts.environments.map((env) => [env.name, env.type])),
		onViolation: void 0
	};
	const shared = {
		root: "",
		virtualModules: /* @__PURE__ */ new Map(),
		vmPlugins: {},
		readyVmPlugins: {},
		inputFileSystems: {},
		pendingWrites: /* @__PURE__ */ new Map()
	};
	function applyUserConfig() {
		const { startConfig, resolvedStartConfig } = opts.getConfig();
		config.root = resolvedStartConfig.root;
		config.srcDirectory = resolvedStartConfig.srcDirectory;
		shared.root = resolvedStartConfig.root;
		const userOpts = startConfig.importProtection;
		if (userOpts?.enabled === false) {
			config.enabled = false;
			return;
		}
		config.enabled = true;
		const behavior = userOpts?.behavior;
		if (typeof behavior === "string") config.effectiveBehavior = behavior;
		else config.effectiveBehavior = config.command === "serve" ? behavior?.dev ?? "mock" : behavior?.build ?? "error";
		config.logMode = userOpts?.log ?? "once";
		config.mockAccess = userOpts?.mockAccess ?? "error";
		config.maxTraceDepth = userOpts?.maxTraceDepth ?? 20;
		config.onViolation = userOpts?.onViolation ? (info) => userOpts.onViolation?.(info) : void 0;
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
	}
	function shouldCheckImporter(file) {
		const normalizedFile = normalizeFilePath(file);
		const cached = shouldCheckImporterCache.get(normalizedFile);
		if (cached !== void 0) {
			perf?.count("shouldCheckImporter.cached");
			return cached;
		}
		const result = shouldCheckImportProtectionImporter(config, normalizedFile);
		shouldCheckImporterCache.set(normalizedFile, result);
		return result;
	}
	api.onBeforeBuild(() => {
		const startedAt = perf ? performance.now() : 0;
		applyUserConfig();
		clearNormalizeFilePathCache();
		extensionlessResolver.clear();
		fileReadCache.clear();
		shouldCheckImporterCache.clear();
		envStates.clear();
		if (perf) perf.time("onBeforeBuild", startedAt);
	});
	api.onBeforeDevCompile(() => {
		const startedAt = perf ? performance.now() : 0;
		applyUserConfig();
		clearNormalizeFilePathCache();
		extensionlessResolver.clear();
		fileReadCache.clear();
		shouldCheckImporterCache.clear();
		for (const envState of envStates.values()) {
			envState.resolveCache.clear();
			envState.buildTransformResults.clear();
			envState.deferredFileViolations.length = 0;
			envState.deferredFileViolationKeys.clear();
		}
		if (perf) perf.time("onBeforeDevCompile", startedAt);
	});
	api.modifyRspackConfig((rspackConfig, utils) => {
		const startedAt = perf ? performance.now() : 0;
		applyUserConfig();
		const envName = utils.environment.name;
		const VMP = utils.rspack.experiments.VirtualModulesPlugin;
		const vmPlugin = new VMP({});
		shared.vmPlugins[envName] = vmPlugin;
		shared.readyVmPlugins[envName] = false;
		rspackConfig.plugins.push(vmPlugin);
		rspackConfig.plugins.push({ apply(compiler) {
			shared.inputFileSystems[envName] = compiler.inputFileSystem;
			compiler.hooks.thisCompilation.tap("TanStackStartImportProtectionVirtualModulesReady", () => {
				shared.readyVmPlugins[envName] = true;
				flushPendingWrites(shared, envName);
			});
		} });
		if (perf) perf.time("modifyRspackConfig", startedAt);
	});
	for (const environment of opts.environments) api.transform({
		test: /\.[cm]?[tj]sx?$/,
		environments: [environment.name],
		order: "post"
	}, async (ctx) => {
		const startedAt = perf ? performance.now() : 0;
		perf?.count("transform.calls");
		perf?.count(`transform.env.${environment.name}`);
		try {
			if (!config.enabled) return ctx.code;
			const envName = environment.name;
			const envType = getImportProtectionEnvType(config, envName);
			const envState = getOrCreateEnvState(envStates, envName);
			const id = ctx.resource;
			const file = normalizeFilePath(ctx.resourcePath);
			if (!shouldCheckImporter(file)) {
				perf?.count("transform.skippedImporter");
				return ctx.code;
			}
			const matchers = getRulesForEnvironment(config, envName);
			const relativeFile = getImportProtectionRelativePath(config.root, file);
			const transformResult = {
				code: ctx.code,
				filename: file,
				map: void 0,
				originalCode: void 0,
				perf
			};
			const importSources = getImportSourcesFromResult(transformResult);
			perf?.count("transform.importSources", importSources.length);
			const transformedImportSources = new Set(importSources);
			const transformInputFileSystem = shared.inputFileSystems[envName];
			const loadOriginalCodeForTransform = transformInputFileSystem ? (target) => loadOriginalCodeFromInputFileSystem(transformInputFileSystem, target) : () => Promise.resolve(void 0);
			const originalCodeStartedAt = perf ? performance.now() : 0;
			const originalCode = config.command === "build" ? await loadOriginalCode(fileReadCache, file, loadOriginalCodeForTransform) : void 0;
			if (perf && config.command === "build") perf.time("transform.originalCode.load", originalCodeStartedAt);
			transformResult.originalCode = originalCode;
			const originalTransformResult = originalCode ? getOrCreateOriginalTransformResult(transformResult) : void 0;
			const buildImportSourcesStartedAt = perf ? performance.now() : 0;
			const buildImportSources = originalTransformResult ? getImportSourcesFromResult(originalTransformResult) : [];
			if (perf && originalCode) {
				perf.time("transform.originalImportAnalysis", buildImportSourcesStartedAt);
				perf.count("transform.originalImportSources", buildImportSources.length);
			}
			const buildTransformResult = config.command === "build" ? transformResult : void 0;
			if (config.command === "build") {
				const relativeBuildFile = getImportProtectionRelativePath(config.root, file);
				addTransformResult(envState.buildTransformResults, file, buildTransformResult);
				addTransformResult(envState.buildTransformResults, relativeBuildFile, buildTransformResult);
				if (id !== file) addTransformResult(envState.buildTransformResults, id, buildTransformResult);
			}
			const hasServerOnlyMarker = importSources.some((source) => config.markerSpecifiers.serverOnly.has(source));
			const hasClientOnlyMarker = importSources.some((source) => config.markerSpecifiers.clientOnly.has(source));
			if (hasServerOnlyMarker && hasClientOnlyMarker) throw new Error(`[import-protection] File "${relativeFile}" has both server-only and client-only markers. This is not allowed.`);
			const markerKind = hasServerOnlyMarker ? "server" : hasClientOnlyMarker ? "client" : void 0;
			if (checkFileDenial(relativeFile, matchers) || envType === "client" && markerKind === "server" || envType === "server" && markerKind === "client") {
				let exportNames = [];
				try {
					exportNames = getNamedExportsFromResult(transformResult);
				} catch {
					exportNames = [];
				}
				if (config.command === "build") return generateSelfContainedMockModule(exportNames);
				const runtimeId = ensureRuntimeMockModule({
					shared,
					envName,
					mode: config.mockAccess,
					env: envName,
					importer: file,
					specifier: relativeFile
				});
				return generateDevSelfDenialModule(exportNames, runtimeId);
			}
			const deniedSpecifierReplacements = /* @__PURE__ */ new Map();
			let exportsBySource;
			const getExportsBySource = () => {
				if (exportsBySource) return exportsBySource;
				try {
					exportsBySource = getMockExportNamesBySourceFromResult(transformResult);
				} catch {
					exportsBySource = /* @__PURE__ */ new Map();
				}
				return exportsBySource;
			};
			for (const source of importSources) {
				const specifierMatch = matchesAny(source, matchers.specifiers);
				if (!specifierMatch) continue;
				const resolved = await resolveAgainstImporter({
					envState,
					config,
					ctx,
					importerId: id,
					source,
					extensionlessResolver,
					perf
				});
				const runtimeId = config.command === "build" ? ensureSilentMockModule(shared, envName) : ensureRuntimeMockModule({
					shared,
					envName,
					mode: config.mockAccess,
					env: envName,
					importer: file,
					specifier: source
				});
				const replacement = ensureMockEdgeModule({
					shared,
					envName,
					payload: {
						exports: getExportsBySource().get(source) ?? [],
						runtimeId,
						violation: {
							env: envName,
							envType,
							importer: file,
							specifier: source,
							...resolved ? { resolved } : {},
							patternText: serializePattern(specifierMatch.pattern)
						}
					}
				});
				deniedSpecifierReplacements.set(source, replacement);
			}
			if (config.command === "build") for (const source of buildImportSources) {
				if (transformedImportSources.has(source)) continue;
				if (matchesAny(source, matchers.specifiers)) continue;
				if (!hasOriginalUnsafeUsage(buildTransformResult, source, envType)) continue;
				const resolved = await resolveAgainstImporter({
					envState,
					config,
					ctx,
					importerId: id,
					source,
					extensionlessResolver,
					perf
				});
				if (!resolved) continue;
				const relativeResolved = getImportProtectionRelativePath(config.root, resolved);
				const buildFileMatch = checkFileDenial(relativeResolved, matchers);
				if (!buildFileMatch) continue;
				deferFileViolation(envState, {
					importer: file,
					specifier: source,
					resolved,
					relativeResolved,
					pattern: buildFileMatch.pattern,
					useOriginalLocation: true
				});
			}
			if (deniedSpecifierReplacements.size === 0) return ctx.code;
			const rewritten = rewriteDeniedImports(ctx.code, id, new Set(deniedSpecifierReplacements.keys()), (source) => deniedSpecifierReplacements.get(source) ?? source);
			if (!rewritten) return ctx.code;
			return {
				code: rewritten.code,
				map: normalizeSourceMap(rewritten.map) ?? null
			};
		} finally {
			if (perf) perf.time("transform", startedAt);
		}
	});
	api.processAssets({
		stage: "report",
		environments: opts.environments.map((environment) => environment.name)
	}, async (context) => {
		const envName = context.environment.name;
		const startedAt = perf ? performance.now() : 0;
		perf?.count("processAssets.calls");
		perf?.count(`processAssets.env.${envName}`);
		try {
			if (!config.enabled) return;
			const envType = getImportProtectionEnvType(config, envName);
			const envState = getOrCreateEnvState(envStates, envName);
			const matchers = getRulesForEnvironment(config, envName);
			const processFileReadCache = /* @__PURE__ */ new Map();
			const loadOriginalCodeFromCompilation = (file) => loadOriginalCode(processFileReadCache, file, context.compilation.inputFileSystem ? (target) => loadOriginalCodeFromInputFileSystem(context.compilation.inputFileSystem, target) : () => Promise.resolve(void 0));
			const allModules = Array.from(context.compilation.modules);
			const relevantModules = allModules.filter(isImportProtectionSourceModule);
			perf?.count("processAssets.modules.total", allModules.length);
			perf?.count("processAssets.modules.relevant", relevantModules.length);
			const providerStartedAt = perf ? performance.now() : 0;
			const provider = await buildTransformResultProvider({
				modules: relevantModules,
				root: config.root,
				loadOriginalCode: loadOriginalCodeFromCompilation,
				preloaded: envState.buildTransformResults,
				perf
			});
			if (perf) perf.time("processAssets.provider.build", providerStartedAt);
			const importLocCache = new ImportLocCache();
			const markerKindCache = /* @__PURE__ */ new Map();
			const graphStartedAt = perf ? performance.now() : 0;
			const { graph, edges, inactiveEdges } = buildCompilationGraph({
				compilation: context.compilation,
				modules: relevantModules
			});
			if (perf) {
				perf.time("processAssets.graph.build", graphStartedAt);
				perf.count("processAssets.graph.edges", edges.length);
				perf.count("processAssets.graph.inactiveEdges", inactiveEdges.length);
			}
			const liveFileEdgeKeys = new Set(edges.filter((edge) => !!edge.specifier).map((edge) => `${normalizeFilePath(edge.importer)}::${edge.specifier}::${normalizeFilePath(edge.resolved)}`));
			const candidateCache = /* @__PURE__ */ new Map();
			const getCandidates = (id) => {
				const normalized = normalizeFilePath(id);
				let candidates = candidateCache.get(normalized);
				if (!candidates) {
					candidates = buildResolutionCandidates(normalized);
					candidateCache.set(normalized, candidates);
				}
				return candidates;
			};
			const survivingModules = /* @__PURE__ */ new Set();
			for (const module of relevantModules) for (const candidate of getCandidates(getModuleFile(module))) survivingModules.add(candidate);
			const didModuleSurvive = (id) => getCandidates(id).some((candidate) => survivingModules.has(candidate));
			for (const module of relevantModules) {
				const payload = getMockEdgePayloadFromFile(getModuleFile(module));
				if (!payload) continue;
				if (!shouldCheckImporter(payload.violation.importer)) continue;
				const info = await buildViolationInfo({
					config,
					provider,
					graph,
					importLocCache,
					perf,
					envName,
					envType,
					importer: payload.violation.importer,
					source: payload.violation.specifier,
					resolved: payload.violation.resolved,
					type: "specifier",
					pattern: payload.violation.patternText,
					preferOriginalCode: true
				});
				await reportViolation({
					config,
					envState,
					compilation: context.compilation,
					rspack: context.compiler.rspack,
					perf,
					info
				});
			}
			for (const edge of edges) {
				if (!edge.specifier) continue;
				if (!shouldCheckImporter(edge.importer)) continue;
				const importProtectionCheck = getRsbuildResolvedImportProtectionCheck(getImportProtectionRelativePath(config.root, edge.resolved), matchers);
				if (!importProtectionCheck) continue;
				if (importProtectionCheck.type === "file") {
					const info = await buildViolationInfo({
						config,
						provider,
						graph,
						importLocCache,
						perf,
						envName,
						envType,
						importer: edge.importer,
						source: edge.specifier,
						resolved: edge.resolved,
						type: "file",
						pattern: importProtectionCheck.fileMatch.pattern
					});
					await reportViolation({
						config,
						envState,
						compilation: context.compilation,
						rspack: context.compiler.rspack,
						perf,
						info
					});
					continue;
				}
				const markerKind = await getMarkerKindForFile({
					config,
					provider,
					loadOriginalCode: loadOriginalCodeFromCompilation,
					markerKindCache,
					file: edge.resolved
				});
				if (!(envType === "client" && markerKind === "server" || envType === "server" && markerKind === "client")) continue;
				const info = await buildViolationInfo({
					config,
					provider,
					graph,
					importLocCache,
					perf,
					envName,
					envType,
					importer: edge.importer,
					source: edge.specifier,
					resolved: edge.resolved,
					type: "marker"
				});
				await reportViolation({
					config,
					envState,
					compilation: context.compilation,
					rspack: context.compiler.rspack,
					perf,
					info
				});
			}
			if (config.command === "build") {
				const seenInactiveFileEdgeKeys = /* @__PURE__ */ new Set();
				for (const edge of inactiveEdges) {
					if (!edge.specifier) continue;
					if (!shouldCheckImporter(edge.importer)) continue;
					const liveEdgeKey = `${normalizeFilePath(edge.importer)}::${edge.specifier}::${normalizeFilePath(edge.resolved)}`;
					if (liveFileEdgeKeys.has(liveEdgeKey)) continue;
					if (seenInactiveFileEdgeKeys.has(liveEdgeKey)) continue;
					seenInactiveFileEdgeKeys.add(liveEdgeKey);
					if (!didModuleSurvive(edge.resolved)) continue;
					if (!didModuleSurvive(edge.importer)) continue;
					if (!hasOriginalUnsafeUsage(provider.getTransformResult(edge.importer), edge.specifier, envType)) continue;
					const fileMatch = checkFileDenial(getImportProtectionRelativePath(config.root, edge.resolved), matchers);
					if (!fileMatch) continue;
					const info = await buildViolationInfo({
						config,
						provider,
						graph,
						importLocCache,
						perf,
						envName,
						envType,
						importer: edge.importer,
						source: edge.specifier,
						resolved: edge.resolved,
						type: "file",
						pattern: fileMatch.pattern,
						preferOriginalCode: true
					});
					await reportViolation({
						config,
						envState,
						compilation: context.compilation,
						rspack: context.compiler.rspack,
						perf,
						info
					});
				}
			}
			for (const violation of envState.deferredFileViolations) {
				const liveEdgeKey = `${normalizeFilePath(violation.importer)}::${violation.specifier}::${normalizeFilePath(violation.resolved)}`;
				if (liveFileEdgeKeys.has(liveEdgeKey)) continue;
				if (!didModuleSurvive(violation.resolved)) continue;
				if (!didModuleSurvive(violation.importer)) continue;
				const info = await buildViolationInfo({
					config,
					provider,
					graph,
					importLocCache,
					perf,
					envName,
					envType,
					importer: violation.importer,
					source: violation.specifier,
					resolved: violation.resolved,
					type: "file",
					pattern: violation.pattern,
					preferOriginalCode: violation.useOriginalLocation
				});
				await reportViolation({
					config,
					envState,
					compilation: context.compilation,
					rspack: context.compiler.rspack,
					perf,
					info
				});
			}
		} finally {
			if (perf) {
				perf.time("processAssets", startedAt);
				perf.flush(config.root, envName, "processAssets");
			}
		}
	});
}
//#endregion
export { registerImportProtection };

//# sourceMappingURL=import-protection.js.map