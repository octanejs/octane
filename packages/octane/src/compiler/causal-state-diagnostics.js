import { analyzeHookDependencies } from './hook-deps.js';

export const CAUSAL_STATE_RENDER_WRITE = 'OCTANE_CAUSAL_STATE_RENDER_WRITE';
export const CAUSAL_STATE_PURITY_WRITE = 'OCTANE_CAUSAL_STATE_PURITY_WRITE';
export const CAUSAL_STATE_EFFECT_WRITE = 'OCTANE_CAUSAL_STATE_EFFECT_WRITE';
export const CAUSAL_STATE_CLEANUP_WRITE = 'OCTANE_CAUSAL_STATE_CLEANUP_WRITE';

const FUNCTION_TYPES = new Set([
	'ArrowFunctionExpression',
	'FunctionDeclaration',
	'FunctionExpression',
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
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const WRITER_HOOKS = new Set(['useState', 'useReducer', 'useActionState', 'useOptimistic']);
const SYNC_ITERATORS = new Set([
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flatMap',
	'forEach',
	'map',
	'reduce',
	'reduceRight',
	'some',
	'sort',
]);
const SKIP_KEYS = new Set(['end', 'loc', 'metadata', 'parent', 'range', 'start', 'type']);

function unwrap(node) {
	let current = node;
	while (current && TRANSPARENT_EXPRESSIONS.has(current.type)) current = current.expression;
	return current;
}

function isFunction(node) {
	return node != null && FUNCTION_TYPES.has(node.type);
}

function declarationOf(statement) {
	if (
		statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
	) {
		return statement.declaration;
	}
	return statement;
}

function createScope(parent, kind) {
	return { parent, kind, bindings: new Map() };
}

function nearestFunctionScope(scope) {
	let current = scope;
	while (current.parent !== null && current.kind !== 'function') current = current.parent;
	return current;
}

function declareIdentifier(scope, node, data = {}) {
	if (!node || node.type !== 'Identifier') return null;
	let binding = scope.bindings.get(node.name);
	if (binding === undefined) {
		binding = {
			name: node.name,
			node,
			scope,
			constant: false,
			mutated: false,
			value: null,
			...data,
		};
		scope.bindings.set(node.name, binding);
	}
	return binding;
}

function declarePattern(scope, pattern, data, bindingsByPattern) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		const binding = declareIdentifier(scope, pattern, data);
		if (binding !== null) bindingsByPattern.set(pattern, binding);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		declarePattern(scope, pattern.left, data, bindingsByPattern);
		return;
	}
	if (pattern.type === 'RestElement') {
		declarePattern(scope, pattern.argument, data, bindingsByPattern);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) {
			declarePattern(scope, element, data, bindingsByPattern);
		}
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			declarePattern(
				scope,
				property.type === 'RestElement' ? property.argument : property.value,
				data,
				bindingsByPattern,
			);
		}
	}
}

