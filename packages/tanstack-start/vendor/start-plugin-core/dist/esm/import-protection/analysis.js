import { getOrCreate } from "./utils.js";
import { buildLineIndex } from "./sourceLocation.js";
import * as t from "@babel/types";
import { parseAst } from "@tanstack/router-utils";
//#region src/import-protection/analysis.ts
function mayContainImportOrExport(code) {
	return code.includes("import") || code.includes("export");
}
function makeTransientResult(code, filename, perf) {
	const result = {
		code,
		filename,
		map: void 0,
		originalCode: void 0
	};
	if (perf) result.perf = perf;
	return result;
}
function getOrParseAst(result) {
	if (result.parsedAst) {
		result.perf?.count("analysis.parseAst.cached");
		return result.parsedAst;
	}
	const startedAt = result.perf ? performance.now() : 0;
	result.perf?.count("analysis.parseAst.calls");
	try {
		const ast = parseAst({
			code: result.code,
			filename: result.filename
		});
		result.parsedAst = ast;
		return ast;
	} finally {
		if (result.perf) result.perf.time("analysis.parseAst", startedAt);
	}
}
function getModuleExportName(node) {
	return t.isIdentifier(node) ? node.name : node.value;
}
function getStringLiteralValueStart(node) {
	if (node.start == null) return -1;
	const raw = node.extra?.raw;
	if (typeof raw === "string" && (raw.startsWith("'") || raw.startsWith("\""))) return node.start + 1;
	return node.start;
}
function isTypeOnlyImportDeclaration(node) {
	if (node.importKind === "type") return true;
	if (node.specifiers.length === 0) return false;
	return node.specifiers.every((specifier) => t.isImportSpecifier(specifier) && specifier.importKind === "type");
}
function isTypeOnlyExportNamedDeclaration(node) {
	if (node.exportKind === "type") return true;
	if (!node.source || node.declaration || node.specifiers.length === 0) return false;
	return node.specifiers.every((specifier) => t.isExportSpecifier(specifier) && specifier.exportKind === "type");
}
function collectIdentifiersFromPattern$1(pattern, add) {
	if (t.isIdentifier(pattern)) add(pattern.name);
	else if (t.isObjectPattern(pattern)) for (const prop of pattern.properties) if (t.isRestElement(prop)) collectIdentifiersFromPattern$1(prop.argument, add);
	else collectIdentifiersFromPattern$1(prop.value, add);
	else if (t.isArrayPattern(pattern)) {
		for (const elem of pattern.elements) if (elem) collectIdentifiersFromPattern$1(elem, add);
	} else if (t.isAssignmentPattern(pattern)) collectIdentifiersFromPattern$1(pattern.left, add);
	else if (t.isRestElement(pattern)) collectIdentifiersFromPattern$1(pattern.argument, add);
}
function isValidExportName(name) {
	if (name === "default" || name.length === 0) return false;
	const first = name.charCodeAt(0);
	if (!(first >= 65 && first <= 90 || first >= 97 && first <= 122 || first === 95 || first === 36)) return false;
	for (let i = 1; i < name.length; i++) {
		const ch = name.charCodeAt(i);
		if (!(ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 || ch >= 48 && ch <= 57 || ch === 95 || ch === 36)) return false;
	}
	return true;
}
function buildImportAnalysis(result) {
	const ast = getOrParseAst(result);
	const importSourcesInOrder = [];
	const importSpecifierLocationIndex = /* @__PURE__ */ new Map();
	const importBindingsBySource = /* @__PURE__ */ new Map();
	const memberBindingSources = /* @__PURE__ */ new Map();
	const mockNamesBySource = /* @__PURE__ */ new Map();
	const namedExports = /* @__PURE__ */ new Set();
	const getBindingInfo = (source) => getOrCreate(importBindingsBySource, source, () => ({ importedLocalNames: /* @__PURE__ */ new Set() }));
	const addSpecifierLocation = (node) => {
		importSourcesInOrder.push(node.value);
		const index = getStringLiteralValueStart(node);
		if (index === -1) return;
		const prev = importSpecifierLocationIndex.get(node.value);
		if (prev == null || index < prev) importSpecifierLocationIndex.set(node.value, index);
	};
	const addMockName = (source, name) => {
		if (name === "default" || name.length === 0) return;
		getOrCreate(mockNamesBySource, source, () => /* @__PURE__ */ new Set()).add(name);
	};
	const addMemberBinding = (localName, source) => {
		getOrCreate(memberBindingSources, localName, () => /* @__PURE__ */ new Set()).add(source);
	};
	const addNamedExport = (name) => {
		if (name !== "default" && name.length > 0) namedExports.add(name);
	};
	const visit = (node) => {
		if (t.isImportDeclaration(node)) {
			if (!isTypeOnlyImportDeclaration(node)) {
				addSpecifierLocation(node.source);
				const source = node.source.value;
				const bindingInfo = getBindingInfo(source);
				for (const specifier of node.specifiers) {
					if (t.isImportNamespaceSpecifier(specifier)) {
						bindingInfo.importedLocalNames.add(specifier.local.name);
						addMemberBinding(specifier.local.name, source);
						continue;
					}
					if (t.isImportDefaultSpecifier(specifier)) {
						bindingInfo.importedLocalNames.add(specifier.local.name);
						addMemberBinding(specifier.local.name, source);
						continue;
					}
					if (!t.isImportSpecifier(specifier)) continue;
					if (specifier.importKind === "type") continue;
					bindingInfo.importedLocalNames.add(specifier.local.name);
					const importedName = getModuleExportName(specifier.imported);
					if (importedName !== "default") addMockName(source, importedName);
				}
			}
		} else if (t.isExportNamedDeclaration(node)) {
			const isTypeOnly = isTypeOnlyExportNamedDeclaration(node);
			if (!isTypeOnly && node.source && t.isStringLiteral(node.source)) addSpecifierLocation(node.source);
			if (!isTypeOnly && node.source?.value) {
				const source = node.source.value;
				for (const specifier of node.specifiers) {
					if (!t.isExportSpecifier(specifier)) continue;
					if (specifier.exportKind === "type") continue;
					addMockName(source, getModuleExportName(specifier.local));
				}
			}
			if (!isTypeOnly) {
				if (node.declaration) {
					const decl = node.declaration;
					if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
						if (decl.id?.name) addNamedExport(decl.id.name);
					} else if (t.isVariableDeclaration(decl)) for (const d of decl.declarations) collectIdentifiersFromPattern$1(d.id, addNamedExport);
				}
				for (const specifier of node.specifiers) {
					if (!t.isExportSpecifier(specifier)) continue;
					if (specifier.exportKind === "type") continue;
					addNamedExport(getModuleExportName(specifier.exported));
				}
			}
		} else if (t.isExportAllDeclaration(node)) {
			if (node.exportKind !== "type") addSpecifierLocation(node.source);
		} else if (t.isImportExpression(node)) {
			if (t.isStringLiteral(node.source)) addSpecifierLocation(node.source);
		} else if (t.isCallExpression(node) && t.isImport(node.callee)) {
			const sourceNode = node.arguments[0];
			if (t.isStringLiteral(sourceNode)) addSpecifierLocation(sourceNode);
		} else if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
			const object = node.object;
			if (t.isIdentifier(object)) {
				const sources = memberBindingSources.get(object.name);
				if (sources) {
					const property = node.property;
					for (const source of sources) if (!node.computed && t.isIdentifier(property)) addMockName(source, property.name);
					else if (node.computed && t.isStringLiteral(property)) addMockName(source, property.value);
				}
			}
		}
		const keys = t.VISITOR_KEYS[node.type];
		if (!keys) return;
		for (const key of keys) {
			const child = node[key];
			if (Array.isArray(child)) {
				for (const item of child) if (item && typeof item === "object" && "type" in item) visit(item);
			} else if (child && typeof child === "object" && "type" in child) visit(child);
		}
	};
	visit(ast.program);
	const mockExportNamesBySource = /* @__PURE__ */ new Map();
	for (const [source, names] of mockNamesBySource) mockExportNamesBySource.set(source, Array.from(names).sort());
	const lineIndex = result.lineIndex ?? buildLineIndex(result.code);
	result.lineIndex = lineIndex;
	return {
		ast,
		lineIndex,
		importSourcesInOrder,
		importSpecifierLocationIndex,
		importBindingsBySource,
		mockExportNamesBySource,
		namedExports: Array.from(namedExports).sort(),
		usageByKey: /* @__PURE__ */ new Map()
	};
}
function getOrCreateImportAnalysis(result) {
	if (!result.analysis) result.analysis = buildImportAnalysis(result);
	return result.analysis;
}
function getImportSourcesFromResult(result) {
	if (!mayContainImportOrExport(result.code)) return [];
	return getOrCreateImportAnalysis(result).importSourcesInOrder;
}
function getImportSources(code, filename, perf) {
	return getImportSourcesFromResult(makeTransientResult(code, filename, perf));
}
function getImportSpecifierLocationFromResult(result, source) {
	return getOrCreateImportAnalysis(result).importSpecifierLocationIndex.get(source) ?? -1;
}
function getMockExportNamesBySourceFromResult(result) {
	return getOrCreateImportAnalysis(result).mockExportNamesBySource;
}
function getMockExportNamesBySource(code, filename, perf) {
	return getMockExportNamesBySourceFromResult(makeTransientResult(code, filename, perf));
}
function getNamedExportsFromResult(result) {
	return getOrCreateImportAnalysis(result).namedExports;
}
function getNamedExports(code, filename, perf) {
	return getNamedExportsFromResult(makeTransientResult(code, filename, perf));
}
function isCompilerSafeBoundaryCall(call, fnNode, envType) {
	if (!call.arguments.some((arg) => arg === fnNode)) return false;
	const callee = call.callee;
	if (t.isIdentifier(callee)) return envType === "client" ? callee.name === "createServerOnlyFn" : callee.name === "createClientOnlyFn";
	if (!t.isMemberExpression(callee) || callee.computed) return false;
	if (!t.isIdentifier(callee.property)) return false;
	const prop = callee.property.name;
	const rootName = getCalleeRootName(callee.object);
	if (envType === "client") {
		if (prop === "handler") return rootName === "createServerFn" || /ServerFn$/.test(rootName ?? "");
		if (prop === "server") return rootName === "createMiddleware" || rootName === "createIsomorphicFn" || /Middleware$/.test(rootName ?? "");
		return false;
	}
	if (prop === "client") return rootName === "createIsomorphicFn";
	return false;
}
function getCalleeRootName(node) {
	if (t.isIdentifier(node)) return node.name;
	if (t.isCallExpression(node)) return getCalleeRootName(node.callee);
	if (t.isMemberExpression(node)) return getCalleeRootName(node.object);
}
function getBoundNamesFromPattern(pattern, out) {
	if (t.isIdentifier(pattern)) out.add(pattern.name);
	else if (t.isObjectPattern(pattern)) for (const prop of pattern.properties) if (t.isRestElement(prop)) getBoundNamesFromPattern(prop.argument, out);
	else getBoundNamesFromPattern(prop.value, out);
	else if (t.isArrayPattern(pattern)) {
		for (const elem of pattern.elements) if (elem) getBoundNamesFromPattern(elem, out);
	} else if (t.isAssignmentPattern(pattern)) getBoundNamesFromPattern(pattern.left, out);
	else if (t.isRestElement(pattern)) getBoundNamesFromPattern(pattern.argument, out);
}
function addPatternBindingsIfTracked(pattern, tracked, out) {
	const names = /* @__PURE__ */ new Set();
	getBoundNamesFromPattern(pattern, names);
	for (const name of names) if (tracked.has(name)) out.add(name);
}
function collectHoistedVarBindings(node, tracked, out, isRoot = true) {
	if (!isRoot && t.isFunction(node)) return;
	if (t.isVariableDeclaration(node) && node.kind === "var") for (const decl of node.declarations) addPatternBindingsIfTracked(decl.id, tracked, out);
	const keys = t.VISITOR_KEYS[node.type];
	if (!keys) return;
	for (const key of keys) {
		const child = node[key];
		if (Array.isArray(child)) {
			for (const item of child) if (item && typeof item === "object" && "type" in item) collectHoistedVarBindings(item, tracked, out, false);
		} else if (child && typeof child === "object" && "type" in child) collectHoistedVarBindings(child, tracked, out, false);
	}
}
function collectProgramBindings(program, tracked) {
	const bindings = /* @__PURE__ */ new Set();
	for (const node of program.body) {
		if (t.isVariableDeclaration(node)) {
			for (const decl of node.declarations) addPatternBindingsIfTracked(decl.id, tracked, bindings);
			continue;
		}
		if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) {
			if (node.id && tracked.has(node.id.name)) bindings.add(node.id.name);
		}
	}
	return bindings;
}
function collectBlockBindings(block, tracked) {
	const bindings = /* @__PURE__ */ new Set();
	for (const node of block.body) {
		if (t.isVariableDeclaration(node) && node.kind !== "var") {
			for (const decl of node.declarations) addPatternBindingsIfTracked(decl.id, tracked, bindings);
			continue;
		}
		if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) {
			if (node.id && tracked.has(node.id.name)) bindings.add(node.id.name);
		}
	}
	return bindings;
}
function collectFunctionBindings(fn, tracked) {
	const bindings = /* @__PURE__ */ new Set();
	if ((t.isFunctionDeclaration(fn) || t.isFunctionExpression(fn)) && fn.id && tracked.has(fn.id.name)) bindings.add(fn.id.name);
	for (const param of fn.params) addPatternBindingsIfTracked(param, tracked, bindings);
	if (t.isBlockStatement(fn.body)) collectHoistedVarBindings(fn.body, tracked, bindings);
	return bindings;
}
function isShadowedByScope(name, scopeStack) {
	for (let i = scopeStack.length - 1; i >= 0; i--) if (scopeStack[i]?.has(name)) return true;
	return false;
}
function isBindingIdentifierInParent(node, parent) {
	if (!parent) return false;
	if (t.isImportSpecifier(parent) || t.isImportDefaultSpecifier(parent)) return parent.local === node;
	if (t.isImportNamespaceSpecifier(parent)) return parent.local === node;
	if (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent)) return parent.id === node || parent.params.includes(node);
	if (t.isArrowFunctionExpression(parent)) return parent.params.includes(node);
	if (t.isClassDeclaration(parent) || t.isClassExpression(parent)) return parent.id === node;
	if (t.isVariableDeclarator(parent)) return parent.id === node;
	if (t.isCatchClause(parent)) return parent.param === node;
	return false;
}
function isInsideCompilerSafeBoundaryNodes(parents, envType) {
	for (let i = parents.length - 1; i >= 0; i--) {
		const node = parents[i];
		if (!t.isFunction(node)) continue;
		const call = parents[i - 1];
		if (call && t.isCallExpression(call) && isCompilerSafeBoundaryCall(call, node, envType)) return true;
	}
	return false;
}
function findUsagePosInAnalysis(result, source, envType) {
	const analysis = getOrCreateImportAnalysis(result);
	const cacheKey = `${envType ?? "post"}::${source}`;
	if (analysis.usageByKey.has(cacheKey)) return analysis.usageByKey.get(cacheKey) ?? void 0;
	const imported = analysis.importBindingsBySource.get(source)?.importedLocalNames;
	if (!imported || imported.size === 0) {
		analysis.usageByKey.set(cacheKey, null);
		return;
	}
	let preferred;
	let anyUsage;
	const visit = (node, ctx) => {
		if (preferred && anyUsage) return;
		if (t.isProgram(node)) {
			const nextCtx = {
				parents: [...ctx.parents, node],
				scopeStack: [...ctx.scopeStack, collectProgramBindings(node, imported)]
			};
			for (const child of node.body) visit(child, nextCtx);
			return;
		}
		if (t.isFunction(node)) {
			const functionCtx = {
				parents: [...ctx.parents, node],
				scopeStack: [...ctx.scopeStack, collectFunctionBindings(node, imported)]
			};
			visit(node.body, functionCtx);
			return;
		}
		if (t.isBlockStatement(node)) {
			const nextCtx = {
				parents: [...ctx.parents, node],
				scopeStack: [...ctx.scopeStack, collectBlockBindings(node, imported)]
			};
			for (const child of node.body) visit(child, nextCtx);
			return;
		}
		if (t.isCatchClause(node)) {
			const bindings = /* @__PURE__ */ new Set();
			if (node.param) addPatternBindingsIfTracked(node.param, imported, bindings);
			const nextCtx = {
				parents: [...ctx.parents, node],
				scopeStack: bindings.size ? [...ctx.scopeStack, bindings] : ctx.scopeStack
			};
			visit(node.body, nextCtx);
			return;
		}
		if (t.isForStatement(node) && t.isVariableDeclaration(node.init) && node.init.kind !== "var") {
			const bindings = /* @__PURE__ */ new Set();
			for (const decl of node.init.declarations) addPatternBindingsIfTracked(decl.id, imported, bindings);
			const nextCtx = {
				parents: [...ctx.parents, node],
				scopeStack: bindings.size ? [...ctx.scopeStack, bindings] : ctx.scopeStack
			};
			visit(node.init, nextCtx);
			if (node.test) visit(node.test, nextCtx);
			if (node.update) visit(node.update, nextCtx);
			visit(node.body, nextCtx);
			return;
		}
		if ((t.isForInStatement(node) || t.isForOfStatement(node)) && t.isVariableDeclaration(node.left) && node.left.kind !== "var") {
			const bindings = /* @__PURE__ */ new Set();
			for (const decl of node.left.declarations) addPatternBindingsIfTracked(decl.id, imported, bindings);
			const nextCtx = {
				parents: [...ctx.parents, node],
				scopeStack: bindings.size ? [...ctx.scopeStack, bindings] : ctx.scopeStack
			};
			visit(node.left, nextCtx);
			visit(node.right, nextCtx);
			visit(node.body, nextCtx);
			return;
		}
		const nextParents = [...ctx.parents, node];
		if (t.isIdentifier(node)) {
			const parent = ctx.parents[ctx.parents.length - 1];
			if (imported.has(node.name)) {
				if (!isBindingIdentifierInParent(node, parent)) {
					if (!(t.isObjectProperty(parent) && parent.key === node && !parent.computed && !parent.shorthand) && !(t.isObjectMethod(parent) && parent.key === node && !parent.computed) && !(t.isExportSpecifier(parent) && parent.exported === node) && !isShadowedByScope(node.name, ctx.scopeStack) && !(envType && isInsideCompilerSafeBoundaryNodes(ctx.parents, envType))) {
						const loc = node.loc?.start;
						if (loc) {
							const pos = {
								line: loc.line,
								column0: loc.column
							};
							if (t.isCallExpression(parent) && parent.callee === node || t.isNewExpression(parent) && parent.callee === node || (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) && parent.object === node) preferred ||= pos;
							else anyUsage ||= pos;
						}
					}
				}
			}
		}
		if (t.isImportDeclaration(node)) return;
		const keys = t.VISITOR_KEYS[node.type];
		if (!keys) return;
		for (const key of keys) {
			const child = node[key];
			if (Array.isArray(child)) {
				for (const item of child) if (item && typeof item === "object" && "type" in item) visit(item, {
					parents: nextParents,
					scopeStack: ctx.scopeStack
				});
			} else if (child && typeof child === "object" && "type" in child) visit(child, {
				parents: nextParents,
				scopeStack: ctx.scopeStack
			});
		}
	};
	visit(analysis.ast.program, {
		parents: [],
		scopeStack: []
	});
	const pos = preferred ?? anyUsage ?? null;
	analysis.usageByKey.set(cacheKey, pos);
	return pos ?? void 0;
}
function findPostCompileUsagePosFromResult(result, source) {
	return findUsagePosInAnalysis(result, source);
}
function findOriginalUnsafeUsagePosFromResult(result, source, envType) {
	return findUsagePosInAnalysis(result, source, envType);
}
//#endregion
export { findOriginalUnsafeUsagePosFromResult, findPostCompileUsagePosFromResult, getImportSources, getImportSourcesFromResult, getImportSpecifierLocationFromResult, getMockExportNamesBySource, getMockExportNamesBySourceFromResult, getNamedExports, getNamedExportsFromResult, isValidExportName };

//# sourceMappingURL=analysis.js.map