/**
 * Compiler-owned `<Hydrate>` child extraction.
 *
 * A split boundary imports the same authored module with a stable resource
 * query. The queried transform receives the original source again and derives
 * the requested child module from that source alone; no adapter-owned virtual
 * module cache is required. This is important for Rspack, whose loader is
 * intentionally instantiated afresh for every resource query.
 */
import { parseModule } from '@tsrx/core';
import { sourceMapFromOrigins } from './compile-universal.js';

export const HYDRATE_QUERY_PARAM = 'octane-hydrate';

const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);
const TRANSPARENT_TS_EXPRESSIONS = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function generatedText(code) {
	const origins = new Int32Array(code.length);
	origins.fill(-1);
	return { code, origins };
}

function authoredText(source, start = 0, end = source.length) {
	const code = source.slice(start, end);
	const origins = new Int32Array(code.length);
	for (let index = 0; index < origins.length; index++) origins[index] = start + index;
	return { code, origins };
}

function concatMapped(...parts) {
	const values = parts.flat().filter((part) => part != null && part.code !== '');
	const code = values.map((part) => part.code).join('');
	const origins = new Int32Array(code.length);
	let offset = 0;
	for (const part of values) {
		origins.set(part.origins, offset);
		offset += part.code.length;
	}
	return { code, origins };
}

function sliceMapped(part, start, end) {
	return { code: part.code.slice(start, end), origins: part.origins.slice(start, end) };
}

function applyMappedValueReplacements(input, replacements) {
	const sorted = [...replacements].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
	const parts = [];
	let cursor = 0;
	for (const replacement of sorted) {
		if (replacement.start < cursor || replacement.end > input.code.length) {
			throw new Error('Octane Hydrate compiler produced an overlapping mapped rewrite.');
		}
		parts.push(sliceMapped(input, cursor, replacement.start), replacement.value);
		cursor = replacement.end;
	}
	parts.push(sliceMapped(input, cursor, input.code.length));
	return concatMapped(parts);
}

function applyMappedReplacements(source, start, end, replacements) {
	const sorted = [...replacements].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
	const parts = [];
	let cursor = start;
	for (const replacement of sorted) {
		if (replacement.start < cursor || replacement.end > end) {
			throw new Error('Octane Hydrate compiler produced an overlapping source rewrite.');
		}
		parts.push(authoredText(source, cursor, replacement.start), replacement.value);
		cursor = replacement.end;
	}
	parts.push(authoredText(source, cursor, end));
	return concatMapped(parts);
}

function nameOf(node) {
	if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function collectBindingNames(pattern, output) {
	if (!pattern) return;
	if (pattern.type === 'Identifier' || pattern.type === 'JSXIdentifier') {
		output.add(pattern.name);
		return;
	}
	if (pattern.type === 'RestElement') {
		collectBindingNames(pattern.argument, output);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		collectBindingNames(pattern.left, output);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) collectBindingNames(element, output);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			collectBindingNames(property.argument ?? property.value, output);
		}
	}
}

function directDeclaration(statement) {
	if (
		statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
	) {
		return statement.declaration;
	}
	return statement;
}

function directScopeBindings(statements) {
	const bindings = new Set();
	for (const statement of statements ?? []) {
		const declaration = directDeclaration(statement);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) collectBindingNames(item.id, bindings);
		} else if (
			(declaration?.type === 'FunctionDeclaration' ||
				declaration?.type === 'ClassDeclaration' ||
				declaration?.type === 'TSEnumDeclaration') &&
			declaration.id
		) {
			collectBindingNames(declaration.id, bindings);
		}
	}
	return bindings;
}

function topLevelBindingNames(ast) {
	const bindings = new Set();
	for (const statement of ast.body ?? []) {
		const declaration = directDeclaration(statement);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) collectBindingNames(item.id, bindings);
		} else if (
			(declaration?.type === 'FunctionDeclaration' ||
				declaration?.type === 'ClassDeclaration' ||
				declaration?.type === 'TSEnumDeclaration') &&
			declaration.id
		) {
			collectBindingNames(declaration.id, bindings);
		}
	}
	return bindings;
}

function functionVarBindings(body) {
	const bindings = new Set();
	const seen = new WeakSet();
	const visit = (node, root = false) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			!root &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const item of node.declarations ?? []) collectBindingNames(item.id, bindings);
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			visit(value);
		}
	};
	visit(body, true);
	return bindings;
}

function collectImports(ast) {
	const hydrateNames = new Set();
	const hookNames = new Set();
	const importBindings = new Set();
	const declarations = [];
	for (const statement of ast.body ?? []) {
		if (statement.type !== 'ImportDeclaration') continue;
		declarations.push(statement);
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.local?.name) importBindings.add(specifier.local.name);
			if (
				statement.source?.value === 'octane' &&
				statement.importKind !== 'type' &&
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				nameOf(specifier.imported) === 'Hydrate' &&
				specifier.local?.name
			) {
				hydrateNames.add(specifier.local.name);
			}
			if (
				statement.source?.value === 'octane' &&
				statement.importKind !== 'type' &&
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				/^use(?:[A-Z0-9_]|$)/.test(nameOf(specifier.imported) ?? '') &&
				specifier.local?.name
			) {
				hookNames.add(specifier.local.name);
			}
		}
	}
	return { declarations, hookNames, hydrateNames, importBindings };
}

