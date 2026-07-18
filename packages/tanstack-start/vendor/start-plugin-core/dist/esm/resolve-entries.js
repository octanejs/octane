import { resolveModulePath } from "exsolve";
//#region src/resolve-entries.ts
function resolveModule(opts) {
	let baseName = opts.baseName;
	if (!baseName.startsWith("./")) baseName = `./${baseName}`;
	return resolveModulePath(baseName, {
		from: opts.from,
		extensions: [
			".ts",
			".js",
			".mts",
			".mjs",
			".tsx",
			".jsx",
			".tsrx"
		],
		try: true
	});
}
function resolveEntry(opts) {
	let resolveOptions;
	if (!opts.configuredEntry) resolveOptions = {
		baseName: opts.defaultEntry,
		from: opts.resolvedSrcDirectory
	};
	else resolveOptions = {
		baseName: opts.configuredEntry,
		from: opts.resolvedSrcDirectory
	};
	const resolvedEntry = resolveModule(resolveOptions);
	if (opts.required && !resolvedEntry) throw new Error(`Could not resolve entry for ${opts.type}: ${resolveOptions.baseName} in ${resolveOptions.from}`);
	return resolvedEntry;
}
//#endregion
export { resolveEntry };

//# sourceMappingURL=resolve-entries.js.map