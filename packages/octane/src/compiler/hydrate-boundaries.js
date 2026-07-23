/**
 * Compiler-owned `<Hydrate>` child extraction.
 *
 * A split boundary imports the same authored module with a stable resource
 * query. The queried transform receives the original source again and derives
 * the requested child module from that source alone; no adapter-owned virtual
 * module cache is required. This is important for Rspack, whose loader is
 * intentionally instantiated afresh for every resource query.
 */
import { builders as b, parseModule } from '@tsrx/core';

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

function inheritGeneratedOrigin(root, origin) {
	const seen = new WeakSet();
	const visit = (value) => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value.type === 'string' && value.loc == null && origin?.loc != null) {
			value.start = origin.start;
			value.end = origin.end;
			value.loc = origin.loc;
		}
		for (const [key, child] of Object.entries(value)) {
			if (!SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(root);
	return root;
}

function mapAstCow(value, replace) {
	if (!value || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		let output = null;
		for (let index = 0; index < value.length; index++) {
			const mapped = mapAstCow(value[index], replace);
			if (output === null && mapped !== value[index]) output = value.slice(0, index);
			if (output !== null && mapped !== null) output.push(mapped);
		}
		return output ?? value;
	}
	const replacement = replace(value);
	if (replacement !== undefined) return replacement;
	let output = null;
	for (const [key, child] of Object.entries(value)) {
		if (SKIP_KEYS.has(key)) continue;
		const mapped = mapAstCow(child, replace);
		if (mapped !== child) {
			if (output === null) output = { ...value };
			output[key] = mapped;
		}
	}
	return output ?? value;
}

/**
 * Copy-on-write post-order mapper for rewrites where a replaced parent must
 * retain rewrites made to nested nodes. `replace` receives both the parser-owned
 * node used as a WeakMap key and the child-mapped working copy.
 */
function mapAstCowPost(value, replace) {
	if (!value || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		let output = null;
		for (let index = 0; index < value.length; index++) {
			const mapped = mapAstCowPost(value[index], replace);
			if (output === null && mapped !== value[index]) output = value.slice(0, index);
			if (output !== null && mapped !== null) output.push(mapped);
		}
		return output ?? value;
	}
	let output = null;
	for (const [key, child] of Object.entries(value)) {
		if (SKIP_KEYS.has(key)) continue;
		const mapped = mapAstCowPost(child, replace);
		if (mapped !== child) {
			if (output === null) output = { ...value };
			output[key] = mapped;
		}
	}
	const working = output ?? value;
	const replacement = replace(value, working);
	return replacement === undefined ? working : replacement;
}

function jsxExpressionAttribute(name, expression, origin) {
	return inheritGeneratedOrigin(
		b.jsx_attribute(
			b.jsx_id(name, origin),
			b.jsx_expression_container(expression, origin),
			false,
			origin,
		),
		origin,
	);
}

function hydrateLoaderExpression(boundary, request) {
	const query = `${request}?${HYDRATE_QUERY_PARAM}=${encodeURIComponent(boundary.path)}`;
	return inheritGeneratedOrigin(
		b.arrow([], {
			type: 'ImportExpression',
			source: b.literal(query, JSON.stringify(query)),
			metadata: { path: [] },
		}),
		boundary.node,
	);
}

function permanentStaticName(name, origin) {
	return inheritGeneratedOrigin(
		b.jsx_member(name, b.jsx_id(PERMANENT_STATIC_HYDRATE_MEMBER, origin)),
		origin,
	);
}

function nameOf(node) {
	if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function collectBindingNames(pattern, output) {
	if (!pattern) return;
	if (pattern.type === 'TSParameterProperty') {
		collectBindingNames(pattern.parameter, output);
		return;
	}
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
				node.type === 'ArrowFunctionExpression' ||
				node.type === 'ClassDeclaration' ||
				node.type === 'ClassExpression' ||
				node.type === 'StaticBlock' ||
				node.type === 'TSModuleDeclaration')
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
	const neverNames = new Set();
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
			if (
				statement.source?.value === 'octane/hydration' &&
				statement.importKind !== 'type' &&
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				nameOf(specifier.imported) === 'never' &&
				specifier.local?.name
			) {
				neverNames.add(specifier.local.name);
			}
		}
	}
	return { declarations, hookNames, hydrateNames, neverNames, importBindings };
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