function rewrittenImport(input, declaration, keptSpecifiers) {
	if (keptSpecifiers.length === 0) return generatedText('');
	const defaults = keptSpecifiers.filter(
		(specifier) => specifier.type === 'ImportDefaultSpecifier',
	);
	const namespaces = keptSpecifiers.filter(
		(specifier) => specifier.type === 'ImportNamespaceSpecifier',
	);
	const named = keptSpecifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	// Unknown parser extensions are safer left untouched than reconstructed into
	// invalid syntax. None are emitted by the TypeScript import grammar Octane
	// accepts today, but this keeps a future parser addition conservative.
	if (
		defaults.length > 1 ||
		namespaces.length > 1 ||
		keptSpecifiers.length !== defaults.length + namespaces.length + named.length
	) {
		return sliceMapped(input, declaration.start, declaration.end);
	}
	const clause = [];
	if (defaults.length === 1) clause.push(sliceMapped(input, defaults[0].start, defaults[0].end));
	if (namespaces.length === 1)
		clause.push(sliceMapped(input, namespaces[0].start, namespaces[0].end));
	if (named.length > 0) {
		clause.push(
			concatMapped(
				generatedText('{ '),
				named.flatMap((specifier, index) => [
					...(index === 0 ? [] : [generatedText(', ')]),
					sliceMapped(input, specifier.start, specifier.end),
				]),
				generatedText(' }'),
			),
		);
	}
	return concatMapped(
		generatedText(declaration.importKind === 'type' ? 'import type ' : 'import '),
		clause.flatMap((part, index) => [...(index === 0 ? [] : [generatedText(', ')]), part]),
		generatedText(' from '),
		sliceMapped(input, declaration.source.start, declaration.end),
	);
}

/** Keep only import bindings referenced by this independently compiled slice. */
function pruneUnusedImports(input, filename, preserveBareImports) {
	const ast = parseModule(input.code, filename);
	const declarations = (ast.body ?? []).filter((node) => node.type === 'ImportDeclaration');
	if (declarations.length === 0) return input;
	const referenced = new Set(
		collectCaptures(
			(ast.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
			new Set(),
		),
	);
	const replacements = [];
	for (const declaration of declarations) {
		const specifiers = declaration.specifiers ?? [];
		if (specifiers.length === 0) {
			if (!preserveBareImports) {
				replacements.push({
					start: declaration.start,
					end: declaration.end,
					value: generatedText(''),
				});
			}
			continue;
		}
		const kept = specifiers.filter((specifier) => referenced.has(specifier.local?.name));
		if (kept.length === specifiers.length) continue;
		replacements.push({
			start: declaration.start,
			end: declaration.end,
			value: rewrittenImport(input, declaration, kept),
		});
	}
	return replacements.length === 0 ? input : applyMappedValueReplacements(input, replacements);
}

function addRelevantBindings(pattern, shadowed, relevant) {
	const bindings = new Set();
	collectBindingNames(pattern, bindings);
	for (const binding of bindings) if (relevant.has(binding)) shadowed.add(binding);
}

function addRelevantDirectBindings(statements, shadowed, relevant) {
	for (const binding of directScopeBindings(statements)) {
		if (relevant.has(binding)) shadowed.add(binding);
	}
}

function collectRelevantFunctionVars(body, shadowed, relevant) {
	for (const binding of functionVarBindings(body)) {
		if (relevant.has(binding)) shadowed.add(binding);
	}
}

function jsxAttributeName(attribute) {
	if (attribute?.type !== 'JSXAttribute' && attribute?.type !== 'Attribute') return null;
	return nameOf(attribute.name);
}

function unwrapExpression(node) {
	let value = node;
	while (value && TRANSPARENT_TS_EXPRESSIONS.has(value.type)) value = value.expression;
	return value;
}

function literalSplitDisabled(node) {
	let split = null;
	for (const attribute of node.openingElement?.attributes ?? []) {
		if (jsxAttributeName(attribute) === 'split') split = attribute;
	}
	if (split === null || split.value == null) return false;
	const value =
		split.value.type === 'JSXExpressionContainer'
			? unwrapExpression(split.value.expression)
			: split.value;
	return value?.type === 'Literal' && value.value === false;
}

function openingInsertOffset(source, opening) {
	const text = source.slice(opening.start, opening.end);
	if (!text.endsWith('>')) {
		throw new Error('Octane Hydrate compiler found an invalid JSX opening tag.');
	}
	return opening.end - (text.endsWith('/>') ? 2 : 1);
}

function formatLocation(filename, node) {
	const start = node?.loc?.start;
	return start ? `${filename}:${start.line}:${start.column}` : filename;
}

function extractionError(code, filename, node, message) {
	const error = new Error(
		`Octane Hydrate compiler: ${message} (${formatLocation(filename, node)})`,
	);
	error.code = code;
	error.filename = filename;
	error.loc = node?.loc?.start ?? null;
	return error;
}

function isFunction(node) {
	const value = unwrapExpression(node);
	return (
		value?.type === 'FunctionExpression' ||
		value?.type === 'ArrowFunctionExpression' ||
		value?.type === 'FunctionDeclaration'
	);
}

function isRenderableChild(child) {
	if (!child || child.type === 'JSXStyleElement') return false;
	if (child.type === 'JSXText') return !/^\s*$/.test(child.value ?? '');
	if (child.type === 'JSXExpressionContainer') {
		return child.expression != null && child.expression.type !== 'JSXEmptyExpression';
	}
	return true;
}

function assertDirectChildren(boundary, filename) {
	if (!boundary.node.closingElement) {
		throw extractionError(
			'OCTANE_HYDRATE_DIRECT_CHILDREN',
			filename,
			boundary.node,
			'splitting requires direct JSX children. Use an opening/closing tag or set `split={false}`',
		);
	}
	if ((boundary.node.children ?? []).some(isRenderableChild)) return;
	const indirect = (boundary.node.openingElement?.attributes ?? []).find(
		(attribute) =>
			attribute.type === 'JSXSpreadAttribute' ||
			attribute.type === 'SpreadAttribute' ||
			jsxAttributeName(attribute) === 'children',
	);
	if (indirect) {
		throw extractionError(
			'OCTANE_HYDRATE_DIRECT_CHILDREN',
			filename,
			indirect,
			'splitting cannot extract `children` supplied by a prop or spread. Author JSX children directly or set `split={false}`',
		);
	}
}

function isHookCall(node, hookNames) {
	if (node?.type !== 'CallExpression') return false;
	if (node.callee?.type === 'Identifier') {
		return hookNames.has(node.callee.name) || /^use(?:[A-Z0-9_]|$)/.test(node.callee.name);
	}
	return (
		node.callee?.type === 'MemberExpression' &&
		!node.callee.computed &&
		node.callee.property?.type === 'Identifier' &&
		/^use(?:[A-Z0-9_]|$)/.test(node.callee.property.name)
	);
}

function validateBoundary(boundary, filename, hookNames) {
	for (const child of boundary.node.children ?? []) {
		if (child?.type === 'JSXExpressionContainer' && isFunction(child.expression)) {
			throw extractionError(
				'OCTANE_HYDRATE_FUNCTION_CHILD',
				filename,
				child,
				'function children cannot be split. Extract the function into a component or set `split={false}`',
			);
		}
	}

	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node.type === 'ThisExpression') {
			throw extractionError(
				'OCTANE_HYDRATE_THIS_CAPTURE',
				filename,
				node,
				'`this` cannot be captured by a split child. Pass its value through a local or set `split={false}`',
			);
		}
		if (node.type === 'Super') {
			throw extractionError(
				'OCTANE_HYDRATE_SUPER_CAPTURE',
				filename,
				node,
				'`super` cannot be captured by a split child. Extract a component or set `split={false}`',
			);
		}
		if (isHookCall(node, hookNames)) {
			throw extractionError(
				'OCTANE_HYDRATE_DIRECT_HOOK',
				filename,
				node,
				'direct hook calls cannot move into a split child. Call the hook in a child component or set `split={false}`',
			);
		}
		for (const [key, value] of Object.entries(node)) {
			if (
				SKIP_KEYS.has(key) ||
				(key === 'expression' && TRANSPARENT_TS_EXPRESSIONS.has(node.type))
			) {
				continue;
			}
			visit(value);
		}
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) visit(node.expression);
	};
	visit(boundary.node.children);
}

