import * as t from "@babel/types";
//#region src/core/utils.ts
var debug = process.env.TSR_VITE_DEBUG && ["true", "router-plugin"].includes(process.env.TSR_VITE_DEBUG);
/**
* Normalizes a file path by converting Windows backslashes to forward slashes.
* This ensures consistent path handling across different bundlers and operating systems.
*
* The route generator stores paths with forward slashes, but rspack/webpack on Windows
* pass native paths with backslashes to transform handlers.
*/
function normalizePath(path) {
	return path.replace(/\\/g, "/");
}
var routeFactoryCallCodeFilter = [
	/\bcreateFileRoute\s*\(/,
	/\bcreateRootRoute\s*\(/,
	/\bcreateRootRouteWithContext\s*(?:<|\()/
];
function getObjectPropertyKeyName(prop) {
	if (prop.computed) return;
	if (t.isIdentifier(prop.key)) return prop.key.name;
	if (t.isStringLiteral(prop.key)) return prop.key.value;
}
function getUniqueProgramIdentifier(programPath, baseName) {
	let name = baseName;
	let suffix = 2;
	const programScope = programPath.scope.getProgramParent();
	while (programScope.hasBinding(name) || programScope.hasGlobal(name) || programScope.hasReference(name)) {
		name = `${baseName}${suffix}`;
		suffix++;
	}
	programScope.references[name] = true;
	return t.identifier(name);
}
//#endregion
export { debug, getObjectPropertyKeyName, getUniqueProgramIdentifier, normalizePath, routeFactoryCallCodeFilter };

//# sourceMappingURL=utils.js.map