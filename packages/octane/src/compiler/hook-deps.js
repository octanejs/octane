// Compiler-owned dependency inference for hooks whose dependency list is
// omitted. The same analysis feeds the full TSRX/TSX compiler and the
// surgical plain-TS hook pass, keeping custom hooks and components aligned.

import { builders as b } from '@tsrx/core';

const DEPENDENCY_HOOKS = new Map([
	['useEffect', { callback: 0, deps: 1 }],
	['useLayoutEffect', { callback: 0, deps: 1 }],
	['useInsertionEffect', { callback: 0, deps: 1 }],
	['useMemo', { callback: 0, deps: 1 }],
	['useCallback', { callback: 0, deps: 1 }],
	['useImperativeHandle', { callback: 1, deps: 2 }],
]);

// Results omitted from compiler-inferred dependency arrays. useRef is
// lifetime-stable. useEffectEvent is intentionally NOT identity-stable, but is
// non-reactive by API contract: including its fresh wrapper would re-run an
// effect on every render and defeat the hook's purpose.
const OMITTED_DEPENDENCY_RESULT_HOOKS = new Set(['useRef', 'useEffectEvent']);
const STABLE_TUPLE_RESULTS = new Map([
	['useState', new Set([1, 2])],
	['useReducer', new Set([1, 2])],
	['useTransition', new Set([1])],
	['useActionState', new Set([1])],
	['useOptimistic', new Set([1])],
]);

const AST_META_KEYS = new Set(['loc', 'start', 'end', 'range', 'metadata', 'parent']);
const TS_VALUE_WRAPPERS = new Set([
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'ParenthesizedExpression',
]);

let nextBindingId = 0;

function createScope(parent, kind) {
	return { parent, kind, bindings: new Map() };
}

function declareName(scope, name, details = null) {
	let binding = scope.bindings.get(name);
	if (binding === undefined) {
		binding = {
			id: nextBindingId++,
			name,
			scope,
			imported: false,
			dependencyInvariant: false,
			reassigned: false,
			octaneImport: null,
			octaneNamespace: false,
			hookRuntimeImport: null,
			hookRuntimeNamespace: false,
		};
		scope.bindings.set(name, binding);
	}
	if (details?.imported) binding.imported = true;
	if (details?.octaneImport) binding.octaneImport = details.octaneImport;
	if (details?.octaneNamespace) binding.octaneNamespace = true;
	if (details?.hookRuntimeImport) binding.hookRuntimeImport = details.hookRuntimeImport;
	if (details?.hookRuntimeNamespace) binding.hookRuntimeNamespace = true;
	return binding;
}

function declarePattern(pattern, scope, details = null) {
	if (!pattern) return;
	switch (pattern.type) {
		case 'Identifier':
			declareName(scope, pattern.name, details);
			return;
		case 'ObjectPattern':
			for (const prop of pattern.properties || []) {
				declarePattern(prop.type === 'RestElement' ? prop.argument : prop.value, scope, details);
			}
			return;
		case 'ArrayPattern':
			for (const element of pattern.elements || []) declarePattern(element, scope, details);
			return;
		case 'AssignmentPattern':
			declarePattern(pattern.left, scope, details);
			return;
		case 'RestElement':
			declarePattern(pattern.argument, scope, details);
	}
}

function resolveBinding(scope, name) {
	for (let current = scope; current !== null; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function nearestFunctionScope(scope) {
	let current = scope;
	while (current.parent !== null && current.kind !== 'function' && current.kind !== 'module') {
		current = current.parent;
	}
	return current;
}

function unwrapExport(node) {
	if (
		node?.type === 'ExportNamedDeclaration' ||
		node?.type === 'ExportDefaultDeclaration' ||
		node?.type === 'DeclareExportDeclaration'
	) {
		return node.declaration;
	}
	return node;
}

function predeclareDirect(statements, scope, hookRuntimeModules) {
	for (const original of statements || []) {
		if (original.type === 'ImportDeclaration') {
			const isHookRuntime = hookRuntimeModules.has(original.source?.value);
			const isOctane = original.source?.value === 'octane';
			for (const specifier of original.specifiers || []) {
				const imported = specifier.imported?.name;
				declareName(scope, specifier.local.name, {
					imported: true,
					octaneImport: isOctane ? imported : null,
					octaneNamespace: isOctane && specifier.type === 'ImportNamespaceSpecifier',
					hookRuntimeImport: isHookRuntime ? imported : null,
					hookRuntimeNamespace: isHookRuntime && specifier.type === 'ImportNamespaceSpecifier',
				});
			}
			continue;
		}
		const node = unwrapExport(original);
		if (!node) continue;
		if (node.type === 'VariableDeclaration') {
			const target = node.kind === 'var' ? nearestFunctionScope(scope) : scope;
			for (const decl of node.declarations || []) declarePattern(decl.id, target);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			declareName(scope, node.id.name);
		}
	}
}

function collectHoistedVars(node, functionScope, root = true) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) collectHoistedVars(child, functionScope, false);
		return;
	}
	if (!root && isFunction(node)) return;
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const decl of node.declarations || []) declarePattern(decl.id, functionScope);
	}
	for (const key in node) {
		if (AST_META_KEYS.has(key)) continue;
		collectHoistedVars(node[key], functionScope, false);
	}
}