/** Resolve Hydrate boundaries and assign source-order paths under their nearest boundary. */
export function analyzeHydrateBoundaries(source, filename = 'unknown.tsrx') {
	const ast = parseModule(source, filename);
	const imports = collectImports(ast);
	if (imports.hydrateNames.size === 0) {
		return { ast, boundaries: [], imports, roots: [] };
	}

	const boundaries = [];
	const roots = [];
	const relevantBindings = new Set([...imports.importBindings, ...topLevelBindingNames(ast)]);
	const seen = new WeakSet();
	const walk = (node, shadowed, parentBoundary) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, shadowed, parentBoundary);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			walk(node.expression, shadowed, parentBoundary);
			return;
		}
		if (node.type?.startsWith('TS')) return;

		if (node.type === 'JSXElement' || node.type === 'Element') {
			const tag = node.openingElement?.name ?? node.name;
			const local = nameOf(tag);
			const isBoundary =
				(tag?.type === 'JSXIdentifier' || tag?.type === 'Identifier') &&
				imports.hydrateNames.has(local) &&
				!shadowed.has(local);
			let boundary = parentBoundary;
			if (isBoundary) {
				const siblings = parentBoundary === null ? roots : parentBoundary.children;
				const index = siblings.length;
				const path = parentBoundary === null ? String(index) : `${parentBoundary.path}.${index}`;
				boundary = {
					children: [],
					disabled: literalSplitDisabled(node),
					node,
					parent: parentBoundary,
					path,
					shadowedImports: new Set(shadowed),
				};
				siblings.push(boundary);
				boundaries.push(boundary);
			}
			// Props/fallbacks execute outside the boundary's deferred child region.
			walk(node.openingElement?.attributes, shadowed, parentBoundary);
			walk(node.children, shadowed, boundary);
			return;
		}

		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const inner = new Set(shadowed);
			if (node.id) addRelevantBindings(node.id, inner, relevantBindings);
			for (const parameter of node.params ?? []) {
				addRelevantBindings(parameter, inner, relevantBindings);
			}
			collectRelevantFunctionVars(node.body, inner, relevantBindings);
			walk(node.body, inner, parentBoundary);
			return;
		}

		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const inner = new Set(shadowed);
			addRelevantDirectBindings(node.body, inner, relevantBindings);
			walk(node.body, inner, parentBoundary);
			if (node.type === 'JSXCodeBlock') walk(node.render, inner, parentBoundary);
			return;
		}

		if (node.type === 'CatchClause') {
			const inner = new Set(shadowed);
			addRelevantBindings(node.param, inner, relevantBindings);
			walk(node.body, inner, parentBoundary);
			return;
		}

		if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			const inner = new Set(shadowed);
			addRelevantBindings(node.id, inner, relevantBindings);
			walk(node.superClass, shadowed, parentBoundary);
			walk(node.body, inner, parentBoundary);
			walk(node.decorators, shadowed, parentBoundary);
			return;
		}

		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'JSXForExpression'
		) {
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			const inner = new Set(shadowed);
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) {
					addRelevantBindings(item.id, inner, relevantBindings);
				}
			}
			walk(node.right, shadowed, parentBoundary);
			walk(declaration, inner, parentBoundary);
			walk(node.test, inner, parentBoundary);
			walk(node.update, inner, parentBoundary);
			walk(node.key, inner, parentBoundary);
			walk(node.body, inner, parentBoundary);
			walk(node.empty, inner, parentBoundary);
			return;
		}

		if (node.type === 'SwitchStatement') {
			const inner = new Set(shadowed);
			for (const branch of node.cases ?? []) {
				addRelevantDirectBindings(branch.consequent, inner, relevantBindings);
			}
			walk(node.discriminant, shadowed, parentBoundary);
			walk(node.cases, inner, parentBoundary);
			return;
		}

		if (node.type === 'VariableDeclarator') {
			walk(node.init, shadowed, parentBoundary);
			return;
		}
		if (node.type === 'ImportDeclaration') return;
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			walk(value, shadowed, parentBoundary);
		}
	};

	walk(ast.body, new Set(), null);
	return { ast, boundaries, imports, roots };
}

