import path from "node:path";
//#region src/utils.ts
var isWindows = typeof process !== "undefined" && process.platform === "win32";
var windowsSlashRE = /\\/g;
/** Read `build.rollupOptions` or `build.rolldownOptions` from a build config. */
function getBundlerOptions(build) {
	return build?.rolldownOptions ?? build?.rollupOptions;
}
function resolveViteId(id) {
	return `\0${id}`;
}
function createIdFilter(ids) {
	return new RegExp(`^(?:${ids.map(escapeRegExp).join("|")})$`);
}
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function createLogger(prefix) {
	const label = `[${prefix}]`;
	return {
		log: (...args) => console.log(label, ...args),
		debug: (...args) => console.debug(label, ...args),
		info: (...args) => console.info(label, ...args),
		warn: (...args) => console.warn(label, ...args),
		error: (...args) => console.error(label, ...args)
	};
}
function slash(path) {
	return path.replace(windowsSlashRE, "/");
}
function normalizePath(id) {
	return path.posix.normalize(isWindows ? slash(id) : id);
}
//#endregion
export { createIdFilter, createLogger, escapeRegExp, getBundlerOptions, normalizePath, resolveViteId };

//# sourceMappingURL=utils.js.map