function isFunction(node) {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

function callbackReferenceRoot(node) {
	const value = unwrapValue(node);
	if (value?.type === 'Identifier') return value;
	if (value?.type === 'ChainExpression') return callbackReferenceRoot(value.expression);
	if (value?.type === 'MemberExpression') return callbackReferenceRoot(value.object);
	return null;
}

function unwrapValue(node) {
	while (node && TS_VALUE_WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function canonicalHookName(call, scope, onlyImported) {
	const callee = unwrapValue(call?.callee);
	if (!callee) return null;
	if (callee.type === 'Identifier') {
		const binding = resolveBinding(scope, callee.name);
		if (binding?.hookRuntimeImport) return binding.hookRuntimeImport;
		if (onlyImported) return null;
		return callee.name;
	}
	if (
		callee.type === 'MemberExpression' &&
		!callee.computed &&
		callee.object?.type === 'Identifier' &&
		callee.property?.type === 'Identifier'
	) {
		const binding = resolveBinding(scope, callee.object.name);
		if (binding?.hookRuntimeNamespace) return callee.property.name;
	}
	return null;
}

function canonicalOctaneHookName(call, scope) {
	const callee = unwrapValue(call?.callee);
	if (callee?.type === 'Identifier') {
		return resolveBinding(scope, callee.name)?.octaneImport ?? null;
	}
	if (
		callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.object?.type === 'Identifier' &&
		callee.property?.type === 'Identifier' &&
		resolveBinding(scope, callee.object.name)?.octaneNamespace
	) {
		return callee.property.name;
	}
	return null;
}

function directCallBinding(call, scope) {
	const callee = call?.callee;
	return callee?.type === 'Identifier' ? resolveBinding(scope, callee.name) : null;
}

function directParameterBinding(parameter, scope) {
	const value = unwrapValue(parameter);
	return value?.type === 'Identifier' ? resolveBinding(scope, value.name) : null;
}

function hasFullCompilerHookBoundary(call, importedName) {
	if (call?.optional === true) return false;
	if (call?.callee?.type === 'Identifier') return true;
	return (
		importedName !== null &&
		call?.callee?.type === 'MemberExpression' &&
		!call.callee.computed &&
		call.callee.object?.type === 'Identifier' &&
		call.callee.property?.type === 'Identifier'
	);
}

function markReassignedPattern(pattern, scope) {
	const value = unwrapValue(pattern);
	if (!value) return;
	if (value.type === 'Identifier') {
		const binding = resolveBinding(scope, value.name);
		if (binding !== null) binding.reassigned = true;
		return;
	}
	if (value.type === 'AssignmentPattern') {
		markReassignedPattern(value.left, scope);
	} else if (value.type === 'RestElement') {
		markReassignedPattern(value.argument, scope);
	} else if (value.type === 'ArrayPattern') {
		for (const element of value.elements || []) markReassignedPattern(element, scope);
	} else if (value.type === 'ObjectPattern') {
		for (const property of value.properties || []) {
			markReassignedPattern(
				property.type === 'RestElement' ? property.argument : property.value,
				scope,
			);
		}
	}
}

function buildScopes(ast, onlyImported, hookRuntimeModules) {
	nextBindingId = 0;
	const moduleScope = createScope(null, 'module');
	const nodeScopes = new WeakMap();
	const functionScopes = new WeakMap();
	const declarators = [];
	const candidates = [];
	const calls = [];
	const functions = [];
	const functionRecords = new WeakMap();
	const trustedHookNames = new WeakMap();
	const callAnnotations = new Map();
	predeclareDirect(ast.body, moduleScope, hookRuntimeModules);
	collectHoistedVars(ast, moduleScope);

	function walk(node, scope) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, scope);
			return;
		}
		nodeScopes.set(node, scope);

		if (isFunction(node)) {
			const fnScope = createScope(scope, 'function');
			functionScopes.set(node, fnScope);
			const record = {
				node,
				scope: fnScope,
				binding:
					node.type === 'FunctionDeclaration' && node.id
						? resolveBinding(scope, node.id.name)
						: null,
				parameters: null,
				stableDefinition: node.type === 'FunctionDeclaration',
			};
			functions.push(record);
			functionRecords.set(node, record);
			if (node.type === 'FunctionExpression' && node.id) {
				declareName(fnScope, node.id.name);
			}
			if (node.type !== 'ArrowFunctionExpression') declareName(fnScope, 'arguments');
			for (const param of node.params || []) declarePattern(param, fnScope);
			record.parameters = (node.params || []).map((param) =>
				directParameterBinding(param, fnScope),
			);
			collectHoistedVars(node.body, fnScope);
			for (const param of node.params || []) walkPatternDefaults(param, fnScope);
			walk(node.body, fnScope);
			return;
		}

		if (
			node.type === 'BlockStatement' ||
			node.type === 'StaticBlock' ||
			node.type === 'JSXCodeBlock'
		) {
			const blockScope = createScope(scope, 'block');
			predeclareDirect(node.body, blockScope, hookRuntimeModules);
			for (const statement of node.body || []) walk(statement, blockScope);
			// TSRX's final render node lives beside the setup-statement list.
			if (node.type === 'JSXCodeBlock') walk(node.render, blockScope);
			return;
		}

		if (node.type === 'CatchClause') {
			const catchScope = createScope(scope, 'block');
			declarePattern(node.param, catchScope);
			walkPatternDefaults(node.param, catchScope);
			walk(node.body, catchScope);
			return;
		}

		if (node.type === 'SwitchStatement') {
			// A switch body is one lexical scope shared by every unbraced case.
			// Predeclare the direct case statements together so let/const/function
			// captures resolve even when their declaration appears in a case list
			// rather than a BlockStatement body.
			const switchScope = createScope(scope, 'block');
			const statements = [];
			for (const switchCase of node.cases || []) {
				statements.push(...(switchCase.consequent || []));
			}
			predeclareDirect(statements, switchScope, hookRuntimeModules);
			walk(node.discriminant, scope);
			for (const switchCase of node.cases || []) {
				nodeScopes.set(switchCase, switchScope);
				walk(switchCase.test, switchScope);
				for (const statement of switchCase.consequent || []) walk(statement, switchScope);
			}
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
				for (const decl of declaration.declarations || []) declarePattern(decl.id, loopScope);
			}
			if (node.type === 'ForStatement') {
				walk(node.init, loopScope);
				walk(node.test, loopScope);
				walk(node.update, loopScope);
			} else {
				walk(node.left, loopScope);
				if (node.left?.type !== 'VariableDeclaration') markReassignedPattern(node.left, loopScope);
				walk(node.right, loopScope);
			}
			walk(node.body, loopScope);
			return;
		}

		if (node.type === 'VariableDeclaration') {
			for (const decl of node.declarations || []) {
				nodeScopes.set(decl, scope);
				const bindings = [];
				collectPatternBindings(decl.id, scope, bindings);
				declarators.push({ decl, bindings, kind: node.kind });
				walkPatternDefaults(decl.id, scope);
				walk(decl.init, scope);
			}
			return;
		}

		if (node.type === 'AssignmentExpression') {
			markReassignedPattern(node.left, scope);
		} else if (node.type === 'UpdateExpression') {
			markReassignedPattern(node.argument, scope);
		}

		if (node.type === 'CallExpression') {
			// Preserve lexical import identity for the later slotting pass. A module-
			// level name map is insufficient: a component can shadow either a named
			// alias or an Octane namespace inside any nested scope. The annotation is
			// recorded here (keyed by the parser node) and stamped onto rebuilt call
			// copies by rebuildWithHookMetadata — the parser tree itself is never
			// written to. Rebuilt copies carry the props through later `{ ...node }`
			// lowering, exactly as the in-place stamps used to.
			const octaneImportedName = canonicalOctaneHookName(node, scope);
			// The auto-callback stability pass also preserves Octane's historical
			// unbound-hook shorthand (`useState(...)` without an import). Record that
			// fact from this lexical scope walk so it can distinguish a genuinely
			// unbound shorthand from a same-named parameter/local/module binding.
			// Absence is intentionally meaningful: a lexically bound non-Octane
			// callee must never inherit stability merely because its spelling looks
			// like a built-in hook.
			const callee = unwrapValue(node.callee);
			const unboundCallee =
				callee?.type === 'Identifier' && resolveBinding(scope, callee.name) === null;
			const name = canonicalHookName(node, scope, onlyImported);
			const config = DEPENDENCY_HOOKS.get(name);
			const hookRuntimeImportedName = canonicalHookName(node, scope, true);
			if (octaneImportedName !== null || unboundCallee || hookRuntimeImportedName !== null) {
				const props = {};
				if (octaneImportedName !== null) props._octaneImportedHook = octaneImportedName;
				if (unboundCallee) props._octaneUnboundCallee = true;
				if (octaneImportedName === null && hookRuntimeImportedName !== null) {
					props._octaneHookRuntimeImportedHook = hookRuntimeImportedName;
				}
				callAnnotations.set(node, props);
			}
			const trustedName =
				hasFullCompilerHookBoundary(node, hookRuntimeImportedName) &&
				(hookRuntimeImportedName !== null || unboundCallee)
					? (hookRuntimeImportedName ?? name)
					: null;
			const trustedConfig = DEPENDENCY_HOOKS.get(trustedName);
			if (trustedName !== null) trustedHookNames.set(node, trustedName);
			calls.push({
				call: node,
				scope,
				name,
				config,
				trustedConfig,
			});
			if (trustedConfig && node.arguments.length === trustedConfig.deps) {
				candidates.push({ call: node, scope, name: trustedName, config: trustedConfig });
			}
		}

		if (node.type?.startsWith('TS') && !TS_VALUE_WRAPPERS.has(node.type)) return;
		for (const key in node) {
			if (AST_META_KEYS.has(key) || key === 'typeAnnotation' || key === 'returnType') continue;
			walk(node[key], scope);
		}
	}

	function walkPatternDefaults(pattern, scope) {
		if (!pattern) return;
		switch (pattern.type) {
			case 'AssignmentPattern':
				walkPatternDefaults(pattern.left, scope);
				walk(pattern.right, scope);
				return;
			case 'ObjectPattern':
				for (const prop of pattern.properties || []) {
					walkPatternDefaults(prop.type === 'RestElement' ? prop.argument : prop.value, scope);
				}
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements || []) walkPatternDefaults(element, scope);
				return;
			case 'RestElement':
				walkPatternDefaults(pattern.argument, scope);
		}
	}

	walk(ast.body, moduleScope);
	for (const { decl, bindings, kind } of declarators) {
		const init = unwrapValue(decl.init);
		const record = functionRecords.get(init);
		if (record === undefined || decl.id.type !== 'Identifier') continue;
		record.binding = bindings[0]?.binding ?? null;
		record.stableDefinition = kind === 'const';
	}
	const analysis = {
		nodeScopes,
		functionScopes,
		declarators,
		candidates,
		calls,
		functions,
		trustedHookNames,
		callAnnotations,
	};
	// The surgical plain-TS pass slots base hooks only; without a custom-hook
	// withSlot boundary, two local wrapper calls would share their inner slots.
	// Restrict custom-call inference to the full TSRX/TSX compiler, which emits
	// that boundary for every plain-identifier custom hook call.
	const customHooks = onlyImported ? new Map() : discoverCustomDependencyHooks(analysis);
	for (const record of calls) {
		if (record.trustedConfig !== undefined) continue;
		if (
			record.call.optional === true ||
			record.call.arguments.some((argument) => argument.type === 'SpreadElement')
		) {
			continue;
		}
		const binding = directCallBinding(record.call, record.scope);
		const config = binding === null ? undefined : customHooks.get(binding);
		if (config && record.call.arguments.length === config.deps) {
			candidates.push({ call: record.call, scope: record.scope, name: binding.name, config });
		}
	}
	return analysis;
}

