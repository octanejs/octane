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

function bindingName(node) {
	return node.id?.name ?? node.name?.name ?? node.name;
}

function bindingKey(node) {
	return `${node.type}:${node.start}:${node.end}:${bindingName(node)}`;
}

function walkTypes(root, visit) {
	const seen = new WeakSet();
	const walk = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		visit(node);
		for (const key of Object.keys(node)) if (!SKIP.has(key)) walk(node[key]);
	};
	walk(root);
}

// Runtime capture analysis ignores types. Restore the lexical type dependency
// closure of any function moved to module scope, including authored callbacks.
// Lift types beside the function so its signature and body see the same scope.
function restoreTypeScope(fn, contexts, allocateName, localTypeQuery) {
	const bound = new Set();
	const ownBindings = (root) =>
		walkTypes(root, (node) => {
			if (isTypeDeclaration(node) || node.type === 'TSTypeParameter') bound.add(bindingKey(node));
		});
	ownBindings(fn);
	const reference = (node) => {
		if (
			node.type !== 'TSTypeReference' &&
			node.type !== 'TSExpressionWithTypeArguments' &&
			node.type !== 'TSInterfaceHeritage'
		)
			return;
		const name = node.typeName ?? node.expression;
		if (name?.type === 'Identifier') return contexts.get(node.start)?.get(name.name);
	};
	const needed = new Set();
	const aliases = [];
	const parameters = [];
	const visit = (root) =>
		walkTypes(root, (node) => {
			const binding = reference(node);
			if (!binding || bound.has(bindingKey(binding.node)) || needed.has(binding)) return;
			needed.add(binding);
			(binding.parameters ? parameters : aliases).push(binding);
			ownBindings(binding.node);
			visit(binding.node);
		});
	visit(fn);
	if (!needed.size) return null;
	parameters.sort((left, right) => left.node.start - right.node.start);
	const names = new Map(
		[...needed].map((binding) => [binding, allocateName(`_${bindingName(binding.node)}`)]),
	);
	const argumentsFor = (origin) =>
		parameters.map((binding) =>
			b.ts_type_reference(b.id(names.get(binding), origin), null, origin),
		);
	const copies = [new WeakMap(), new WeakMap()];
	const rewrite = (node, lifted = false) => {
		if (!node || typeof node !== 'object') return node;
		if (lifted && localTypeQuery(node)) return b.ts_keyword_type('any', node);
		if (copies[+lifted].has(node)) return copies[+lifted].get(node);
		if (Array.isArray(node)) {
			const result = node.map((child) => rewrite(child, lifted));
			copies[+lifted].set(node, result);
			return result;
		}
		let result = node;
		for (const key of Object.keys(node)) {
			if (SKIP.has(key)) continue;
			const child = rewrite(node[key], lifted);
			if (child !== node[key]) {
				if (result === node) result = { ...node };
				result[key] = child;
			}
		}
		const binding = reference(node);
		if (names.has(binding)) {
			const nameKey = node.type === 'TSTypeReference' ? 'typeName' : 'expression';
			result = { ...result, [nameKey]: b.id(names.get(binding), node[nameKey]) };
			if (!binding.parameters && parameters.length) {
				const argsKey =
					node.typeParameters && !node.typeArguments ? 'typeParameters' : 'typeArguments';
				result[argsKey] = b.ts_type_parameter_instantiation(
					[...argumentsFor(node), ...(result[argsKey]?.params ?? [])],
					node,
				);
			}
		}
		copies[+lifted].set(node, result);
		return result;
	};
	// Every lifted use supplies these arguments. Fresh names preserve alias-owned
	// generic shadowing; dropping copied defaults permits required own parameters.
	const captured = parameters.map((binding) => ({
		...rewrite(binding.node, true),
		name:
			typeof binding.node.name === 'string'
				? names.get(binding)
				: b.id(names.get(binding), binding.node.name),
		default: undefined,
	}));
	const withParameters = (node, own) =>
		captured.length
			? {
					...(node.typeParameters ?? parameters[0].parameters),
					params: [...captured, ...(own?.params ?? [])],
				}
			: own;
	const declarations = aliases.map((binding) => {
		const declaration = rewrite(binding.node, true);
		return {
			...declaration,
			id: b.id(names.get(binding), declaration.id),
			typeParameters: withParameters(declaration, declaration.typeParameters),
		};
	});
	return {
		declarations,
		apply(node) {
			const result = rewrite(node);
			return { ...result, typeParameters: withParameters(result, result.typeParameters) };
		},
	};
}

/** Type the compiler's private ABI without changing emitted runtime operations. */
export function prepareWebTypeScript(program, ctx, allocateName) {
	const authoredFunctions = new Map();
	const typeContexts = new Map();
	const authoredLexical = createLexicalAnalysis(ctx.authoredModuleAst);
	const valueScopes = new Map();
	const collected = new WeakSet();
	const collect = (
		node,
		context = new Map(),
		nested = false,
		valueScope = authoredLexical.rootScope,
	) => {
		if (!node || typeof node !== 'object' || collected.has(node)) return;
		collected.add(node);
		if (Array.isArray(node)) {
			for (const child of node) collect(child, context, nested, valueScope);
			return;
		}
		valueScope = authoredLexical.nodeScopes.get(node) ?? valueScope;
		if (node.start !== undefined) {
			typeContexts.set(node.start, context);
			valueScopes.set(node.start, valueScope);
		}
		if (FUNCTIONS.has(node.type)) {
			authoredFunctions.set(functionKey(node), nested);
			nested = true;
		}
		if (node.typeParameters?.type === 'TSTypeParameterDeclaration') {
			context = new Map(context);
			for (const param of node.typeParameters.params) {
				context.set(bindingName(param), { node: param, parameters: node.typeParameters });
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
		for (const key of Object.keys(node))
			if (!SKIP.has(key)) collect(node[key], context, nested, valueScope);
	};
	collect(ctx.authoredModuleAst);
	// Lifted aliases cannot name a component's runtime locals. Their inferred
	// value types belong to the opaque environment; module/global queries stay.
	const localTypeQuery = (node) => {
		if (node.type !== 'TSTypeQuery') return false;
		let name = node.exprName;
		while (name?.type === 'TSQualifiedName') name = name.left;
		if (name?.type !== 'Identifier') return false;
		const binding = authoredLexical.resolveBinding(valueScopes.get(node.start), name.name);
		return binding !== null && binding.scope !== authoredLexical.rootScope;
	};
	const lexical = createLexicalAnalysis(program);
	const scopes = new Set();
	const params = new Map();
	const typeScopes = new Map();
	const liftedTypes = [];
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
			if (!inFunction) {
				const scope = restoreTypeScope(node, typeContexts, allocateName, localTypeQuery);
				if (scope) {
					typeScopes.set(node, scope);
					liftedTypes.push(...scope.declarations);
				}
			}
			const relocated = !inFunction && authoredFunctions.get(functionKey(node)) === true;
			if (generated || opaque || relocated) {
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
			opaque ||= generated || relocated;
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
		if (scope) result = scope.apply(result);
		copies.set(node, result);
		return result;
	};
	const result = rewrite(program);
	const body = [...liftedTypes, ...result.body];
	if (scopeName === undefined) return { ...result, body };
	const imported = ctx.mode === 'server' ? 'SSRScope' : 'Scope';
	const declaration = b.imports(
		[[imported, scopeName]],
		`octane/internal/${ctx.mode === 'server' ? 'server' : 'client'}`,
	);
	declaration.importKind = 'type';
	return { ...result, body: [b.set_location(declaration, ctx._moduleOrigin), ...body] };
}