/**
 * Recognize only the exact server-only form whose client subtree may be erased.
 * Spreads and indirect strategies stay on the ordinary persistent-wrapper path:
 * either could change the final `split`, `when`, or `children` value at runtime.
 */
function isPermanentStaticBoundary(node, neverNames, shadowedImports) {
	let split = null;
	let when = null;
	const attributes = node.openingElement?.attributes ?? [];
	if (attributes.length !== 2) return false;
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			return false;
		}
		const name = jsxAttributeName(attribute);
		if (name === 'children') return false;
		if (name === 'split') split = attribute;
		else if (name === 'when') when = attribute;
	}
	if (split === null || when === null || !literalSplitDisabled(node)) return false;
	const raw = when.value?.type === 'JSXExpressionContainer' ? when.value.expression : when.value;
	const expression = unwrapExpression(raw);
	if (expression?.type !== 'CallExpression' || (expression.arguments?.length ?? 0) !== 0) {
		return false;
	}
	const callee = unwrapExpression(expression.callee);
	return (
		callee?.type === 'Identifier' &&
		neverNames.has(callee.name) &&
		!shadowedImports.has(callee.name)
	);
}

const PERMANENT_STATIC_HYDRATE_MEMBER = '__octanePermanentStatic';

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
	const visit = (node, directHooks = true, capturesThis = true, capturesSuper = true) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, directHooks, capturesThis, capturesSuper);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			visit(node.expression, directHooks, capturesThis, capturesSuper);
			return;
		}
		if (node.type === 'ThisExpression' && capturesThis) {
			throw extractionError(
				'OCTANE_HYDRATE_THIS_CAPTURE',
				filename,
				node,
				'`this` cannot be captured by a split child. Pass its value through a local or set `split={false}`',
			);
		}
		if (node.type === 'Super' && capturesSuper) {
			throw extractionError(
				'OCTANE_HYDRATE_SUPER_CAPTURE',
				filename,
				node,
				'`super` cannot be captured by a split child. Extract a component or set `split={false}`',
			);
		}
		if (directHooks && isHookCall(node, hookNames)) {
			throw extractionError(
				'OCTANE_HYDRATE_DIRECT_HOOK',
				filename,
				node,
				'direct hook calls cannot move into a split child. Call the hook in a child component or set `split={false}`',
			);
		}
		// `directHooks` also marks the owning component's direct render scope: a
		// scoped <style> there belongs to that component's single style scope,
		// which extraction would tear in half (the server annotates the whole
		// component with one scope hash; the split chunk would compile the sheet
		// under another). Styles nested inside functions never joined the
		// component scope, so they move freely.
		if (directHooks && node.type === 'JSXStyleElement') {
			throw extractionError(
				'OCTANE_HYDRATE_SPLIT_STYLE',
				filename,
				node,
				'a scoped <style> cannot move into a split child — its rules belong to the owning component’s style scope. Move the <style> outside the boundary, into a child component, or set `split={false}`',
			);
		}
		if (isFunction(node)) {
			// A nested function keeps hook calls in its own invocation. Ordinary
			// functions also bind their own receiver; arrows still capture `this`
			// and `super` from the component scope that extraction would replace.
			const lexicalReceiver = unwrapExpression(node).type === 'ArrowFunctionExpression';
			for (const [key, value] of Object.entries(node)) {
				if (
					SKIP_KEYS.has(key) ||
					(key === 'expression' && TRANSPARENT_TS_EXPRESSIONS.has(node.type))
				) {
					continue;
				}
				visit(value, false, lexicalReceiver && capturesThis, lexicalReceiver && capturesSuper);
			}
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (
				SKIP_KEYS.has(key) ||
				(key === 'expression' && TRANSPARENT_TS_EXPRESSIONS.has(node.type))
			) {
				continue;
			}
			visit(value, directHooks, capturesThis, capturesSuper);
		}
	};
	visit(boundary.node.children);
}

