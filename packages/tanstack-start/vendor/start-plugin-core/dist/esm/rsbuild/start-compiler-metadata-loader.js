import { SERVER_FN_BUILD_INFO_CONTEXT_KEY } from "./start-compiler-metadata.js";
//#region src/rsbuild/start-compiler-metadata-loader.ts
var tanStackStartCompilerMetadataLoader = function(source, map) {
	const { metadataById } = this.getOptions();
	const id = this.resource;
	const metadata = metadataById.get(id);
	const setBuildInfo = this[SERVER_FN_BUILD_INFO_CONTEXT_KEY];
	setBuildInfo?.(metadata ?? null);
	this.callback(null, source, map);
};
//#endregion
export { tanStackStartCompilerMetadataLoader as default };

//# sourceMappingURL=start-compiler-metadata-loader.js.map