function resolveBinding(scope, name) {
	for (let current = scope; current !== null; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function createScopes(ast) {
	const scopeByNode = new WeakMap();
	const bindingsByPattern = new WeakMap();
	const declarators = [];
	const functions = [];
	const assignments = [];
	const moduleScope = createScope(null, 'module');

	const predeclareStatements = (statements, scope) => {
		for (const original of statements ?? []) {
			if (original?.type === 'ImportDeclaration') {
				for (const specifier of original.specifiers ?? []) {
					if (specifier.local?.type === 'Identifier') {
						const importedName =
							specifier.type === 'ImportDefaultSpecifier'
								? 'default'
								: specifier.type === 'ImportNamespaceSpecifier'
									? '*'
									: (specifier.imported?.name ?? specifier.imported?.value);
						declareIdentifier(scope, specifier.local, {
							constant: true,
							kind: 'import',
							source: original.source?.value,
							importedName,
						});
					}
				}
				continue;
			}
			const statement = declarationOf(original);
			if (!statement) continue;
			if (statement.type === 'FunctionDeclaration' && statement.id) {
				const binding = declareIdentifier(scope, statement.id, {
					constant: true,
					kind: 'function',
				});
				if (binding !== null) binding.functionNode = statement;
				continue;
			}
			if (statement.type === 'ClassDeclaration' && statement.id) {
				declareIdentifier(scope, statement.id, { constant: false, kind: 'class' });
				continue;
			}
			if (statement.type !== 'VariableDeclaration') continue;
			const target = statement.kind === 'var' ? nearestFunctionScope(scope) : scope;
			for (const declarator of statement.declarations ?? []) {
				declarePattern(
					target,
					declarator.id,
					{ constant: statement.kind === 'const', kind: 'variable' },
					bindingsByPattern,
				);
			}
		}
	};

	const visitPatternExpressions = (pattern, scope, visit) => {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') {
			visitPatternExpressions(pattern.left, scope, visit);
			visit(pattern.right, scope);
		} else if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) {
				visitPatternExpressions(element, scope, visit);
			}
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				if (property.computed) visit(property.key, scope);
				visitPatternExpressions(
					property.type === 'RestElement' ? property.argument : property.value,
					scope,
					visit,
				);
			}
		} else if (pattern.type === 'RestElement') {
			visitPatternExpressions(pattern.argument, scope, visit);
		}
	};

	const visitFunction = (node, parentScope, binding = null) => {
		scopeByNode.set(node, parentScope);
		const scope = createScope(parentScope, 'function');
		if (node.id?.type === 'Identifier') {
			const self = declareIdentifier(scope, node.id, {
				constant: true,
				kind: 'function-name',
			});
			if (self !== null) {
				self.functionNode = node;
				self.value = { kind: 'function', node, binding: self };
			}
		}
		for (const param of node.params ?? []) {
			declarePattern(scope, param, { constant: false, kind: 'parameter' }, bindingsByPattern);
		}
		functions.push({ node, binding, scope });
		for (const param of node.params ?? []) visitPatternExpressions(param, scope, visit);
		if (node.body?.type === 'BlockStatement' || node.body?.type === 'JSXCodeBlock') {
			visitBlock(node.body, scope);
		} else {
			visit(node.body, scope);
		}
	};

	const visitBlock = (node, parentScope) => {
		const scope = createScope(parentScope, 'block');
		scopeByNode.set(node, scope);
		predeclareStatements(node.body, scope);
		for (const statement of node.body ?? []) visit(statement, scope);
		if (node.render) visit(node.render, scope);
	};

	const visit = (node, scope) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, scope);
			return;
		}
		scopeByNode.set(node, scope);

		if (node.type === 'Program') {
			predeclareStatements(node.body, scope);
			for (const statement of node.body ?? []) visit(statement, scope);
			return;
		}
		if (node.type === 'ImportDeclaration') return;
		if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
			visit(node.declaration, scope);
			return;
		}
		if (node.type === 'FunctionDeclaration') {
			const binding = node.id ? resolveBinding(scope, node.id.name) : null;
			visitFunction(node, scope, binding);
			return;
		}
		if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
			visitFunction(node, scope);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			visitBlock(node, scope);
			return;
		}
		if (node.type === 'VariableDeclaration') {
			for (const declarator of node.declarations ?? []) {
				scopeByNode.set(declarator, scope);
				declarators.push({ declarator, declaration: node, scope });
				visitPatternExpressions(declarator.id, scope, visit);
				const initial = unwrap(declarator.init);
				if (isFunction(initial)) {
					const binding =
						declarator.id?.type === 'Identifier' ? resolveBinding(scope, declarator.id.name) : null;
					visitFunction(initial, scope, binding);
				} else {
					visit(declarator.init, scope);
				}
			}
			return;
		}
		if (node.type === 'CatchClause') {
			const catchScope = createScope(scope, 'block');
			scopeByNode.set(node, catchScope);
			declarePattern(catchScope, node.param, { constant: false, kind: 'catch' }, bindingsByPattern);
			visitPatternExpressions(node.param, catchScope, visit);
			visit(node.body, catchScope);
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const loopScope = createScope(scope, 'block');
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
				predeclareStatements([declaration], loopScope);
			}
			if (node.type === 'ForStatement') {
				visit(node.init, loopScope);
				visit(node.test, loopScope);
				visit(node.update, loopScope);
			} else {
				visit(node.left, loopScope);
				visit(node.right, loopScope);
			}
			visit(node.body, loopScope);
			return;
		}
		if (node.type === 'SwitchStatement') {
			visit(node.discriminant, scope);
			const switchScope = createScope(scope, 'block');
			predeclareStatements(
				(node.cases ?? []).flatMap((entry) => entry.consequent ?? []),
				switchScope,
			);
			for (const entry of node.cases ?? []) {
				visit(entry.test, switchScope);
				for (const statement of entry.consequent ?? []) visit(statement, switchScope);
			}
			return;
		}
		if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
			assignments.push({ node, scope });
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			visit(node[key], scope);
		}
	};

	visit(ast, moduleScope);
	return {
		moduleScope,
		scopeByNode,
		bindingsByPattern,
		declarators,
		functions,
		assignments,
	};
}

function markPatternMutated(pattern, scope, scopeData) {
	pattern = unwrap(pattern);
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		const binding = resolveBinding(scope, pattern.name);
		if (binding !== null) binding.mutated = true;
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		markPatternMutated(pattern.left, scope, scopeData);
	} else if (pattern.type === 'RestElement') {
		markPatternMutated(pattern.argument, scope, scopeData);
	} else if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) markPatternMutated(element, scope, scopeData);
	} else if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			markPatternMutated(
				property.type === 'RestElement' ? property.argument : property.value,
				scope,
				scopeData,
			);
		}
	} else if (pattern.type === 'MemberExpression') {
		let object = unwrap(pattern.object);
		while (object?.type === 'MemberExpression') object = unwrap(object.object);
		if (object?.type === 'Identifier') {
			const binding = resolveBinding(scope, object.name);
			if (binding !== null) binding.mutated = true;
		}
	}
}

function staticMemberName(member) {
	const property = member?.property;
	if (
		!member?.computed &&
		(property?.type === 'Identifier' || property?.type === 'JSXIdentifier')
	) {
		return property.name;
	}
	if (
		property?.type === 'Literal' &&
		(typeof property.value === 'string' || typeof property.value === 'number')
	) {
		return String(property.value);
	}
	return null;
}

function staticObjectPropertyValue(object, name) {
	if (object?.type === 'ArrayExpression') {
		const index = Number(name);
		return Number.isInteger(index) && index >= 0 ? (object.elements?.[index] ?? null) : null;
	}
	if (object?.type !== 'ObjectExpression') return null;
	// A spread can override or dynamically supply the property, so do not claim a
	// static callee through an object whose final shape is not locally known.
	if ((object.properties ?? []).some((property) => property.type === 'SpreadElement')) return null;
	for (let index = (object.properties?.length ?? 0) - 1; index >= 0; index--) {
		const property = object.properties[index];
		if (property.type !== 'Property' || property.kind !== 'init') continue;
		const key =
			!property.computed && property.key?.type === 'Identifier'
				? property.key.name
				: property.key?.type === 'Literal'
					? String(property.key.value)
					: null;
		if (key === name) return property.value;
	}
	return null;
}

