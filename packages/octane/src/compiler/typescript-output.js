import { builders as b } from '@tsrx/core';
import { createLexicalAnalysis, isIdentifierReference } from './compile-universal.js';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const SKIP = new Set(['loc', 'start', 'end', 'range', 'metadata', 'parent']);

function functionKey(node) {
	return `${node.type}:${node.start}:${node.end}:${node.id?.name ?? ''}`;
}

function isTypeDeclaration(node) {
	return node?.type === 'TSTypeAliasDeclaration' || node?.type === 'TSInterfaceDeclaration';
}

// Runtime capture analysis deliberately ignores the type namespace. A helper
// moved to module scope still needs the local declarations named by annotations.
// Copy only that dependency closure; all of it erases before execution.
function restoreTypeScope(fn, context) {
	if (!context?.size) return null;
	const bound = new Set(
		(fn.typeParameters?.params ?? []).map((param) => param.name.name ?? param.name),
	);
	for (const statement of fn.body.type === 'BlockStatement' ? fn.body.body : [])
		if (isTypeDeclaration(statement)) bound.add(statement.id.name);
	const declarations = [];
	const parameters = [];
	let parameterOrigin = fn.typeParameters;
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'TSTypeReference' || node.type === 'TSExpressionWithTypeArguments') {
			let name = node.typeName ?? node.expression;
			while (name?.type === 'TSQualifiedName') name = name.left;
			const binding = context.get(name?.name);
			if (binding && !bound.has(name.name)) {
				bound.add(name.name);
				if (binding.parameters) {
					parameters.push(binding.node);
					parameterOrigin ??= binding.parameters;
				} else declarations.push(binding.node);
				visit(binding.node);
			}
		}
		for (const key of Object.keys(node)) if (!SKIP.has(key)) visit(node[key]);
	};
	visit(fn);
	parameters.sort((left, right) => left.start - right.start);
	return declarations.length || parameters.length
		? {
				declarations,
				parameters: parameters.length
					? { ...parameterOrigin, params: [...parameters, ...(fn.typeParameters?.params ?? [])] }
					: fn.typeParameters,
			}
		: null;
}

/** Type the compiler's private ABI without changing emitted runtime operations. */
export function prepareWebTypeScript(program, ctx, allocateName) {
	const authoredFunctions = new Set();
	const typeContexts = new Map();
	const collected = new WeakSet();
	const collect = (node, context = new Map()) => {
		if (!node || typeof node !== 'object' || collected.has(node)) return;
		collected.add(node);
		if (Array.isArray(node)) {
			for (const child of node) collect(child, context);
			return;
		}
		if (node.start !== undefined) typeContexts.set(node.start, context);
		if (FUNCTIONS.has(node.type)) {
			authoredFunctions.add(functionKey(node));
			if (node.typeParameters) {
				context = new Map(context);
				for (const param of node.typeParameters.params) {
					context.set(param.name.name ?? param.name, {
						node: param,
						parameters: node.typeParameters,
					});
				}
			}
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const declarations = node.body.filter(isTypeDeclaration);
			if (declarations.length) {
				context = new Map(context);
				for (const declaration of declarations)
					context.set(declaration.id.name, { node: declaration });
			}
		}
		for (const key of Object.keys(node)) if (!SKIP.has(key)) collect(node[key], context);
	};
	collect(ctx.authoredModuleAst);
	const lexical = createLexicalAnalysis(program);
	const scopes = new Set();
	const params = new Map();
	const typeScopes = new Map();
	let scopeName;
	const scopeType = (origin) => {
		scopeName ??= allocateName('_$Scope');
		return b.ts_type_reference(b.id(scopeName, origin), null, origin);
	};
	const annotate = (param, type, optional = false) => ({
		...param,
		typeAnnotation: b.ts_type_annotation(type, param),
		...(optional ? { optional: true } : null),
	});
	const seen = [new WeakSet(), new WeakSet()];
	const find = (node, inFunction = false, opaque = false) => {
		if (!node || typeof node !== 'object' || seen[+inFunction].has(node)) return;
		seen[+inFunction].add(node);
		if (Array.isArray(node)) {
			for (const child of node) find(child, inFunction, opaque);
			return;
		}
		if (FUNCTIONS.has(node.type)) {
			const generated = node._octaneTypedBody === true || !authoredFunctions.has(functionKey(node));
			if (generated || opaque) {
				if (generated && !inFunction)
					typeScopes.set(node, restoreTypeScope(node, typeContexts.get(node.start)));
				for (let index = 0; index < (node.params?.length ?? 0); index++) {
					const param = node.params[index];
					if (param.typeAnnotation || param.type === 'AssignmentPattern') continue;
					if (generated && param.type === 'Identifier' && param.name === '__s') {
						params.set(param, annotate(param, scopeType(param), true));
						const binding = lexical.resolveBinding(lexical.nodeScopes.get(node.body), '__s');
						if (binding !== null) scopes.add(binding.scope);
					} else if (!(index === 0 && node._octaneContextualProps)) {
						params.set(
							param,
							annotate(
								param,
								b.ts_keyword_type('any', param),
								generated &&
									(param.name === '__extra' || (node._octaneTypedBody && param.name === '__props')),
							),
						);
					}
				}
			}
			opaque ||= generated;
		}
		for (const key of Object.keys(node))
			if (!SKIP.has(key)) find(node[key], inFunction || FUNCTIONS.has(node.type), opaque);
	};
	find(program);
	const copies = new WeakMap();
	const rewrite = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return node;
		// A shorthand property's key is syntax, even when it shares its identifier
		// with the value. Only the value receives the type-only scope assertion.
		if (parent?.type === 'Property' && key === 'key' && !parent.computed) return node;
		if (params.has(node)) return params.get(node);
		if (copies.has(node)) return copies.get(node);
		if (
			node.type === 'Identifier' &&
			node.name === '__s' &&
			isIdentifierReference(node, parent, key, lexical)
		) {
			const binding = lexical.resolveBinding(lexical.nodeScopes.get(node), node.name);
			if (binding !== null && scopes.has(binding.scope)) {
				const result = b.ts_as(node, scopeType(node), node);
				copies.set(node, result);
				return result;
			}
		}
		if (Array.isArray(node)) {
			const children = node.map((child) => rewrite(child, parent, key));
			const result = children.some((child, index) => child !== node[index]) ? children : node;
			copies.set(node, result);
			return result;
		}
		let result = node;
		for (const property of Object.keys(node)) {
			if (SKIP.has(property)) continue;
			const child = rewrite(node[property], node, property);
			if (child !== node[property]) {
				if (result === node) result = { ...node };
				result[property] = child;
			}
		}
		if (result.type === 'Property' && result.shorthand && result.value !== node.value) {
			result = { ...result, shorthand: false };
		}
		const scope = typeScopes.get(node);
		if (scope)
			result = {
				...result,
				typeParameters: scope.parameters,
				body:
					scope.declarations.length === 0
						? result.body
						: b.block([
								...scope.declarations,
								...(result.body.type === 'BlockStatement'
									? result.body.body
									: [b.return(result.body)]),
							]),
			};
		copies.set(node, result);
		return result;
	};
	const result = rewrite(program);
	if (scopeName === undefined) return result;
	const imported = ctx.mode === 'server' ? 'SSRScope' : 'Scope';
	const declaration = b.imports(
		[[imported, scopeName]],
		`octane/internal/${ctx.mode === 'server' ? 'server' : 'client'}`,
	);
	declaration.importKind = 'type';
	return { ...result, body: [b.set_location(declaration, ctx._moduleOrigin), ...result.body] };
}