function visitJsxTag(name, visitIdentifier) {
	if (!name) return;
	if (name.type === 'JSXIdentifier' || name.type === 'Identifier') {
		if (/^[A-Z_$]/.test(name.name)) visitIdentifier(name);
		return;
	}
	if (name.type === 'JSXMemberExpression' || name.type === 'MemberExpression') {
		let object = name.object;
		while (object?.type === 'JSXMemberExpression' || object?.type === 'MemberExpression') {
			object = object.object;
		}
		if (object?.type === 'JSXIdentifier' || object?.type === 'Identifier') {
			visitIdentifier(object);
		}
	}
}

/** Collect names whose values must cross from the parent module into a queried child. */
function collectCaptures(nodes, importBindings, shadowedImports = new Set()) {
	const captures = new Set();
	const scopes = [];
	const seen = new WeakSet();
	const isBound = (name) => {
		if (importBindings.has(name) && !shadowedImports.has(name)) return true;
		for (let index = scopes.length - 1; index >= 0; index--) {
			if (scopes[index].has(name)) return true;
		}
		return false;
	};
	const reference = (node) => {
		if (node?.name && !isBound(node.name)) captures.add(node.name);
	};
	const visitPatternDefaults = (pattern) => {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') {
			visit(pattern.right);
			visitPatternDefaults(pattern.left);
		} else if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) visitPatternDefaults(element);
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				if (property.computed) visit(property.key);
				visitPatternDefaults(property.argument ?? property.value);
			}
		} else if (pattern.type === 'RestElement') {
			visitPatternDefaults(pattern.argument);
		}
	};
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			visit(node.expression);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		if (node.type === 'Identifier') {
			reference(node);
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			visitJsxTag(node.openingElement?.name ?? node.name, reference);
			for (const attribute of node.openingElement?.attributes ?? node.attributes ?? []) {
				if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
					visit(attribute.argument);
				} else {
					visit(attribute.value);
				}
			}
			visit(node.children);
			return;
		}
		if (node.type === 'JSXAttribute' || node.type === 'Attribute') {
			visit(node.value);
			return;
		}
		if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
			visit(node.object);
			if (node.computed) visit(node.property);
			return;
		}
		if (node.type === 'Property' || node.type === 'PropertyDefinition') {
			if (node.computed) visit(node.key);
			if (node.shorthand) visit(node.value ?? node.key);
			else visit(node.value);
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const bindings = functionVarBindings(node.body);
			collectBindingNames(node.id, bindings);
			for (const parameter of node.params ?? []) collectBindingNames(parameter, bindings);
			scopes.push(bindings);
			for (const parameter of node.params ?? []) visitPatternDefaults(parameter);
			visit(node.body);
			scopes.pop();
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			scopes.push(directScopeBindings(node.body));
			visit(node.body);
			if (node.type === 'JSXCodeBlock') visit(node.render);
			scopes.pop();
			return;
		}
		if (node.type === 'CatchClause') {
			const bindings = new Set();
			collectBindingNames(node.param, bindings);
			scopes.push(bindings);
			visitPatternDefaults(node.param);
			visit(node.body);
			scopes.pop();
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'JSXForExpression'
		) {
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			const bindings = new Set();
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) collectBindingNames(item.id, bindings);
			}
			visit(node.right);
			scopes.push(bindings);
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) visit(item.init);
			} else visit(declaration);
			visit(node.test);
			visit(node.update);
			visit(node.key);
			visit(node.body);
			visit(node.empty);
			scopes.pop();
			return;
		}
		if (node.type === 'VariableDeclarator') {
			visit(node.init);
			visitPatternDefaults(node.id);
			return;
		}
		if (
			node.type === 'ImportDeclaration' ||
			node.type === 'LabeledStatement' ||
			node.type === 'BreakStatement' ||
			node.type === 'ContinueStatement' ||
			node.type === 'MetaProperty'
		) {
			if (node.type === 'LabeledStatement') visit(node.body);
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			visit(value);
		}
	};
	visit(nodes);
	return [...captures];
}