/** Resolve Hydrate boundaries and assign source-order paths under their nearest boundary. */
export function analyzeHydrateBoundaries(source, filename = 'unknown.tsrx', parsedAst = null) {
	const ast = parsedAst ?? parseModule(source, filename);
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
					permanentStatic: isPermanentStaticBoundary(node, imports.neverNames, shadowed),
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
			const parameterBindings = new Set();
			collectBindingNames(node.id, parameterBindings);
			for (const parameter of node.params ?? []) {
				collectBindingNames(parameter, parameterBindings);
			}
			// A non-simple parameter list executes outside the function body's `var`
			// environment. Defaults and computed parameter keys can therefore still
			// reference a module binding with the same name as a body-local `var`.
			scopes.push(parameterBindings);
			for (const parameter of node.params ?? []) visitPatternDefaults(parameter);
			scopes.pop();
			const bodyBindings = new Set(parameterBindings);
			for (const binding of functionVarBindings(node.body)) bodyBindings.add(binding);
			scopes.push(bodyBindings);
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

// `collectCaptures` deliberately ignores erased TypeScript syntax, but these
// nodes either emit JavaScript or contain runtime initializers. The permanent-
// static declaration pruner must not prove exclusivity with an analysis that
// cannot see those references. Keep the direct subtree erasure/import pruning,
// but leave module declarations intact whenever one of these forms is present.
const PRIVATE_DECLARATION_PRUNING_UNSAFE_TS_NODES = new Set([
	'TSEnumDeclaration',
	'TSExportAssignment',
	'TSImportEqualsDeclaration',
	'TSModuleDeclaration',
	'TSParameterProperty',
]);

function canPrunePrivateModuleDeclarations(ast) {
	let safe = true;
	const seen = new WeakSet();
	const visit = (node) => {
		if (!safe || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		// Direct eval can observe module/function lexical bindings that do not
		// appear as identifier nodes in the parsed AST. Treat even a shadowed
		// syntactic `eval(...)` conservatively rather than deleting a declaration
		// whose name may be read from the string payload.
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			node.callee.name === 'eval'
		) {
			safe = false;
			return;
		}
		if (PRIVATE_DECLARATION_PRUNING_UNSAFE_TS_NODES.has(node.type)) {
			safe = false;
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			visit(value);
		}
	};
	visit(ast);
	return safe;
}

function localExportBindings(ast) {
	const bindings = new Set();
	for (const statement of ast.body ?? []) {
		if (statement.type === 'ExportNamedDeclaration' && statement.source == null) {
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.local?.name) bindings.add(specifier.local.name);
			}
		} else if (
			statement.type === 'ExportDefaultDeclaration' &&
			statement.declaration?.type === 'Identifier'
		) {
			bindings.add(statement.declaration.name);
		}
	}
	return bindings;
}

/** Private module declarations that can disappear with a proven server-only graph. */
function privateModuleDeclarationGraph(ast, importBindings) {
	const records = [];
	const exportedBindings = localExportBindings(ast);
	for (const node of ast.body ?? []) {
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
		const bindings = declarationBindingSet(node);
		if (bindings.size === 0) continue;
		records.push({
			bindings,
			dependencies: new Set(),
			// Removing one declarator must not discard an unrelated initializer in
			// the same authored statement. Keep multi-declarator declarations whole.
			removable:
				![...bindings].some((binding) => exportedBindings.has(binding)) &&
				(node.type !== 'VariableDeclaration' ||
					((node.declarations?.length ?? 0) === 1 && bindings.size === 1)),
			node,
		});
	}
	const byBinding = new Map();
	for (const record of records) {
		for (const binding of record.bindings) byBinding.set(binding, record);
	}
	for (const record of records) {
		for (const dependency of collectCaptures([record.node], importBindings)) {
			if (byBinding.has(dependency)) record.dependencies.add(dependency);
		}
	}
	return { byBinding, records };
}

