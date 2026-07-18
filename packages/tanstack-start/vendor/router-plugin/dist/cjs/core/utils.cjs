const require_runtime = require("../_virtual/_rolldown/runtime.cjs");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
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
	if (_babel_types.isIdentifier(prop.key)) return prop.key.name;
	if (_babel_types.isStringLiteral(prop.key)) return prop.key.value;
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
	return _babel_types.identifier(name);
}
//#endregion
exports.debug = debug;
exports.getObjectPropertyKeyName = getObjectPropertyKeyName;
exports.getUniqueProgramIdentifier = getUniqueProgramIdentifier;
exports.normalizePath = normalizePath;
exports.routeFactoryCallCodeFilter = routeFactoryCallCodeFilter;

//# sourceMappingURL=utils.cjs.map