function declarationBindingSet(node) {
	const bindings = new Set();
	if (node?.type === 'VariableDeclaration') {
		for (const declaration of node.declarations ?? []) {
			collectBindingNames(declaration.id, bindings);
		}
	} else if (
		(node?.type === 'FunctionDeclaration' || node?.type === 'ClassDeclaration') &&
		node.id
	) {
		collectBindingNames(node.id, bindings);
	}
	return bindings;
}

function movableModuleDeclarations(analysis) {
	const records = [];
	for (const node of analysis.ast.body ?? []) {
		if (
			node.type !== 'VariableDeclaration' &&
			node.type !== 'FunctionDeclaration' &&
			node.type !== 'ClassDeclaration'
		) {
			continue;
		}
		if (node.declare === true || (node.type === 'FunctionDeclaration' && node.body == null)) {
			continue;
		}
		// A declaration containing its own Hydrate site needs another extraction
		// pass after it moves. Keep that uncommon declaration in the parent until
		// recursive declaration slicing has an explicit protocol of its own.
		if (
			analysis.boundaries.some(
				(boundary) => boundary.node.start >= node.start && boundary.node.end <= node.end,
			)
		) {
			continue;
		}
		const bindings = declarationBindingSet(node);
		if (bindings.size === 0) continue;
		records.push({
			bindings,
			dependencies: new Set(),
			node,
		});
	}
	const byBinding = new Map();
	for (const record of records) {
		for (const binding of record.bindings) byBinding.set(binding, record);
	}
	for (const record of records) {
		for (const dependency of collectCaptures([record.node], analysis.imports.importBindings)) {
			if (byBinding.has(dependency)) record.dependencies.add(dependency);
		}
	}
	return { byBinding, records };
}

function createModuleMovePlan(source, filename, analysis, request) {
	const candidates = movableModuleDeclarations(analysis);
	if (candidates.records.length === 0) {
		return {
			bindingsByPath: new Map(),
			declarationsByPath: new Map(),
			movedRecords: [],
		};
	}
	const allBindings = new Set(candidates.byBinding.keys());
	const rootReplacements = extractionFrontier(analysis.roots).flatMap((boundary) =>
		boundaryReplacements(source, boundary, request, analysis.imports.importBindings, allBindings),
	);
	for (const record of candidates.records) {
		rootReplacements.push({
			start: record.node.start,
			end: record.node.end,
			value: generatedText(''),
		});
	}
	const provisionalRoot = applyMappedReplacements(source, 0, source.length, rootReplacements).code;
	const provisionalAst = parseModule(provisionalRoot, filename);
	const eagerReferences = new Set(
		collectCaptures(
			(provisionalAst.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
			analysis.imports.importBindings,
		),
	);
	const eagerRecords = new Set();
	const eagerQueue = [];
	for (const name of eagerReferences) {
		const record = candidates.byBinding.get(name);
		if (record !== undefined && !eagerRecords.has(record)) {
			eagerRecords.add(record);
			eagerQueue.push(record);
		}
	}
	for (let index = 0; index < eagerQueue.length; index++) {
		for (const dependency of eagerQueue[index].dependencies) {
			const record = candidates.byBinding.get(dependency);
			if (record !== undefined && !eagerRecords.has(record)) {
				eagerRecords.add(record);
				eagerQueue.push(record);
			}
		}
	}

	const allBindingsByPath = new Map();
	for (const boundary of analysis.boundaries) {
		if (!boundary.disabled) allBindingsByPath.set(boundary.path, allBindings);
	}
	const referencesByPath = new Map();
	for (const boundary of analysis.boundaries) {
		if (boundary.disabled) continue;
		const provisionalChild = extractedModule(
			source,
			filename,
			analysis,
			boundary,
			request,
			allBindingsByPath,
		);
		const childAst = parseModule(provisionalChild.code, filename);
		referencesByPath.set(
			boundary.path,
			collectCaptures(
				(childAst.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
				analysis.imports.importBindings,
			),
		);
	}
	const recordsForReferences = (childReferences) => {
		const records = new Set();
		const queue = [];
		for (const name of childReferences) {
			const record = candidates.byBinding.get(name);
			if (record !== undefined && !eagerRecords.has(record) && !records.has(record)) {
				records.add(record);
				queue.push(record);
			}
		}
		for (let index = 0; index < queue.length; index++) {
			for (const dependency of queue[index].dependencies) {
				const record = candidates.byBinding.get(dependency);
				if (record !== undefined && !eagerRecords.has(record) && !records.has(record)) {
					records.add(record);
					queue.push(record);
				}
			}
		}
		return records;
	};
	// A declaration needed by more than one independently loaded child must keep
	// one module identity. Leave it in the parent and pass that value through
	// each boundary instead of evaluating duplicate stores/singletons per chunk.
	const preliminaryCounts = new Map();
	for (const references of referencesByPath.values()) {
		for (const record of recordsForReferences(references)) {
			preliminaryCounts.set(record, (preliminaryCounts.get(record) ?? 0) + 1);
		}
	}
	const sharedQueue = [];
	for (const [record, count] of preliminaryCounts) {
		if (count > 1 && !eagerRecords.has(record)) {
			eagerRecords.add(record);
			sharedQueue.push(record);
		}
	}
	for (let index = 0; index < sharedQueue.length; index++) {
		for (const dependency of sharedQueue[index].dependencies) {
			const record = candidates.byBinding.get(dependency);
			if (record !== undefined && !eagerRecords.has(record)) {
				eagerRecords.add(record);
				sharedQueue.push(record);
			}
		}
	}

	const bindingsByPath = new Map();
	const declarationsByPath = new Map();
	const movedRecords = new Set();
	for (const boundary of analysis.boundaries) {
		if (boundary.disabled) continue;
		const records = recordsForReferences(referencesByPath.get(boundary.path) ?? []);
		if (records.size === 0) continue;
		const ordered = candidates.records.filter((record) => records.has(record));
		const bindings = new Set(ordered.flatMap((record) => [...record.bindings]));
		bindingsByPath.set(boundary.path, bindings);
		declarationsByPath.set(boundary.path, ordered);
		for (const record of ordered) movedRecords.add(record);
	}
	return {
		bindingsByPath,
		declarationsByPath,
		movedRecords: candidates.records.filter((record) => movedRecords.has(record)),
	};
}

function sameSourceRequest(filename) {
	const normalized = filename.replace(/\\/g, '/');
	const name = normalized.slice(normalized.lastIndexOf('/') + 1);
	return './' + name;
}

function loaderExpression(boundary, request) {
	const query = `${request}?${HYDRATE_QUERY_PARAM}=${encodeURIComponent(boundary.path)}`;
	return `() => import(${JSON.stringify(query)})`;
}

function boundaryMappingNeedles(source, boundary) {
	const needles = [];
	const keys = new Set();
	const seen = new WeakSet();
	const add = (code, offset) => {
		if (!code || code.length > 160 || code.includes('\n')) return;
		if (keys.has(code)) return;
		keys.add(code);
		needles.push({ code, offset });
	};
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node.type === 'JSXExpressionContainer' && node.expression) {
			add(source.slice(node.expression.start, node.expression.end), node.expression.start);
		}
		if (node.type === 'Identifier' && typeof node.start === 'number') {
			add(node.name, node.start);
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			visit(value);
		}
	};
	visit(boundary.node.children);
	return needles;
}