function movableModuleDeclarations(analysis) {
	const records = [];
	const moduleBindings = topLevelBindingNames(analysis.ast);
	const exportedBindings = localExportBindings(analysis.ast);
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
		if ([...bindings].some((binding) => exportedBindings.has(binding))) continue;
		records.push({
			bindings,
			dependencies: new Set(),
			retainedDependencies: new Set(),
			node,
		});
	}
	const byBinding = new Map();
	for (const record of records) {
		for (const binding of record.bindings) byBinding.set(binding, record);
	}
	for (const record of records) {
		for (const dependency of collectCaptures([record.node], analysis.imports.importBindings)) {
			if (byBinding.has(dependency)) {
				record.dependencies.add(dependency);
			} else if (moduleBindings.has(dependency)) {
				record.retainedDependencies.add(dependency);
			}
		}
	}
	return { byBinding, records };
}

function sameSourceRequest(filename) {
	const normalized = filename.replace(/\\/g, '/');
	const name = normalized.slice(normalized.lastIndexOf('/') + 1);
	return './' + name;
}

function extractionFrontier(boundaries) {
	const output = [];
	const visit = (boundary) => {
		if (boundary.permanentStatic) {
			output.push(boundary);
		} else if (boundary.disabled) {
			for (const child of boundary.children) visit(child);
		} else {
			output.push(boundary);
		}
	};
	for (const boundary of boundaries) visit(boundary);
	return output;
}

function hasPermanentStaticAncestor(boundary) {
	for (let parent = boundary.parent; parent !== null; parent = parent.parent) {
		if (parent.permanentStatic) return true;
	}
	return false;
}

function uniqueGeneratedName(source, preferred) {
	let name = preferred;
	while (source.includes(name)) name += '$';
	return name;
}

function permanentStaticStyleNodes(boundary) {
	const styles = [];
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			return;
		}
		if (node.type === 'JSXStyleElement') {
			styles.push(node);
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (!SKIP_KEYS.has(key)) visit(value);
		}
	};
	visit(boundary.node.children);
	return styles.sort((left, right) => left.start - right.start);
}

function hydrateBoundaryElement(
	boundary,
	request,
	importBindings,
	additionalModuleBindings = new Set(),
) {
	const node = boundary.node;
	const opening = node.openingElement;
	if (boundary.permanentStatic) {
		const children = permanentStaticStyleNodes(boundary);
		return {
			...node,
			children,
			openingElement: {
				...opening,
				name: permanentStaticName(opening.name, opening.name),
				attributes: [
					...(opening.attributes ?? []),
					jsxExpressionAttribute('children', b.literal(null, 'null'), opening),
				],
			},
			closingElement:
				node.closingElement === null
					? null
					: {
							...node.closingElement,
							name: permanentStaticName(node.closingElement.name, node.closingElement.name),
						},
		};
	}
	if (boundary.disabled) return node;
	assertDirectChildren(boundary, boundary.filename);
	validateBoundary(boundary, boundary.filename, boundary.hookNames);
	const availableBindings = new Set([...importBindings, ...additionalModuleBindings]);
	const captures = collectCaptures(node.children, availableBindings, boundary.shadowedImports);
	const attributes = [
		...(opening.attributes ?? []),
		jsxExpressionAttribute('__load', hydrateLoaderExpression(boundary, request), opening),
	];
	if (captures.length > 0) {
		attributes.push(
			jsxExpressionAttribute(
				'__data',
				inheritGeneratedOrigin(b.array(captures.map((name) => b.id(name))), opening),
				opening,
			),
		);
	}
	attributes.push(jsxExpressionAttribute('children', b.literal(null, 'null'), opening));
	return {
		...node,
		children: [],
		openingElement: { ...opening, attributes },
	};
}