function collectPatternBindings(pattern, scope, into) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		const binding = resolveBinding(scope, pattern.name);
		if (binding) into.push({ pattern, binding });
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const prop of pattern.properties || []) {
			collectPatternBindings(prop.type === 'RestElement' ? prop.argument : prop.value, scope, into);
		}
	} else if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements || []) collectPatternBindings(element, scope, into);
	} else if (pattern.type === 'AssignmentPattern') {
		collectPatternBindings(pattern.left, scope, into);
	} else if (pattern.type === 'RestElement') {
		collectPatternBindings(pattern.argument, scope, into);
	}
}

function customHookConfigEqual(left, right) {
	return left.callback === right.callback && left.deps === right.deps;
}

function forwardedParameterIndex(argument, record, analysis) {
	const value = unwrapValue(argument);
	if (value?.type !== 'Identifier') return -1;
	const scope = analysis.nodeScopes.get(value);
	const binding = scope ? resolveBinding(scope, value.name) : null;
	return binding === null ? -1 : record.parameters.indexOf(binding);
}

function onlyReadsForwardedParameters(record, config, allowed, analysis) {
	const callbackBinding = record.parameters[config.callback];
	const dependencyBinding = record.parameters[config.deps];
	const argumentsBinding =
		record.node.type === 'ArrowFunctionExpression'
			? null
			: (record.scope.bindings.get('arguments') ?? null);
	let safe = true;

	function walk(node) {
		if (!safe || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'Identifier') {
			const scope = analysis.nodeScopes.get(node);
			const binding = scope ? resolveBinding(scope, node.name) : null;
			if (argumentsBinding !== null && binding === argumentsBinding) {
				safe = false;
				return;
			}
			if ((binding === callbackBinding || binding === dependencyBinding) && !allowed.has(node)) {
				safe = false;
			}
			return;
		}
		if (node.type?.startsWith('TS') && !TS_VALUE_WRAPPERS.has(node.type)) return;
		for (const key in node) {
			if (
				AST_META_KEYS.has(key) ||
				key === 'typeAnnotation' ||
				key === 'returnType' ||
				key === 'typeParameters'
			) {
				continue;
			}
			walk(node[key]);
		}
	}

	walk(record.node.body);
	return safe;
}