function hookName(call) {
	return call?._octaneImportedHook ?? call?._octaneHookRuntimeImportedHook ?? null;
}

function writerFromHookPattern(pattern, call, scopeData) {
	const name = hookName(call);
	if (!WRITER_HOOKS.has(name) || pattern?.type !== 'ArrayPattern') return;
	const writerPattern = pattern.elements?.[1];
	if (writerPattern?.type !== 'Identifier') return;
	const binding = scopeData.bindingsByPattern.get(writerPattern);
	if (binding === undefined || !binding.constant || binding.mutated) return;
	binding.value = {
		kind: 'writer',
		hook: name,
		name: writerPattern.name,
		declaration: writerPattern,
		hookCall: call,
	};
}

function rangeFor(node) {
	const start = node?.loc?.start ?? { line: 1, column: 0 };
	const end = node?.loc?.end ?? start;
	return {
		start: { offset: node?.start ?? 0, line: start.line, column: start.column },
		end: { offset: node?.end ?? node?.start ?? 0, line: end.line, column: end.column },
	};
}

function phaseDiagnostic(phase, call, writer, filename) {
	const displayName =
		call.callee?.type === 'Identifier' ? call.callee.name : writer.name || 'state updater';
	let code;
	let severity;
	let message;
	if (phase.kind === 'render') {
		code = CAUSAL_STATE_RENDER_WRITE;
		severity = 'error';
		message =
			`[${code}] Octane's causal state model does not allow \`${displayName}\` to update ` +
			`state while <${phase.owner}> renders. Derive values during render, or move the ` +
			'transition to the event or action that causes it.';
	} else if (phase.kind === 'purity') {
		code = CAUSAL_STATE_PURITY_WRITE;
		severity = 'error';
		message =
			`[${code}] Octane's causal state model requires ${phase.label} to be pure; ` +
			`\`${displayName}\` updates state. Return the derived value and move the transition to ` +
			'the event, action, or external-source boundary that causes it.';
	} else if (phase.kind === 'cleanup') {
		code = CAUSAL_STATE_CLEANUP_WRITE;
		severity = 'warning';
		message =
			`[${code}] Octane's causal state model does not allow \`${displayName}\` to update ` +
			'state while effect cleanup executes. Cleanup should only undo external synchronization; ' +
			'move state transitions to their event, action, or source callback.';
	} else {
		code = CAUSAL_STATE_EFFECT_WRITE;
		severity = 'warning';
		message =
			`[${code}] Octane's causal state model does not allow \`${displayName}\` to update ` +
			'state while effect setup executes. Derive values during render, handle user causes in ' +
			'events/actions, and model external input as a source snapshot.';
	}
	const primary = rangeFor(call.callee ?? call);
	const declaration = rangeFor(writer.declaration ?? writer.hookCall);
	return {
		code,
		severity,
		phase: phase.kind,
		message,
		filename: filename || 'module.tsrx',
		start: primary.start,
		end: primary.end,
		declaration: {
			hook: writer.hook,
			name: writer.name,
			start: declaration.start,
			end: declaration.end,
		},
		reportOnly: severity !== 'error',
	};
}

function formatDiagnostic(diagnostic) {
	return `${diagnostic.filename}:${diagnostic.start.line}:${diagnostic.start.column + 1} ${diagnostic.message}`;
}

/**
 * Find state writes whose execution phase is statically proven. Function values
 * passed to opaque APIs remain deliberately unclassified; the runtime guard owns
 * callbacks that may run either synchronously or on a later causal turn.
 */