function boundaryReplacements(
	source,
	boundary,
	request,
	importBindings,
	additionalModuleBindings = new Set(),
) {
	if (boundary.disabled) return [];
	assertDirectChildren(boundary, boundary.filename);
	validateBoundary(boundary, boundary.filename, boundary.hookNames);
	const availableBindings = new Set([...importBindings, ...additionalModuleBindings]);
	const captures = collectCaptures(
		boundary.node.children,
		availableBindings,
		boundary.shadowedImports,
	);
	const childrenStart = boundary.node.openingElement.end;
	const childrenEnd = boundary.node.closingElement.start;
	const insert = openingInsertOffset(source, boundary.node.openingElement);
	const data = captures.length === 0 ? '' : ` __data={[${captures.join(', ')}]}`;
	// Keep an explicit children prop after extracting the body. This preserves the
	// component-call marker shape that hydration expects while __load supplies the
	// deferred body at activation time.
	return [
		{
			start: insert,
			end: insert,
			value: generatedText(
				` __load={${loaderExpression(boundary, request)}}${data} children={null}`,
			),
		},
		{ start: childrenStart, end: childrenEnd, value: generatedText('') },
	];
}

function extractionFrontier(boundaries) {
	const output = [];
	const visit = (boundary) => {
		if (boundary.disabled) {
			for (const child of boundary.children) visit(child);
		} else {
			output.push(boundary);
		}
	};
	for (const boundary of boundaries) visit(boundary);
	return output;
}

function uniqueGeneratedName(source, preferred) {
	let name = preferred;
	while (source.includes(name)) name += '$';
	return name;
}