// A custom hook is dependency-bearing only when its local definition proves
// that contract by transparently forwarding two plain parameters to a known
// dependency hook. This deliberately excludes imported/method hooks and
// selector-shaped hooks: adding an array to an arbitrary `useSomething(fn)`
// call could occupy a completely unrelated optional argument.
function discoverCustomDependencyHooks(analysis) {
	const configs = new Map();
	const callsByFunctionScope = new Map();
	for (const callRecord of analysis.calls) {
		const owner = nearestFunctionScope(callRecord.scope);
		let calls = callsByFunctionScope.get(owner);
		if (calls === undefined) callsByFunctionScope.set(owner, (calls = []));
		calls.push(callRecord);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const record of analysis.functions) {
			const binding = record.binding;
			if (
				binding === null ||
				configs.has(binding) ||
				!record.stableDefinition ||
				binding.reassigned ||
				!/^use[A-Z]/.test(binding.name)
			) {
				continue;
			}
			let inferred = null;
			let ambiguous = false;
			const allowed = new Set();
			for (const callRecord of callsByFunctionScope.get(record.scope) || []) {
				if (
					callRecord.call.start < record.node.body.start ||
					callRecord.call.end > record.node.body.end
				) {
					continue;
				}
				let targetConfig = callRecord.trustedConfig;
				if (targetConfig === undefined) {
					const targetBinding = directCallBinding(callRecord.call, callRecord.scope);
					targetConfig = targetBinding === null ? undefined : configs.get(targetBinding);
				}
				if (
					targetConfig === undefined ||
					callRecord.call.optional === true ||
					callRecord.call.arguments.length !== targetConfig.deps + 1 ||
					callRecord.call.arguments.some((argument) => argument.type === 'SpreadElement')
				) {
					continue;
				}
				const callback = forwardedParameterIndex(
					callRecord.call.arguments[targetConfig.callback],
					record,
					analysis,
				);
				const deps = forwardedParameterIndex(
					callRecord.call.arguments[targetConfig.deps],
					record,
					analysis,
				);
				if (callback < 0 || deps < 0 || callback >= deps || deps !== record.parameters.length - 1) {
					continue;
				}
				const config = { callback, deps };
				if (inferred !== null && !customHookConfigEqual(inferred, config)) {
					ambiguous = true;
					break;
				}
				inferred = config;
				allowed.add(unwrapValue(callRecord.call.arguments[targetConfig.callback]));
				allowed.add(unwrapValue(callRecord.call.arguments[targetConfig.deps]));
			}
			if (
				!ambiguous &&
				inferred !== null &&
				onlyReadsForwardedParameters(record, inferred, allowed, analysis)
			) {
				configs.set(binding, inferred);
				changed = true;
			}
		}
	}
	return configs;
}

