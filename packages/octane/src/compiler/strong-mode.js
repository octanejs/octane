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
const NULLISH_VALUE = 1;
const FALSY_VALUE = 2;
const TRUTHY_VALUE = 4;
const UNKNOWN_VALUE = NULLISH_VALUE | FALSY_VALUE | TRUTHY_VALUE;
const UNKNOWN_PRIMITIVE = Symbol('unknown primitive');
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

function optionalChainCanSkip(node) {
	let current = node;
	while (current != null) {
		// Grouping ends a chain before an outer call or property access evaluates.
		if (current.type === 'ChainExpression') return false;
		if (TRANSPARENT_EXPRESSIONS.has(current.type)) {
			current = current.expression;
			continue;
		}
		if (current.type !== 'CallExpression' && current.type !== 'MemberExpression') return false;
		if (current.optional === true) return true;
		current = current.type === 'CallExpression' ? current.callee : current.object;
	}
	return false;
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
	if (!value.computed) {
		return value.property?.type === 'Identifier' ? value.property.name : null;
	}
	const property = unwrap(value.property);
	return property?.type === 'Literal' ? property.value : null;
}

function currentRef(member, scope) {
	const value = unwrap(member);
	if (value?.type !== 'MemberExpression' || value.optional === true) return false;
	const object = unwrap(value.object);
	if (object?.type !== 'Identifier' || resolve(scope, object.name)?.kind !== 'ref') return false;
	if (!value.computed) {
		return value.property?.type === 'Identifier' && value.property.name === 'current';
	}
	const property = unwrap(value.property);
	return property?.type === 'Literal' && property.value === 'current';
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
					alwaysAwaits(node.callee) ||
					(node.optional !== true &&
						(node.arguments ?? []).some(alwaysAwaits) &&
						!optionalChainCanSkip(node.callee))
				);
			case 'ClassExpression':
				return alwaysAwaits(node.superClass);
			case 'AssignmentExpression':
				return (
					alwaysAwaits(node.left) ||
					(node.operator !== '&&=' &&
						node.operator !== '||=' &&
						node.operator !== '??=' &&
						alwaysAwaits(node.right))
				);
			case 'BinaryExpression':
				return alwaysAwaits(node.left) || alwaysAwaits(node.right);
			case 'LogicalExpression':
				return alwaysAwaits(node.left);
			case 'ConditionalExpression':
				return (
					alwaysAwaits(node.test) || (alwaysAwaits(node.consequent) && alwaysAwaits(node.alternate))
				);
			case 'UnaryExpression':
			case 'UpdateExpression':
				return alwaysAwaits(node.argument);
			case 'MemberExpression':
				return (
					alwaysAwaits(node.object) ||
					(node.optional !== true &&
						node.computed === true &&
						alwaysAwaits(node.property) &&
						!optionalChainCanSkip(node.object))
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
			case 'TaggedTemplateExpression':
				return alwaysAwaits(node.tag) || alwaysAwaits(node.quasi);
			default:
				return false;
		}
	}

	function patternAlwaysAwaits(pattern) {
		switch (pattern?.type) {
			case 'ArrayPattern':
				return (pattern.elements ?? []).some(patternAlwaysAwaits);
			case 'ObjectPattern':
				return (pattern.properties ?? []).some(
					(property) =>
						(property.computed === true && alwaysAwaits(property.key)) ||
						patternAlwaysAwaits(property.argument ?? property.value),
				);
			case 'AssignmentPattern':
				return patternAlwaysAwaits(pattern.left);
			case 'RestElement':
				return patternAlwaysAwaits(pattern.argument);
			default:
				return false;
		}
	}

	// Bit 1 exits this loop before an await; bit 2 reaches its test synchronously.
	function doWhileSynchronousControl(statement, nestedBreaks = 0, nestedLoops = 0, labels = null) {
		switch (statement?.type) {
			case 'BreakStatement': {
				if (statement.label == null) return nestedBreaks === 0 ? 1 : 0;
				for (let label = labels; label; label = label.parent) {
					if (label.name === statement.label.name) return 0;
				}
				return 1;
			}
			case 'ContinueStatement': {
				if (statement.label == null) return nestedLoops === 0 ? 2 : 0;
				for (let label = labels; label; label = label.parent) {
					if (label.name === statement.label.name) return 0;
				}
				return 2;
			}
			case 'BlockStatement':
			case 'JSXCodeBlock': {
				let control = 0;
				for (const child of statement.body ?? []) {
					control |= doWhileSynchronousControl(child, nestedBreaks, nestedLoops, labels);
					if (
						statementAlwaysAwaits(child) ||
						child.type === 'BreakStatement' ||
						child.type === 'ContinueStatement' ||
						child.type === 'ReturnStatement' ||
						child.type === 'ThrowStatement'
					) {
						return control;
					}
				}
				return control;
			}
			case 'IfStatement':
				return alwaysAwaits(statement.test)
					? 0
					: doWhileSynchronousControl(statement.consequent, nestedBreaks, nestedLoops, labels) |
							doWhileSynchronousControl(statement.alternate, nestedBreaks, nestedLoops, labels);
			case 'LabeledStatement':
				return doWhileSynchronousControl(statement.body, nestedBreaks, nestedLoops, {
					name: statement.label.name,
					parent: labels,
				});
			case 'SwitchStatement': {
				if (alwaysAwaits(statement.discriminant)) return 0;
				let control = 0;
				for (const branch of statement.cases ?? []) {
					for (const child of branch.consequent ?? []) {
						control |= doWhileSynchronousControl(child, nestedBreaks + 1, nestedLoops, labels);
						if (statementAlwaysAwaits(child) || child.type === 'BreakStatement') break;
					}
				}
				return control;
			}
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement':
			case 'WhileStatement':
			case 'DoWhileStatement':
				return statementAlwaysAwaits(statement)
					? 0
					: doWhileSynchronousControl(statement.body, nestedBreaks + 1, nestedLoops + 1, labels);
			case 'TryStatement':
				if (statement.finalizer != null && statementAlwaysAwaits(statement.finalizer)) return 0;
				return (
					doWhileSynchronousControl(statement.block, nestedBreaks, nestedLoops, labels) |
					doWhileSynchronousControl(statement.handler?.body, nestedBreaks, nestedLoops, labels) |
					doWhileSynchronousControl(statement.finalizer, nestedBreaks, nestedLoops, labels)
				);
			default:
				return 0;
		}
	}

	function switchCaseAlwaysAwaits(cases, start) {
		for (let index = start; index < cases.length; index++) {
			for (const statement of cases[index].consequent ?? []) {
				if (doWhileSynchronousControl(statement) !== 0) return false;
				if (statementAlwaysAwaits(statement)) return true;
				if (
					statement.type === 'BreakStatement' ||
					statement.type === 'ContinueStatement' ||
					statement.type === 'ReturnStatement' ||
					statement.type === 'ThrowStatement'
				) {
					return false;
				}
			}
		}
		return false;
	}

	function statementAlwaysAwaits(statement) {
		switch (statement?.type) {
			case 'ExpressionStatement':
				return alwaysAwaits(statement.expression);
			case 'VariableDeclaration':
				return (statement.declarations ?? []).some(
					(declaration) => alwaysAwaits(declaration.init) || patternAlwaysAwaits(declaration.id),
				);
			case 'ClassDeclaration':
				return alwaysAwaits(statement.superClass);
			case 'ReturnStatement':
			case 'ThrowStatement':
				return alwaysAwaits(statement.argument);
			case 'BlockStatement':
			case 'JSXCodeBlock':
				for (const child of statement.body ?? []) {
					if (statementAlwaysAwaits(child)) return true;
				}
				return false;
			case 'IfStatement':
				return (
					alwaysAwaits(statement.test) ||
					(statement.alternate != null &&
						statementAlwaysAwaits(statement.consequent) &&
						statementAlwaysAwaits(statement.alternate))
				);
			case 'ForStatement':
				return (
					(statement.init?.type === 'VariableDeclaration'
						? statementAlwaysAwaits(statement.init)
						: alwaysAwaits(statement.init)) || alwaysAwaits(statement.test)
				);
			case 'ForInStatement':
				return alwaysAwaits(statement.right);
			case 'ForOfStatement':
				return statement.await === true || alwaysAwaits(statement.right);
			case 'WhileStatement':
				return alwaysAwaits(statement.test);
			case 'LabeledStatement':
				return (
					statementAlwaysAwaits(statement.body) &&
					(statement.body?.type === 'DoWhileStatement' ||
						doWhileSynchronousControl(statement.body) === 0)
				);
			case 'SwitchStatement': {
				if (alwaysAwaits(statement.discriminant)) return true;
				const cases = statement.cases ?? [];
				if (!cases.some((branch) => branch.test == null)) {
					return alwaysAwaits(cases[0]?.test);
				}
				let searchAwaits = false;
				const fallbackAwaits = cases.some((branch) => alwaysAwaits(branch.test));
				for (let index = 0; index < cases.length; index++) {
					const branch = cases[index];
					if (branch.test != null && alwaysAwaits(branch.test)) searchAwaits = true;
					if (
						!(branch.test == null ? fallbackAwaits : searchAwaits) &&
						!switchCaseAlwaysAwaits(cases, index)
					) {
						return false;
					}
				}
				return true;
			}
			case 'DoWhileStatement': {
				const control = doWhileSynchronousControl(statement.body);
				const bodyAwaits = statementAlwaysAwaits(statement.body) && control === 0;
				return (control & 1) === 0 && (bodyAwaits || alwaysAwaits(statement.test));
			}
			case 'TryStatement':
				return (
					(statement.finalizer != null && statementAlwaysAwaits(statement.finalizer)) ||
					(statementAlwaysAwaits(statement.block) &&
						(statement.handler == null || statementAlwaysAwaits(statement.handler.body)))
				);
			default:
				return false;
		}
	}

	function continuedChainAlwaysAwaits(expression, groupedOptional = false) {
		if (expression?.type === 'ChainExpression') {
			return groupedOptional
				? continuedChainAlwaysAwaits(expression.expression)
				: alwaysAwaits(expression);
		}
		const node = unwrap(expression);
		if (node == null) return false;
		if (node.type === 'MemberExpression') {
			return (
				continuedChainAlwaysAwaits(node.object) ||
				(node.computed === true && alwaysAwaits(node.property))
			);
		}
		if (node.type === 'CallExpression') {
			return continuedChainAlwaysAwaits(node.callee) || (node.arguments ?? []).some(alwaysAwaits);
		}
		return alwaysAwaits(node);
	}

	function phaseAfter(expression, phase, continued = false, groupedOptional = false) {
		if (!currentFunctionIsAsync || phase === 'deferred') return phase;
		if (
			alwaysAwaits(expression) ||
			(continued &&
				((optionalChainCanSkip(expression) && continuedChainAlwaysAwaits(expression)) ||
					(groupedOptional && continuedChainAlwaysAwaits(expression, true))))
		) {
			return 'deferred';
		}
		return phase;
	}

	function visitExpressionList(expressions, scope, phase) {
		let executionPhase = phase;
		for (const expression of expressions ?? []) {
			visit(expression, scope, executionPhase);
			executionPhase = phaseAfter(expression, executionPhase);
		}
		return executionPhase;
	}

	function visitStatements(statements, scope, phase) {
		let executionPhase = phase;
		for (const statement of statements ?? []) {
			visit(statement, scope, executionPhase);
			if (
				currentFunctionIsAsync &&
				executionPhase !== 'deferred' &&
				statementAlwaysAwaits(statement)
			) {
				executionPhase = 'deferred';
			}
		}
		return executionPhase;
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
				const executionPhase = visitStatements(body.body, functionScope, phase);
				if (body.render) visit(body.render, functionScope, executionPhase);
			} else {
				visit(body, functionScope, phase);
			}
		} finally {
			currentFunctionIsAsync = enclosingFunctionIsAsync;
		}
	}

	function visitPatternExpressions(pattern, scope, phase) {
		let executionPhase = phase;
		if (pattern?.type === 'AssignmentPattern') {
			executionPhase = visitPatternExpressions(pattern.left, scope, executionPhase);
			visit(pattern.right, scope, executionPhase);
		} else if (pattern?.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) {
				executionPhase = visitPatternExpressions(element, scope, executionPhase);
			}
		} else if (pattern?.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				if (property.computed) {
					visit(property.key, scope, executionPhase);
					executionPhase = phaseAfter(property.key, executionPhase);
				}
				executionPhase = visitPatternExpressions(
					property.argument ?? property.value,
					scope,
					executionPhase,
				);
			}
		} else if (pattern?.type === 'RestElement') {
			executionPhase = visitPatternExpressions(pattern.argument, scope, executionPhase);
		}
		return executionPhase;
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
		} else if (declaration.id?.type === 'ObjectPattern' && stateTuple) {
			for (const property of declaration.id.properties ?? []) {
				if (property.type !== 'Property') continue;
				const key = property.computed
					? staticPrimitiveValue(property.key, scope)
					: property.key?.type === 'Identifier'
						? property.key.name
						: property.key?.value;
				const value = property.value;
				const setter = value?.type === 'AssignmentPattern' ? value.left : value;
				if ((key === 1 || key === '1') && setter?.type === 'Identifier') {
					target.bindings.set(setter.name, { kind: 'setter' });
				}
			}
		} else if (declaration.id?.type === 'Identifier') {
			if (stateTuple) {
				target.bindings.set(declaration.id.name, { kind: 'state-tuple' });
			} else if (
				initial?.type === 'CallExpression' &&
				importedHook(initial.callee, scope) === 'useRef'
			) {
				target.bindings.set(declaration.id.name, { kind: 'ref' });
			} else if (declarationKind === 'const' && stateTupleUpdater(initial, scope)) {
				target.bindings.set(declaration.id.name, { kind: 'setter' });
			} else if (declarationKind === 'const' && initial?.type === 'Identifier') {
				const value = resolve(scope, initial.name);
				if (
					value?.kind === 'setter' ||
					value?.kind === 'ref' ||
					value?.kind === 'callback' ||
					value?.kind === 'callback-choice' ||
					value?.kind === 'linked-options' ||
					value?.kind === 'linked-key' ||
					value?.kind === 'constant'
				) {
					target.bindings.set(declaration.id.name, value);
				} else if (value == null && initial.name === 'undefined') {
					target.bindings.set(declaration.id.name, {
						kind: 'constant',
						value: NULLISH_VALUE,
						primitive: undefined,
					});
				}
			} else if (declarationKind === 'const' && FUNCTION_TYPES.has(initial?.type)) {
				target.bindings.set(declaration.id.name, { kind: 'callback', node: initial, scope });
			} else if (
				declarationKind === 'const' &&
				staticLinkedStateComparatorKey(initial, scope) !== null
			) {
				target.bindings.set(declaration.id.name, {
					kind: 'linked-key',
					value: staticLinkedStateComparatorKey(initial, scope),
				});
			} else if (
				declarationKind === 'const' &&
				(initial?.type === 'ObjectExpression' ||
					initial?.type === 'ConditionalExpression' ||
					initial?.type === 'LogicalExpression' ||
					initial?.type === 'SequenceExpression') &&
				linkedStateOptionsExpression(initial, scope)
			) {
				target.bindings.set(declaration.id.name, {
					kind: 'linked-options',
					node: initial,
					scope,
				});
			} else if (
				declarationKind === 'const' &&
				(initial?.type === 'ConditionalExpression' ||
					initial?.type === 'LogicalExpression' ||
					initial?.type === 'SequenceExpression') &&
				synchronousCallbackExpression(initial, scope)
			) {
				target.bindings.set(declaration.id.name, {
					kind: 'callback-choice',
					node: initial,
					scope,
				});
			} else if (declarationKind === 'const') {
				const primitive = staticPrimitiveValue(initial, scope);
				let value = staticExpressionValue(initial, scope);
				if (value === UNKNOWN_VALUE && primitive !== UNKNOWN_PRIMITIVE) {
					value = primitive == null ? NULLISH_VALUE : primitive ? TRUTHY_VALUE : FALSY_VALUE;
				}
				if (value !== UNKNOWN_VALUE) {
					target.bindings.set(declaration.id.name, {
						kind: 'constant',
						value,
						primitive,
					});
				}
			}
		}
		visit(declaration.init, scope, phase);
		return visitPatternExpressions(declaration.id, scope, phaseAfter(declaration.init, phase));
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

	function stateTupleUpdater(value, scope) {
		const member = unwrap(value);
		if (member?.type !== 'MemberExpression' || member.computed !== true) return false;
		const property = staticPrimitiveValue(member.property, scope);
		return (
			(property === 1 || property === '1') &&
			unwrap(member.object)?.type === 'Identifier' &&
			resolve(scope, unwrap(member.object).name)?.kind === 'state-tuple'
		);
	}

	function staticPrimitiveValue(value, scope) {
		const expression = unwrap(value);
		if (expression?.type === 'Literal') return expression.value;
		if (expression?.type === 'Identifier') {
			const binding = resolve(scope, expression.name);
			if (binding?.kind === 'linked-key') return binding.value;
			if (binding?.kind === 'constant') return binding.primitive;
			if (binding == null && expression.name === 'undefined') return undefined;
			return UNKNOWN_PRIMITIVE;
		}
		if (expression?.type === 'TemplateLiteral') {
			let result = '';
			for (let index = 0; index < (expression.quasis?.length ?? 0); index++) {
				const text = expression.quasis[index]?.value?.cooked;
				if (text == null) return UNKNOWN_PRIMITIVE;
				result += text;
				if (index < (expression.expressions?.length ?? 0)) {
					const part = staticPrimitiveValue(expression.expressions[index], scope);
					if (
						part === UNKNOWN_PRIMITIVE ||
						(part !== null && typeof part === 'object') ||
						typeof part === 'function' ||
						typeof part === 'symbol'
					) {
						return UNKNOWN_PRIMITIVE;
					}
					result += String(part);
				}
			}
			return result;
		}
		if (expression?.type === 'BinaryExpression' && expression.operator === '+') {
			const left = staticPrimitiveValue(expression.left, scope);
			const right = staticPrimitiveValue(expression.right, scope);
			if (
				left === UNKNOWN_PRIMITIVE ||
				right === UNKNOWN_PRIMITIVE ||
				(left !== null && typeof left === 'object') ||
				(right !== null && typeof right === 'object') ||
				typeof left === 'function' ||
				typeof right === 'function' ||
				typeof left === 'symbol' ||
				typeof right === 'symbol'
			) {
				return UNKNOWN_PRIMITIVE;
			}
			if (
				(typeof left === 'bigint' || typeof right === 'bigint') &&
				typeof left !== 'string' &&
				typeof right !== 'string' &&
				(typeof left !== 'bigint' || typeof right !== 'bigint')
			) {
				return UNKNOWN_PRIMITIVE;
			}
			return left + right;
		}
		if (expression?.type === 'UnaryExpression') {
			if (expression.operator === 'void') return undefined;
			const argument = staticPrimitiveValue(expression.argument, scope);
			if (expression.operator === '!') {
				if (argument !== UNKNOWN_PRIMITIVE) return !argument;
				const value = staticExpressionValue(expression.argument, scope);
				return value === TRUTHY_VALUE
					? false
					: value !== UNKNOWN_VALUE && (value & TRUTHY_VALUE) === 0
						? true
						: UNKNOWN_PRIMITIVE;
			}
			if (
				argument === UNKNOWN_PRIMITIVE ||
				(argument !== null && typeof argument === 'object') ||
				typeof argument === 'function' ||
				typeof argument === 'symbol'
			) {
				return UNKNOWN_PRIMITIVE;
			}
			if (expression.operator === '+') {
				return typeof argument === 'bigint' ? UNKNOWN_PRIMITIVE : +argument;
			}
			if (expression.operator === '-') return -argument;
			if (expression.operator === '~') return ~argument;
		}
		if (expression?.type === 'SequenceExpression') {
			const expressions = expression.expressions ?? [];
			return staticPrimitiveValue(expressions[expressions.length - 1], scope);
		}
		if (expression?.type === 'ConditionalExpression') {
			const branches = conditionalExpressionBranches(expression, scope);
			return branches === 1
				? staticPrimitiveValue(expression.consequent, scope)
				: branches === 2
					? staticPrimitiveValue(expression.alternate, scope)
					: UNKNOWN_PRIMITIVE;
		}
		if (expression?.type === 'LogicalExpression') {
			const branches = logicalExpressionBranches(expression, scope);
			return branches === 1
				? staticPrimitiveValue(expression.left, scope)
				: branches === 2
					? staticPrimitiveValue(expression.right, scope)
					: UNKNOWN_PRIMITIVE;
		}
		return UNKNOWN_PRIMITIVE;
	}

	function staticLinkedStateComparatorKey(value, scope) {
		const key = staticPrimitiveValue(value, scope);
		return key === 'sourceEqual' || key === 'valueEqual' ? key : null;
	}

	function staticExpressionValue(value, scope) {
		const expression = unwrap(value);
		if (expression?.type === 'Literal') {
			return expression.value == null
				? NULLISH_VALUE
				: expression.value
					? TRUTHY_VALUE
					: FALSY_VALUE;
		} else if (
			FUNCTION_TYPES.has(expression?.type) ||
			expression?.type === 'ObjectExpression' ||
			expression?.type === 'ArrayExpression' ||
			stateTupleUpdater(expression, scope)
		) {
			return TRUTHY_VALUE;
		} else if (
			expression?.type === 'TemplateLiteral' ||
			(expression?.type === 'BinaryExpression' && expression.operator === '+') ||
			(expression?.type === 'UnaryExpression' &&
				(expression.operator === '+' || expression.operator === '-' || expression.operator === '~'))
		) {
			const primitive = staticPrimitiveValue(expression, scope);
			return primitive === UNKNOWN_PRIMITIVE
				? UNKNOWN_VALUE
				: primitive == null
					? NULLISH_VALUE
					: primitive
						? TRUTHY_VALUE
						: FALSY_VALUE;
		} else if (expression?.type === 'Identifier') {
			const binding = resolve(scope, expression.name);
			if (binding == null && expression.name === 'undefined') return NULLISH_VALUE;
			if (binding?.kind === 'constant') return binding.value;
			if (
				binding?.kind === 'callback' ||
				binding?.kind === 'setter' ||
				binding?.kind === 'ref' ||
				binding?.kind === 'state-tuple' ||
				binding?.kind === 'linked-key' ||
				binding?.kind === 'hook' ||
				binding?.kind === 'namespace'
			) {
				return TRUTHY_VALUE;
			}
			if (binding?.kind === 'callback-choice' || binding?.kind === 'linked-options') {
				if (activeCallbacks.has(binding.node)) return UNKNOWN_VALUE;
				activeCallbacks.add(binding.node);
				try {
					return staticExpressionValue(binding.node, binding.scope);
				} finally {
					activeCallbacks.delete(binding.node);
				}
			}
		} else if (expression?.type === 'SequenceExpression') {
			const expressions = expression.expressions ?? [];
			return staticExpressionValue(expressions[expressions.length - 1], scope);
		} else if (expression?.type === 'LogicalExpression') {
			const left = staticExpressionValue(expression.left, scope);
			if (expression.operator === '??') {
				return (
					(left & (FALSY_VALUE | TRUTHY_VALUE)) |
					((left & NULLISH_VALUE) !== 0 ? staticExpressionValue(expression.right, scope) : 0)
				);
			}
			if (expression.operator === '||') {
				return (
					(left & TRUTHY_VALUE) |
					((left & (NULLISH_VALUE | FALSY_VALUE)) !== 0
						? staticExpressionValue(expression.right, scope)
						: 0)
				);
			}
			if (expression.operator === '&&') {
				return (
					(left & (NULLISH_VALUE | FALSY_VALUE)) |
					((left & TRUTHY_VALUE) !== 0 ? staticExpressionValue(expression.right, scope) : 0)
				);
			}
		} else if (expression?.type === 'ConditionalExpression') {
			const test = staticExpressionValue(expression.test, scope);
			return (
				((test & TRUTHY_VALUE) !== 0 ? staticExpressionValue(expression.consequent, scope) : 0) |
				((test & (NULLISH_VALUE | FALSY_VALUE)) !== 0
					? staticExpressionValue(expression.alternate, scope)
					: 0)
			);
		} else if (expression?.type === 'UnaryExpression' && expression.operator === 'void') {
			return NULLISH_VALUE;
		} else if (expression?.type === 'UnaryExpression' && expression.operator === '!') {
			const argument = staticExpressionValue(expression.argument, scope);
			return (
				((argument & TRUTHY_VALUE) !== 0 ? FALSY_VALUE : 0) |
				((argument & (NULLISH_VALUE | FALSY_VALUE)) !== 0 ? TRUTHY_VALUE : 0)
			);
		}
		return UNKNOWN_VALUE;
	}

	function conditionalExpressionBranches(expression, scope) {
		const test = staticExpressionValue(expression.test, scope);
		return (
			((test & TRUTHY_VALUE) !== 0 ? 1 : 0) | ((test & (NULLISH_VALUE | FALSY_VALUE)) !== 0 ? 2 : 0)
		);
	}

	function logicalExpressionBranches(expression, scope) {
		const left = staticExpressionValue(expression.left, scope);
		if (expression.operator === '??') {
			return (
				((left & (FALSY_VALUE | TRUTHY_VALUE)) !== 0 ? 1 : 0) |
				((left & NULLISH_VALUE) !== 0 ? 2 : 0)
			);
		}
		if (expression.operator === '||') {
			return (
				((left & TRUTHY_VALUE) !== 0 ? 1 : 0) |
				((left & (NULLISH_VALUE | FALSY_VALUE)) !== 0 ? 2 : 0)
			);
		}
		if (expression.operator === '&&') {
			return (
				((left & (NULLISH_VALUE | FALSY_VALUE)) !== 0 ? 1 : 0) |
				((left & TRUTHY_VALUE) !== 0 ? 2 : 0)
			);
		}
		return 3;
	}

	function visitSynchronousHookCallback(value, scope, phase) {
		const callback = unwrap(value);
		if (FUNCTION_TYPES.has(callback?.type)) {
			visitCallback(callback, scope, phase);
			return true;
		} else if (callback?.type === 'SequenceExpression') {
			const expressions = callback.expressions ?? [];
			return visitSynchronousHookCallback(expressions[expressions.length - 1], scope, phase);
		} else if (callback?.type === 'ConditionalExpression') {
			const branches = conditionalExpressionBranches(callback, scope);
			if ((branches & 1) !== 0) visitSynchronousHookCallback(callback.consequent, scope, phase);
			if ((branches & 2) !== 0) visitSynchronousHookCallback(callback.alternate, scope, phase);
			return true;
		} else if (callback?.type === 'LogicalExpression') {
			const branches = logicalExpressionBranches(callback, scope);
			if ((branches & 1) !== 0 && callback.operator !== '&&') {
				visitSynchronousHookCallback(callback.left, scope, phase);
			}
			if ((branches & 2) !== 0) visitSynchronousHookCallback(callback.right, scope, phase);
			return true;
		} else if (callback?.type === 'Identifier') {
			const binding = resolve(scope, callback.name);
			if (binding?.kind === 'callback') visitCallback(binding.node, binding.scope, phase);
			else if (binding?.kind === 'callback-choice') {
				if (activeCallbacks.has(binding.node)) return true;
				activeCallbacks.add(binding.node);
				try {
					visitSynchronousHookCallback(binding.node, binding.scope, phase);
				} finally {
					activeCallbacks.delete(binding.node);
				}
			} else if (binding?.kind === 'setter' && (phase === 'render' || phase === 'effect')) {
				reportSetter(callback, phase);
			}
			return true;
		} else if (stateTupleUpdater(callback, scope)) {
			if (phase === 'render' || phase === 'effect') reportSetter(callback, phase);
			return true;
		}
		return false;
	}

	function synchronousCallbackExpression(value, scope) {
		const callback = unwrap(value);
		if (FUNCTION_TYPES.has(callback?.type) || stateTupleUpdater(callback, scope)) return true;
		if (callback?.type === 'Identifier') {
			const kind = resolve(scope, callback.name)?.kind;
			return kind === 'callback' || kind === 'callback-choice' || kind === 'setter';
		}
		if (callback?.type === 'SequenceExpression') {
			const expressions = callback.expressions ?? [];
			return synchronousCallbackExpression(expressions[expressions.length - 1], scope);
		}
		if (callback?.type === 'ConditionalExpression') {
			const branches = conditionalExpressionBranches(callback, scope);
			return (
				((branches & 1) !== 0 && synchronousCallbackExpression(callback.consequent, scope)) ||
				((branches & 2) !== 0 && synchronousCallbackExpression(callback.alternate, scope))
			);
		}
		if (callback?.type === 'LogicalExpression') {
			const branches = logicalExpressionBranches(callback, scope);
			return (
				((branches & 1) !== 0 &&
					callback.operator !== '&&' &&
					synchronousCallbackExpression(callback.left, scope)) ||
				((branches & 2) !== 0 && synchronousCallbackExpression(callback.right, scope))
			);
		}
		return false;
	}

	function linkedStateComparatorName(property, scope) {
		if (property?.type !== 'Property' || property.kind !== 'init') return null;
		const key = unwrap(property.key);
		const name =
			property.computed !== true
				? key?.type === 'Identifier'
					? key.name
					: key?.value
				: staticPrimitiveValue(key, scope);
		return name === 'sourceEqual' || name === 'valueEqual' ? name : null;
	}

	function linkedStateOptionsExpression(value, scope) {
		const options = unwrap(value);
		if (options?.type === 'Identifier') {
			return resolve(scope, options.name)?.kind === 'linked-options';
		}
		if (options?.type === 'SequenceExpression') {
			const expressions = options.expressions ?? [];
			return linkedStateOptionsExpression(expressions[expressions.length - 1], scope);
		}
		if (options?.type === 'ConditionalExpression' || options?.type === 'LogicalExpression') {
			const logical = options.type === 'LogicalExpression';
			const branches = logical
				? logicalExpressionBranches(options, scope)
				: conditionalExpressionBranches(options, scope);
			return (
				((branches & 1) !== 0 &&
					(!logical || options.operator !== '&&') &&
					linkedStateOptionsExpression(logical ? options.left : options.consequent, scope)) ||
				((branches & 2) !== 0 &&
					linkedStateOptionsExpression(logical ? options.right : options.alternate, scope))
			);
		}
		return (
			options?.type === 'ObjectExpression' &&
			(options.properties ?? []).some((property) =>
				property.type === 'SpreadElement'
					? linkedStateOptionsExpression(property.argument, scope)
					: linkedStateComparatorName(property, scope) !== null,
			)
		);
	}

	function visitLinkedStateComparators(value, parentScope, phase, overridden, activeOptions) {
		let options = unwrap(value);
		let scope = parentScope;
		if (options?.type === 'Identifier') {
			const binding = resolve(scope, options.name);
			if (binding?.kind !== 'linked-options') return;
			options = binding.node;
			scope = binding.scope;
		}
		if (
			(options?.type !== 'ObjectExpression' &&
				options?.type !== 'ConditionalExpression' &&
				options?.type !== 'LogicalExpression' &&
				options?.type !== 'SequenceExpression') ||
			activeOptions?.has(options)
		) {
			return;
		}
		overridden ??= new Set();
		activeOptions ??= new Set();
		activeOptions.add(options);
		try {
			if (options.type === 'SequenceExpression') {
				const expressions = options.expressions ?? [];
				visitLinkedStateComparators(
					expressions[expressions.length - 1],
					scope,
					phase,
					overridden,
					activeOptions,
				);
				return;
			}
			if (options.type === 'ConditionalExpression' || options.type === 'LogicalExpression') {
				const logical = options.type === 'LogicalExpression';
				const branches = logical
					? logicalExpressionBranches(options, scope)
					: conditionalExpressionBranches(options, scope);
				const first =
					logical && options.operator === '&&' ? null : logical ? options.left : options.consequent;
				const second = logical ? options.right : options.alternate;
				if (branches !== 3) {
					visitLinkedStateComparators(
						branches === 1 ? first : second,
						scope,
						phase,
						overridden,
						activeOptions,
					);
					return;
				}
				const firstOverrides = new Set(overridden);
				const secondOverrides = new Set(overridden);
				visitLinkedStateComparators(first, scope, phase, firstOverrides, activeOptions);
				visitLinkedStateComparators(second, scope, phase, secondOverrides, activeOptions);
				for (const name of firstOverrides) {
					if (secondOverrides.has(name)) overridden.add(name);
				}
				return;
			}
			const properties = options.properties ?? [];
			for (let index = properties.length - 1; index >= 0; index--) {
				const property = properties[index];
				if (property.type === 'SpreadElement') {
					visitLinkedStateComparators(property.argument, scope, phase, overridden, activeOptions);
					continue;
				}
				const name = linkedStateComparatorName(property, scope);
				if (name !== null && !overridden.has(name)) {
					overridden.add(name);
					visitSynchronousHookCallback(property.value, scope, phase);
				}
			}
		} finally {
			activeOptions.delete(options);
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
				const executionPhase = visitStatements(node.body, block, phase);
				if (node.render) visit(node.render, block, executionPhase);
				return;
			}
			case 'IfStatement': {
				visit(node.test, scope, phase);
				const branchPhase = phaseAfter(node.test, phase);
				visit(node.consequent, scope, branchPhase);
				visit(node.alternate, scope, branchPhase);
				return;
			}
			case 'ConditionalExpression': {
				visit(node.test, scope, phase);
				const branchPhase = phaseAfter(node.test, phase);
				visit(node.consequent, scope, branchPhase);
				visit(node.alternate, scope, branchPhase);
				return;
			}
			case 'LogicalExpression':
			case 'BinaryExpression':
				visit(node.left, scope, phase);
				visit(node.right, scope, phaseAfter(node.left, phase));
				return;
			case 'SequenceExpression':
				visitExpressionList(node.expressions, scope, phase);
				return;
			case 'ArrayExpression':
				visitExpressionList(node.elements, scope, phase);
				return;
			case 'TemplateLiteral':
				visitExpressionList(node.expressions, scope, phase);
				return;
			case 'ObjectExpression': {
				let executionPhase = phase;
				for (const property of node.properties ?? []) {
					if (property.type === 'SpreadElement') {
						visit(property.argument, scope, executionPhase);
						executionPhase = phaseAfter(property.argument, executionPhase);
						continue;
					}
					if (property.computed === true) {
						visit(property.key, scope, executionPhase);
						executionPhase = phaseAfter(property.key, executionPhase);
					}
					if (property.kind === 'init' && property.method !== true) {
						visit(property.value, scope, executionPhase);
						executionPhase = phaseAfter(property.value, executionPhase);
					}
				}
				return;
			}
			case 'MemberExpression': {
				visit(node.object, scope, phase);
				if (node.computed === true) {
					visit(node.property, scope, phaseAfter(node.object, phase, true, node.optional === true));
				}
				return;
			}
			case 'LabeledStatement':
				visit(node.body, scope, phase);
				return;
			case 'SwitchStatement': {
				visit(node.discriminant, scope, phase);
				const initialPhase =
					currentFunctionIsAsync && phase !== 'deferred' && alwaysAwaits(node.discriminant)
						? 'deferred'
						: phase;
				const branches = node.cases ?? [];
				const switchScope = createScope(scope, 'block');
				for (const branch of branches) predeclareStatements(branch.consequent, switchScope);

				let searchPhase = initialPhase;
				for (const branch of branches) {
					visit(branch.test, switchScope, searchPhase);
					if (currentFunctionIsAsync && searchPhase !== 'deferred' && alwaysAwaits(branch.test)) {
						searchPhase = 'deferred';
					}
				}

				const fallbackPhase = searchPhase;
				searchPhase = initialPhase;
				let fallthroughPhase = null;
				for (const branch of branches) {
					if (currentFunctionIsAsync && searchPhase !== 'deferred' && alwaysAwaits(branch.test)) {
						searchPhase = 'deferred';
					}
					const matchingPhase = branch.test == null ? fallbackPhase : searchPhase;
					const branchPhase =
						matchingPhase === 'deferred' &&
						(fallthroughPhase == null || fallthroughPhase === 'deferred')
							? 'deferred'
							: phase;
					const executionPhase = visitStatements(branch.consequent, switchScope, branchPhase);
					const last = branch.consequent?.[branch.consequent.length - 1];
					fallthroughPhase =
						last?.type === 'BreakStatement' ||
						last?.type === 'ContinueStatement' ||
						last?.type === 'ReturnStatement' ||
						last?.type === 'ThrowStatement'
							? null
							: executionPhase;
				}
				return;
			}
			case 'VariableDeclaration': {
				let declarationPhase = phase;
				for (const declaration of node.declarations ?? []) {
					declarationPhase = bindDeclaration(declaration, node.kind, scope, declarationPhase);
				}
				return;
			}
			case 'CallExpression': {
				const hook = importedHook(node.callee, scope);
				const callee = unwrap(node.callee);
				const calleeBinding = callee?.type === 'Identifier' ? resolve(scope, callee.name) : null;
				const tupleUpdater = stateTupleUpdater(callee, scope);
				if (!FUNCTION_TYPES.has(callee?.type)) {
					visit(node.callee, scope, phase);
				}
				let executionPhase = phaseAfter(node.callee, phase, true, node.optional === true);
				const synchronousCallbackIndex =
					hook === 'useLinkedState'
						? 1
						: hook === 'useReducer'
							? 2
							: hook === 'useState' || hook === 'useMemo' || EFFECT_HOOKS.has(hook)
								? 0
								: -1;
				for (let index = 0; index < (node.arguments?.length ?? 0); index++) {
					const argument = node.arguments[index];
					if (index !== synchronousCallbackIndex || !FUNCTION_TYPES.has(unwrap(argument)?.type)) {
						visit(argument, scope, executionPhase);
					}
					executionPhase = phaseAfter(argument, executionPhase);
				}
				if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					(calleeBinding?.kind === 'setter' || tupleUpdater)
				) {
					reportSetter(callee, executionPhase);
				}
				if (EFFECT_HOOKS.has(hook)) {
					visitSynchronousHookCallback(node.arguments?.[0], scope, 'effect');
					return;
				}
				if (hook === 'useState' || hook === 'useMemo') {
					visitSynchronousHookCallback(node.arguments?.[0], scope, executionPhase);
					return;
				}
				if (hook === 'useReducer') {
					visitSynchronousHookCallback(node.arguments?.[2], scope, executionPhase);
					return;
				}
				if (hook === 'useLinkedState') {
					visitSynchronousHookCallback(node.arguments?.[1], scope, executionPhase);
					visitLinkedStateComparators(node.arguments?.[2], scope, executionPhase);
					return;
				}
				if (FUNCTION_TYPES.has(callee?.type)) {
					visitCallback(callee, scope, executionPhase);
				} else if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					calleeBinding?.kind === 'callback'
				) {
					visitCallback(calleeBinding.node, calleeBinding.scope, executionPhase);
				} else if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					(calleeBinding?.kind === 'callback-choice' ||
						callee?.type === 'SequenceExpression' ||
						callee?.type === 'ConditionalExpression' ||
						callee?.type === 'LogicalExpression')
				) {
					visitSynchronousHookCallback(callee, scope, executionPhase);
				}
				return;
			}
			case 'NewExpression': {
				const callee = unwrap(node.callee);
				const binding = callee?.type === 'Identifier' ? resolve(scope, callee.name) : null;
				const inlineConstructor =
					(callee?.type === 'FunctionExpression' || callee?.type === 'FunctionDeclaration') &&
					callee.async !== true &&
					callee.generator !== true;
				if (!FUNCTION_TYPES.has(callee?.type)) visit(node.callee, scope, phase);
				const executionPhase = visitExpressionList(
					node.arguments,
					scope,
					phaseAfter(node.callee, phase),
				);
				if (inlineConstructor) {
					visitCallback(callee, scope, executionPhase);
				} else if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					binding?.kind === 'callback' &&
					(binding.node.type === 'FunctionExpression' ||
						binding.node.type === 'FunctionDeclaration') &&
					binding.node.async !== true &&
					binding.node.generator !== true
				) {
					visitCallback(binding.node, binding.scope, executionPhase);
				}
				return;
			}
			case 'TaggedTemplateExpression': {
				const tag = unwrap(node.tag);
				const binding = tag?.type === 'Identifier' ? resolve(scope, tag.name) : null;
				if (!FUNCTION_TYPES.has(tag?.type)) visit(node.tag, scope, phase);
				const tagPhase = phaseAfter(node.tag, phase, true);
				visit(node.quasi, scope, tagPhase);
				const executionPhase = phaseAfter(node.quasi, tagPhase);
				if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					binding?.kind === 'setter'
				) {
					reportSetter(tag, executionPhase);
				} else if (FUNCTION_TYPES.has(tag?.type)) {
					visitCallback(tag, scope, executionPhase);
				} else if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					binding?.kind === 'callback'
				) {
					visitCallback(binding.node, binding.scope, executionPhase);
				}
				return;
			}
			case 'AssignmentExpression': {
				if (node.left?.type === 'ArrayPattern' || node.left?.type === 'ObjectPattern') {
					visit(node.right, scope, phase);
					visitPatternExpressions(node.left, scope, phaseAfter(node.right, phase));
					return;
				}
				visit(node.left, scope, phase);
				const rightPhase = phaseAfter(node.left, phase, true);
				visit(node.right, scope, rightPhase);
				const executionPhase = phaseAfter(node.right, rightPhase);
				if (executionPhase === 'render' && currentRef(node.left, scope)) reportRef(node.left);
				return;
			}
			case 'UpdateExpression':
				if (phase === 'render' && currentRef(node.argument, scope)) reportRef(node.argument);
				visit(node.argument, scope, phase);
				return;
			case 'CatchClause': {
				const catchScope = createScope(scope, 'block', [], node.param ? [node.param] : []);
				visit(node.body, catchScope, phase);
				return;
			}
			case 'ForStatement': {
				const loop = createScope(scope, 'block');
				if (node.init?.type === 'VariableDeclaration') {
					const target = declarationScope(loop, node.init.kind);
					const binding = { kind: 'other' };
					for (const declaration of node.init.declarations ?? []) {
						addPatternNames(declaration.id, target.bindings, binding);
					}
				}
				let executionPhase = phase;
				visit(node.init, loop, executionPhase);
				if (
					currentFunctionIsAsync &&
					executionPhase !== 'deferred' &&
					(node.init?.type === 'VariableDeclaration'
						? statementAlwaysAwaits(node.init)
						: alwaysAwaits(node.init))
				) {
					executionPhase = 'deferred';
				}
				visit(node.test, loop, executionPhase);
				if (currentFunctionIsAsync && executionPhase !== 'deferred' && alwaysAwaits(node.test)) {
					executionPhase = 'deferred';
				}
				visit(node.body, loop, executionPhase);
				visit(node.update, loop, executionPhase);
				return;
			}
			case 'ForInStatement':
			case 'ForOfStatement': {
				const loop = createScope(scope, 'block');
				if (node.left?.type === 'VariableDeclaration') {
					const target = declarationScope(loop, node.left.kind);
					const binding = { kind: 'other' };
					for (const declaration of node.left.declarations ?? []) {
						addPatternNames(declaration.id, target.bindings, binding);
					}
				}
				visit(node.right, loop, phase);
				const executionPhase =
					currentFunctionIsAsync &&
					phase !== 'deferred' &&
					(alwaysAwaits(node.right) || (node.type === 'ForOfStatement' && node.await === true))
						? 'deferred'
						: phase;
				visit(node.left, loop, executionPhase);
				visit(node.body, loop, executionPhase);
				return;
			}
			case 'WhileStatement': {
				visit(node.test, scope, phase);
				const executionPhase =
					currentFunctionIsAsync && phase !== 'deferred' && alwaysAwaits(node.test)
						? 'deferred'
						: phase;
				visit(node.body, scope, executionPhase);
				return;
			}
			case 'DoWhileStatement': {
				visit(node.body, scope, phase);
				const executionPhase =
					currentFunctionIsAsync &&
					phase !== 'deferred' &&
					statementAlwaysAwaits(node.body) &&
					(doWhileSynchronousControl(node.body) & 2) === 0
						? 'deferred'
						: phase;
				visit(node.test, scope, executionPhase);
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
