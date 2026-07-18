const require_runtime = require("../../_virtual/_rolldown/runtime.cjs");
const require_constants = require("../constants.cjs");
const require_select_adapter = require("../hmr/select-adapter.cjs");
const require_utils = require("../utils.cjs");
const require_framework_options = require("./framework-options.cjs");
let _tanstack_router_utils = require("@tanstack/router-utils");
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
let _babel_core = require("@babel/core");
_babel_core = require_runtime.__toESM(_babel_core, 1);
let _babel_template = require("@babel/template");
_babel_template = require_runtime.__toESM(_babel_template, 1);
//#region src/core/code-splitter/compilers.ts
function hashRouteHmrSignature(code) {
	let hash = 14695981039346656037n;
	for (let index = 0; index < code.length; index++) {
		hash ^= BigInt(code.charCodeAt(index));
		hash = BigInt.asUintN(64, hash * 1099511628211n);
	}
	return hash.toString(16).padStart(16, "0");
}
function getRouteHmrSignatureSource(ast, filename) {
	const signatureAst = _babel_types.cloneNode(ast, true);
	const localBindings = /* @__PURE__ */ new Set();
	for (const node of signatureAst.program.body) (0, _tanstack_router_utils.collectLocalBindingsFromStatement)(node, localBindings);
	const dependencyGraph = (0, _tanstack_router_utils.buildDependencyGraph)((0, _tanstack_router_utils.buildDeclarationMap)(signatureAst), localBindings);
	const keepBindings = new Set(["Route"]);
	(0, _tanstack_router_utils.expandTransitively)(keepBindings, dependencyGraph);
	(0, _tanstack_router_utils.retainModuleLevelDeclarations)(signatureAst, keepBindings);
	(0, _tanstack_router_utils.unwrapExportedDeclarations)(signatureAst);
	signatureAst.program.body = signatureAst.program.body.filter((statement) => !_babel_types.isImportDeclaration(statement));
	return (0, _tanstack_router_utils.generateFromAst)(signatureAst, {
		sourceMaps: false,
		sourceFileName: filename,
		filename
	}).code;
}
var SPLIT_NODES_CONFIG = new Map([
	["loader", {
		routeIdent: "loader",
		localImporterIdent: "$$splitLoaderImporter",
		splitStrategy: "lazyFn",
		localExporterIdent: "SplitLoader",
		exporterIdent: "loader"
	}],
	["component", {
		routeIdent: "component",
		localImporterIdent: "$$splitComponentImporter",
		splitStrategy: "lazyRouteComponent",
		localExporterIdent: "SplitComponent",
		exporterIdent: "component"
	}],
	["pendingComponent", {
		routeIdent: "pendingComponent",
		localImporterIdent: "$$splitPendingComponentImporter",
		splitStrategy: "lazyRouteComponent",
		localExporterIdent: "SplitPendingComponent",
		exporterIdent: "pendingComponent"
	}],
	["errorComponent", {
		routeIdent: "errorComponent",
		localImporterIdent: "$$splitErrorComponentImporter",
		splitStrategy: "lazyRouteComponent",
		localExporterIdent: "SplitErrorComponent",
		exporterIdent: "errorComponent"
	}],
	["notFoundComponent", {
		routeIdent: "notFoundComponent",
		localImporterIdent: "$$splitNotFoundComponentImporter",
		splitStrategy: "lazyRouteComponent",
		localExporterIdent: "SplitNotFoundComponent",
		exporterIdent: "notFoundComponent"
	}]
]);
var KNOWN_SPLIT_ROUTE_IDENTS = [...SPLIT_NODES_CONFIG.keys()];
function addSplitSearchParamToFilename(filename, grouping) {
	const [bareFilename] = filename.split("?");
	const params = new URLSearchParams();
	params.append(require_constants.tsrSplit, (0, _tanstack_router_utils.createIdentifier)(grouping));
	return `${bareFilename}?${params.toString()}`;
}
function removeSplitSearchParamFromFilename(filename) {
	const [bareFilename] = filename.split("?");
	return bareFilename;
}
function addSharedSearchParamToFilename(filename) {
	const [bareFilename] = filename.split("?");
	return `${bareFilename}?${require_constants.tsrShared}=1`;
}
var splittableCreateRouteFns = ["createFileRoute"];
var unsplittableCreateRouteFns = ["createRootRoute", "createRootRouteWithContext"];
var allCreateRouteFns = [...splittableCreateRouteFns, ...unsplittableCreateRouteFns];
/**
* Computes module-level bindings that are shared between split and non-split
* route properties. These bindings need to be extracted into a shared virtual
* module to avoid double-initialization.
*
* A binding is "shared" if it is referenced by at least one split property
* AND at least one non-split property. Only locally-declared module-level
* bindings are candidates (not imports — bundlers dedupe those).
*/
function computeSharedBindings(opts) {
	const ast = (0, _tanstack_router_utils.parseAst)(opts);
	const localModuleLevelBindings = /* @__PURE__ */ new Set();
	for (const node of ast.program.body) (0, _tanstack_router_utils.collectLocalBindingsFromStatement)(node, localModuleLevelBindings);
	localModuleLevelBindings.delete("Route");
	if (localModuleLevelBindings.size === 0) return /* @__PURE__ */ new Set();
	function findIndexForSplitNode(str) {
		return opts.codeSplitGroupings.findIndex((group) => group.includes(str));
	}
	let routeOptions;
	_babel_core.traverse(ast, { CallExpression(path) {
		if (!_babel_types.isIdentifier(path.node.callee)) return;
		if (!splittableCreateRouteFns.includes(path.node.callee.name)) return;
		if (_babel_types.isCallExpression(path.parentPath.node)) {
			const opts = resolveIdentifier(path, path.parentPath.node.arguments[0]);
			if (_babel_types.isObjectExpression(opts)) routeOptions = opts;
		} else if (_babel_types.isVariableDeclarator(path.parentPath.node)) {
			const caller = resolveIdentifier(path, path.parentPath.node.init);
			if (_babel_types.isCallExpression(caller)) {
				const opts = resolveIdentifier(path, caller.arguments[0]);
				if (_babel_types.isObjectExpression(opts)) routeOptions = opts;
			}
		}
	} });
	if (!routeOptions) return /* @__PURE__ */ new Set();
	const splitGroupsPresent = /* @__PURE__ */ new Set();
	let hasNonSplit = false;
	for (const prop of routeOptions.properties) {
		if (!_babel_types.isObjectProperty(prop)) continue;
		const key = require_utils.getObjectPropertyKeyName(prop);
		if (!key) continue;
		if (key === "codeSplitGroupings") continue;
		if (_babel_types.isIdentifier(prop.value) && prop.value.name === "undefined") continue;
		const groupIndex = findIndexForSplitNode(key);
		if (groupIndex === -1) hasNonSplit = true;
		else splitGroupsPresent.add(groupIndex);
	}
	if (!hasNonSplit && splitGroupsPresent.size < 2) return /* @__PURE__ */ new Set();
	const declMap = (0, _tanstack_router_utils.buildDeclarationMap)(ast);
	const depGraph = (0, _tanstack_router_utils.buildDependencyGraph)(declMap, localModuleLevelBindings);
	const allLocalBindings = new Set(localModuleLevelBindings);
	allLocalBindings.add("Route");
	const fullDepGraph = (0, _tanstack_router_utils.buildDependencyGraph)(declMap, allLocalBindings);
	const refsByGroup = /* @__PURE__ */ new Map();
	for (const prop of routeOptions.properties) {
		if (!_babel_types.isObjectProperty(prop)) continue;
		const key = require_utils.getObjectPropertyKeyName(prop);
		if (!key) continue;
		if (key === "codeSplitGroupings") continue;
		const groupIndex = findIndexForSplitNode(key);
		const directRefs = (0, _tanstack_router_utils.collectModuleLevelRefsFromNode)(prop.value, localModuleLevelBindings);
		const allRefs = new Set(directRefs);
		(0, _tanstack_router_utils.expandTransitively)(allRefs, depGraph);
		for (const ref of allRefs) {
			let groups = refsByGroup.get(ref);
			if (!groups) {
				groups = /* @__PURE__ */ new Set();
				refsByGroup.set(ref, groups);
			}
			groups.add(groupIndex);
		}
	}
	const shared = /* @__PURE__ */ new Set();
	for (const [name, groups] of refsByGroup) if (groups.size >= 2) shared.add(name);
	(0, _tanstack_router_utils.expandSharedDestructuredDeclarators)(ast, refsByGroup, shared);
	if (shared.size === 0) return shared;
	(0, _tanstack_router_utils.expandDestructuredDeclarations)(ast, shared);
	(0, _tanstack_router_utils.removeBindingsTransitivelyDependingOn)(shared, fullDepGraph, ["Route"]);
	return shared;
}
/**
* Find which shared bindings are user-exported in the original source.
* These need to be re-exported from the shared module.
*/
function findExportedSharedBindings(ast, sharedBindings) {
	const exported = /* @__PURE__ */ new Set();
	for (const stmt of ast.program.body) {
		if (!_babel_types.isExportNamedDeclaration(stmt) || !stmt.declaration) continue;
		if (_babel_types.isVariableDeclaration(stmt.declaration)) {
			for (const decl of stmt.declaration.declarations) for (const name of (0, _tanstack_router_utils.collectIdentifiersFromPattern)(decl.id)) if (sharedBindings.has(name)) exported.add(name);
		} else if (_babel_types.isFunctionDeclaration(stmt.declaration) && stmt.declaration.id) {
			if (sharedBindings.has(stmt.declaration.id.name)) exported.add(stmt.declaration.id.name);
		} else if (_babel_types.isClassDeclaration(stmt.declaration) && stmt.declaration.id) {
			if (sharedBindings.has(stmt.declaration.id.name)) exported.add(stmt.declaration.id.name);
		}
	}
	return exported;
}
/**
* Remove declarations of shared bindings from the AST.
* Handles both plain and exported declarations, including destructured patterns.
* Removes the entire statement if all bindings in it are shared.
*/
function removeSharedDeclarations(ast, sharedBindings) {
	ast.program.body = ast.program.body.filter((stmt) => {
		const decl = _babel_types.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
		if (_babel_types.isVariableDeclaration(decl)) {
			decl.declarations = decl.declarations.filter((declarator) => {
				return !(0, _tanstack_router_utils.collectIdentifiersFromPattern)(declarator.id).every((n) => sharedBindings.has(n));
			});
			if (decl.declarations.length === 0) return false;
		} else if (_babel_types.isFunctionDeclaration(decl) && decl.id) {
			if (sharedBindings.has(decl.id.name)) return false;
		} else if (_babel_types.isClassDeclaration(decl) && decl.id) {
			if (sharedBindings.has(decl.id.name)) return false;
		}
		return true;
	});
}
function compileCodeSplitReferenceRoute(opts) {
	const ast = (0, _tanstack_router_utils.parseAst)(opts);
	const refIdents = (0, _tanstack_router_utils.findReferencedIdentifiers)(ast);
	const knownExportedIdents = /* @__PURE__ */ new Set();
	function findIndexForSplitNode(str) {
		return opts.codeSplitGroupings.findIndex((group) => group.includes(str));
	}
	const frameworkOptions = require_framework_options.getFrameworkOptions(opts.targetFramework);
	const PACKAGE = frameworkOptions.package;
	const LAZY_ROUTE_COMPONENT_IDENT = frameworkOptions.idents.lazyRouteComponent;
	const LAZY_FN_IDENT = frameworkOptions.idents.lazyFn;
	const stableRouteOptionKeys = [...new Set((opts.compilerPlugins ?? []).flatMap((plugin) => plugin.getStableRouteOptionKeys?.() ?? []))];
	let createRouteFn;
	let modified = false;
	let hmrAdded = false;
	let sharedExportedNames;
	_babel_core.traverse(ast, { Program: { enter(programPath) {
		/**
		* If the component for the route is being imported from
		* another file, this is to track the path to that file
		* the path itself doesn't matter, we just need to keep
		* track of it so that we can remove it from the imports
		* list if it's not being used like:
		*
		* `import '../shared/imported'`
		*/
		const removableImportPaths = /* @__PURE__ */ new Set([]);
		programPath.traverse({ CallExpression: (path) => {
			if (!_babel_types.isIdentifier(path.node.callee)) return;
			if (!allCreateRouteFns.includes(path.node.callee.name)) return;
			createRouteFn = path.node.callee.name;
			function babelHandleReference(routeOptions) {
				const hasImportedOrDefinedIdentifier = (name) => {
					return programPath.scope.hasBinding(name);
				};
				const addRouteHmr = (insertionPath, routeOptions) => {
					if (!opts.addHmr || hmrAdded) return;
					opts.compilerPlugins?.forEach((plugin) => {
						if ((plugin.onAddHmr?.({
							programPath,
							callExpressionPath: path,
							insertionPath,
							routeOptions,
							createRouteFn,
							opts
						}))?.modified) modified = true;
					});
					modified = true;
					hmrAdded = true;
				};
				if (_babel_types.isObjectExpression(routeOptions)) {
					const insertionPath = path.getStatementParent() ?? path;
					opts.compilerPlugins?.forEach((plugin) => {
						if ((plugin.onRouteOptions?.({
							programPath,
							callExpressionPath: path,
							insertionPath,
							routeOptions,
							createRouteFn,
							opts
						}))?.modified) modified = true;
					});
					if (opts.deleteNodes && opts.deleteNodes.size > 0) routeOptions.properties = routeOptions.properties.filter((prop) => {
						if (_babel_types.isObjectProperty(prop)) {
							const key = require_utils.getObjectPropertyKeyName(prop);
							if (key && opts.deleteNodes.has(key)) {
								modified = true;
								return false;
							}
						}
						return true;
					});
					if (!splittableCreateRouteFns.includes(createRouteFn)) {
						opts.compilerPlugins?.forEach((plugin) => {
							if ((plugin.onUnsplittableRoute?.({
								programPath,
								callExpressionPath: path,
								insertionPath,
								routeOptions,
								createRouteFn,
								opts
							}))?.modified) modified = true;
						});
						addRouteHmr(insertionPath, routeOptions);
						return programPath.stop();
					}
					routeOptions.properties.forEach((prop) => {
						if (_babel_types.isObjectProperty(prop)) {
							const key = require_utils.getObjectPropertyKeyName(prop);
							if (key) {
								const codeSplitGroupingByKey = findIndexForSplitNode(key);
								if (codeSplitGroupingByKey === -1) return;
								const codeSplitGroup = [...new Set(opts.codeSplitGroupings[codeSplitGroupingByKey])];
								if (!SPLIT_NODES_CONFIG.has(key)) return;
								if (_babel_types.isBooleanLiteral(prop.value) || _babel_types.isNullLiteral(prop.value) || _babel_types.isIdentifier(prop.value) && prop.value.name === "undefined") return;
								const splitNodeMeta = SPLIT_NODES_CONFIG.get(key);
								const splitUrl = addSplitSearchParamToFilename(opts.filename, codeSplitGroup);
								if (splitNodeMeta.splitStrategy === "lazyRouteComponent") {
									const value = prop.value;
									let shouldSplit = true;
									if (_babel_types.isIdentifier(value)) {
										const existingImportPath = getImportSpecifierAndPathFromLocalName(programPath, value.name).path;
										if (existingImportPath) removableImportPaths.add(existingImportPath);
										const isExported = hasExport(ast, value);
										if (isExported) knownExportedIdents.add(value.name);
										shouldSplit = !isExported;
										if (shouldSplit) removeIdentifierLiteral(path, value);
									}
									if (!shouldSplit) return;
									modified = true;
									if (!hasImportedOrDefinedIdentifier(LAZY_ROUTE_COMPONENT_IDENT)) programPath.unshiftContainer("body", [_babel_template.statement(`import { ${LAZY_ROUTE_COMPONENT_IDENT} } from '${PACKAGE}'`)()]);
									if (!hasImportedOrDefinedIdentifier(splitNodeMeta.localImporterIdent)) programPath.unshiftContainer("body", [_babel_template.statement(`const ${splitNodeMeta.localImporterIdent} = () => import('${splitUrl}')`)()]);
									const insertionPath = path.getStatementParent() ?? path;
									let splitPropValue;
									for (const plugin of opts.compilerPlugins ?? []) {
										const pluginPropValue = plugin.onSplitRouteProperty?.({
											programPath,
											callExpressionPath: path,
											insertionPath,
											routeOptions,
											prop,
											splitNodeMeta,
											lazyRouteComponentIdent: LAZY_ROUTE_COMPONENT_IDENT,
											opts
										});
										if (!pluginPropValue) continue;
										modified = true;
										splitPropValue = pluginPropValue;
										break;
									}
									if (splitPropValue) prop.value = splitPropValue;
									else prop.value = _babel_template.expression(`${LAZY_ROUTE_COMPONENT_IDENT}(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`)();
									addRouteHmr(insertionPath, routeOptions);
								} else {
									const value = prop.value;
									let shouldSplit = true;
									if (_babel_types.isIdentifier(value)) {
										const existingImportPath = getImportSpecifierAndPathFromLocalName(programPath, value.name).path;
										if (existingImportPath) removableImportPaths.add(existingImportPath);
										const isExported = hasExport(ast, value);
										if (isExported) knownExportedIdents.add(value.name);
										shouldSplit = !isExported;
										if (shouldSplit) removeIdentifierLiteral(path, value);
									}
									if (!shouldSplit) return;
									modified = true;
									if (!hasImportedOrDefinedIdentifier(LAZY_FN_IDENT)) programPath.unshiftContainer("body", _babel_template.smart(`import { ${LAZY_FN_IDENT} } from '${PACKAGE}'`)());
									if (!hasImportedOrDefinedIdentifier(splitNodeMeta.localImporterIdent)) programPath.unshiftContainer("body", [_babel_template.statement(`const ${splitNodeMeta.localImporterIdent} = () => import('${splitUrl}')`)()]);
									prop.value = _babel_template.expression(`${LAZY_FN_IDENT}(${splitNodeMeta.localImporterIdent}, '${splitNodeMeta.exporterIdent}')`)();
								}
							}
						}
						programPath.scope.crawl();
					});
					addRouteHmr(insertionPath, routeOptions);
				}
			}
			if (_babel_types.isCallExpression(path.parentPath.node)) babelHandleReference(resolveIdentifier(path, path.parentPath.node.arguments[0]));
			else if (_babel_types.isVariableDeclarator(path.parentPath.node)) {
				const caller = resolveIdentifier(path, path.parentPath.node.init);
				if (_babel_types.isCallExpression(caller)) babelHandleReference(resolveIdentifier(path, caller.arguments[0]));
			}
		} });
		/**
		* If the component for the route is being imported,
		* and it's not being used, remove the import statement
		* from the program, by checking that the import has no
		* specifiers
		*/
		if (removableImportPaths.size > 0) {
			modified = true;
			programPath.traverse({ ImportDeclaration(path) {
				if (path.node.specifiers.length > 0) return;
				if (removableImportPaths.has(path.node.source.value)) path.remove();
			} });
		}
		if (opts.sharedBindings && opts.sharedBindings.size > 0) {
			sharedExportedNames = findExportedSharedBindings(ast, opts.sharedBindings);
			removeSharedDeclarations(ast, opts.sharedBindings);
			const sharedModuleUrl = addSharedSearchParamToFilename(opts.filename);
			const sharedImportSpecifiers = [...opts.sharedBindings].map((name) => _babel_types.importSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
			const [sharedImportPath] = programPath.unshiftContainer("body", _babel_types.importDeclaration(sharedImportSpecifiers, _babel_types.stringLiteral(sharedModuleUrl)));
			sharedImportPath.traverse({ Identifier(identPath) {
				if (identPath.parentPath.isImportSpecifier() && identPath.key === "local") refIdents.add(identPath);
			} });
			if (sharedExportedNames.size > 0) {
				const reExportSpecifiers = [...sharedExportedNames].map((name) => _babel_types.exportSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
				programPath.pushContainer("body", _babel_types.exportNamedDeclaration(null, reExportSpecifiers, _babel_types.stringLiteral(sharedModuleUrl)));
			}
		}
	} } });
	if (!modified) return null;
	(0, _tanstack_router_utils.deadCodeElimination)(ast, refIdents);
	if (knownExportedIdents.size > 0) {
		const warningMessage = createNotExportableMessage(opts.filename, knownExportedIdents);
		console.warn(warningMessage);
		if (process.env.NODE_ENV !== "production") {
			const warningTemplate = _babel_template.statement(`console.warn(${JSON.stringify(warningMessage)})`)();
			ast.program.body.unshift(warningTemplate);
		}
	}
	if (hmrAdded) {
		const signatureSource = getRouteHmrSignatureSource(ast, opts.filename);
		ast.program.body.push(...require_select_adapter.createRouteHmrStatement(stableRouteOptionKeys, {
			hmrStyle: opts.hmrStyle ?? "vite",
			targetFramework: opts.targetFramework,
			routeId: opts.hmrRouteId,
			routeSignature: hashRouteHmrSignature(signatureSource)
		}));
	}
	const result = (0, _tanstack_router_utils.generateFromAst)(ast, {
		sourceMaps: true,
		sourceFileName: opts.filename,
		filename: opts.filename
	});
	if (result.map) result.map.sourcesContent = [opts.code];
	return result;
}
function compileCodeSplitVirtualRoute(opts) {
	const ast = (0, _tanstack_router_utils.parseAst)(opts);
	const refIdents = (0, _tanstack_router_utils.findReferencedIdentifiers)(ast);
	if (opts.sharedBindings && opts.sharedBindings.size > 0) removeSharedDeclarations(ast, opts.sharedBindings);
	const intendedSplitNodes = new Set(opts.splitTargets);
	const knownExportedIdents = /* @__PURE__ */ new Set();
	_babel_core.traverse(ast, { Program: { enter(programPath) {
		const trackedNodesToSplitByType = {
			component: void 0,
			loader: void 0,
			pendingComponent: void 0,
			errorComponent: void 0,
			notFoundComponent: void 0
		};
		programPath.traverse({ CallExpression: (path) => {
			if (!_babel_types.isIdentifier(path.node.callee)) return;
			if (!splittableCreateRouteFns.includes(path.node.callee.name)) return;
			function babelHandleVirtual(options) {
				if (_babel_types.isObjectExpression(options)) {
					options.properties.forEach((prop) => {
						if (_babel_types.isObjectProperty(prop)) KNOWN_SPLIT_ROUTE_IDENTS.forEach((splitType) => {
							if (require_utils.getObjectPropertyKeyName(prop) !== splitType) return;
							const value = prop.value;
							if (_babel_types.isIdentifier(value) && value.name === "undefined") return;
							let isExported = false;
							if (_babel_types.isIdentifier(value)) {
								isExported = hasExport(ast, value);
								if (isExported) knownExportedIdents.add(value.name);
							}
							if (isExported && _babel_types.isIdentifier(value)) removeExports(ast, value);
							else {
								const meta = SPLIT_NODES_CONFIG.get(splitType);
								trackedNodesToSplitByType[splitType] = {
									node: prop.value,
									meta
								};
							}
						});
					});
					options.properties = [];
				}
			}
			if (_babel_types.isCallExpression(path.parentPath.node)) babelHandleVirtual(resolveIdentifier(path, path.parentPath.node.arguments[0]));
			else if (_babel_types.isVariableDeclarator(path.parentPath.node)) {
				const caller = resolveIdentifier(path, path.parentPath.node.init);
				if (_babel_types.isCallExpression(caller)) babelHandleVirtual(resolveIdentifier(path, caller.arguments[0]));
			}
		} });
		intendedSplitNodes.forEach((SPLIT_TYPE) => {
			const splitKey = trackedNodesToSplitByType[SPLIT_TYPE];
			if (!splitKey) return;
			let splitNode = splitKey.node;
			const splitMeta = {
				...splitKey.meta,
				shouldRemoveNode: true
			};
			let originalIdentName;
			if (_babel_types.isIdentifier(splitNode)) originalIdentName = splitNode.name;
			while (_babel_types.isIdentifier(splitNode)) splitNode = programPath.scope.getBinding(splitNode.name)?.path.node;
			if (splitNode) if (_babel_types.isFunctionDeclaration(splitNode)) {
				if (!splitNode.id) throw new Error(`Function declaration for "${SPLIT_TYPE}" must have an identifier.`);
				splitMeta.shouldRemoveNode = false;
				splitMeta.localExporterIdent = splitNode.id.name;
			} else if (_babel_types.isFunctionExpression(splitNode) || _babel_types.isArrowFunctionExpression(splitNode)) programPath.pushContainer("body", _babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(_babel_types.identifier(splitMeta.localExporterIdent), splitNode)]));
			else if (_babel_types.isImportSpecifier(splitNode) || _babel_types.isImportDefaultSpecifier(splitNode)) programPath.pushContainer("body", _babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(_babel_types.identifier(splitMeta.localExporterIdent), splitNode.local)]));
			else if (_babel_types.isVariableDeclarator(splitNode)) if (_babel_types.isIdentifier(splitNode.id)) {
				splitMeta.localExporterIdent = splitNode.id.name;
				splitMeta.shouldRemoveNode = false;
			} else if (_babel_types.isObjectPattern(splitNode.id)) {
				if (originalIdentName) splitMeta.localExporterIdent = originalIdentName;
				splitMeta.shouldRemoveNode = false;
			} else throw new Error(`Unexpected splitNode type ☝️: ${splitNode.type}`);
			else if (_babel_types.isCallExpression(splitNode)) {
				const outputSplitNodeCode = (0, _tanstack_router_utils.generateFromAst)(splitNode).code;
				const splitNodeAst = _babel_core.parse(outputSplitNodeCode);
				if (!splitNodeAst) throw new Error(`Failed to parse the generated code for "${SPLIT_TYPE}" in the node type "${splitNode.type}"`);
				const statement = splitNodeAst.program.body[0];
				if (!statement) throw new Error(`Failed to parse the generated code for "${SPLIT_TYPE}" in the node type "${splitNode.type}" as no statement was found in the program body`);
				if (_babel_types.isExpressionStatement(statement)) {
					const expression = statement.expression;
					programPath.pushContainer("body", _babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(_babel_types.identifier(splitMeta.localExporterIdent), expression)]));
				} else throw new Error(`Unexpected expression type encounter for "${SPLIT_TYPE}" in the node type "${splitNode.type}"`);
			} else if (_babel_types.isConditionalExpression(splitNode)) programPath.pushContainer("body", _babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(_babel_types.identifier(splitMeta.localExporterIdent), splitNode)]));
			else if (_babel_types.isTSAsExpression(splitNode)) {
				splitNode = splitNode.expression;
				programPath.pushContainer("body", _babel_types.variableDeclaration("const", [_babel_types.variableDeclarator(_babel_types.identifier(splitMeta.localExporterIdent), splitNode)]));
			} else if (_babel_types.isBooleanLiteral(splitNode)) return;
			else if (_babel_types.isNullLiteral(splitNode)) return;
			else {
				console.info("Unexpected splitNode type:", splitNode);
				throw new Error(`Unexpected splitNode type ☝️: ${splitNode.type}`);
			}
			if (splitMeta.shouldRemoveNode) programPath.node.body = programPath.node.body.filter((node) => {
				return node !== splitNode;
			});
			for (const plugin of opts.compilerPlugins ?? []) {
				const pluginExporterIdent = plugin.onExportSplitRouteProperty?.({
					programPath,
					splitNodeMeta: splitMeta,
					localExporterIdent: splitMeta.localExporterIdent
				});
				if (pluginExporterIdent) splitMeta.localExporterIdent = pluginExporterIdent.name;
			}
			programPath.pushContainer("body", [_babel_types.exportNamedDeclaration(null, [_babel_types.exportSpecifier(_babel_types.identifier(splitMeta.localExporterIdent), _babel_types.identifier(splitMeta.exporterIdent))])]);
		});
		programPath.traverse({ ExportNamedDeclaration(path) {
			if (path.node.declaration) {
				if (_babel_types.isVariableDeclaration(path.node.declaration)) {
					const specifiers = path.node.declaration.declarations.flatMap((decl) => {
						if (_babel_types.isIdentifier(decl.id)) return [_babel_types.importSpecifier(_babel_types.identifier(decl.id.name), _babel_types.identifier(decl.id.name))];
						if (_babel_types.isObjectPattern(decl.id)) return (0, _tanstack_router_utils.collectIdentifiersFromPattern)(decl.id).map((name) => _babel_types.importSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
						if (_babel_types.isArrayPattern(decl.id)) return (0, _tanstack_router_utils.collectIdentifiersFromPattern)(decl.id).map((name) => _babel_types.importSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
						return [];
					});
					if (specifiers.length === 0) {
						path.remove();
						return;
					}
					const importDecl = _babel_types.importDeclaration(specifiers, _babel_types.stringLiteral(removeSplitSearchParamFromFilename(opts.filename)));
					path.replaceWith(importDecl);
					path.traverse({ Identifier(identPath) {
						if (identPath.parentPath.isImportSpecifier() && identPath.key === "local") refIdents.add(identPath);
					} });
				}
			}
		} });
		if (opts.sharedBindings && opts.sharedBindings.size > 0) {
			const sharedImportSpecifiers = [...opts.sharedBindings].map((name) => _babel_types.importSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
			const sharedModuleUrl = addSharedSearchParamToFilename(removeSplitSearchParamFromFilename(opts.filename));
			const [sharedImportPath] = programPath.unshiftContainer("body", _babel_types.importDeclaration(sharedImportSpecifiers, _babel_types.stringLiteral(sharedModuleUrl)));
			sharedImportPath.traverse({ Identifier(identPath) {
				if (identPath.parentPath.isImportSpecifier() && identPath.key === "local") refIdents.add(identPath);
			} });
		}
	} } });
	(0, _tanstack_router_utils.deadCodeElimination)(ast, refIdents);
	(0, _tanstack_router_utils.stripUnreferencedTopLevelExpressionStatements)(ast);
	if (ast.program.body.length === 0) ast.program.directives = [];
	const result = (0, _tanstack_router_utils.generateFromAst)(ast, {
		sourceMaps: true,
		sourceFileName: opts.filename,
		filename: opts.filename
	});
	if (result.map) result.map.sourcesContent = [opts.code];
	return result;
}
/**
* Compile the shared virtual module (`?tsr-shared=1`).
* Keeps only shared binding declarations, their transitive dependencies,
* and imports they need. Exports all shared bindings.
*/
function compileCodeSplitSharedRoute(opts) {
	const ast = (0, _tanstack_router_utils.parseAst)(opts);
	const refIdents = (0, _tanstack_router_utils.findReferencedIdentifiers)(ast);
	const localBindings = /* @__PURE__ */ new Set();
	for (const node of ast.program.body) (0, _tanstack_router_utils.collectLocalBindingsFromStatement)(node, localBindings);
	localBindings.delete("Route");
	const depGraph = (0, _tanstack_router_utils.buildDependencyGraph)((0, _tanstack_router_utils.buildDeclarationMap)(ast), localBindings);
	const keepBindings = new Set(opts.sharedBindings);
	keepBindings.delete("Route");
	(0, _tanstack_router_utils.expandTransitively)(keepBindings, depGraph);
	(0, _tanstack_router_utils.retainModuleLevelDeclarations)(ast, keepBindings);
	(0, _tanstack_router_utils.unwrapExportedDeclarations)(ast);
	const exportSpecifiers = [...opts.sharedBindings].sort((a, b) => a.localeCompare(b)).map((name) => _babel_types.exportSpecifier(_babel_types.identifier(name), _babel_types.identifier(name)));
	if (exportSpecifiers.length > 0) {
		const exportDecl = _babel_types.exportNamedDeclaration(null, exportSpecifiers);
		ast.program.body.push(exportDecl);
		_babel_core.traverse(ast, { Program(programPath) {
			const bodyPaths = programPath.get("body");
			const last = bodyPaths[bodyPaths.length - 1];
			if (last && last.isExportNamedDeclaration()) last.traverse({ Identifier(identPath) {
				if (identPath.parentPath.isExportSpecifier() && identPath.key === "local") refIdents.add(identPath);
			} });
			programPath.stop();
		} });
	}
	(0, _tanstack_router_utils.deadCodeElimination)(ast, refIdents);
	if (ast.program.body.length === 0) ast.program.directives = [];
	const result = (0, _tanstack_router_utils.generateFromAst)(ast, {
		sourceMaps: true,
		sourceFileName: opts.filename,
		filename: opts.filename
	});
	if (result.map) result.map.sourcesContent = [opts.code];
	return result;
}
/**
* This function should read get the options from by searching for the key `codeSplitGroupings`
* on createFileRoute and return it's values if it exists, else return undefined
*/
function detectCodeSplitGroupingsFromRoute(opts) {
	const ast = (0, _tanstack_router_utils.parseAst)(opts);
	let codeSplitGroupings = void 0;
	_babel_core.traverse(ast, { Program: { enter(programPath) {
		programPath.traverse({ CallExpression(path) {
			if (!_babel_types.isIdentifier(path.node.callee)) return;
			if (!(path.node.callee.name === "createRoute" || path.node.callee.name === "createFileRoute")) return;
			function babelHandleSplittingGroups(routeOptions) {
				if (_babel_types.isObjectExpression(routeOptions)) routeOptions.properties.forEach((prop) => {
					if (_babel_types.isObjectProperty(prop)) {
						if (require_utils.getObjectPropertyKeyName(prop) === "codeSplitGroupings") {
							const value = prop.value;
							if (_babel_types.isArrayExpression(value)) codeSplitGroupings = value.elements.map((group) => {
								if (_babel_types.isArrayExpression(group)) return group.elements.map((node) => {
									if (!_babel_types.isStringLiteral(node)) throw new Error("You must provide a string literal for the codeSplitGroupings");
									return node.value;
								});
								throw new Error("You must provide arrays with codeSplitGroupings options.");
							});
							else throw new Error("You must provide an array of arrays for the codeSplitGroupings.");
						}
					}
				});
			}
			if (_babel_types.isCallExpression(path.parentPath.node)) babelHandleSplittingGroups(resolveIdentifier(path, path.parentPath.node.arguments[0]));
			else if (_babel_types.isVariableDeclarator(path.parentPath.node)) {
				const caller = resolveIdentifier(path, path.parentPath.node.init);
				if (_babel_types.isCallExpression(caller)) babelHandleSplittingGroups(resolveIdentifier(path, caller.arguments[0]));
			}
		} });
	} } });
	return { groupings: codeSplitGroupings };
}
function createNotExportableMessage(filename, idents) {
	const list = Array.from(idents).map((d) => `- ${d}`);
	return [
		`[tanstack-router] These exports from "${filename}" will not be code-split and will increase your bundle size:`,
		...list,
		"For the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file."
	].join("\n");
}
function getImportSpecifierAndPathFromLocalName(programPath, name) {
	let specifier = null;
	let path = null;
	programPath.traverse({ ImportDeclaration(importPath) {
		const found = importPath.node.specifiers.find((targetSpecifier) => targetSpecifier.local.name === name);
		if (found) {
			specifier = found;
			path = importPath.node.source.value;
		}
	} });
	return {
		specifier,
		path
	};
}
function resolveIdentifier(path, node) {
	if (_babel_types.isIdentifier(node)) {
		const binding = path.scope.getBinding(node.name);
		if (binding) {
			const declarator = binding.path.node;
			if (_babel_types.isObjectExpression(declarator.init)) return declarator.init;
			else if (_babel_types.isFunctionDeclaration(declarator.init)) return declarator.init;
		}
		return;
	}
	return node;
}
function removeIdentifierLiteral(path, node) {
	const binding = path.scope.getBinding(node.name);
	if (binding) {
		if (_babel_types.isVariableDeclarator(binding.path.node) && _babel_types.isObjectPattern(binding.path.node.id)) {
			const objectPattern = binding.path.node.id;
			objectPattern.properties = objectPattern.properties.filter((prop) => {
				if (!_babel_types.isObjectProperty(prop)) return true;
				if (_babel_types.isIdentifier(prop.value) && prop.value.name === node.name) return false;
				if (_babel_types.isAssignmentPattern(prop.value) && _babel_types.isIdentifier(prop.value.left) && prop.value.left.name === node.name) return false;
				return true;
			});
			if (objectPattern.properties.length === 0) binding.path.remove();
			return;
		}
		binding.path.remove();
	}
}
function hasExport(ast, node) {
	let found = false;
	_babel_core.traverse(ast, {
		ExportNamedDeclaration(path) {
			if (path.node.declaration) {
				if (_babel_types.isVariableDeclaration(path.node.declaration)) path.node.declaration.declarations.forEach((decl) => {
					if (_babel_types.isVariableDeclarator(decl)) {
						if (_babel_types.isIdentifier(decl.id)) {
							if (decl.id.name === node.name) found = true;
						} else if (_babel_types.isObjectPattern(decl.id) || _babel_types.isArrayPattern(decl.id)) {
							if ((0, _tanstack_router_utils.collectIdentifiersFromPattern)(decl.id).includes(node.name)) found = true;
						}
					}
				});
				if (_babel_types.isFunctionDeclaration(path.node.declaration)) {
					if (_babel_types.isIdentifier(path.node.declaration.id)) {
						if (path.node.declaration.id.name === node.name) found = true;
					}
				}
			}
		},
		ExportDefaultDeclaration(path) {
			if (_babel_types.isIdentifier(path.node.declaration)) {
				if (path.node.declaration.name === node.name) found = true;
			}
			if (_babel_types.isFunctionDeclaration(path.node.declaration)) {
				if (_babel_types.isIdentifier(path.node.declaration.id)) {
					if (path.node.declaration.id.name === node.name) found = true;
				}
			}
		}
	});
	return found;
}
function removeExports(ast, node) {
	let removed = false;
	_babel_core.traverse(ast, {
		ExportNamedDeclaration(path) {
			if (path.node.declaration) {
				if (_babel_types.isVariableDeclaration(path.node.declaration)) path.node.declaration.declarations.forEach((decl) => {
					if (_babel_types.isVariableDeclarator(decl)) {
						if (_babel_types.isIdentifier(decl.id)) {
							if (decl.id.name === node.name) {
								path.remove();
								removed = true;
							}
						} else if (_babel_types.isObjectPattern(decl.id) || _babel_types.isArrayPattern(decl.id)) {
							if ((0, _tanstack_router_utils.collectIdentifiersFromPattern)(decl.id).includes(node.name)) {
								path.remove();
								removed = true;
							}
						}
					}
				});
				else if (_babel_types.isFunctionDeclaration(path.node.declaration)) {
					if (_babel_types.isIdentifier(path.node.declaration.id)) {
						if (path.node.declaration.id.name === node.name) {
							path.remove();
							removed = true;
						}
					}
				}
			}
		},
		ExportDefaultDeclaration(path) {
			if (_babel_types.isIdentifier(path.node.declaration)) {
				if (path.node.declaration.name === node.name) {
					path.remove();
					removed = true;
				}
			} else if (_babel_types.isFunctionDeclaration(path.node.declaration)) {
				if (_babel_types.isIdentifier(path.node.declaration.id)) {
					if (path.node.declaration.id.name === node.name) {
						path.remove();
						removed = true;
					}
				}
			}
		}
	});
	return removed;
}
//#endregion
exports.compileCodeSplitReferenceRoute = compileCodeSplitReferenceRoute;
exports.compileCodeSplitSharedRoute = compileCodeSplitSharedRoute;
exports.compileCodeSplitVirtualRoute = compileCodeSplitVirtualRoute;
exports.computeSharedBindings = computeSharedBindings;
exports.detectCodeSplitGroupingsFromRoute = detectCodeSplitGroupingsFromRoute;

//# sourceMappingURL=compilers.cjs.map