function markDependencyInvariantBindings(analysis) {
	let changed = true;
	while (changed) {
		changed = false;
		for (const { decl, bindings, kind } of analysis.declarators) {
			if (kind !== 'const' || !decl.init) continue;
			const init = unwrapValue(decl.init);
			const scope = analysis.nodeScopes.get(decl);
			const callName =
				init?.type === 'CallExpression' ? (analysis.trustedHookNames.get(init) ?? null) : null;

			if (decl.id.type === 'Identifier') {
				let dependencyInvariant =
					callName !== null && OMITTED_DEPENDENCY_RESULT_HOOKS.has(callName);
				if (!dependencyInvariant && init?.type === 'Identifier') {
					dependencyInvariant = resolveBinding(scope, init.name)?.dependencyInvariant === true;
				}
				if (dependencyInvariant && bindings[0] && !bindings[0].binding.dependencyInvariant) {
					bindings[0].binding.dependencyInvariant = true;
					changed = true;
				}
				continue;
			}

			if (decl.id.type === 'ArrayPattern' && callName !== null) {
				const stableIndices = STABLE_TUPLE_RESULTS.get(callName);
				if (!stableIndices) continue;
				for (const index of stableIndices) {
					const element = decl.id.elements?.[index];
					if (!element || element.type !== 'Identifier') continue;
					const binding = resolveBinding(scope, element.name);
					if (binding && !binding.dependencyInvariant) {
						binding.dependencyInvariant = true;
						changed = true;
					}
				}
			}
		}
	}
}