function extractedModule(
	source,
	filename,
	analysis,
	boundary,
	request,
	moduleBindingsByPath = new Map(),
	moduleDeclarationsByPath = new Map(),
) {
	if (boundary.disabled) {
		throw extractionError(
			'OCTANE_HYDRATE_DISABLED_QUERY',
			filename,
			boundary.node,
			`boundary ${JSON.stringify(boundary.path)} has literal \`split={false}\` and has no split module`,
		);
	}
	assertDirectChildren(boundary, filename);
	validateBoundary(boundary, filename, analysis.imports.hookNames);
	const moduleBindings = moduleBindingsByPath.get(boundary.path) ?? new Set();
	const captures = collectCaptures(
		boundary.node.children,
		new Set([...analysis.imports.importBindings, ...moduleBindings]),
		boundary.shadowedImports,
	);
	const pathName = boundary.path.replace(/[^A-Za-z0-9_$]/g, '_');
	const componentName = uniqueGeneratedName(source, `__OctaneHydrateBoundary_${pathName}`);
	const captureName = uniqueGeneratedName(source, `__octaneHydrateCaptures_${pathName}`);
	const importParts = analysis.imports.declarations.flatMap((declaration, index) => [
		...(index === 0 ? [] : [generatedText('\n')]),
		authoredText(source, declaration.start, declaration.end),
	]);
	const movedDeclarationParts = (moduleDeclarationsByPath.get(boundary.path) ?? []).flatMap(
		(record, index) => [
			...(index === 0 ? [] : [generatedText('\n')]),
			authoredText(source, record.node.start, record.node.end),
		],
	);
	const nestedReplacements = extractionFrontier(boundary.children).flatMap((child) => {
		child.filename = filename;
		return boundaryReplacements(
			source,
			child,
			request,
			analysis.imports.importBindings,
			moduleBindingsByPath.get(child.path),
		);
	});
	const children = applyMappedReplacements(
		source,
		boundary.node.openingElement.end,
		boundary.node.closingElement.start,
		nestedReplacements,
	);
	const captureSetup =
		captures.length === 0 ? '' : `\n const [${captures.join(', ')}] = ${captureName};`;
	return concatMapped(
		importParts,
		importParts.length === 0 ? null : generatedText('\n'),
		movedDeclarationParts,
		movedDeclarationParts.length === 0 ? null : generatedText('\n'),
		generatedText(
			`export default function ${componentName}(${captureName}) @{${captureSetup}\n <>`,
		),
		children,
		generatedText(`</>\n}\n`),
	);
}

/** Read the stable Hydrate boundary path from a bundler resource ID. */
export function hydrateBoundaryPathFromId(id) {
	const queryIndex = id.indexOf('?');
	if (queryIndex === -1) return null;
	const hashIndex = id.indexOf('#', queryIndex);
	const query = id.slice(queryIndex + 1, hashIndex === -1 ? id.length : hashIndex);
	const values = new URLSearchParams(query).getAll(HYDRATE_QUERY_PARAM);
	if (values.length === 0) return null;
	if (values.length !== 1 || !/^\d+(?:\.\d+)*$/.test(values[0])) {
		const error = new Error(
			`Octane Hydrate compiler: invalid ${HYDRATE_QUERY_PARAM} resource query in ${JSON.stringify(id)}.`,
		);
		error.code = 'OCTANE_HYDRATE_INVALID_QUERY';
		throw error;
	}
	return values[0];
}

/**
 * Prepare either the authored client module or one independently requested
 * split child. Server modules deliberately bypass this pass and retain their
 * real children.
 */
export function prepareHydrateBoundaries(source, filename, boundaryPath = null) {
	if (!source.includes('Hydrate') || !source.includes('octane')) {
		if (boundaryPath === null) return null;
		throw extractionError(
			'OCTANE_HYDRATE_QUERY_NOT_FOUND',
			filename,
			null,
			`boundary ${JSON.stringify(boundaryPath)} does not exist`,
		);
	}
	const analysis = analyzeHydrateBoundaries(source, filename);
	if (analysis.boundaries.length === 0) {
		if (boundaryPath === null) return null;
		throw extractionError(
			'OCTANE_HYDRATE_QUERY_NOT_FOUND',
			filename,
			null,
			`boundary ${JSON.stringify(boundaryPath)} does not exist`,
		);
	}
	for (const boundary of analysis.boundaries) {
		boundary.filename = filename;
		boundary.hookNames = analysis.imports.hookNames;
	}
	const request = sameSourceRequest(filename);
	const moduleMovePlan = createModuleMovePlan(source, filename, analysis, request);
	let transformed;
	if (boundaryPath === null) {
		const replacements = extractionFrontier(analysis.roots).flatMap((boundary) =>
			boundaryReplacements(
				source,
				boundary,
				request,
				analysis.imports.importBindings,
				moduleMovePlan.bindingsByPath.get(boundary.path),
			),
		);
		for (const record of moduleMovePlan.movedRecords) {
			replacements.push({
				start: record.node.start,
				end: record.node.end,
				value: generatedText(''),
			});
		}
		if (replacements.length === 0) return null;
		transformed = applyMappedReplacements(source, 0, source.length, replacements);
		transformed = pruneUnusedImports(transformed, filename, true);
	} else {
		const boundary = analysis.boundaries.find((candidate) => candidate.path === boundaryPath);
		if (boundary === undefined) {
			throw extractionError(
				'OCTANE_HYDRATE_QUERY_NOT_FOUND',
				filename,
				null,
				`boundary ${JSON.stringify(boundaryPath)} does not exist`,
			);
		}
		transformed = extractedModule(
			source,
			filename,
			analysis,
			boundary,
			request,
			moduleMovePlan.bindingsByPath,
			moduleMovePlan.declarationsByPath,
		);
		transformed = pruneUnusedImports(transformed, filename, false);
	}
	return {
		boundaryPath,
		map: sourceMapFromOrigins(transformed.code, transformed.origins, source, filename),
		mappingNeedles:
			boundaryPath === null
				? extractionFrontier(analysis.roots).flatMap((boundary) =>
						boundaryMappingNeedles(source, boundary),
					)
				: boundaryMappingNeedles(
						source,
						analysis.boundaries.find((boundary) => boundary.path === boundaryPath),
					),
		source: transformed.code,
	};
}

