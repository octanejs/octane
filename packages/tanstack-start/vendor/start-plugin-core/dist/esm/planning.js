import { resolveEntry } from "./resolve-entries.js";
import { joinPaths } from "@tanstack/router-core";
import { join } from "pathe";
//#region src/planning.ts
function normalizePublicBase(base) {
	const resolvedBase = base ?? "/";
	if (isFullUrl(resolvedBase)) return resolvedBase;
	return joinPaths([
		"/",
		resolvedBase,
		"/"
	]);
}
function deriveRouterBasepath(opts) {
	if (opts.configuredBasepath !== void 0) return opts.configuredBasepath;
	if (isFullUrl(opts.publicBase)) return "/";
	return opts.publicBase.replace(/^\/|\/$/g, "");
}
function shouldRewriteDevBasepath(opts) {
	if (opts.command !== "serve" || opts.middlewareMode) return false;
	return !joinPaths([
		"/",
		opts.routerBasepath,
		"/"
	]).startsWith(joinPaths([
		"/",
		opts.publicBase,
		"/"
	]));
}
function createNormalizedBasePaths(opts) {
	return {
		publicBase: opts.publicBase,
		assetBase: {
			dev: opts.publicBase,
			build: opts.publicBase
		}
	};
}
function createNormalizedOutputDirectories(opts) {
	return {
		client: opts.client,
		server: opts.server
	};
}
function createServerFnBasePath(opts) {
	return joinPaths([
		"/",
		opts.routerBasepath,
		opts.serverFnBase,
		"/"
	]);
}
function resolveStartEntryPlan(opts) {
	const srcDirectory = join(opts.root, opts.startConfig.srcDirectory);
	const startFilePath = resolveEntry({
		type: "start entry",
		configuredEntry: opts.startConfig.start.entry,
		defaultEntry: "start",
		resolvedSrcDirectory: srcDirectory,
		required: false
	});
	const routerFilePath = resolveEntry({
		type: "router entry",
		configuredEntry: opts.startConfig.router.entry,
		defaultEntry: "router",
		resolvedSrcDirectory: srcDirectory,
		required: true
	});
	const clientEntryPath = resolveEntry({
		type: "client entry",
		configuredEntry: opts.startConfig.client.entry,
		defaultEntry: "client",
		resolvedSrcDirectory: srcDirectory,
		required: false
	});
	const serverEntryPath = resolveEntry({
		type: "server entry",
		configuredEntry: opts.startConfig.server.entry,
		defaultEntry: "server",
		resolvedSrcDirectory: srcDirectory,
		required: false
	});
	return {
		srcDirectory,
		startFilePath,
		routerFilePath,
		entryPaths: {
			client: clientEntryPath ?? opts.defaultEntryPaths.client,
			server: serverEntryPath ?? opts.defaultEntryPaths.server,
			start: startFilePath ?? opts.defaultEntryPaths.start,
			router: routerFilePath
		}
	};
}
function isFullUrl(str) {
	try {
		new URL(str);
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { createNormalizedBasePaths, createNormalizedOutputDirectories, createServerFnBasePath, deriveRouterBasepath, normalizePublicBase, resolveStartEntryPlan, shouldRewriteDevBasepath };

//# sourceMappingURL=planning.js.map