function scopeIsWithin(scope, ancestor) {
	for (let current = scope; current !== null; current = current.parent) {
		if (current === ancestor) return true;
	}
	return false;
}

function staticMemberInfo(node) {
	const original = node;
	let current = node.type === 'ChainExpression' ? node.expression : node;
	if (
		current?.type !== 'MemberExpression' ||
		current.computed ||
		current.property?.type !== 'Identifier'
	) {
		return null;
	}
	const root = unwrapValue(current.object);
	if (root?.type !== 'Identifier') return null;
	// Stop at one level (`props.value`). For a deeper access such as
	// `props.order.push`, the caller recurses into the object and records
	// `props.order`. Besides avoiding over-specific getter reads, this preserves
	// the receiver identity a method call executes against; tracking only
	// `Array.prototype.push` would miss a new `props.order` array.
	// A nested optional member is no longer wrapped by its original outer
	// ChainExpression. Restore that wrapper for the generated dependency so the
	// full-compiler AST remains valid ESTree (`props?.user`, not a bare optional
	// MemberExpression). Source offsets stay on the wrapper for the surgical pass.
	const dependencyNode =
		original.type !== 'ChainExpression' && current.optional
			? {
					type: 'ChainExpression',
					expression: original,
					start: original.start,
					end: original.end,
					loc: original.loc,
				}
			: original;
	return {
		node: dependencyNode,
		root,
		path: `${current.optional ? '?' : ''}.${current.property.name}`,
	};
}