function fallbackObjectReplacements(object) {
	const properties = object.properties ?? [];
	const removed = properties.map(
		(property) => property.type !== 'SpreadElement' && nameOf(property.key) === 'fallback',
	);
	const replacements = [];
	for (let index = 0; index < properties.length; ) {
		if (!removed[index]) {
			index++;
			continue;
		}
		const first = index;
		while (index + 1 < properties.length && removed[index + 1]) index++;
		const last = index;
		const previous = first > 0 ? properties[first - 1] : null;
		const next = last + 1 < properties.length ? properties[last + 1] : null;
		replacements.push({
			start: next !== null ? properties[first].start : (previous?.end ?? object.start + 1),
			end: next !== null ? next.start : previous !== null ? properties[last].end : object.end - 1,
			value: generatedText(''),
		});
		index++;
	}
	return replacements;
}

function collectSingleUseConstObjects(ast) {
	const candidatesByName = new Map();
	const candidateIds = new WeakSet();
	const ownerByNode = new WeakMap();
	const referencesByName = new Map();
	const seen = new WeakSet();
	const functions = new Set([
		'ArrowFunctionExpression',
		'FunctionDeclaration',
		'FunctionExpression',
	]);
	const collect = (node, owner = null, exported = false) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collect(child, owner, exported);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		ownerByNode.set(node, owner);
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			collect(node.expression, owner, exported);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
			collect(node.declaration, owner, true);
			collect(node.specifiers, owner, true);
			collect(node.source, owner, true);
			return;
		}
		const childOwner = functions.has(node.type) ? node : owner;
		if (node.type === 'VariableDeclaration' && node.kind === 'const' && !exported) {
			for (const declaration of node.declarations ?? []) {
				const object = unwrapExpression(declaration.init);
				if (declaration.id?.type !== 'Identifier' || object?.type !== 'ObjectExpression') {
					continue;
				}
				const candidate = {
					id: declaration.id,
					name: declaration.id.name,
					object,
					owner,
				};
				candidateIds.add(declaration.id);
				let values = candidatesByName.get(candidate.name);
				if (values === undefined) candidatesByName.set(candidate.name, (values = []));
				values.push(candidate);
			}
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			collect(value, childOwner, false);
		}
	};
	collect(ast);

	const counted = new WeakSet();
	const count = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) count(child);
			return;
		}
		if (counted.has(node)) return;
		counted.add(node);
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			count(node.expression);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		if (node.type === 'Identifier' && !candidateIds.has(node)) {
			let references = referencesByName.get(node.name);
			if (references === undefined) referencesByName.set(node.name, (references = []));
			references.push(node);
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			count(value);
		}
	};
	count(ast);
	return { candidatesByName, ownerByNode, referencesByName };
}

/**
 * A Hydrate fallback is only observable for a client-only/later mount. Initial
 * SSR always renders the real children, so a directly authored fallback must
 * not retain its component graph or execute its expression in the server
 * bundle. Inline object spreads and unshared const object spreads can drop the
 * same property safely; shared and dynamic spreads remain untouched because
 * their other observations are not compiler-owned.
 */
export function prepareServerHydrateBoundaries(source, filename) {
	if (!source.includes('Hydrate') || !source.includes('octane')) return null;
	const analysis = analyzeHydrateBoundaries(source, filename);
	if (analysis.boundaries.length === 0) return null;
	const constObjects = collectSingleUseConstObjects(analysis.ast);
	const replacements = [];
	for (const boundary of analysis.boundaries) {
		for (const attribute of boundary.node.openingElement?.attributes ?? []) {
			if (jsxAttributeName(attribute) === 'fallback') {
				replacements.push({
					start: attribute.start,
					end: attribute.end,
					value: generatedText(''),
				});
				continue;
			}
			if (attribute.type !== 'JSXSpreadAttribute' && attribute.type !== 'SpreadAttribute') {
				continue;
			}
			const argument = unwrapExpression(attribute.argument);
			if (argument?.type === 'ObjectExpression') {
				replacements.push(...fallbackObjectReplacements(argument));
				continue;
			}
			if (argument?.type !== 'Identifier') continue;
			const candidates = constObjects.candidatesByName.get(argument.name);
			const references = constObjects.referencesByName.get(argument.name);
			if (candidates?.length !== 1 || references?.length !== 1 || references[0] !== argument) {
				continue;
			}
			const candidate = candidates[0];
			const owner = constObjects.ownerByNode.get(argument) ?? null;
			if (candidate.owner !== null && candidate.owner !== owner) continue;
			replacements.push(...fallbackObjectReplacements(candidate.object));
		}
	}
	if (replacements.length === 0) return null;
	// Removing an outer fallback also removes any Hydrate authored inside that
	// fallback. Keep only outermost ranges so nested client-only fallbacks cannot
	// produce overlapping textual edits.
	const outermost = [];
	let coveredUntil = -1;
	for (const replacement of replacements.sort(
		(left, right) => left.start - right.start || right.end - left.end,
	)) {
		if (replacement.start < coveredUntil) continue;
		outermost.push(replacement);
		coveredUntil = replacement.end;
	}
	const transformed = applyMappedReplacements(source, 0, source.length, outermost);
	return {
		boundaryPath: null,
		map: sourceMapFromOrigins(transformed.code, transformed.origins, source, filename),
		mappingNeedles: [],
		source: transformed.code,
	};
}
