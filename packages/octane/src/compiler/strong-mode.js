const STATE_HOOKS = new Set(['useState', 'useReducer', 'useLinkedState']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);
const TRANSPARENT_EXPRESSIONS = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const SKIP_KEYS = new Set([
	'type',
	'start',
	'end',
	'loc',
	'range',
	'parent',
	'metadata',
	'comments',
	'tokens',
	'typeAnnotation',
	'returnType',
	'typeParameters',
]);

export const STRONG_RENDER_STATE_UPDATE = 'OCTANE_STRONG_RENDER_STATE_UPDATE';
export const STRONG_EFFECT_STATE_UPDATE = 'OCTANE_STRONG_EFFECT_STATE_UPDATE';
export const STRONG_RENDER_REF_WRITE = 'OCTANE_STRONG_RENDER_REF_WRITE';
export const STRONG_DIRECTIVE_PLACEMENT = 'OCTANE_STRONG_DIRECTIVE_PLACEMENT';

function unwrap(node) {
	let value = node;
	while (value && TRANSPARENT_EXPRESSIONS.has(value.type)) value = value.expression;
	return value;
}

function addPatternNames(pattern, bindings, value) {
	if (pattern == null) return;
	switch (pattern.type) {
		case 'Identifier':
			bindings.set(pattern.name, value);
			break;
		case 'RestElement':
			addPatternNames(pattern.argument, bindings, value);
			break;
		case 'AssignmentPattern':
			addPatternNames(pattern.left, bindings, value);
			break;
		case 'ArrayPattern':
			for (const element of pattern.elements ?? []) addPatternNames(element, bindings, value);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties ?? []) {
				addPatternNames(property.argument ?? property.value, bindings, value);
			}
	}
}

function declarationOf(statement) {
	return statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
		? statement.declaration
		: statement;
}

function nearestFunctionScope(scope) {
	let current = scope;
	while (current?.parent && current.kind !== 'function') current = current.parent;
	return current;
}

function declarationScope(scope, kind) {
	return kind === 'var' ? nearestFunctionScope(scope) : scope;
}

function predeclareStatements(statements, scope) {
	for (const original of statements ?? []) {
		const node = declarationOf(original);
		if (node?.type === 'ImportDeclaration') {
			const octane = node.source?.value === 'octane' && node.importKind !== 'type';
			for (const specifier of node.specifiers ?? []) {
				if (!specifier.local?.name || specifier.importKind === 'type') continue;
				if (octane && specifier.type === 'ImportNamespaceSpecifier') {
					scope.bindings.set(specifier.local.name, { kind: 'namespace' });
				} else if (octane && specifier.type === 'ImportSpecifier') {
					const hook = specifier.imported?.name ?? specifier.imported?.value;
					scope.bindings.set(specifier.local.name, { kind: 'hook', hook });
				} else {
					scope.bindings.set(specifier.local.name, { kind: 'other' });
				}
			}
		} else if (node?.type === 'VariableDeclaration') {
			const target = declarationScope(scope, node.kind);
			for (const declaration of node.declarations ?? []) {
				addPatternNames(declaration.id, target.bindings, { kind: 'other' });
			}
		} else if (node?.type === 'FunctionDeclaration' && node.id?.name) {
			scope.bindings.set(node.id.name, { kind: 'callback', node, scope });
		} else if (node?.type === 'ClassDeclaration' && node.id?.name) {
			scope.bindings.set(node.id.name, { kind: 'other' });
		}
	}
}

function createScope(parent, kind, statements = [], params = []) {
	const scope = { parent, kind, bindings: new Map() };
	predeclareStatements(statements, scope);
	for (const param of params) addPatternNames(param, scope.bindings, { kind: 'other' });
	return scope;
}

function resolve(scope, name) {
	for (let current = scope; current; current = current.parent) {
		if (current.bindings.has(name)) return current.bindings.get(name);
	}
	return null;
}

