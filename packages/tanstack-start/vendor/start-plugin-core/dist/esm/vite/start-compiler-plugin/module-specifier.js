//#region src/vite/start-compiler-plugin/module-specifier.ts
function createViteDevServerFnModuleSpecifierEncoder(root) {
	const normalizedRoot = root.replace(/\\/g, "/");
	const rootWithTrailingSlash = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
	return ({ extractedFilename }) => {
		const normalizedFile = extractedFilename.replace(/\\/g, "/");
		if (normalizedFile.startsWith(rootWithTrailingSlash)) return `/${normalizedFile.slice(rootWithTrailingSlash.length)}`;
		return normalizedFile.startsWith("/") ? `/@fs${normalizedFile}` : `/@fs/${normalizedFile}`;
	};
}
function decodeViteDevServerModuleSpecifier(moduleSpecifier) {
	let sourceFile = moduleSpecifier;
	if (sourceFile.startsWith("/@id/")) sourceFile = sourceFile.slice(5);
	else if (sourceFile.startsWith("/@fs/")) {
		sourceFile = sourceFile.slice(4);
		sourceFile = sourceFile.replace(/^\/([A-Za-z]:\/)/, "$1");
	} else if (sourceFile.startsWith("/")) sourceFile = sourceFile.slice(1);
	const queryIndex = sourceFile.indexOf("?");
	return queryIndex === -1 ? sourceFile : sourceFile.slice(0, queryIndex);
}
//#endregion
export { createViteDevServerFnModuleSpecifierEncoder, decodeViteDevServerModuleSpecifier };

//# sourceMappingURL=module-specifier.js.map