function collectDependencies(expression, callbackScope, analysis) {
	const dependencies = [];
	const seen = new Set();

	function addIdentifier(node) {
		const scope = analysis.nodeScopes.get(node);
		const binding = scope ? resolveBinding(scope, node.name) : null;
		if (
			binding === null ||
			binding.imported ||
			binding.dependencyInvariant ||
			(callbackScope !== null && scopeIsWithin(binding.scope, callbackScope))
		) {
			return;
		}
		const key = `b${binding.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			dependencies.push({ node, key, binding });
		}
	}

	function addStaticMember(info) {
		const scope = analysis.nodeScopes.get(info.root);
		const binding = scope ? resolveBinding(scope, info.root.name) : null;
		if (
			binding === null ||
			binding.imported ||
			binding.dependencyInvariant ||
			(callbackScope !== null && scopeIsWithin(binding.scope, callbackScope))
		) {
			return;
		}
		const key = `b${binding.id}${info.path}`;
		if (!seen.has(key)) {
			seen.add(key);
			dependencies.push({ node: info.node, key, binding });
		}
	}

	function walk(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (TS_VALUE_WRAPPERS.has(node.type)) {
			walk(node.expression);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		switch (node.type) {
			case 'Identifier':
				addIdentifier(node);
				return;
			case 'ChainExpression': {
				const info = staticMemberInfo(node);
				if (info) addStaticMember(info);
				else walk(node.expression);
				return;
			}
			case 'MemberExpression': {
				const info = staticMemberInfo(node);
				if (info) addStaticMember(info);
				else {
					walk(node.object);
					if (node.computed) walk(node.property);
				}
				return;
			}
			case 'Property':
				if (node.computed) walk(node.key);
				walk(node.value);
				return;
			case 'PropertyDefinition':
			case 'MethodDefinition':
				if (node.computed) walk(node.key);
				walk(node.value);
				return;
			case 'AssignmentExpression':
				if (node.operator === '=') walkAssignmentTarget(node.left);
				else walk(node.left);
				walk(node.right);
				return;
			case 'VariableDeclarator':
				walkPatternExpression(node.id);
				walk(node.init);
				return;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				for (const param of node.params || []) walkPatternExpression(param);
				walk(node.body);
				return;
			case 'ImportDeclaration':
			case 'ExportAllDeclaration':
			case 'MetaProperty':
			case 'PrivateIdentifier':
			case 'JSXIdentifier':
			case 'Literal':
			case 'ThisExpression':
			case 'Super':
				return;
			case 'LabeledStatement':
				walk(node.body);
				return;
			case 'BreakStatement':
			case 'ContinueStatement':
				return;
			case 'JSXElement':
			case 'Element':
				walkJsxElement(node);
				return;
			case 'JSXFragment':
			case 'Fragment':
				walk(node.children);
				return;
			case 'JSXAttribute':
			case 'Attribute':
				walk(node.value);
				return;
			case 'JSXExpressionContainer':
			case 'TSRXExpression':
				walk(node.expression);
				return;
		}
		for (const key in node) {
			if (
				AST_META_KEYS.has(key) ||
				key === 'typeAnnotation' ||
				key === 'returnType' ||
				key === 'typeParameters'
			) {
				continue;
			}
			walk(node[key]);
		}
	}

	function walkAssignmentTarget(target) {
		if (!target) return;
		if (TS_VALUE_WRAPPERS.has(target.type)) {
			walkAssignmentTarget(target.expression);
			return;
		}
		switch (target.type) {
			case 'Identifier':
				return;
			case 'MemberExpression':
				// Writing `object[key]` reads the receiver and computed key, but not
				// the previous property value. This keeps `ref.current = value` from
				// depending on `ref.current` while still tracking a changing receiver.
				walk(target.object);
				if (target.computed) walk(target.property);
				return;
			case 'ObjectPattern':
				for (const prop of target.properties || []) {
					if (prop.computed) walk(prop.key);
					walkAssignmentTarget(prop.type === 'RestElement' ? prop.argument : prop.value);
				}
				return;
			case 'ArrayPattern':
				for (const element of target.elements || []) walkAssignmentTarget(element);
				return;
			case 'AssignmentPattern':
				walkAssignmentTarget(target.left);
				walk(target.right);
				return;
			case 'RestElement':
				walkAssignmentTarget(target.argument);
				return;
		}
		walk(target);
	}

	function walkPatternExpression(pattern) {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') {
			walkPatternExpression(pattern.left);
			walk(pattern.right);
		} else if (pattern.type === 'ObjectPattern') {
			for (const prop of pattern.properties || []) {
				if (prop.computed) walk(prop.key);
				walkPatternExpression(prop.type === 'RestElement' ? prop.argument : prop.value);
			}
		} else if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements || []) walkPatternExpression(element);
		} else if (pattern.type === 'RestElement') {
			walkPatternExpression(pattern.argument);
		}
	}

	function walkJsxElement(node) {
		const tag = node.openingElement?.name || node.id;
		if (tag?.type === 'Identifier' || tag?.type === 'JSXIdentifier') {
			if (typeof tag.name === 'string' && !/^[a-z]/.test(tag.name) && !tag.name.includes('-')) {
				addIdentifier(tag);
			}
		} else if (tag?.type === 'MemberExpression' || tag?.type === 'JSXMemberExpression') {
			let root = tag;
			while (root?.object) root = root.object;
			if (root?.type === 'Identifier' || root?.type === 'JSXIdentifier') addIdentifier(root);
		} else if (tag?.type === 'JSXExpressionContainer') {
			walk(tag.expression);
		}
		walk(node.attributes || node.openingElement?.attributes);
		walk(node.children);
	}

	walk(expression);
	return dependencies;
}

function collectCallbackReference(expression, analysis) {
	const root = callbackReferenceRoot(expression);
	if (root === null) return null;
	const scope = analysis.nodeScopes.get(root);
	const binding = scope ? resolveBinding(scope, root.name) : null;
	const value = unwrapValue(expression);
	if (
		binding === null ||
		binding.imported ||
		(value.type === 'Identifier' && binding.dependencyInvariant)
	) {
		return [];
	}
	// A referenced callback is itself the scheduled value. Preserve its complete
	// member/optional/computed path instead of applying the one-level receiver
	// truncation used for reads inside an inline callback.
	return [{ node: value, key: `b${binding.id}:callback`, binding }];
}

function cloneDependency(node) {
	if (node.type === 'Identifier') return { ...node };
	if (node.type === 'ChainExpression') {
		return { ...node, expression: cloneDependency(node.expression) };
	}
	if (node.type === 'MemberExpression') {
		return {
			...node,
			object: cloneDependency(node.object),
			property: node.computed ? cloneDependency(node.property) : { ...node.property },
		};
	}
	return { ...node };
}

/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string }} options */
function analyzeInternal(ast, options) {
	const onlyImported = options.onlyImported === true;
	const hookRuntimeModules = new Set(['octane', ...(options.hookRuntimeModules || [])]);
	const analysis = buildScopes(ast, onlyImported, hookRuntimeModules);
	markDependencyInvariantBindings(analysis);
	const inferred = new Map();

	for (const candidate of analysis.candidates) {
		const rawCallback = candidate.call.arguments[candidate.config.callback];
		const callback = unwrapValue(rawCallback);
		let dependencies;
		if (isFunction(callback)) {
			dependencies = collectDependencies(
				callback,
				analysis.functionScopes.get(callback) || null,
				analysis,
			);
		} else {
			dependencies = collectCallbackReference(callback, analysis);
			if (dependencies === null) {
				const loc = candidate.call.loc?.start;
				const at = loc ? ` at ${options.filename || 'source'}:${loc.line}:${loc.column}` : '';
				throw new Error(
					`Cannot infer dependencies for ${candidate.name}${at}: the callback must be an inline function or a stable reference. Pass an explicit dependency array, or \`null\` to run on every render.`,
				);
			}
		}
		inferred.set(candidate.call, {
			name: candidate.name,
			depsIndex: candidate.config.deps,
			dependencies,
		});
	}
	return { analysis, inferred };
}