function importedHook(callee, scope) {
	const value = unwrap(callee);
	if (value?.type === 'Identifier') {
		const binding = resolve(scope, value.name);
		return binding?.kind === 'hook' ? binding.hook : null;
	}
	if (value?.type !== 'MemberExpression' || value.optional === true) return null;
	const object = unwrap(value.object);
	if (object?.type !== 'Identifier' || resolve(scope, object.name)?.kind !== 'namespace') {
		return null;
	}
	if (!value.computed && value.property?.type === 'Identifier') return value.property.name;
	return value.computed && value.property?.type === 'Literal' ? value.property.value : null;
}

function currentRef(member, scope) {
	const value = unwrap(member);
	if (value?.type !== 'MemberExpression' || value.optional === true) return false;
	const object = unwrap(value.object);
	if (object?.type !== 'Identifier' || resolve(scope, object.name)?.kind !== 'ref') return false;
	return value.computed
		? value.property?.type === 'Literal' && value.property.value === 'current'
		: value.property?.type === 'Identifier' && value.property.name === 'current';
}

function sourcePosition(node, boundary) {
	const offset = boundary === 'end' ? (node?.end ?? node?.start ?? 0) : (node?.start ?? 0);
	const position = boundary === 'end' ? (node?.loc?.end ?? node?.loc?.start) : node?.loc?.start;
	return {
		offset,
		line: position?.line ?? 1,
		column: position?.column ?? 0,
	};
}

function diagnostic(code, filename, node, message, suggestions = []) {
	return {
		code,
		severity: 'error',
		filename,
		start: sourcePosition(node, 'start'),
		end: sourcePosition(node, 'end'),
		message,
		suggestions,
	};
}

function strongDirectives(ast) {
	let enabled = false;
	let misplaced = null;
	let prologue = true;
	for (const statement of ast?.body ?? []) {
		if (
			prologue &&
			statement.type === 'ExpressionStatement' &&
			typeof statement.directive === 'string'
		) {
			if (statement.directive === 'use strong') enabled = true;
			continue;
		}
		prologue = false;
		if (
			misplaced === null &&
			statement.type === 'ExpressionStatement' &&
			statement.expression?.value === 'use strong' &&
			(statement.expression.raw === '"use strong"' || statement.expression.raw === "'use strong'")
		) {
			misplaced = statement.expression;
		}
	}
	return { enabled, misplaced };
}

/**
 * Analyze only modules that explicitly opted in. The authored parser tree is
 * read-only: scope information stays in local maps instead of annotating AST
 * nodes, so compile, SSR, hydration extraction, and Volar share one contract.
 *
 * @param {any} ast
 * @param {string} source
 * @param {string | undefined} filename
 * @param {{ strong?: boolean }} [options]
 */
