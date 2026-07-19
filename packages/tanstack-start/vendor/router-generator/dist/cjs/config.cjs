const require_runtime = require("./_virtual/_rolldown/runtime.cjs");
const require_config = require("./filesystem/virtual/config.cjs");
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path, 1);
let node_fs = require("node:fs");
let zod = require("zod");
//#region src/config.ts
var tokenJsonRegexSchema = zod.z.object({
	regex: zod.z.string(),
	flags: zod.z.string().optional()
});
var tokenMatcherSchema = zod.z.union([
	zod.z.string(),
	zod.z.instanceof(RegExp),
	tokenJsonRegexSchema
]);
var baseConfigSchema = zod.z.object({
	target: zod.z.enum([
		"react",
		"solid",
		"vue",
		"octane"
	]).optional().default("react"),
	virtualRouteConfig: require_config.virtualRootRouteSchema.or(zod.z.string()).optional(),
	routeFilePrefix: zod.z.string().optional(),
	routeFileIgnorePrefix: zod.z.string().optional().default("-"),
	routeFileIgnorePattern: zod.z.string().optional(),
	routesDirectory: zod.z.string().optional().default("./src/routes"),
	quoteStyle: zod.z.enum(["single", "double"]).optional().default("single"),
	semicolons: zod.z.boolean().optional().default(false),
	disableLogging: zod.z.boolean().optional().default(false),
	routeTreeFileHeader: zod.z.array(zod.z.string()).optional().default([
		"/* eslint-disable */",
		"// @ts-nocheck",
		"// noinspection JSUnusedGlobalSymbols"
	]),
	indexToken: tokenMatcherSchema.optional().default("index"),
	routeToken: tokenMatcherSchema.optional().default("route"),
	pathParamsAllowedCharacters: zod.z.array(zod.z.enum([
		";",
		":",
		"@",
		"&",
		"=",
		"+",
		"$",
		","
	])).optional()
});
var configSchema = baseConfigSchema.extend({
	generatedRouteTree: zod.z.string().optional().default("./src/routeTree.gen.ts"),
	disableTypes: zod.z.boolean().optional().default(false),
	addExtensions: zod.z.union([zod.z.boolean(), zod.z.string()]).optional().default(false).transform((v) => typeof v === "string" ? v.startsWith(".") ? v : `.${v}` : v),
	enableRouteTreeFormatting: zod.z.boolean().optional().default(true),
	routeTreeFileFooter: zod.z.union([zod.z.array(zod.z.string()).optional().default([]), zod.z.custom((value) => typeof value === "function")]).optional(),
	autoCodeSplitting: zod.z.boolean().optional(),
	customScaffolding: zod.z.object({
		routeTemplate: zod.z.string().optional(),
		lazyRouteTemplate: zod.z.string().optional()
	}).optional(),
	experimental: zod.z.object({ enableCodeSplitting: zod.z.boolean().optional() }).optional(),
	plugins: zod.z.array(zod.z.custom()).optional(),
	tmpDir: zod.z.string().optional().default(""),
	importRoutesUsingAbsolutePaths: zod.z.boolean().optional().default(false)
});
function resolveConfigPath({ configDirectory }) {
	return node_path.default.resolve(configDirectory, "tsr.config.json");
}
function getConfig(inlineConfig = {}, configDirectory) {
	if (configDirectory === void 0) configDirectory = process.cwd();
	const configFilePathJson = resolveConfigPath({ configDirectory });
	const exists = (0, node_fs.existsSync)(configFilePathJson);
	let config;
	let rawConfig;
	if (exists) {
		const merged = {
			...JSON.parse((0, node_fs.readFileSync)(configFilePathJson, "utf-8")),
			...inlineConfig
		};
		rawConfig = merged;
		config = configSchema.parse(merged);
	} else {
		rawConfig = inlineConfig;
		config = configSchema.parse(inlineConfig);
	}
	if (config.target === "octane" && rawConfig.addExtensions === void 0) config.addExtensions = true;
	if (config.disableTypes) config.generatedRouteTree = config.generatedRouteTree.replace(/\.(ts|tsx)$/, ".js");
	if (configDirectory) if (node_path.default.isAbsolute(configDirectory)) {
		config.routesDirectory = node_path.default.resolve(configDirectory, config.routesDirectory);
		config.generatedRouteTree = node_path.default.resolve(configDirectory, config.generatedRouteTree);
	} else {
		config.routesDirectory = node_path.default.resolve(process.cwd(), configDirectory, config.routesDirectory);
		config.generatedRouteTree = node_path.default.resolve(process.cwd(), configDirectory, config.generatedRouteTree);
	}
	const resolveTmpDir = (dir) => {
		if (Array.isArray(dir)) dir = node_path.default.join(...dir);
		if (!node_path.default.isAbsolute(dir)) dir = node_path.default.resolve(process.cwd(), dir);
		return dir;
	};
	if (config.tmpDir) config.tmpDir = resolveTmpDir(config.tmpDir);
	else if (process.env.TSR_TMP_DIR) config.tmpDir = resolveTmpDir(process.env.TSR_TMP_DIR);
	else config.tmpDir = resolveTmpDir([".tanstack", "tmp"]);
	validateConfig(config);
	return config;
}
function validateConfig(config) {
	if (typeof config.experimental?.enableCodeSplitting !== "undefined") {
		const message = `
------
⚠️ ⚠️ ⚠️
ERROR: The "experimental.enableCodeSplitting" flag has been made stable and is now "autoCodeSplitting". Please update your configuration file to use "autoCodeSplitting" instead of "experimental.enableCodeSplitting".
------
`;
		console.error(message);
		throw new Error(message);
	}
	if (areTokensEqual(config.indexToken, config.routeToken)) throw new Error(`The "indexToken" and "routeToken" options must be different.`);
	if (config.routeFileIgnorePrefix && config.routeFileIgnorePrefix.trim() === "_") throw new Error(`The "routeFileIgnorePrefix" cannot be an underscore ("_"). This is a reserved character used to denote a pathless route. Please use a different prefix.`);
	return config;
}
/**
* Compares two token matchers for equality.
* Handles strings, RegExp instances, and JSON regex objects.
*/
function areTokensEqual(a, b) {
	if (typeof a === "string" && typeof b === "string") return a === b;
	if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
	if (typeof a === "object" && "regex" in a && typeof b === "object" && "regex" in b) return a.regex === b.regex && (a.flags ?? "") === (b.flags ?? "");
	return false;
}
//#endregion
exports.baseConfigSchema = baseConfigSchema;
exports.configSchema = configSchema;
exports.getConfig = getConfig;
exports.resolveConfigPath = resolveConfigPath;

//# sourceMappingURL=config.cjs.map