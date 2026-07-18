import { MOCK_MODULE_ID } from "./constants.js";
import * as t from "@babel/types";
import { generateFromAst, parseAst } from "@tanstack/router-utils";
//#region src/import-protection/rewrite.ts
function getModuleExportName(node) {
	return t.isIdentifier(node) ? node.name : node.value;
}
function toMemberExpressionProperty(name) {
	return t.isValidIdentifier(name) ? {
		property: t.identifier(name),
		computed: false
	} : {
		property: t.stringLiteral(name),
		computed: true
	};
}
function toModuleExportNameNode(name) {
	return t.isValidIdentifier(name) ? t.identifier(name) : t.stringLiteral(name);
}
function createInternalReexportVarName(localName, mockIndex, usedNames) {
	const baseName = t.isValidIdentifier(localName) ? `__tss_reexport_${localName}` : `__tss_reexport_${mockIndex}`;
	let candidate = baseName;
	let suffix = 0;
	while (usedNames.has(candidate)) {
		suffix++;
		candidate = `${baseName}_${suffix}`;
	}
	usedNames.add(candidate);
	return candidate;
}
/**
* Rewrite static imports/re-exports from denied sources using Babel AST transforms.
*
* Transforms:
*   import { a as b, c } from 'denied'
* Into:
*   import __tss_deny_0 from 'tanstack-start-import-protection:mock'
*   const b = __tss_deny_0.a
*   const c = __tss_deny_0.c
*
* Also handles:
*   import def from 'denied'        -> import def from mock
*   import * as ns from 'denied'    -> import ns from mock
*   export { x } from 'denied'      -> export const x = mock.x
*   export * from 'denied'          -> removed
*   export { x as y } from 'denied' -> export const y = mock.x
*/
function rewriteDeniedImports(code, id, deniedSources, getMockModuleId = () => MOCK_MODULE_ID) {
	return rewriteDeniedImportsFromAst(parseAst({
		code,
		filename: id
	}), id, deniedSources, getMockModuleId);
}
function rewriteDeniedImportsFromAst(ast, id, deniedSources, getMockModuleId = () => MOCK_MODULE_ID) {
	let modified = false;
	let mockCounter = 0;
	for (let i = ast.program.body.length - 1; i >= 0; i--) {
		const node = ast.program.body[i];
		if (t.isImportDeclaration(node)) {
			if (node.importKind === "type") continue;
			if (!deniedSources.has(node.source.value)) continue;
			const mockVar = `__tss_deny_${mockCounter++}`;
			const replacements = [];
			replacements.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(mockVar))], t.stringLiteral(getMockModuleId(node.source.value))));
			for (const specifier of node.specifiers) if (t.isImportDefaultSpecifier(specifier) || t.isImportNamespaceSpecifier(specifier)) replacements.push(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(specifier.local.name), t.identifier(mockVar))]));
			else if (t.isImportSpecifier(specifier)) {
				if (specifier.importKind === "type") continue;
				const memberProperty = toMemberExpressionProperty(getModuleExportName(specifier.imported));
				replacements.push(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(specifier.local.name), t.memberExpression(t.identifier(mockVar), memberProperty.property, memberProperty.computed))]));
			}
			ast.program.body.splice(i, 1, ...replacements);
			modified = true;
			continue;
		}
		if (t.isExportNamedDeclaration(node) && node.source) {
			if (node.exportKind === "type") continue;
			if (!deniedSources.has(node.source.value)) continue;
			const mockIndex = mockCounter++;
			const mockVar = `__tss_deny_${mockIndex}`;
			const replacements = [];
			replacements.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(mockVar))], t.stringLiteral(getMockModuleId(node.source.value))));
			const usedInternalVars = /* @__PURE__ */ new Set();
			const exportSpecifiers = [];
			for (const specifier of node.specifiers) if (t.isExportSpecifier(specifier)) {
				if (specifier.exportKind === "type") continue;
				const localName = getModuleExportName(specifier.local);
				const exportedName = getModuleExportName(specifier.exported);
				const memberProperty = toMemberExpressionProperty(localName);
				const internalVar = createInternalReexportVarName(localName, mockIndex, usedInternalVars);
				replacements.push(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(internalVar), t.memberExpression(t.identifier(mockVar), memberProperty.property, memberProperty.computed))]));
				exportSpecifiers.push({
					localName: internalVar,
					exportedName
				});
			}
			if (exportSpecifiers.length > 0) replacements.push(t.exportNamedDeclaration(null, exportSpecifiers.map((s) => t.exportSpecifier(t.identifier(s.localName), toModuleExportNameNode(s.exportedName)))));
			ast.program.body.splice(i, 1, ...replacements);
			modified = true;
			continue;
		}
		if (t.isExportAllDeclaration(node)) {
			if (node.exportKind === "type") continue;
			if (!deniedSources.has(node.source.value)) continue;
			ast.program.body.splice(i, 1);
			modified = true;
			continue;
		}
	}
	if (!modified) return void 0;
	const result = generateFromAst(ast, {
		sourceMaps: true,
		sourceFileName: id,
		filename: id
	});
	return {
		code: result.code,
		...result.map ? { map: result.map } : {}
	};
}
//#endregion
export { rewriteDeniedImports };

//# sourceMappingURL=rewrite.js.map