/**
 * Return inferred dependency expressions for every supported hook call whose
 * dependency argument is omitted. Explicit arrays, `null`, and any other
 * explicit dependency expression are left untouched. Read-only: the input AST
 * is never modified.
 */
export function analyzeHookDependencies(ast, options = {}) {
	return analyzeInternal(ast, options).inferred;
}

/**
 * Copy-on-write rebuild carrying hook metadata: every call the scope walk
 * annotated is replaced by a shallow copy stamped with its `_octane*` props
 * (so later `{ ...node }` lowering keeps them), and — when `insertDeps` —
 * candidate calls also receive their inferred dependency `ArrayExpression`.
 * Untouched subtrees stay shared with the input by reference. Returns the
 * rebuilt module plus the inference map re-keyed to the rebuilt call nodes.
 */
/** @param {any} ast @param {any} analysis @param {Map<any, any>} inferred @param {boolean} insertDeps */
function rebuildWithHookMetadata(ast, analysis, inferred, insertDeps) {
	const annotations = analysis.callAnnotations;
	const rekeyedInferred = new Map();
	/** @param {any} node @returns {any} */
	function rebuild(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let out = null;
			for (let i = 0; i < node.length; i++) {
				const mapped = rebuild(node[i]);
				if (out === null && mapped !== node[i]) out = node.slice(0, i);
				if (out !== null) out.push(mapped);
			}
			return out ?? node;
		}
		let out = null;
		for (const key in node) {
			if (AST_META_KEYS.has(key)) continue;
			const mapped = rebuild(node[key]);
			if (mapped !== node[key]) {
				if (out === null) out = { ...node };
				out[key] = mapped;
			}
		}
		const props = annotations.get(node);
		const result = inferred.get(node);
		if (props !== undefined || result !== undefined) {
			if (out === null) out = { ...node };
			if (props !== undefined) Object.assign(out, props);
			if (result !== undefined) {
				if (insertDeps) {
					const args = out.arguments.slice();
					// The synthesized array maps to the hook call it belongs to; each
					// dependency clone keeps its authored position.
					args.splice(result.depsIndex, 0, {
						...b.array(
							result.dependencies.map((/** @type {any} */ dependency) =>
								cloneDependency(dependency.node),
							),
						),
						start: node.start,
						end: node.end,
						loc: node.loc,
					});
					out.arguments = args;
				}
				rekeyedInferred.set(out, result);
			}
		}
		return out ?? node;
	}
	return { ast: rebuild(ast), inferred: rekeyedInferred };
}

/**
 * Annotation-only rebuild for the surgical plain-TS pass: returns a rebuilt
 * module whose hook calls carry their `_octane*` props, plus the inference map
 * keyed by the rebuilt calls. Dependency arrays are NOT inserted — that pass
 * edits source text from the inference results instead of reprinting the tree.
 */
/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string }} [options] */
export function annotateHookCalls(ast, options = {}) {
	const { analysis, inferred } = analyzeInternal(ast, options);
	return rebuildWithHookMetadata(ast, analysis, inferred, false);
}

/**
 * Full-compiler entry: rebuild the module with hook annotations AND inferred
 * dependency arrays inserted at each candidate call. Copy-on-write — the input
 * AST is never modified; callers must use the returned module.
 */
/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string }} [options] */
export function applyHookDependencies(ast, options = {}) {
	const { analysis, inferred } = analyzeInternal(ast, options);
	return rebuildWithHookMetadata(ast, analysis, inferred, true).ast;
}