export function analyzeCausalStateDiagnostics(ast, source, filename, options = {}) {
	analyzeHookDependencies(ast, {
		filename,
		onlyImported: options.onlyImported === true,
		hookRuntimeModules: options.hookRuntimeModules,
	});
	const scopeData = createScopes(ast);
	const runtimeModules = new Set([
		'octane',
		'octane/server',
		'octane/universal',
		...(options.hookRuntimeModules ?? []),
	]);
	const anonymousDefaultFunctions = new WeakSet();
	for (const statement of ast.body ?? []) {
		if (statement?.type !== 'ExportDefaultDeclaration') continue;
		const declaration = unwrap(statement.declaration);
		if (isFunction(declaration) && declaration.id == null) {
			anonymousDefaultFunctions.add(declaration);
		}
	}
	for (const { node, scope } of scopeData.assignments) {
		markPatternMutated(
			node.type === 'AssignmentExpression' ? node.left : node.argument,
			scope,
			scopeData,
		);
	}

	for (const entry of scopeData.functions) {
		if (entry.binding !== null && entry.binding.constant && !entry.binding.mutated) {
			entry.binding.functionNode = entry.node;
			entry.binding.value = { kind: 'function', node: entry.node, binding: entry.binding };
		}
	}
	for (const { declarator, scope } of scopeData.declarators) {
		writerFromHookPattern(declarator.id, unwrap(declarator.init), scopeData);
		if (declarator.id?.type === 'Identifier') {
			const binding = resolveBinding(scope, declarator.id.name);
			if (binding !== null) binding.initializer = declarator.init;
		}
	}

	const resolveValue = (node, context) => {
		node = unwrap(node);
		if (!node) return null;
		if (isFunction(node)) return { kind: 'function', node, binding: null };
		if (node.type === 'ObjectExpression' || node.type === 'ArrayExpression') {
			return { kind: 'aggregate', node };
		}
		if (node.type === 'SequenceExpression') {
			return resolveValue(node.expressions?.at(-1), context);
		}
		if (node.type === 'CallExpression' && hookName(node) === 'useCallback') {
			return resolveValue(node.arguments?.[0], context);
		}
		if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
			const object = resolveValue(node.object, context);
			const name = staticMemberName(node);
			if (object?.kind !== 'aggregate' || name === null) return null;
			return resolveValue(staticObjectPropertyValue(object.node, name), context);
		}
		if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return null;
		const scope = scopeData.scopeByNode.get(node) ?? scopeData.moduleScope;
		const binding = resolveBinding(scope, node.name);
		if (binding === null || binding.mutated) return null;
		for (let current = context; current !== null; current = current.parent) {
			if (current.values.has(binding)) return current.values.get(binding);
		}
		return binding.value;
	};

	// Resolve immutable aliases after writers and functions have been identified.
	for (let changed = true; changed; ) {
		changed = false;
		for (const { declarator, declaration, scope } of scopeData.declarators) {
			if (declaration.kind !== 'const' || declarator.id?.type !== 'Identifier') continue;
			const binding = resolveBinding(scope, declarator.id.name);
			if (binding === null || binding.mutated || binding.value !== null) continue;
			const value = resolveValue(declarator.init, null);
			if (value !== null) {
				binding.value = value;
				changed = true;
			}
		}
	}

	const diagnostics = [];
	const reported = new Set();
	const activeFunctions = new Set();

	const reportWriter = (call, writer, phase) => {
		if (phase.kind === 'event' || phase.kind === 'allowed') return;
		const diagnostic = phaseDiagnostic(phase, call, writer, filename);
		const key = `${diagnostic.code}:${diagnostic.start.offset}`;
		if (reported.has(key)) return;
		reported.add(key);
		diagnostics.push(diagnostic);
	};

	const createCallContext = (fnValue, args, callerContext) => {
		const values = new Map();
		for (let index = 0; index < (fnValue.node.params?.length ?? 0); index++) {
			const parameter = fnValue.node.params[index];
			const pattern = parameter?.type === 'AssignmentPattern' ? parameter.left : parameter;
			if (pattern?.type !== 'Identifier') continue;
			const binding = scopeData.bindingsByPattern.get(pattern);
			const value = resolveValue(args[index], callerContext);
			if (binding !== undefined && value !== null) values.set(binding, value);
		}
		return { parent: callerContext, values };
	};

	const executeFunction = (value, phase, args = [], callerContext = null) => {
		if (value?.kind !== 'function') return;
		const key = `${phase.kind}:${value.node.start ?? 0}`;
		if (activeFunctions.has(key)) return;
		activeFunctions.add(key);
		try {
			const context = createCallContext(value, args, callerContext);
			for (const parameter of value.node.params ?? []) {
				if (parameter.type === 'AssignmentPattern') executeNode(parameter.right, phase, context);
			}
			// Parameter initializers run when every callable is entered, including
			// generators. Generator bodies wait for the first `.next()`, while async
			// bodies run synchronously through the first reached `await` and resume on
			// a later causal turn. Only that synchronous prefix inherits `phase`.
			if (value.node.generator) return;
			if (value.node.async) executeAsyncPrefixNode(value.node.body, phase, context);
			else executeNode(value.node.body, phase, context);
		} finally {
			activeFunctions.delete(key);
		}
	};

	const executeKnownCallable = (value, phase, site, args = [], callerContext = null) => {
		if (value?.kind === 'writer') reportWriter(site, value, phase);
		else executeFunction(value, phase, args, callerContext);
	};

	const ownReturnValues = (fn) => {
		if (fn.body?.type !== 'BlockStatement' && fn.body?.type !== 'JSXCodeBlock') {
			return fn.body == null ? [] : [fn.body];
		}
		const values = [];
		const visit = (node, root = false) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (!root && isFunction(node)) return;
			if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
				for (const statement of node.body ?? []) {
					visit(statement);
					if (
						statement?.type === 'ReturnStatement' ||
						statement?.type === 'ThrowStatement' ||
						statement?.type === 'BreakStatement' ||
						statement?.type === 'ContinueStatement'
					) {
						break;
					}
				}
				return;
			}
			if (node.type === 'ReturnStatement') {
				if (node.argument) values.push(node.argument);
				return;
			}
			for (const key in node) {
				if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
				visit(node[key]);
			}
		};
		visit(fn.body, true);
		return values;
	};

	const callableResolutionStack = new Set();
	const resolveCallableValues = (node, context) => {
		node = unwrap(node);
		if (!node) return [];
		if (node.type === 'ConditionalExpression') {
			const truthiness = staticTruthiness(node.test, context);
			if (truthiness !== null) {
				return resolveCallableValues(truthiness ? node.consequent : node.alternate, context);
			}
			return [
				...resolveCallableValues(node.consequent, context),
				...resolveCallableValues(node.alternate, context),
			];
		}
		if (node.type === 'LogicalExpression') {
			const truthiness = staticTruthiness(node.left, context);
			if (node.operator === '&&' && truthiness !== null) {
				return truthiness ? resolveCallableValues(node.right, context) : [];
			}
			if (node.operator === '||' && truthiness !== null) {
				return truthiness
					? resolveCallableValues(node.left, context)
					: resolveCallableValues(node.right, context);
			}
			const nullish = staticNullishness(node.left, context);
			if (node.operator === '??' && nullish !== null) {
				return resolveCallableValues(nullish ? node.right : node.left, context);
			}
			return [
				...resolveCallableValues(node.left, context),
				...resolveCallableValues(node.right, context),
			];
		}
		if (node.type === 'SequenceExpression') {
			return resolveCallableValues(node.expressions?.at(-1), context);
		}

		const direct = resolveValue(node, context);
		if (direct?.kind === 'function' || direct?.kind === 'writer') return [direct];

		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			const scope = scopeData.scopeByNode.get(node) ?? scopeData.moduleScope;
			const binding = resolveBinding(scope, node.name);
			if (binding?.constant && !binding.mutated && binding.initializer) {
				return resolveCallableValues(binding.initializer, context);
			}
			return [];
		}

		if (node.type !== 'CallExpression') return [];
		const callees = resolveCallableValues(node.callee, context);
		const returned = [];
		for (const callee of callees) {
			if (callee.kind !== 'function' || callee.node.async || callee.node.generator) continue;
			const key = callee.node;
			if (callableResolutionStack.has(key)) continue;
			callableResolutionStack.add(key);
			try {
				const callContext = createCallContext(callee, node.arguments ?? [], context);
				for (const value of ownReturnValues(callee.node)) {
					returned.push(...resolveCallableValues(value, callContext));
				}
			} finally {
				callableResolutionStack.delete(key);
			}
		}
		return returned;
	};

	const processHookPolicy = (call, context) => {
		const name = hookName(call);
		if (name === 'useMemo') {
			for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
				executeKnownCallable(
					callback,
					{ kind: 'purity', label: '`useMemo` calculations' },
					call.arguments?.[0],
				);
			}
		} else if (name === 'useState') {
			for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
				executeKnownCallable(
					callback,
					{ kind: 'purity', label: '`useState` initializers' },
					call.arguments?.[0],
				);
			}
		} else if (name === 'useReducer') {
			for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
				executeKnownCallable(callback, { kind: 'purity', label: 'reducers' }, call.arguments?.[0]);
			}
			for (const callback of resolveCallableValues(call.arguments?.[2], context)) {
				executeKnownCallable(
					callback,
					{ kind: 'purity', label: '`useReducer` initializers' },
					call.arguments?.[2],
				);
			}
		} else if (name === 'useOptimistic') {
			for (const callback of resolveCallableValues(call.arguments?.[1], context)) {
				executeKnownCallable(
					callback,
					{ kind: 'purity', label: '`useOptimistic` update functions' },
					call.arguments?.[1],
				);
			}
		} else if (EFFECT_HOOKS.has(name)) {
			for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
				executeKnownCallable(callback, { kind: 'effect' }, call.arguments?.[0], [], context);
				// Async and generator callbacks return a Promise/iterator, never a
				// cleanup function. Their syntactic return values must not be classified
				// as lifecycle cleanup.
				if (callback.kind !== 'function' || callback.node.async || callback.node.generator) {
					continue;
				}
				for (const returned of ownReturnValues(callback.node)) {
					for (const cleanup of resolveCallableValues(returned, context)) {
						executeKnownCallable(cleanup, { kind: 'cleanup' }, returned, [], context);
					}
				}
			}
		} else if (name === 'useImperativeHandle') {
			for (const factory of resolveCallableValues(call.arguments?.[1], context)) {
				executeKnownCallable(factory, { kind: 'effect' }, call.arguments?.[1], [], context);
			}
		}
	};

	const executeCallAfterEvaluation = (call, phase, context) => {
		const name = hookName(call);
		if (name !== null) processHookPolicy(call, context);

		const callees = resolveCallableValues(call.callee, context);
		for (const callee of callees) {
			if (callee.kind === 'writer') {
				reportWriter(call, callee, phase);
				if (callee.hook === 'useState') {
					for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
						executeKnownCallable(
							callback,
							{ kind: 'purity', label: 'functional state updaters' },
							call.arguments?.[0],
						);
					}
				}
			} else if (callee.kind === 'function') {
				executeFunction(callee, phase, call.arguments ?? [], context);
			}
		}

		const member = unwrap(call.callee);
		if (
			member?.type === 'MemberExpression' &&
			!member.computed &&
			member.property?.type === 'Identifier' &&
			SYNC_ITERATORS.has(member.property.name) &&
			resolveValue(member.object, context)?.node?.type === 'ArrayExpression'
		) {
			for (const callback of resolveCallableValues(call.arguments?.[0], context)) {
				executeKnownCallable(callback, phase, call.arguments?.[0], [], context);
			}
		}
	};

	const executeCall = (call, phase, context) => {
		// Evaluating a nested callee (for example `makeCallback()()`) and each
		// argument is immediate. Function literals passed to opaque APIs are only
		// created, and are therefore skipped by `executeNode`.
		executeNode(call.callee, phase, context);
		for (const argument of call.arguments ?? []) executeNode(argument, phase, context);
		executeCallAfterEvaluation(call, phase, context);
	};

	function executeNode(node, phase, context) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) executeNode(child, phase, context);
			return;
		}
		node = unwrap(node);
		if (!node) return;
		if (isFunction(node) || node.type?.startsWith('TS')) return;
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			let completed = true;
			for (const statement of node.body ?? []) {
				executeNode(statement, phase, context);
				if (
					statement?.type === 'ReturnStatement' ||
					statement?.type === 'ThrowStatement' ||
					statement?.type === 'BreakStatement' ||
					statement?.type === 'ContinueStatement'
				) {
					completed = false;
					break;
				}
			}
			if (completed && node.render) executeNode(node.render, phase, context);
			return;
		}
		if (node.type === 'CallExpression') {
			executeCall(node, phase, context);
			return;
		}
		if (node.type === 'Property') {
			if (node.computed) executeNode(node.key, phase, context);
			executeNode(node.value, phase, context);
			return;
		}
		if (node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
			if (node.computed) executeNode(node.key, phase, context);
			return;
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			executeNode(node[key], phase, context);
		}
	}

	const PREFIX_NORMAL = 1;
	const PREFIX_RETURNED = 2;
	const PREFIX_THROWN = 4;
	const PREFIX_BROKEN = 8;
	const PREFIX_CONTINUED = 16;
	const PREFIX_SUSPENDED = 32;

	const staticTruthiness = (node, context) => {
		node = unwrap(node);
		if (!node) return null;
		if (node.type === 'Literal') return Boolean(node.value);
		if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression' || isFunction(node)) {
			return true;
		}
		if (node.type === 'UnaryExpression') {
			if (node.operator === 'void') return false;
			if (node.operator === '!') {
				const argument = staticTruthiness(node.argument, context);
				return argument === null ? null : !argument;
			}
		}
		if (node.type === 'SequenceExpression') {
			return staticTruthiness(node.expressions?.at(-1), context);
		}
		const value = resolveValue(node, context);
		if (value?.kind === 'function' || value?.kind === 'writer' || value?.kind === 'aggregate') {
			return true;
		}
		return null;
	};

	const staticNullishness = (node, context) => {
		node = unwrap(node);
		if (!node) return null;
		if (node.type === 'Literal') return node.value == null;
		if (node.type === 'UnaryExpression' && node.operator === 'void') return true;
		if (node.type === 'SequenceExpression') {
			return staticNullishness(node.expressions?.at(-1), context);
		}
		const value = resolveValue(node, context);
		if (value?.kind === 'function' || value?.kind === 'writer' || value?.kind === 'aggregate') {
			return false;
		}
		return null;
	};

	function executeAsyncPrefixList(nodes, phase, context) {
		let outcome = PREFIX_NORMAL;
		for (const node of nodes ?? []) {
			if ((outcome & PREFIX_NORMAL) === 0) break;
			outcome = (outcome & ~PREFIX_NORMAL) | executeAsyncPrefixNode(node, phase, context);
		}
		return outcome;
	}

	function executeAsyncPrefixCall(call, phase, context) {
		let outcome = executeAsyncPrefixNode(call.callee, phase, context);
		for (const argument of call.arguments ?? []) {
			if ((outcome & PREFIX_NORMAL) === 0) return outcome;
			outcome = (outcome & ~PREFIX_NORMAL) | executeAsyncPrefixNode(argument, phase, context);
		}
		if ((outcome & PREFIX_NORMAL) !== 0) {
			executeCallAfterEvaluation(call, phase, context);
		}
		return outcome;
	}

	function executeAsyncPrefixNode(node, phase, context) {
		if (!node || typeof node !== 'object') return PREFIX_NORMAL;
		if (Array.isArray(node)) return executeAsyncPrefixList(node, phase, context);
		node = unwrap(node);
		if (!node || isFunction(node) || node.type?.startsWith('TS')) return PREFIX_NORMAL;

		if (node.type === 'AwaitExpression') {
			const argument = executeAsyncPrefixNode(node.argument, phase, context);
			return (argument & ~PREFIX_NORMAL) | PREFIX_SUSPENDED;
		}
		if (node.type === 'CallExpression') {
			return executeAsyncPrefixCall(node, phase, context);
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const body = executeAsyncPrefixList(node.body, phase, context);
			if ((body & PREFIX_NORMAL) === 0 || !node.render) return body;
			return (body & ~PREFIX_NORMAL) | executeAsyncPrefixNode(node.render, phase, context);
		}
		if (node.type === 'ExpressionStatement') {
			return executeAsyncPrefixNode(node.expression, phase, context);
		}
		if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') {
			const argument = executeAsyncPrefixNode(node.argument, phase, context);
			const completion = node.type === 'ReturnStatement' ? PREFIX_RETURNED : PREFIX_THROWN;
			return (argument & ~PREFIX_NORMAL) | ((argument & PREFIX_NORMAL) === 0 ? 0 : completion);
		}
		if (node.type === 'BreakStatement') {
			return PREFIX_BROKEN;
		}
		if (node.type === 'ContinueStatement') {
			return PREFIX_CONTINUED;
		}
		if (node.type === 'IfStatement') {
			const test = executeAsyncPrefixNode(node.test, phase, context);
			if ((test & PREFIX_NORMAL) === 0) return test;
			const truthiness = staticTruthiness(node.test, context);
			if (truthiness === true) {
				return (test & ~PREFIX_NORMAL) | executeAsyncPrefixNode(node.consequent, phase, context);
			}
			if (truthiness === false) {
				return (
					(test & ~PREFIX_NORMAL) |
					(node.alternate ? executeAsyncPrefixNode(node.alternate, phase, context) : PREFIX_NORMAL)
				);
			}
			const consequent = executeAsyncPrefixNode(node.consequent, phase, context);
			const alternate = node.alternate
				? executeAsyncPrefixNode(node.alternate, phase, context)
				: PREFIX_NORMAL;
			return (test & ~PREFIX_NORMAL) | consequent | alternate;
		}
		if (node.type === 'ConditionalExpression') {
			const test = executeAsyncPrefixNode(node.test, phase, context);
			if ((test & PREFIX_NORMAL) === 0) return test;
			const truthiness = staticTruthiness(node.test, context);
			if (truthiness !== null) {
				return (
					(test & ~PREFIX_NORMAL) |
					executeAsyncPrefixNode(truthiness ? node.consequent : node.alternate, phase, context)
				);
			}
			return (
				(test & ~PREFIX_NORMAL) |
				executeAsyncPrefixNode(node.consequent, phase, context) |
				executeAsyncPrefixNode(node.alternate, phase, context)
			);
		}
		if (node.type === 'LogicalExpression') {
			const left = executeAsyncPrefixNode(node.left, phase, context);
			if ((left & PREFIX_NORMAL) === 0) return left;
			const truthiness = staticTruthiness(node.left, context);
			const nullish = staticNullishness(node.left, context);
			const mustEvaluateRight =
				(node.operator === '&&' && truthiness === true) ||
				(node.operator === '||' && truthiness === false) ||
				(node.operator === '??' && nullish === true);
			const mustShortCircuit =
				(node.operator === '&&' && truthiness === false) ||
				(node.operator === '||' && truthiness === true) ||
				(node.operator === '??' && nullish === false);
			if (mustEvaluateRight) {
				return (left & ~PREFIX_NORMAL) | executeAsyncPrefixNode(node.right, phase, context);
			}
			if (mustShortCircuit) return left;
			// An unknown condition can short-circuit synchronously or evaluate the
			// right-hand side, so retain both possible outcomes.
			return (
				(left & ~PREFIX_NORMAL) | PREFIX_NORMAL | executeAsyncPrefixNode(node.right, phase, context)
			);
		}
		if (node.type === 'VariableDeclaration') {
			return executeAsyncPrefixList(
				(node.declarations ?? []).map((declarator) => declarator.init),
				phase,
				context,
			);
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'WhileStatement' ||
			node.type === 'DoWhileStatement'
		) {
			const setup = [];
			if (node.type === 'ForStatement') setup.push(node.init, node.test);
			else if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
				setup.push(node.left, node.right);
			} else {
				setup.push(node.test);
			}
			const initial = executeAsyncPrefixList(setup, phase, context);
			if ((initial & PREFIX_NORMAL) === 0) return initial;
			if (node.await === true) return (initial & ~PREFIX_NORMAL) | PREFIX_SUSPENDED;
			executeAsyncPrefixNode(node.body, phase, context);
			if (node.type === 'ForStatement') executeAsyncPrefixNode(node.update, phase, context);
			// Except for a statically modelled do/while, a loop may execute zero
			// iterations. Keep its following statements in the synchronous prefix.
			return (initial & ~PREFIX_NORMAL) | PREFIX_NORMAL;
		}
		if (node.type === 'TryStatement') {
			const attempted = executeAsyncPrefixNode(node.block, phase, context);
			let handled = attempted;
			if (node.handler && (attempted & PREFIX_THROWN) !== 0) {
				handled =
					(handled & ~PREFIX_THROWN) | executeAsyncPrefixNode(node.handler.body, phase, context);
			}
			if (node.finalizer && (handled & ~PREFIX_SUSPENDED) !== 0) {
				const finalizer = executeAsyncPrefixNode(node.finalizer, phase, context);
				let result = handled & PREFIX_SUSPENDED;
				if ((finalizer & PREFIX_NORMAL) !== 0) result |= handled & ~PREFIX_SUSPENDED;
				result |= finalizer & ~PREFIX_NORMAL;
				return result;
			}
			return handled;
		}
		if (node.type === 'Property') {
			const values = node.computed ? [node.key, node.value] : [node.value];
			return executeAsyncPrefixList(values, phase, context);
		}
		if (node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
			return node.computed ? executeAsyncPrefixNode(node.key, phase, context) : PREFIX_NORMAL;
		}

		const children = [];
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			children.push(node[key]);
		}
		return executeAsyncPrefixList(children, phase, context);
	}

	// Hook callbacks and functional updater bodies have an intrinsic phase even
	// when their enclosing component/custom hook is imported and invoked elsewhere.
	const scanPolicies = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) scanPolicies(child);
			return;
		}
		if (node.type === 'CallExpression') {
			if (hookName(node) !== null) processHookPolicy(node, null);
			for (const callee of resolveCallableValues(node.callee, null)) {
				if (callee.kind !== 'writer' || callee.hook !== 'useState') continue;
				for (const callback of resolveCallableValues(node.arguments?.[0], null)) {
					executeKnownCallable(
						callback,
						{ kind: 'purity', label: 'functional state updaters' },
						node.arguments?.[0],
					);
				}
			}
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			scanPolicies(node[key]);
		}
	};
	const executeComponentValue = (node, owner) => {
		const value = unwrap(node);
		if (!value) return;
		if (value.type === 'ConditionalExpression') {
			executeComponentValue(value.consequent, owner);
			executeComponentValue(value.alternate, owner);
			return;
		}
		if (value.type === 'LogicalExpression') {
			executeComponentValue(value.left, owner);
			executeComponentValue(value.right, owner);
			return;
		}
		if (value.type === 'SequenceExpression') {
			executeComponentValue(value.expressions?.at(-1), owner);
			return;
		}
		executeFunction(resolveValue(value, null), { kind: 'render', owner });
	};
	const componentReferenceName = (node) => {
		if (!node) return null;
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name;
		if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
			const object = componentReferenceName(node.object);
			const property = staticMemberName(node);
			return object === null || property === null ? null : `${object}.${property}`;
		}
		return null;
	};
	const importedRuntimeFunctionName = (callee) => {
		const value = unwrap(callee);
		if (value?.type === 'Identifier') {
			const scope = scopeData.scopeByNode.get(value) ?? scopeData.moduleScope;
			const binding = resolveBinding(scope, value.name);
			return binding !== null &&
				binding.kind === 'import' &&
				!binding.mutated &&
				runtimeModules.has(binding.source)
				? binding.importedName
				: null;
		}
		if (
			(value?.type === 'MemberExpression' || value?.type === 'JSXMemberExpression') &&
			value.object?.type === 'Identifier'
		) {
			const scope = scopeData.scopeByNode.get(value.object) ?? scopeData.moduleScope;
			const binding = resolveBinding(scope, value.object.name);
			return binding !== null &&
				binding.kind === 'import' &&
				binding.importedName === '*' &&
				!binding.mutated &&
				runtimeModules.has(binding.source)
				? staticMemberName(value)
				: null;
		}
		return null;
	};
	const scanComponentEntries = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) scanComponentEntries(child);
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			const tag = node.openingElement?.name ?? node.id;
			if (tag?.type === 'JSXExpressionContainer' && tag.isDynamic === true) {
				executeComponentValue(tag.expression, 'dynamic component');
			} else if (
				tag?.type === 'MemberExpression' ||
				tag?.type === 'JSXMemberExpression' ||
				((tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') &&
					!/^[a-z]/.test(tag.name) &&
					!tag.name.includes('-'))
			) {
				executeComponentValue(tag, componentReferenceName(tag) ?? 'component');
			}
		}
		if (node.type === 'ExportDefaultDeclaration') {
			executeComponentValue(node.declaration, 'default component export');
		}
		if (node.type === 'ExportNamedDeclaration' && node.source == null) {
			const declaration = node.declaration;
			if (
				declaration?.type === 'FunctionDeclaration' &&
				(/^[A-Z]/.test(declaration.id?.name ?? '') || /^use[A-Z]/.test(declaration.id?.name ?? ''))
			) {
				executeComponentValue(declaration, declaration.id.name);
			} else if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) {
					if (
						item.id?.type === 'Identifier' &&
						(/^[A-Z]/.test(item.id.name) || /^use[A-Z]/.test(item.id.name))
					) {
						executeComponentValue(item.init, item.id.name);
					}
				}
			}
			for (const specifier of node.specifiers ?? []) {
				const exported = specifier.exported?.name ?? specifier.exported?.value;
				if (
					(exported === 'default' ||
						(typeof exported === 'string' &&
							(/^[A-Z]/.test(exported) || /^use[A-Z]/.test(exported)))) &&
					specifier.local
				) {
					executeComponentValue(specifier.local, String(exported));
				}
			}
		}
		if (
			node.type === 'CallExpression' &&
			importedRuntimeFunctionName(node.callee) === 'createElement'
		) {
			executeComponentValue(node.arguments?.[0], 'createElement component');
		}
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'MemberExpression' &&
			!node.callee.computed &&
			node.callee.property?.type === 'Identifier' &&
			node.callee.property.name === 'render'
		) {
			executeComponentValue(node.arguments?.[0], 'root component');
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			scanComponentEntries(node[key]);
		}
	};
	// Custom-hook definitions have an intrinsic render/purity policy even when
	// imported and invoked elsewhere. JSX return shape alone is not component
	// evidence: a JSX-producing event/deferred factory remains ordinary code until
	// it is used at JSX, root.render, or an exported component boundary.
	for (const entry of scopeData.functions) {
		const name =
			entry.binding?.name ??
			entry.node.id?.name ??
			(anonymousDefaultFunctions.has(entry.node) ? 'default' : null);
		const definingScope = scopeData.scopeByNode.get(entry.node);
		if (!name || definingScope !== scopeData.moduleScope) continue;
		if (/^use[A-Z]/.test(name)) {
			executeFunction(
				{ kind: 'function', node: entry.node, binding: entry.binding },
				{ kind: 'render', owner: name },
			);
		}
	}
	scanComponentEntries(ast);
	scanPolicies(ast);

	diagnostics.sort(
		(left, right) => left.start.offset - right.start.offset || left.code.localeCompare(right.code),
	);
	return {
		diagnostics,
		errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
		reports: diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'),
	};
}

export class CausalStateCompileError extends Error {
	constructor(diagnostics) {
		super(diagnostics.map(formatDiagnostic).join('\n'));
		this.name = 'CausalStateCompileError';
		this.code = diagnostics[0]?.code ?? 'OCTANE_CAUSAL_STATE';
		this.diagnostics = diagnostics;
	}
}

export function assertNoCausalStateErrors(analysis) {
	if (analysis.errors.length > 0) throw new CausalStateCompileError(analysis.errors);
}