function transformHydrateAst(
	ast,
	analysis,
	request,
	bindingsByPath = new Map(),
	removedRecords = [],
) {
	const replacements = new WeakMap();
	for (const boundary of extractionFrontier(analysis.roots)) {
		replacements.set(
			boundary.node,
			hydrateBoundaryElement(
				boundary,
				request,
				analysis.imports.importBindings,
				bindingsByPath.get(boundary.path),
			),
		);
	}
	const removed = new WeakSet(removedRecords.map((record) => record.node));
	return mapAstCow(ast, (node) => {
		if (removed.has(node)) return null;
		return replacements.has(node) ? replacements.get(node) : undefined;
	});
}

function pruneUnusedImportsAst(ast, preserveBareImports) {
	const declarations = (ast.body ?? []).filter((node) => node.type === 'ImportDeclaration');
	if (declarations.length === 0) return ast;
	const referenced = new Set(
		collectCaptures(
			(ast.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
			new Set(),
		),
	);
	const replacements = new WeakMap();
	let changed = false;
	for (const declaration of declarations) {
		const specifiers = declaration.specifiers ?? [];
		if (specifiers.length === 0) {
			if (!preserveBareImports) {
				replacements.set(declaration, null);
				changed = true;
			}
			continue;
		}
		const kept = specifiers.filter((specifier) => referenced.has(specifier.local?.name));
		if (kept.length === specifiers.length) continue;
		replacements.set(declaration, kept.length === 0 ? null : { ...declaration, specifiers: kept });
		changed = true;
	}
	if (!changed) return ast;
	return mapAstCow(ast, (node) => (replacements.has(node) ? replacements.get(node) : undefined));
}

function extractedModuleAst(
	source,
	analysis,
	boundary,
	request,
	moduleBindingsByPath = new Map(),
	moduleDeclarationsByPath = new Map(),
) {
	if (boundary.disabled) {
		throw extractionError(
			'OCTANE_HYDRATE_DISABLED_QUERY',
			boundary.filename,
			boundary.node,
			`boundary ${JSON.stringify(boundary.path)} has literal \`split={false}\` and has no split module`,
		);
	}
	assertDirectChildren(boundary, boundary.filename);
	validateBoundary(boundary, boundary.filename, analysis.imports.hookNames);
	const moduleBindings = moduleBindingsByPath.get(boundary.path) ?? new Set();
	const captures = collectCaptures(
		boundary.node.children,
		new Set([...analysis.imports.importBindings, ...moduleBindings]),
		boundary.shadowedImports,
	);
	const pathName = boundary.path.replace(/[^A-Za-z0-9_$]/g, '_');
	const componentName = uniqueGeneratedName(source, `__OctaneHydrateBoundary_${pathName}`);
	const captureName = uniqueGeneratedName(source, `__octaneHydrateCaptures_${pathName}`);
	const nestedAnalysis = {
		...analysis,
		roots: boundary.children,
	};
	const fragmentChildren = transformHydrateAst(
		{
			type: 'Program',
			sourceType: 'module',
			body: boundary.node.children,
			metadata: { path: [] },
		},
		nestedAnalysis,
		request,
		moduleBindingsByPath,
	).body;
	const setup =
		captures.length === 0
			? []
			: [
					inheritGeneratedOrigin(
						b.const(b.array_pattern(captures.map((name) => b.id(name))), b.id(captureName)),
						boundary.node,
					),
				];
	const codeBlock = inheritGeneratedOrigin(
		{
			type: 'JSXCodeBlock',
			body: setup,
			render: b.jsx_fragment(fragmentChildren),
			metadata: { path: [] },
		},
		boundary.node,
	);
	const generatedExport = inheritGeneratedOrigin(
		b.export_default(b.function_declaration(b.id(componentName), [b.id(captureName)], codeBlock)),
		boundary.node,
	);
	const program = {
		...analysis.ast,
		body: [
			...analysis.imports.declarations,
			...(moduleDeclarationsByPath.get(boundary.path) ?? []).map((record) => record.node),
			generatedExport,
		],
	};
	return pruneUnusedImportsAst(program, false);
}

function createModuleMovePlanAst(source, analysis, request) {
	const candidates = movableModuleDeclarations(analysis);
	if (candidates.records.length === 0) {
		return {
			bindingsByPath: new Map(),
			declarationsByPath: new Map(),
			movedRecords: [],
		};
	}
	const allBindings = new Set(candidates.byBinding.keys());
	const allBindingsByPath = new Map();
	for (const boundary of analysis.boundaries) {
		if (!boundary.disabled && !hasPermanentStaticAncestor(boundary)) {
			allBindingsByPath.set(boundary.path, allBindings);
		}
	}
	const provisionalRoot = transformHydrateAst(
		analysis.ast,
		analysis,
		request,
		allBindingsByPath,
		candidates.records,
	);
	const eagerReferences = new Set(
		collectCaptures(
			(provisionalRoot.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
			analysis.imports.importBindings,
		),
	);
	const eagerRecords = new Set();
	const dependents = new Map();
	for (const record of candidates.records) {
		for (const dependency of record.dependencies) {
			const dependencyRecord = candidates.byBinding.get(dependency);
			if (dependencyRecord === undefined || dependencyRecord === record) continue;
			let records = dependents.get(dependencyRecord);
			if (records === undefined) dependents.set(dependencyRecord, (records = new Set()));
			records.add(record);
		}
	}
	const markEager = (seeds) => {
		const queue = [];
		const enqueue = (record) => {
			if (record === undefined || eagerRecords.has(record)) return;
			eagerRecords.add(record);
			queue.push(record);
		};
		for (const record of seeds) enqueue(record);
		for (let index = 0; index < queue.length; index++) {
			const record = queue[index];
			for (const dependency of record.dependencies) enqueue(candidates.byBinding.get(dependency));
			for (const dependent of dependents.get(record) ?? []) enqueue(dependent);
		}
	};
	const eagerSeeds = candidates.records.filter((record) => record.retainedDependencies.size > 0);
	for (const name of eagerReferences) {
		const record = candidates.byBinding.get(name);
		if (record !== undefined) eagerSeeds.push(record);
	}
	markEager(eagerSeeds);

	const referencesByPath = new Map();
	for (const boundary of analysis.boundaries) {
		if (boundary.disabled || hasPermanentStaticAncestor(boundary)) continue;
		const childAst = extractedModuleAst(source, analysis, boundary, request, allBindingsByPath);
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
	const preliminaryCounts = new Map();
	for (const references of referencesByPath.values()) {
		for (const record of recordsForReferences(references)) {
			preliminaryCounts.set(record, (preliminaryCounts.get(record) ?? 0) + 1);
		}
	}
	markEager([...preliminaryCounts].filter(([, count]) => count > 1).map(([record]) => record));

	const bindingsByPath = new Map();
	const declarationsByPath = new Map();
	const movedRecords = new Set();
	for (const boundary of analysis.boundaries) {
		if (boundary.disabled || hasPermanentStaticAncestor(boundary)) continue;
		const records = recordsForReferences(referencesByPath.get(boundary.path) ?? []);
		if (records.size === 0) continue;
		const ordered = candidates.records.filter((record) => records.has(record));
		bindingsByPath.set(boundary.path, new Set(ordered.flatMap((record) => [...record.bindings])));
		declarationsByPath.set(boundary.path, ordered);
		for (const record of ordered) movedRecords.add(record);
	}
	return {
		bindingsByPath,
		declarationsByPath,
		movedRecords: candidates.records.filter((record) => movedRecords.has(record)),
	};
}

function createPermanentStaticRemovalPlanAst(analysis, request, moduleMovePlan) {
	const staticBoundaries = analysis.boundaries.filter(
		(boundary) => boundary.permanentStatic && !hasPermanentStaticAncestor(boundary),
	);
	if (staticBoundaries.length === 0 || !canPrunePrivateModuleDeclarations(analysis.ast)) {
		return [];
	}
	const authored = privateModuleDeclarationGraph(analysis.ast, analysis.imports.importBindings);
	if (authored.records.length === 0) return [];
	const staticRecords = new Set();
	const staticQueue = [];
	const enqueueStatic = (record) => {
		if (record === undefined || staticRecords.has(record)) return;
		staticRecords.add(record);
		staticQueue.push(record);
	};
	for (const boundary of staticBoundaries) {
		for (const reference of collectCaptures(
			boundary.node.children,
			analysis.imports.importBindings,
			boundary.shadowedImports,
		)) {
			enqueueStatic(authored.byBinding.get(reference));
		}
	}
	for (let index = 0; index < staticQueue.length; index++) {
		for (const dependency of staticQueue[index].dependencies) {
			enqueueStatic(authored.byBinding.get(dependency));
		}
	}
	if (staticRecords.size === 0) return [];

	const preparedAst = transformHydrateAst(
		analysis.ast,
		analysis,
		request,
		moduleMovePlan.bindingsByPath,
		moduleMovePlan.movedRecords,
	);
	const preparedImports = collectImports(preparedAst);
	const client = privateModuleDeclarationGraph(preparedAst, preparedImports.importBindings);
	const removableClientNodes = new WeakSet(
		client.records.filter((record) => record.removable).map((record) => record.node),
	);
	const eagerAst = mapAstCow(preparedAst, (node) =>
		removableClientNodes.has(node) ? null : undefined,
	);
	const eagerReferences = collectCaptures(
		(eagerAst.body ?? []).filter((node) => node.type !== 'ImportDeclaration'),
		preparedImports.importBindings,
	);
	const protectedRecords = new Set();
	const protectedQueue = [];
	const enqueueProtected = (record) => {
		if (record === undefined || protectedRecords.has(record)) return;
		protectedRecords.add(record);
		protectedQueue.push(record);
	};
	for (const record of authored.records) {
		if (!staticRecords.has(record) || !record.removable) enqueueProtected(record);
	}
	for (const reference of eagerReferences) enqueueProtected(authored.byBinding.get(reference));
	const movedBindings = new Set(
		moduleMovePlan.movedRecords.flatMap((record) => [...record.bindings]),
	);
	for (const binding of movedBindings) enqueueProtected(authored.byBinding.get(binding));
	for (let index = 0; index < protectedQueue.length; index++) {
		const authoredRecord = protectedQueue[index];
		let clientRecord;
		for (const binding of authoredRecord.bindings) {
			clientRecord = client.byBinding.get(binding);
			if (clientRecord !== undefined) break;
		}
		if (clientRecord === undefined) continue;
		for (const dependency of clientRecord.dependencies) {
			enqueueProtected(authored.byBinding.get(dependency));
		}
	}
	return authored.records.filter(
		(record) =>
			record.removable &&
			staticRecords.has(record) &&
			!protectedRecords.has(record) &&
			![...record.bindings].some((binding) => movedBindings.has(binding)),
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
export function prepareHydrateBoundaries(source, filename, boundaryPath = null, parsedAst = null) {
	if (!source.includes('Hydrate') || !source.includes('octane')) {
		if (boundaryPath === null) return null;
		throw extractionError(
			'OCTANE_HYDRATE_QUERY_NOT_FOUND',
			filename,
			null,
			`boundary ${JSON.stringify(boundaryPath)} does not exist`,
		);
	}
	const analysis = analyzeHydrateBoundaries(source, filename, parsedAst);
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
	const moduleMovePlan = createModuleMovePlanAst(source, analysis, request);
	const permanentStaticRemoved =
		boundaryPath === null
			? createPermanentStaticRemovalPlanAst(analysis, request, moduleMovePlan)
			: [];
	let ast;
	if (boundaryPath === null) {
		ast = transformHydrateAst(analysis.ast, analysis, request, moduleMovePlan.bindingsByPath, [
			...moduleMovePlan.movedRecords,
			...permanentStaticRemoved,
		]);
		ast = pruneUnusedImportsAst(ast, true);
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
		ast = extractedModuleAst(
			source,
			analysis,
			boundary,
			request,
			moduleMovePlan.bindingsByPath,
			moduleMovePlan.declarationsByPath,
		);
	}
	return {
		ast,
		boundaryPath,
	};
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
export function prepareServerHydrateBoundaries(source, filename, parsedAst = null) {
	if (!source.includes('Hydrate') || !source.includes('octane')) return null;
	const analysis = analyzeHydrateBoundaries(source, filename, parsedAst);
	if (analysis.boundaries.length === 0) return null;
	const constObjects = collectSingleUseConstObjects(analysis.ast);
	const elementUpdates = new Map();
	const objectUpdates = new Map();
	const updateElement = (node) => {
		let update = elementUpdates.get(node);
		if (update === undefined) {
			update = { permanentStatic: false, removedAttributes: new Set() };
			elementUpdates.set(node, update);
		}
		return update;
	};
	const updateObject = (object) => {
		let removed = objectUpdates.get(object);
		if (removed === undefined) objectUpdates.set(object, (removed = new Set()));
		for (const property of object.properties ?? []) {
			if (property.type !== 'SpreadElement' && nameOf(property.key) === 'fallback') {
				removed.add(property);
			}
		}
	};
	for (const boundary of analysis.boundaries) {
		if (boundary.permanentStatic) {
			updateElement(boundary.node).permanentStatic = true;
		}
		for (const attribute of boundary.node.openingElement?.attributes ?? []) {
			if (jsxAttributeName(attribute) === 'fallback') {
				updateElement(boundary.node).removedAttributes.add(attribute);
				continue;
			}
			if (attribute.type !== 'JSXSpreadAttribute' && attribute.type !== 'SpreadAttribute') {
				continue;
			}
			const argument = unwrapExpression(attribute.argument);
			if (argument?.type === 'ObjectExpression') {
				updateObject(argument);
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
			updateObject(candidate.object);
		}
	}
	if (elementUpdates.size === 0 && objectUpdates.size === 0) return null;
	const ast = mapAstCowPost(analysis.ast, (original, node) => {
		const elementUpdate = elementUpdates.get(original);
		if (elementUpdate !== undefined) {
			const opening = node.openingElement;
			return {
				...node,
				openingElement: {
					...opening,
					attributes: (opening.attributes ?? []).filter(
						(attribute) => !elementUpdate.removedAttributes.has(attribute),
					),
					name: elementUpdate.permanentStatic
						? permanentStaticName(opening.name, opening.name)
						: opening.name,
				},
				closingElement:
					!elementUpdate.permanentStatic || node.closingElement === null
						? node.closingElement
						: {
								...node.closingElement,
								name: permanentStaticName(node.closingElement.name, node.closingElement.name),
							},
			};
		}
		const removedProperties = objectUpdates.get(original);
		if (removedProperties !== undefined) {
			return {
				...node,
				properties: (node.properties ?? []).filter((property) => !removedProperties.has(property)),
			};
		}
		return undefined;
	});
	return {
		ast,
		boundaryPath: null,
	};
}