export function analyzeStrongMode(ast, source, filename, options = {}) {
	if (options.strong !== true && !source.includes('use strong')) {
		return { enabled: false, diagnostics: [] };
	}
	const diagnostics = [];
	const directives = strongDirectives(ast);
	if (directives.misplaced !== null) {
		diagnostics.push(
			diagnostic(
				STRONG_DIRECTIVE_PLACEMENT,
				filename,
				directives.misplaced,
				'Place "use strong" at the top of the file, before imports or other code.',
			),
		);
	}
	const enabled = options.strong === true || directives.enabled;
	if (!enabled) return { enabled: false, diagnostics };

	const moduleScope = createScope(null, 'module', ast.body ?? []);
	const activeCallbacks = new Set();
	let currentFunctionIsAsync = false;

	function reportSetter(node, phase) {
		const effect = phase === 'effect';
		const code = effect ? STRONG_EFFECT_STATE_UPDATE : STRONG_RENDER_STATE_UPDATE;
		const message = effect
			? 'Strong mode does not allow synchronous state updates inside effect setup. Derive the value during render or use useLinkedState when state follows another value.'
			: 'Strong mode does not allow state updates during render. Use useLinkedState when state needs to reset or change with another value.';
		diagnostics.push(diagnostic(code, filename, node, message, [{ hook: 'useLinkedState' }]));
	}

	function reportRef(node) {
		diagnostics.push(
			diagnostic(
				STRONG_RENDER_REF_WRITE,
				filename,
				node,
				'Strong mode does not allow writing to useRef.current during render. Move the write to an event or effect, or express the value as state.',
			),
		);
	}

	function alwaysAwaits(expression) {
		const node = unwrap(expression);
		if (node == null) return false;
		switch (node.type) {
			case 'AwaitExpression':
				return true;
			case 'SequenceExpression':
				return (node.expressions ?? []).some(alwaysAwaits);
			case 'CallExpression':
			case 'NewExpression':
				return (
					node.optional !== true &&
					(alwaysAwaits(node.callee) || (node.arguments ?? []).some(alwaysAwaits))
				);
			case 'AssignmentExpression':
				return alwaysAwaits(node.left) || alwaysAwaits(node.right);
			case 'BinaryExpression':
				return alwaysAwaits(node.left) || alwaysAwaits(node.right);
			case 'LogicalExpression':
				return alwaysAwaits(node.left);
			case 'ConditionalExpression':
				return alwaysAwaits(node.test);
			case 'UnaryExpression':
			case 'UpdateExpression':
				return alwaysAwaits(node.argument);
			case 'MemberExpression':
				return (
					node.optional !== true &&
					(alwaysAwaits(node.object) || (node.computed === true && alwaysAwaits(node.property)))
				);
			case 'ArrayExpression':
				return (node.elements ?? []).some(alwaysAwaits);
			case 'ObjectExpression':
				return (node.properties ?? []).some((property) =>
					property.type === 'SpreadElement'
						? alwaysAwaits(property.argument)
						: (property.computed === true && alwaysAwaits(property.key)) ||
							(property.kind === 'init' &&
								property.method !== true &&
								alwaysAwaits(property.value)),
				);
			case 'SpreadElement':
				return alwaysAwaits(node.argument);
			case 'TemplateLiteral':
				return (node.expressions ?? []).some(alwaysAwaits);
			default:
				return false;
		}
	}

	function statementAlwaysAwaits(statement) {
		if (statement?.type === 'ExpressionStatement') return alwaysAwaits(statement.expression);
		if (statement?.type === 'VariableDeclaration') {
			return (statement.declarations ?? []).some((declaration) => alwaysAwaits(declaration.init));
		}
		return statement?.type === 'ReturnStatement' || statement?.type === 'ThrowStatement'
			? alwaysAwaits(statement.argument)
			: false;
	}

	function visitFunction(node, parentScope, phase) {
		const enclosingFunctionIsAsync = currentFunctionIsAsync;
		currentFunctionIsAsync = node.async === true;
		try {
			const body = node.body;
			const statements =
				body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock' ? body.body : [];
			const functionScope = createScope(parentScope, 'function', statements, node.params ?? []);
			if (node.id?.name) functionScope.bindings.set(node.id.name, { kind: 'other' });
			for (const parameter of node.params ?? []) {
				visitPatternExpressions(parameter, functionScope, phase);
			}
			if (body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock') {
				let executionPhase = phase;
				for (const statement of body.body ?? []) {
					visit(statement, functionScope, executionPhase);
					if (
						currentFunctionIsAsync &&
						executionPhase !== 'deferred' &&
						statementAlwaysAwaits(statement)
					) {
						executionPhase = 'deferred';
					}
				}
				if (body.render) visit(body.render, functionScope, executionPhase);
			} else {
				visit(body, functionScope, phase);
			}
		} finally {
			currentFunctionIsAsync = enclosingFunctionIsAsync;
		}
	}

	function visitPatternExpressions(pattern, scope, phase) {
		if (pattern?.type === 'AssignmentPattern') {
			visitPatternExpressions(pattern.left, scope, phase);
			visit(pattern.right, scope, phase);
		} else if (pattern?.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) visitPatternExpressions(element, scope, phase);
		} else if (pattern?.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				if (property.computed) visit(property.key, scope, phase);
				visitPatternExpressions(property.argument ?? property.value, scope, phase);
			}
		} else if (pattern?.type === 'RestElement') {
			visitPatternExpressions(pattern.argument, scope, phase);
		}
	}

	function bindDeclaration(declaration, declarationKind, scope, phase) {
		const target = declarationScope(scope, declarationKind);
		const initial = unwrap(declaration.init);
		const stateTuple =
			(initial?.type === 'CallExpression' &&
				STATE_HOOKS.has(importedHook(initial.callee, scope))) ||
			(initial?.type === 'Identifier' && resolve(scope, initial.name)?.kind === 'state-tuple');
		if (declaration.id?.type === 'ArrayPattern' && stateTuple) {
			const element = declaration.id.elements?.[1];
			const setter = element?.type === 'AssignmentPattern' ? element.left : element;
			if (setter?.type === 'Identifier') target.bindings.set(setter.name, { kind: 'setter' });
		} else if (declaration.id?.type === 'Identifier') {
			if (stateTuple) {
				target.bindings.set(declaration.id.name, { kind: 'state-tuple' });
			} else if (
				initial?.type === 'CallExpression' &&
				importedHook(initial.callee, scope) === 'useRef'
			) {
				target.bindings.set(declaration.id.name, { kind: 'ref' });
			} else if (declarationKind === 'const' && initial?.type === 'Identifier') {
				const value = resolve(scope, initial.name);
				if (value?.kind === 'setter' || value?.kind === 'ref' || value?.kind === 'callback') {
					target.bindings.set(declaration.id.name, value);
				}
			} else if (declarationKind === 'const' && FUNCTION_TYPES.has(initial?.type)) {
				target.bindings.set(declaration.id.name, { kind: 'callback', node: initial, scope });
			}
		}
		visitPatternExpressions(declaration.id, scope, phase);
		visit(declaration.init, scope, phase);
	}

	function visitCallback(node, parentScope, phase) {
		if (activeCallbacks.has(node)) return;
		activeCallbacks.add(node);
		try {
			visitFunction(node, parentScope, phase);
		} finally {
			activeCallbacks.delete(node);
		}
	}

	function visitEffectCallback(value, scope) {
		const callback = unwrap(value);
		if (FUNCTION_TYPES.has(callback?.type)) {
			visitCallback(callback, scope, 'effect');
		} else if (callback?.type === 'Identifier') {
			const binding = resolve(scope, callback.name);
			if (binding?.kind === 'callback') visitCallback(binding.node, binding.scope, 'effect');
			else if (binding?.kind === 'setter') reportSetter(callback, 'effect');
		}
	}

	function visit(node, scope, phase) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, scope, phase);
			return;
		}
		if (TRANSPARENT_EXPRESSIONS.has(node.type)) {
			visit(node.expression, scope, phase);
			return;
		}
		if (node.type?.startsWith('TS')) return;

		switch (node.type) {
			case 'ImportDeclaration':
			case 'Identifier':
			case 'JSXIdentifier':
			case 'Literal':
			case 'ThisExpression':
			case 'Super':
				return;
			case 'ExportNamedDeclaration':
			case 'ExportDefaultDeclaration':
				visit(node.declaration, scope, phase);
				return;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				visitFunction(node, scope, phase === 'module' ? 'render' : 'deferred');
				return;
			case 'BlockStatement':
			case 'JSXCodeBlock': {
				const block = createScope(scope, 'block', node.body ?? []);
				for (const statement of node.body ?? []) visit(statement, block, phase);
				if (node.render) visit(node.render, block, phase);
				return;
			}
			case 'VariableDeclaration':
				for (const declaration of node.declarations ?? []) {
					bindDeclaration(declaration, node.kind, scope, phase);
				}
				return;
			case 'CallExpression': {
				const hook = importedHook(node.callee, scope);
				const callee = unwrap(node.callee);
				const calleeBinding = callee?.type === 'Identifier' ? resolve(scope, callee.name) : null;
				const tupleUpdater =
					callee?.type === 'MemberExpression' &&
					callee.computed === true &&
					callee.property?.type === 'Literal' &&
					(callee.property.value === 1 || callee.property.value === '1') &&
					unwrap(callee.object)?.type === 'Identifier' &&
					resolve(scope, unwrap(callee.object).name)?.kind === 'state-tuple';
				if (
					(phase === 'render' || phase === 'effect') &&
					(calleeBinding?.kind === 'setter' || tupleUpdater) &&
					!(currentFunctionIsAsync && (node.arguments ?? []).some(alwaysAwaits))
				) {
					reportSetter(callee, phase);
				}
				if (EFFECT_HOOKS.has(hook)) {
					visit(node.callee, scope, phase);
					visitEffectCallback(node.arguments?.[0], scope);
					for (let index = 1; index < (node.arguments?.length ?? 0); index++) {
						visit(node.arguments[index], scope, phase);
					}
					return;
				}
				if (hook === 'useMemo' && FUNCTION_TYPES.has(unwrap(node.arguments?.[0])?.type)) {
					visit(node.callee, scope, phase);
					visitFunction(unwrap(node.arguments[0]), scope, phase);
					for (let index = 1; index < node.arguments.length; index++) {
						visit(node.arguments[index], scope, phase);
					}
					return;
				}
				if (FUNCTION_TYPES.has(callee?.type)) {
					visitCallback(callee, scope, phase);
					for (const argument of node.arguments ?? []) visit(argument, scope, phase);
					return;
				}
				if ((phase === 'render' || phase === 'effect') && calleeBinding?.kind === 'callback') {
					visitCallback(calleeBinding.node, calleeBinding.scope, phase);
					for (const argument of node.arguments ?? []) visit(argument, scope, phase);
					return;
				}
				visit(node.callee, scope, phase);
				for (const argument of node.arguments ?? []) visit(argument, scope, phase);
				return;
			}
			case 'AssignmentExpression':
				if (phase === 'render' && currentRef(node.left, scope)) reportRef(node.left);
				visit(node.left, scope, phase);
				visit(node.right, scope, phase);
				return;
			case 'UpdateExpression':
				if (phase === 'render' && currentRef(node.argument, scope)) reportRef(node.argument);
				visit(node.argument, scope, phase);
				return;
			case 'CatchClause': {
				const catchScope = createScope(scope, 'block', [], node.param ? [node.param] : []);
				visit(node.body, catchScope, phase);
				return;
			}
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement': {
				const loop = createScope(scope, 'block');
				for (const key of ['init', 'left', 'right', 'test', 'update', 'body']) {
					visit(node[key], loop, phase);
				}
				return;
			}
		}

		for (const key in node) {
			if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key], scope, phase);
		}
	}

	for (const statement of ast.body ?? []) visit(statement, moduleScope, 'module');
	return { enabled, diagnostics };
}

/** Throw the first Strong-mode violation using the original authored location. */
export function assertStrongMode(ast, source, filename, options) {
	if (options?.strong !== true && !source.includes('use strong')) return;
	const result = analyzeStrongMode(ast, source, filename, options);
	const violation = result.diagnostics[0];
	if (violation === undefined) return result;
	const { code, message } = violation;
	const { line, column } = violation.start;
	const error = new SyntaxError(
		`${filename ?? '<anonymous>'}:${line}:${column + 1}: [${code}] ${message}`,
	);
	error.code = code;
	error.filename = filename;
	error.loc = { line, column };
	error.pos = violation.start.offset;
	error.end = violation.end.offset;
	throw error;
}
