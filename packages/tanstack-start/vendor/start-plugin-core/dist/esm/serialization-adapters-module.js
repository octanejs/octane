//#region src/serialization-adapters-module.ts
var EMPTY_SERIALIZATION_ADAPTERS_MODULE = `export const pluginSerializationAdapters = []
export const hasPluginAdapters = false`;
function resolveSerializationAdaptersForRuntime(opts) {
	if (!opts.adapters?.length) return [];
	const resolvedAdapters = [];
	for (let i = 0; i < opts.adapters.length; i++) {
		const adapter = opts.adapters[i];
		if ("module" in adapter) {
			resolvedAdapters.push({
				module: adapter.module,
				export: adapter.export,
				isFactory: adapter.isFactory ?? true,
				index: i
			});
			continue;
		}
		const runtimeAdapter = opts.runtime === "client" ? adapter.client : adapter.server;
		if (!runtimeAdapter) continue;
		resolvedAdapters.push({
			module: runtimeAdapter.module,
			export: runtimeAdapter.export,
			isFactory: runtimeAdapter.isFactory ?? true,
			index: i
		});
	}
	return resolvedAdapters;
}
function generateSerializationAdaptersModule(opts) {
	const resolvedAdapters = resolveSerializationAdaptersForRuntime(opts);
	if (resolvedAdapters.length === 0) return EMPTY_SERIALIZATION_ADAPTERS_MODULE;
	return `${resolvedAdapters.map((adapter) => `import { ${adapter.export} as adapter${adapter.index} } from '${adapter.module}'`).join("\n")}
export const pluginSerializationAdapters = [${resolvedAdapters.map((adapter) => adapter.isFactory ? `...(Array.isArray(adapter${adapter.index}()) ? adapter${adapter.index}() : [adapter${adapter.index}()])` : `adapter${adapter.index}`).join(", ")}]
export const hasPluginAdapters = true`;
}
//#endregion
export { generateSerializationAdaptersModule };

//# sourceMappingURL=serialization-adapters-module.js.map