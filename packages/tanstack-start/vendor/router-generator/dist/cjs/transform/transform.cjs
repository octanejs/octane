const require_runtime = require("../_virtual/_rolldown/runtime.cjs");
let magic_string = require("magic-string");
magic_string = require_runtime.__toESM(magic_string, 1);
let _babel_types = require("@babel/types");
_babel_types = require_runtime.__toESM(_babel_types, 1);
let _tanstack_router_utils = require("@tanstack/router-utils");
//#region src/transform/transform.ts
var routeConstructors = ["createFileRoute", "createLazyFileRoute"];
function transform({ ctx, source, parseSource, filename, node }) {
	if (parseSource !== void 0 && parseSource.length !== source.length) return {
		result: "error",
		error: /* @__PURE__ */ new Error(`expected parseSource for ${filename ?? ctx.routeId} to preserve the original source length`)
	};
	let ast;
	try {
		ast = (0, _tanstack_router_utils.parseAst)({
			code: parseSource ?? source,
			filename
		});
	} catch (error) {
		return {
			result: "error",
			error
		};
	}
	const exportedRouteNames = getExportedRouteNames(ast.program.body);
	if (exportedRouteNames.size === 0) return { result: "no-route-export" };
	const { calls: routeCalls, hasUnsupportedRouteId, hasMalformedRouteCall } = findExportedRouteCalls(ast.program.body, exportedRouteNames);
	if (routeCalls.length === 0 && hasMalformedRouteCall) return {
		result: "error",
		error: /* @__PURE__ */ new Error(`expected Route export in ${ctx.routeId} to use createFileRoute('/path')({...}) or createLazyFileRoute('/path')({...})`)
	};
	if (routeCalls.length === 0 && hasUnsupportedRouteId) return {
		result: "error",
		error: /* @__PURE__ */ new Error(`expected route id to be a string literal or plain template literal in ${ctx.routeId}`)
	};
	if (routeCalls.length === 0) return { result: "not-modified" };
	if (routeCalls.length > 1) return {
		result: "error",
		error: /* @__PURE__ */ new Error(`expected exactly one createFileRoute/createLazyFileRoute call in ${ctx.routeId}`)
	};
	const routeCall = routeCalls[0];
	const routeIdQuote = getRouteIdQuote(source, routeCall.routeIdArg);
	const createFileRouteProps = getCreateFileRouteProps(routeCall.optionsArg);
	if (createFileRouteProps) node.createFileRouteProps = createFileRouteProps;
	const expectedCallee = getExpectedRouteConstructor(ctx.lazy);
	const expectedRouteId = `${routeIdQuote}${ctx.routeId}${routeIdQuote}`;
	const currentRouteId = source.slice(routeCall.routeIdArg.start, routeCall.routeIdArg.end);
	const targetModule = `@tanstack/${ctx.target}-router`;
	const imports = parseTargetImports(ast.program.body, source, targetModule);
	const s = new magic_string.default(source);
	let modified = false;
	if (routeCall.callee.name !== expectedCallee) {
		s.update(routeCall.callee.start, routeCall.callee.end, expectedCallee);
		modified = true;
	}
	if (currentRouteId !== expectedRouteId) {
		s.update(routeCall.routeIdArg.start, routeCall.routeIdArg.end, expectedRouteId);
		modified = true;
	}
	if (updateRouteImports({
		imports,
		source,
		s,
		targetModule,
		required: expectedCallee,
		lineEnding: getLineEnding(source)
	})) modified = true;
	if (!modified) return { result: "not-modified" };
	return {
		result: "modified",
		output: s.toString()
	};
}
function getExportedRouteNames(body) {
	const exportedRouteNames = /* @__PURE__ */ new Set();
	for (const statement of body) {
		if (!_babel_types.isExportNamedDeclaration(statement) || statement.source) continue;
		if (_babel_types.isVariableDeclaration(statement.declaration)) {
			for (const declarator of statement.declaration.declarations) if (_babel_types.isIdentifier(declarator.id) && declarator.id.name === "Route") exportedRouteNames.add("Route");
		}
		for (const specifier of statement.specifiers) {
			if (!_babel_types.isExportSpecifier(specifier) || getExportedName(specifier.exported) !== "Route") continue;
			const localName = getLocalBindingName(specifier.local);
			if (localName) exportedRouteNames.add(localName);
		}
	}
	return exportedRouteNames;
}
function findExportedRouteCalls(body, exportedRouteNames) {
	const calls = [];
	let hasUnsupportedRouteId = false;
	let hasMalformedRouteCall = false;
	for (const statement of body) {
		const declaration = getVariableDeclaration(statement);
		if (!declaration) continue;
		for (const declarator of declaration.declarations) {
			if (!_babel_types.isIdentifier(declarator.id) || !exportedRouteNames.has(declarator.id.name)) continue;
			const init = getRouteConstructorInit(declarator.init);
			if (!init) {
				if (isDirectRouteConstructorCall(declarator.init)) hasMalformedRouteCall = true;
				continue;
			}
			const routeIdArg = init.innerCall.arguments[0];
			if (isSupportedRouteId(routeIdArg)) calls.push({
				callee: init.callee,
				routeIdArg,
				optionsArg: init.outerCall.arguments[0]
			});
			else hasUnsupportedRouteId = true;
		}
	}
	return {
		calls,
		hasUnsupportedRouteId,
		hasMalformedRouteCall
	};
}
function getVariableDeclaration(statement) {
	const declaration = _babel_types.isExportNamedDeclaration(statement) ? statement.declaration : statement;
	return _babel_types.isVariableDeclaration(declaration) ? declaration : null;
}
function getExportedName(node) {
	return _babel_types.isIdentifier(node) ? node.name : node.value;
}
function getLocalBindingName(node) {
	return _babel_types.isIdentifier(node) ? node.name : null;
}
function getRouteConstructorInit(expression) {
	if (!expression || !_babel_types.isCallExpression(expression)) return null;
	if (!_babel_types.isCallExpression(expression.callee)) return null;
	const innerCall = expression.callee;
	if (!_babel_types.isIdentifier(innerCall.callee) || !isRouteConstructor(innerCall.callee)) return null;
	return {
		callee: innerCall.callee,
		outerCall: expression,
		innerCall
	};
}
function isDirectRouteConstructorCall(expression) {
	return !!expression && _babel_types.isCallExpression(expression) && _babel_types.isIdentifier(expression.callee) && isRouteConstructor(expression.callee);
}
function isRouteConstructor(callee) {
	return routeConstructors.includes(callee.name);
}
function isSupportedRouteId(arg) {
	return !!arg && (_babel_types.isStringLiteral(arg) || _babel_types.isTemplateLiteral(arg) && arg.expressions.length === 0);
}
function getRouteIdQuote(source, arg) {
	const raw = source.slice(arg.start, arg.end);
	if (raw.startsWith("'")) return "'";
	if (raw.startsWith("\"")) return "\"";
	return "`";
}
function getCreateFileRouteProps(arg) {
	if (!arg || !_babel_types.isObjectExpression(arg)) return;
	const props = /* @__PURE__ */ new Set();
	for (const property of arg.properties) {
		if (!_babel_types.isObjectProperty(property) || property.computed) continue;
		if (_babel_types.isIdentifier(property.key)) {
			props.add(property.key.name);
			continue;
		}
		if (_babel_types.isStringLiteral(property.key)) props.add(property.key.value);
	}
	return props;
}
function parseTargetImports(body, source, targetModule) {
	const imports = [];
	for (const statement of body) {
		if (!_babel_types.isImportDeclaration(statement) || statement.importKind === "type" || statement.source.value !== targetModule) continue;
		const rawSource = source.slice(statement.source.start, statement.source.end);
		const importStatement = source.slice(statement.start, statement.end);
		imports.push({
			declaration: statement,
			defaultImport: statement.specifiers.find((specifier) => _babel_types.isImportDefaultSpecifier(specifier))?.local.name,
			namespace: statement.specifiers.find((specifier) => _babel_types.isImportNamespaceSpecifier(specifier))?.local.name,
			named: statement.specifiers.filter((specifier) => _babel_types.isImportSpecifier(specifier)).map((specifier) => ({
				imported: _babel_types.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value,
				local: specifier.local.name,
				importKind: specifier.importKind ?? void 0
			})),
			moduleName: statement.source.value,
			quote: rawSource[0],
			semicolon: importStatement.trimEnd().endsWith(";")
		});
	}
	return imports;
}
function updateRouteImports({ imports, source, s, targetModule, required, lineEnding }) {
	const analysis = analyzeRouteImports(imports, required);
	if (analysis.kind === "ok") return false;
	if (analysis.kind === "rename") {
		s.update(analysis.imported.start, analysis.imported.end, analysis.next);
		s.update(analysis.local.start, analysis.local.end, analysis.next);
		return true;
	}
	return normalizeRouteImports({
		imports,
		source,
		s,
		targetModule,
		required,
		lineEnding
	});
}
function analyzeRouteImports(imports, required) {
	const opposite = getOtherRouteConstructor(required);
	let requiredCount = 0;
	let oppositeCount = 0;
	let renameCandidate;
	for (const declaration of imports) for (const specifier of declaration.declaration.specifiers) {
		if (!_babel_types.isImportSpecifier(specifier)) continue;
		const imported = specifier.imported;
		if (!_babel_types.isIdentifier(imported)) return { kind: "normalize" };
		if (!isRouteConstructorName(imported.name)) continue;
		if (specifier.local.name !== imported.name) return { kind: "normalize" };
		if (imported.name === required) {
			requiredCount++;
			continue;
		}
		if (imported.name === opposite) {
			oppositeCount++;
			renameCandidate = {
				imported,
				local: specifier.local,
				next: required
			};
		}
	}
	if (requiredCount === 1 && oppositeCount === 0) return { kind: "ok" };
	if (requiredCount === 0 && oppositeCount === 1 && renameCandidate) return {
		kind: "rename",
		...renameCandidate
	};
	return { kind: "normalize" };
}
function normalizeRouteImports({ imports, source, s, targetModule, required, lineEnding }) {
	const owner = imports.find((declaration) => hasNamedImport(declaration.named, required)) ?? imports.find((declaration) => !declaration.namespace);
	let modified = false;
	for (const declaration of imports) {
		const named = normalizeNamedImports({
			named: declaration.named,
			required,
			isOwner: declaration === owner
		});
		if (sameNamedImports(declaration.named, named)) continue;
		const replacement = renderImportDeclaration({
			...declaration,
			named
		});
		if (replacement === null) {
			s.remove(declaration.declaration.start, getRemovalEnd(source, declaration.declaration.end));
			modified = true;
			continue;
		}
		s.update(declaration.declaration.start, declaration.declaration.end, replacement);
		modified = true;
	}
	if (!owner) {
		const quote = imports[0]?.quote ?? "'";
		const semicolon = imports[0]?.semicolon ?? false;
		s.prepend(`import { ${required} } from ${quote}${targetModule}${quote}${semicolon ? ";" : ""}${lineEnding}`);
		modified = true;
	}
	return modified;
}
function normalizeNamedImports({ named, required, isOwner }) {
	const banned = getOtherRouteConstructor(required);
	const nextNamed = [];
	const seen = /* @__PURE__ */ new Set();
	for (const specifier of named) {
		if (specifier.imported === banned) continue;
		if (specifier.local === required && (specifier.imported !== required || !isOwner)) continue;
		const key = `${specifier.importKind ?? "value"}:${specifier.imported}:${specifier.local}`;
		if (seen.has(key)) continue;
		seen.add(key);
		nextNamed.push(specifier);
	}
	if (isOwner && !hasNamedImport(nextNamed, required)) nextNamed.push({
		imported: required,
		local: required
	});
	return nextNamed;
}
function getExpectedRouteConstructor(lazy) {
	return lazy ? "createLazyFileRoute" : "createFileRoute";
}
function getOtherRouteConstructor(constructor) {
	return constructor === "createFileRoute" ? "createLazyFileRoute" : "createFileRoute";
}
function hasNamedImport(named, required) {
	return named.some((specifier) => specifier.imported === required && specifier.local === required && specifier.importKind !== "type");
}
function sameNamedImports(left, right) {
	return left.length === right.length && left.every((specifier, index) => specifier.imported === right[index].imported && specifier.local === right[index].local && specifier.importKind === right[index].importKind);
}
function isRouteConstructorName(value) {
	return routeConstructors.includes(value);
}
function renderImportDeclaration(importDeclaration) {
	const parts = [];
	if (importDeclaration.defaultImport) parts.push(importDeclaration.defaultImport);
	if (importDeclaration.namespace) parts.push(`* as ${importDeclaration.namespace}`);
	if (importDeclaration.named.length > 0) parts.push(`{ ${importDeclaration.named.map((specifier) => `${specifier.importKind === "type" ? "type " : ""}${specifier.imported === specifier.local ? specifier.imported : `${specifier.imported} as ${specifier.local}`}`).join(", ")} }`);
	if (parts.length === 0) return null;
	return `import ${parts.join(", ")} from ${importDeclaration.quote}${importDeclaration.moduleName}${importDeclaration.quote}${importDeclaration.semicolon ? ";" : ""}`;
}
function getLineEnding(source) {
	if (source.includes("\r\n")) return "\r\n";
	if (source.includes("\n")) return "\n";
	if (source.includes("\r")) return "\r";
	return "\n";
}
function getRemovalEnd(source, end) {
	let pos = end;
	while (pos < source.length && (source[pos] === " " || source[pos] === "	")) pos++;
	if (source[pos] === "\r" && source[pos + 1] === "\n") return pos + 2;
	if (source[pos] === "\n" || source[pos] === "\r") return pos + 1;
	return end;
}
//#endregion
exports.transform = transform;

//# sourceMappingURL=transform.cjs.map