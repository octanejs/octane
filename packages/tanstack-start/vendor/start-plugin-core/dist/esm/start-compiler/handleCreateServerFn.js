import { cleanId, codeFrameError, stripMethodCall } from "./utils.js";
import { hasKeys } from "@tanstack/router-core";
import path from "pathe";
import * as t from "@babel/types";
import { getVariableDeclaratorForExpressionPath } from "@tanstack/router-utils";
import babel from "@babel/core";
//#region src/start-compiler/handleCreateServerFn.ts
var TSS_SERVERFN_SPLIT_PARAM = "tss-serverfn-split";
var providerHmrAcceptTemplate = babel.template.statements(`
if (import.meta.hot) {
  import.meta.hot.accept(() => {})
}
if (import.meta.webpackHot) {
  import.meta.webpackHot.accept(() => {})
}
`, { placeholderPattern: false });
var serverRpcTemplate = babel.template.expression(`createServerRpc(%%serverFnMeta%%, %%fn%%)`);
var clientRpcTemplate = babel.template.expression(`createClientRpc(%%functionId%%)`);
var ssrRpcManifestTemplate = babel.template.expression(`createSsrRpc(%%functionId%%)`);
function warnInputValidatorDeprecation(context, inputValidator) {
	const loc = inputValidator.callPath.node.loc?.start;
	const location = loc ? `${context.id}:${loc.line}:${loc.column + 1} ` : `${context.id} `;
	context.warn?.(`${location}createServerFn().inputValidator() is deprecated. Use createServerFn().validator() instead.`);
}
var RuntimeCodeCache = /* @__PURE__ */ new Map();
function getCachedRuntimeCode(framework, type) {
	let cache = RuntimeCodeCache.get(framework);
	if (!cache) {
		cache = {
			provider: babel.template.ast(`import { createServerRpc } from '@tanstack/${framework}-start/server-rpc'`, { placeholderPattern: false }),
			client: babel.template.ast(`import { createClientRpc } from '@tanstack/${framework}-start/client-rpc'`, { placeholderPattern: false }),
			ssr: babel.template.ast(`import { createSsrRpc } from '@tanstack/${framework}-start/ssr-rpc'`, { placeholderPattern: false })
		};
		RuntimeCodeCache.set(framework, cache);
	}
	return cache[type];
}
/**
* Gets the environment configuration for the current compilation context.
*/
function getEnvConfig(context, isProviderFile) {
	const { env } = context;
	if (isProviderFile) return {
		isClientEnvironment: false,
		runtimeCodeType: "provider"
	};
	if (env === "client") return {
		isClientEnvironment: true,
		runtimeCodeType: "client"
	};
	return {
		isClientEnvironment: false,
		runtimeCodeType: "ssr"
	};
}
/**
* Builds the serverFnMeta object literal AST node.
* The object contains: { id, name, filename }
*/
function buildServerFnMetaObject(functionId, variableName, filename) {
	return t.objectExpression([
		t.objectProperty(t.identifier("id"), t.stringLiteral(functionId)),
		t.objectProperty(t.identifier("name"), t.stringLiteral(variableName)),
		t.objectProperty(t.identifier("filename"), t.stringLiteral(filename))
	]);
}
/**
* Generates the RPC stub expression for provider files.
* Uses pre-compiled template for performance.
*/
function generateProviderRpcStub(serverFnMeta, fn) {
	return serverRpcTemplate({
		serverFnMeta,
		fn
	});
}
/**
* Generates the RPC stub expression for caller files.
* Uses pre-compiled templates for performance.
* Note: Client and SSR callers only receive the functionId string, not the full metadata.
*/
function generateCallerRpcStub(functionId, envConfig) {
	const functionIdLiteral = t.stringLiteral(functionId);
	if (envConfig.runtimeCodeType === "client") return clientRpcTemplate({ functionId: functionIdLiteral });
	return ssrRpcManifestTemplate({ functionId: functionIdLiteral });
}
/**
* Handles createServerFn transformations for a batch of candidates.
*
* This function performs extraction and replacement of server functions
*
* For caller files (non-provider):
* - Replaces the server function with an RPC stub
* - Does not include the handler function body
*
* For provider files:
* - Creates an extractedFn that calls __executeServer
* - Modifies .handler() to pass (extractedFn, serverFn) - two arguments
*
* @param candidates - All ServerFn candidates to process
* @param context - The compilation context with helpers and mutable state
* @returns Result containing runtime code to add, or null if no candidates processed
*/
function handleCreateServerFn(candidates, context) {
	if (candidates.length === 0) return;
	const isProviderFile = context.id.includes(TSS_SERVERFN_SPLIT_PARAM);
	if (isProviderFile && context.serverFnProviderModuleDirectives) ensureDirectivePrologue(context.ast, context.serverFnProviderModuleDirectives);
	const envConfig = getEnvConfig(context, isProviderFile);
	const functionNameSet = /* @__PURE__ */ new Set();
	const exportNames = /* @__PURE__ */ new Set();
	const serverFnsById = {};
	const [baseFilename] = context.id.split("?");
	const extractedFilename = `${baseFilename}?${TSS_SERVERFN_SPLIT_PARAM}`;
	const relativeFilename = path.relative(context.root, baseFilename);
	const knownFns = context.getKnownServerFns();
	const cleanedContextId = cleanId(context.id);
	for (const candidate of candidates) {
		const { path: candidatePath, methodChain } = candidate;
		const { validator, inputValidator, handler } = methodChain;
		const candidateVariableDeclarator = getVariableDeclaratorForExpressionPath(candidatePath);
		if (!candidateVariableDeclarator) throw new Error("createServerFn must be assigned to a variable!");
		const variableDeclarator = candidateVariableDeclarator.node;
		if (!t.isIdentifier(variableDeclarator.id)) throw codeFrameError(context.code, variableDeclarator.id.loc, "createServerFn must be assigned to a simple identifier, not a destructuring pattern");
		const existingVariableName = variableDeclarator.id.name;
		let functionName = `${existingVariableName}_createServerFn_handler`;
		while (functionNameSet.has(functionName)) functionName = incrementFunctionNameVersion(functionName);
		functionNameSet.add(functionName);
		const functionId = context.generateFunctionId({
			filename: relativeFilename,
			functionName,
			extractedFilename
		});
		const knownFn = knownFns[functionId];
		const isClientReferenced = envConfig.isClientEnvironment || !!knownFn || envConfig.runtimeCodeType === "ssr";
		const canonicalExtractedFilename = knownFn?.extractedFilename ?? extractedFilename;
		if (inputValidator) warnInputValidatorDeprecation(context, inputValidator);
		for (const [methodName, methodCall] of [["validator", validator], ["inputValidator", inputValidator]]) {
			if (!methodCall) continue;
			if (!methodCall.callPath.node.arguments[0]) throw new Error(`createServerFn().${methodName}() must be called with a validator!`);
			if (context.env === "client") stripMethodCall(methodCall.callPath);
		}
		const handlerFnPath = handler?.firstArgPath;
		if (!handler || !handlerFnPath?.node) throw codeFrameError(context.code, candidatePath.node.callee.loc, `createServerFn must be called with a "handler" property!`);
		if (!t.isExpression(handlerFnPath.node)) throw codeFrameError(context.code, handlerFnPath.node.loc, `handler() must be called with an expression, not a ${handlerFnPath.node.type}`);
		const handlerFn = handlerFnPath.node;
		if (!isProviderFile) serverFnsById[functionId] = {
			functionName,
			functionId,
			filename: cleanedContextId,
			extractedFilename: canonicalExtractedFilename,
			isClientReferenced
		};
		if (isProviderFile) {
			const executeServerArrowFn = t.arrowFunctionExpression([t.identifier("opts")], t.callExpression(t.memberExpression(t.identifier(existingVariableName), t.identifier("__executeServer")), [t.identifier("opts")]));
			const extractedFnInit = generateProviderRpcStub(buildServerFnMetaObject(functionId, existingVariableName, relativeFilename), executeServerArrowFn);
			const extractedFnStatement = t.variableDeclaration("const", [t.variableDeclarator(t.identifier(functionName), extractedFnInit)]);
			const variableDeclaration = candidateVariableDeclarator.parentPath;
			if (!variableDeclaration.isVariableDeclaration()) throw new Error("Expected createServerFn to be in a VariableDeclaration");
			variableDeclaration.insertBefore(extractedFnStatement);
			const extractedFnIdentifier = t.identifier(functionName);
			const serverFnNode = t.cloneNode(handlerFn, true);
			handler.callPath.node.arguments = [extractedFnIdentifier, serverFnNode];
			exportNames.add(functionName);
		} else {
			const rpcStub = generateCallerRpcStub(functionId, envConfig);
			handlerFnPath.replaceWith(rpcStub);
		}
	}
	if (isProviderFile) {
		safeRemoveExports(context.ast);
		if (exportNames.size > 0) context.ast.program.body.push(t.exportNamedDeclaration(void 0, Array.from(exportNames).map((name) => t.exportSpecifier(t.identifier(name), t.identifier(name)))));
		if (context.mode === "dev") context.ast.program.body.push(...providerHmrAcceptTemplate());
	}
	if (!isProviderFile && hasKeys(serverFnsById) && context.onServerFnsById) context.onServerFnsById(serverFnsById);
	const runtimeCode = getCachedRuntimeCode(context.framework, envConfig.runtimeCodeType);
	context.ast.program.body.unshift(t.cloneNode(runtimeCode));
}
/**
* Makes an identifier safe for use as a JavaScript identifier.
*/
function makeIdentifierSafe(identifier) {
	return identifier.replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[0-9]/, "_$&").replace(/^\$/, "_$").replace(/_{2,}/g, "_").replace(/^_|_$/g, "");
}
/**
* Increments the version number suffix on a function name.
*/
function incrementFunctionNameVersion(functionName) {
	const [realReferenceName, count] = functionName.split(/_(\d+)$/);
	const suffix = `_${Number(count || "0") + 1}`;
	return makeIdentifierSafe(realReferenceName) + suffix;
}
/**
* Removes all exports from the AST while preserving the declarations.
* Used for provider files where we want to re-export only the server functions.
*/
function safeRemoveExports(ast) {
	ast.program.body = ast.program.body.flatMap((node) => {
		if (t.isExportNamedDeclaration(node) || t.isExportDefaultDeclaration(node)) {
			if (t.isFunctionDeclaration(node.declaration) || t.isClassDeclaration(node.declaration) || t.isVariableDeclaration(node.declaration)) {
				if (t.isFunctionDeclaration(node.declaration) || t.isClassDeclaration(node.declaration)) {
					if (!node.declaration.id) return node;
				}
				return node.declaration;
			} else if (node.declaration === null) return [];
		}
		return node;
	});
}
function ensureDirectivePrologue(ast, directiveValues) {
	const directives = ast.program.directives;
	const existingDirectives = new Set(directives.map((directive) => directive.value.value));
	const missingDirectives = [];
	for (const directiveValue of directiveValues) {
		if (!directiveValue || existingDirectives.has(directiveValue)) continue;
		existingDirectives.add(directiveValue);
		missingDirectives.push(directiveValue);
	}
	for (let i = missingDirectives.length - 1; i >= 0; i--) directives.unshift(t.directive(t.directiveLiteral(missingDirectives[i])));
}
//#endregion
export { handleCreateServerFn };

//# sourceMappingURL=handleCreateServerFn.js.map