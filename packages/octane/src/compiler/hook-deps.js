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
	['useLinkedState', new Set([1, 2])],
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
			moduleImmutable: false,
			reassigned: false,
			octaneImport: null,
			octaneNamespace: false,
			hookRuntimeImport: null,
			hookRuntimeNamespace: false,
		};
		scope.bindings.set(name, binding);
	}
	if (details?.imported) binding.imported = true;
	if (details?.moduleImmutable) binding.moduleImmutable = true;
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

function predeclareDirect(statements, scope, hookRuntimeModules, bindingsOnly = false) {
	for (const original of statements || []) {
		if (original.type === 'ImportDeclaration') {
			if (bindingsOnly && original.importKind === 'type') continue;
			const isHookRuntime = hookRuntimeModules.has(original.source?.value);
			const isOctane = original.source?.value === 'octane';
			for (const specifier of original.specifiers || []) {
				if (bindingsOnly && specifier.importKind === 'type') continue;
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
		// A module-scope `const`/`function`/`class` is evaluated once for the
		// program's lifetime, so its identity is fixed exactly like an import's.
		// `var` and `let` are excluded: any later statement may rebind them.
		// Function and class bindings are writable, so their claim is provisional
		// here and withdrawn by `reassigned` at marking time.
		const atModuleScope = scope.kind === 'module';
		if (node.type === 'VariableDeclaration') {
			const target = node.kind === 'var' ? nearestFunctionScope(scope) : scope;
			const details = atModuleScope && node.kind === 'const' ? { moduleImmutable: true } : null;
			for (const decl of node.declarations || []) declarePattern(decl.id, target, details);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			declareName(scope, node.id.name, atModuleScope ? { moduleImmutable: true } : null);
		}
	}
}

function collectHoistedVars(node, functionScope, root = true, bindingsOnly = false) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) collectHoistedVars(child, functionScope, false, bindingsOnly);
		return;
	}
	if (!root && isFunction(node)) return;
	if (
		bindingsOnly &&
		(isFunction(node) ||
			(!root && node.type === 'StaticBlock') ||
			node.type === 'ClassDeclaration' ||
			node.type === 'ClassExpression' ||
			node.type === 'TSModuleDeclaration')
	) {
		return;
	}
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const decl of node.declarations || []) declarePattern(decl.id, functionScope);
	}
	for (const key in node) {
		if (AST_META_KEYS.has(key)) continue;
		collectHoistedVars(node[key], functionScope, false, bindingsOnly);
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

function buildScopes(ast, onlyImported, hookRuntimeModules, bindingsOnly = false) {
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
	const declarationBindings = bindingsOnly ? new Map() : null;
	const firstDefinitions = bindingsOnly ? new Map() : null;
	predeclareDirect(ast.body, moduleScope, hookRuntimeModules, bindingsOnly);
	collectHoistedVars(ast, moduleScope, true, bindingsOnly);

	function rememberBindings(bindings, definesValue = true) {
		if (declarationBindings === null || firstDefinitions === null) return;
		for (const { pattern, binding } of bindings) {
			declarationBindings.set(pattern, binding);
			if (!definesValue) continue;
			const previous = firstDefinitions.get(binding);
			if (previous !== undefined && previous !== pattern) binding.reassigned = true;
			else firstDefinitions.set(binding, pattern);
		}
	}

	function rememberPattern(pattern, scope, definesValue = true) {
		if (!bindingsOnly) return;
		if (pattern?.type === 'TSParameterProperty') pattern = pattern.parameter;
		const bindings = [];
		collectPatternBindings(pattern, scope, bindings);
		rememberBindings(bindings, definesValue);
	}

	function invalidateVisibleBindings(scope) {
		for (let current = scope; current !== null; current = current.parent) {
			for (const binding of current.bindings.values()) binding.reassigned = true;
		}
	}

	function walk(node, scope) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, scope);
			return;
		}
		if (!bindingsOnly) nodeScopes.set(node, scope);
		if (
			bindingsOnly &&
			(node.type === 'TSInstantiationExpression' || node.type === 'TSExportAssignment')
		) {
			walk(node.expression, scope);
			return;
		}

		if (isFunction(node)) {
			const fnScope = createScope(scope, 'function');
			const record = bindingsOnly
				? null
				: {
						node,
						scope: fnScope,
						binding:
							node.type === 'FunctionDeclaration' && node.id
								? resolveBinding(scope, node.id.name)
								: null,
						parameters: null,
						stableDefinition: node.type === 'FunctionDeclaration',
					};
			if (record !== null) {
				functionScopes.set(node, fnScope);
				functions.push(record);
				functionRecords.set(node, record);
			}
			if (bindingsOnly && node.type === 'FunctionDeclaration' && node.id) {
				rememberPattern(node.id, scope);
			}
			if (node.type === 'FunctionExpression' && node.id) {
				declareName(fnScope, node.id.name);
				if (bindingsOnly) rememberPattern(node.id, fnScope);
			}
			if (node.type !== 'ArrowFunctionExpression') declareName(fnScope, 'arguments');
			for (const param of node.params || []) {
				declarePattern(
					bindingsOnly && param.type === 'TSParameterProperty' ? param.parameter : param,
					fnScope,
				);
			}
			if (record !== null) {
				record.parameters = (node.params || []).map((param) =>
					directParameterBinding(param, fnScope),
				);
			}
			if (bindingsOnly) {
				for (const param of node.params || []) rememberPattern(param, fnScope);
				// Parameter defaults cannot see declarations in the function body.
				// Afterwards, share the direct body with the parameters so legal var
				// and function redeclarations count as competing value definitions.
				for (const param of node.params || []) walkPatternDefaults(param, fnScope);
				collectHoistedVars(node.body, fnScope, true, true);
				if (node.body?.type === 'BlockStatement' || node.body?.type === 'JSXCodeBlock') {
					predeclareDirect(node.body.body, fnScope, hookRuntimeModules, true);
					for (const statement of node.body.body || []) walk(statement, fnScope);
					if (node.body.type === 'JSXCodeBlock') walk(node.body.render, fnScope);
				} else {
					walk(node.body, fnScope);
				}
			} else {
				collectHoistedVars(node.body, fnScope);
				for (const param of node.params || []) walkPatternDefaults(param, fnScope);
				walk(node.body, fnScope);
			}
			return;
		}

		if (bindingsOnly && node.type === 'ImportDeclaration') {
			if (node.importKind !== 'type') {
				for (const specifier of node.specifiers || []) {
					if (specifier.importKind !== 'type') rememberPattern(specifier.local, scope);
				}
			}
			return;
		}

		if (
			bindingsOnly &&
			node.declare !== true &&
			((node.type === 'TSModuleDeclaration' && node.kind !== 'global') ||
				node.type === 'TSEnumDeclaration')
		) {
			// The dependency walk deliberately skips TypeScript-only syntax. Runtime
			// namespaces and enum initializers can still write their enclosing scope.
			invalidateVisibleBindings(scope);
			return;
		}

		if (bindingsOnly && (node.type === 'ClassDeclaration' || node.type === 'ClassExpression')) {
			if (node.type === 'ClassDeclaration' && node.id) rememberPattern(node.id, scope);
			const classScope = createScope(scope, 'block');
			if (node.id) declarePattern(node.id, classScope);
			for (const decorator of node.decorators || []) walk(decorator, scope);
			walk(node.superClass, classScope);
			walk(node.body, classScope);
			return;
		}

		if (
			node.type === 'BlockStatement' ||
			node.type === 'StaticBlock' ||
			node.type === 'JSXCodeBlock'
		) {
			const blockScope = createScope(
				scope,
				bindingsOnly && node.type === 'StaticBlock' ? 'function' : 'block',
			);
			if (bindingsOnly && node.type === 'StaticBlock') {
				collectHoistedVars(node, blockScope, true, true);
			}
			predeclareDirect(node.body, blockScope, hookRuntimeModules, bindingsOnly);
			for (const statement of node.body || []) walk(statement, blockScope);
			// TSRX's final render node lives beside the setup-statement list.
			if (node.type === 'JSXCodeBlock') walk(node.render, blockScope);
			return;
		}

		if (node.type === 'CatchClause') {
			const catchScope = createScope(scope, 'block');
			declarePattern(node.param, catchScope);
			if (bindingsOnly) rememberPattern(node.param, catchScope);
			if (bindingsOnly && node.resetParam) {
				declarePattern(node.resetParam, catchScope);
				rememberPattern(node.resetParam, catchScope);
			}
			walkPatternDefaults(node.param, catchScope);
			walk(node.body, catchScope);
			return;
		}

		if (node.type === 'SwitchStatement' || (bindingsOnly && node.type === 'JSXSwitchExpression')) {
			// A switch body is one lexical scope shared by every unbraced case.
			// Predeclare the direct case statements together so let/const/function
			// captures resolve even when their declaration appears in a case list
			// rather than a BlockStatement body.
			const switchScope = createScope(scope, 'block');
			const statements = [];
			for (const switchCase of node.cases || []) {
				statements.push(...(switchCase.consequent || []));
			}
			predeclareDirect(statements, switchScope, hookRuntimeModules, bindingsOnly);
			walk(node.discriminant, scope);
			for (const switchCase of node.cases || []) {
				if (!bindingsOnly) nodeScopes.set(switchCase, switchScope);
				walk(switchCase.test, switchScope);
				for (const statement of switchCase.consequent || []) walk(statement, switchScope);
			}
			return;
		}

		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			(bindingsOnly && node.type === 'JSXForExpression')
		) {
			const loopScope = createScope(scope, 'block');
			const loopType = node.type === 'JSXForExpression' ? node.statementType : node.type;
			const declaration = loopType === 'ForStatement' ? node.init : node.left;
			if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
				for (const decl of declaration.declarations || []) declarePattern(decl.id, loopScope);
			}
			if (loopType === 'ForStatement') {
				walk(node.init, loopScope);
				walk(node.test, loopScope);
				walk(node.update, loopScope);
			} else {
				walk(node.left, loopScope);
				if (node.left?.type !== 'VariableDeclaration') markReassignedPattern(node.left, loopScope);
				else if (bindingsOnly && node.left.kind === 'var') {
					for (const decl of node.left.declarations || [])
						markReassignedPattern(decl.id, loopScope);
				}
				walk(node.right, node.type === 'JSXForExpression' ? scope : loopScope);
			}
			if (bindingsOnly && node.type === 'JSXForExpression') {
				declarePattern(node.index, loopScope);
				rememberPattern(node.index, loopScope);
				walk(node.key, loopScope);
			}
			walk(node.body, loopScope);
			if (bindingsOnly && node.type === 'JSXForExpression') walk(node.empty, scope);
			return;
		}

		if (node.type === 'VariableDeclaration') {
			for (const decl of node.declarations || []) {
				if (!bindingsOnly) nodeScopes.set(decl, scope);
				const bindings = [];
				collectPatternBindings(decl.id, scope, bindings);
				if (bindingsOnly) rememberBindings(bindings, node.kind !== 'var' || decl.init != null);
				else declarators.push({ decl, bindings, kind: node.kind });
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

		if (bindingsOnly && node.type === 'CallExpression') {
			let callee = unwrapValue(node.callee);
			while (callee?.type === 'TSInstantiationExpression') {
				callee = unwrapValue(callee.expression);
			}
			if (
				node.optional !== true &&
				callee?.type === 'Identifier' &&
				callee.name === 'eval' &&
				resolveBinding(scope, callee.name) === null
			) {
				// Direct eval can reassign any lexically reachable writable binding.
				invalidateVisibleBindings(scope);
			}
		} else if (node.type === 'CallExpression') {
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
			case 'TSParameterProperty':
				if (bindingsOnly) walkPatternDefaults(pattern.parameter, scope);
				return;
			case 'AssignmentPattern':
				walkPatternDefaults(pattern.left, scope);
				walk(pattern.right, scope);
				return;
			case 'ObjectPattern':
				for (const prop of pattern.properties || []) {
					// A computed key is a READ of the surrounding scope, not a binding
					// (`const { [key]: picked } = source`). It must be walked so the
					// identifier gets a `nodeScopes` entry: `collectDependencies`
					// resolves every capture through that map, and an unmapped node
					// resolves to no binding, which it cannot distinguish from a
					// genuine global — so the capture would be dropped silently.
					if (prop.computed) walk(prop.key, scope);
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
		moduleScope,
		nodeScopes,
		functionScopes,
		declarators,
		candidates,
		calls,
		functions,
		trustedHookNames,
		callAnnotations,
		declarationBindings,
	};
	if (bindingsOnly) return analysis;
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

/**
 * Is this expression the same value on every evaluation? Only a PRIMITIVE
 * literal qualifies: it has no identity to change.
 *
 * A regex literal is excluded even though ESTree calls it a `Literal` —
 * `/foo/g` allocates a fresh RegExp on every evaluation, and carries mutable
 * `lastIndex` state besides. The object/function check is the same guard one
 * step more general, for any parser that materializes a literal value.
 */
export function isInvariantLiteral(node) {
	if (!node || node.type !== 'Literal' || node.regex != null) return false;
	return (
		node.value === null || (typeof node.value !== 'object' && typeof node.value !== 'function')
	);
}

// The same question for a hook initializer, which additionally accepts a
// template literal with no substitutions — that is a plain string constant.
// Kept separate so the shared predicate above stays byte-identical to what
// compile.js's other call sites have always meant by it.
function isInvariantInitializer(node) {
	if (node?.type === 'TemplateLiteral') return (node.expressions?.length ?? 0) === 0;
	return isInvariantLiteral(node);
}

function markDependencyInvariantBindings(analysis) {
	// Seed the lattice with the bindings whose identity is fixed for the
	// program's lifetime, so the `const alias = original` propagation below
	// carries them into component scope for free.
	//
	// An imported binding was already filtered at every use site; marking it
	// here changes nothing about its own treatment and exists so an alias of it
	// inherits the same answer.
	for (const binding of analysis.moduleScope.bindings.values()) {
		if (binding.imported || (binding.moduleImmutable && !binding.reassigned)) {
			binding.dependencyInvariant = true;
		}
	}
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
				if (!dependencyInvariant) dependencyInvariant = isInvariantInitializer(init);
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
		name: current.property.name,
		path: `${current.optional ? '?' : ''}.${current.property.name}`,
	};
}

// Directive prologues that declare "this body executes in another context, not
// during render" — a nested function carrying one contributes only its ROOT
// captures to an inferred dependency array, because hoisting its member reads
// to render time would run getters in a context where they may be illegal
// (issue #542: TypeGPU's `.$` is only readable inside `'use gpu'` shader code)
// and at a moment the program never performs them.
//
// This is a deliberate ALLOWLIST, not "any directive": directives that mark
// same-context compiler hints (`'use strict'`, React Compiler's `'use memo'` /
// `'use no memo'`, `'use signals'`) or reserved module/function markers with
// their own semantics (`'use server'`, `'use client'`, `'use cache'`,
// `'use workflow'`/`'use step'`) must NOT truncate. Extend the set as more
// other-context directives appear in the ecosystem.
//
//   'use gpu'  — TypeGPU shader functions (transpiled, run on the GPU).
//   'worklet'  — react-native-reanimated / react-native-worklets-core bodies,
//                serialized and executed on a separate UI-thread runtime.
const OPAQUE_EXECUTION_DIRECTIVES = new Set(['use gpu', 'worklet']);

// A directive prologue is the run of leading string-literal expression
// statements. Parsers implementing ESTree stamp `directive` on those
// statements; fall back to the literal value where they don't.
function hasOpaqueExecutionDirective(fn) {
	if (fn.body?.type !== 'BlockStatement') return false;
	for (const statement of fn.body.body || []) {
		if (statement.type !== 'ExpressionStatement') return false;
		const expression = unwrapValue(statement.expression);
		const value =
			statement.directive ??
			(expression?.type === 'Literal' && typeof expression.value === 'string'
				? expression.value
				: null);
		if (value === null) return false;
		if (OPAQUE_EXECUTION_DIRECTIVES.has(value)) return true;
	}
	return false;
}

// The `octane` runtime export inferred method-call dependencies compile to.
// Both emitters alias it: the full compiler through `ctx.runtimeNeeded` (its
// `_$`-prefixed rtAlias convention is baked into methodDepNode below) and the
// surgical pass through its own helper-import allocator.
export const METHOD_DEP_IMPORT = '__methodDep';

// The emitted dependency expression for a one-level method call:
// `_$__methodDep(root, 'name')` — own property ? member value : receiver (see
// the runtime helper's contract in src/method-dep.ts). The call node carries
// the authored member's source range so source maps and the surgical pass's
// offset expectations stay anchored to the authored expression, while the
// cloned root identifier keeps its own authored position.
function methodDepNode(dependency) {
	// Every synthesized node is stamped with the authored member's origin — the
	// bundler print path asserts a loc on each printed node, including the
	// helper's callee identifier.
	const call = b.call(
		b.id(`_$${METHOD_DEP_IMPORT}`, dependency.node),
		{ ...dependency.method.root },
		b.literal(dependency.method.name, JSON.stringify(dependency.method.name), dependency.node),
	);
	return {
		...call,
		start: dependency.node.start,
		end: dependency.node.end,
		loc: dependency.node.loc,
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

	// A one-level member CALLED as a method. The member value alone cannot
	// witness a changed receiver when the method is inherited (issue #542:
	// `count.toFixed` is `Number.prototype.toFixed` on every render), and the
	// receiver alone would defeat memoization for own function properties on
	// per-render containers (`props.onChange(...)`). Record the pair and let the
	// emitted `__methodDep(root, 'name')` helper pick the comparable value at
	// runtime. Deeper callees (`a.b.c(...)`) never reach here: their receiver
	// path is recorded by the ordinary member walk, which cannot capture the
	// method itself, so they were never exposed to the stale-method hazard.
	function addMethodCall(info) {
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
		// Distinct from the plain-read key: `x.m` read as a value elsewhere in the
		// callback still contributes its own member dependency.
		const key = `b${binding.id}${info.path}()`;
		if (!seen.has(key)) {
			seen.add(key);
			dependencies.push({
				node: info.node,
				key,
				binding,
				method: { root: info.root, name: info.name },
			});
		}
	}

	// Depth of enclosing functions whose directive prologue declares another
	// execution context (see OPAQUE_EXECUTION_DIRECTIVES). Inside one, member
	// chains truncate to their root bindings: the body's property reads happen
	// in that other context, so hoisting them into a render-time dependency
	// array would evaluate getters in a context where they may be illegal
	// (TypeGPU's `.$`) and at a time the program never reads them.
	let opaqueDepth = 0;

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
			case 'CallExpression': {
				if (opaqueDepth > 0) {
					// Roots only: the callee's receiver chain collapses through the
					// MemberExpression case below; no method-pair dependency either,
					// since it would read the member at render.
					walk(node.callee);
					walk(node.arguments);
					return;
				}
				// Optional spellings land here too: `a?.b(x)` and `a.b?.(x)` are a
				// CallExpression under a ChainExpression whose callee is a bare
				// (possibly optional) MemberExpression, which staticMemberInfo accepts.
				const callee = unwrapValue(node.callee);
				const info =
					callee?.type === 'MemberExpression' || callee?.type === 'ChainExpression'
						? staticMemberInfo(callee)
						: null;
				if (info) addMethodCall(info);
				else walk(node.callee);
				walk(node.arguments);
				return;
			}
			case 'ChainExpression': {
				if (opaqueDepth > 0) {
					walk(node.expression);
					return;
				}
				const info = staticMemberInfo(node);
				if (info) addStaticMember(info);
				else walk(node.expression);
				return;
			}
			case 'MemberExpression': {
				if (opaqueDepth > 0) {
					walk(node.object);
					if (node.computed) walk(node.property);
					return;
				}
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
			case 'ArrowFunctionExpression': {
				const opaque = hasOpaqueExecutionDirective(node);
				if (opaque) opaqueDepth++;
				for (const param of node.params || []) walkPatternExpression(param);
				walk(node.body);
				if (opaque) opaqueDepth--;
				return;
			}
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

/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string, inferDependencies?: boolean }} options */
function analyzeInternal(ast, options) {
	const onlyImported = options.onlyImported === true;
	const hookRuntimeModules = new Set(['octane', ...(options.hookRuntimeModules || [])]);
	const analysis = buildScopes(ast, onlyImported, hookRuntimeModules);
	const inferred = new Map();
	// A hand-slotted module owns its authored dependency ABI. The production
	// memo-only pass still needs lexical import provenance, but must not infer
	// omitted lists or reject source the manual-slot path previously accepted.
	if (options.inferDependencies === false) return { analysis, inferred };
	markDependencyInvariantBindings(analysis);

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
 * Return authored declaration identifiers whose bindings have a write or a
 * competing value definition. This is a read-only, scope-aware proof for callers
 * that recreate lexical scopes per invocation. Absence from the set does not
 * make a mutable declaration kind immutable by itself.
 *
 * @param {any} ast
 * @returns {WeakSet<import('estree').Identifier>}
 */
export function collectReassignedBindings(ast) {
	const { declarationBindings } = buildScopes(ast, true, new Set(), true);
	/** @type {WeakSet<import('estree').Identifier>} */
	const reassigned = new WeakSet();
	for (const [node, binding] of declarationBindings ?? []) {
		if (binding.reassigned) reassigned.add(node);
	}
	return reassigned;
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
/** @param {any} ast @param {any} analysis @param {Map<any, any>} inferred @param {boolean} insertDeps @param {boolean} nativeReads */
function rebuildWithHookMetadata(ast, analysis, inferred, insertDeps, nativeReads = false) {
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
				// Only an authored omission grants this capability. Explicit arrays,
				// null, and dependency arguments forwarded by wrappers stay ordinary.
				if (nativeReads && result.name === 'useMemo') out._octaneNativeInferredMemo = true;
				if (insertDeps) {
					const args = out.arguments.slice();
					// The synthesized array maps to the hook call it belongs to; each
					// dependency clone keeps its authored position.
					args.splice(result.depsIndex, 0, {
						...b.array(
							result.dependencies.map((/** @type {any} */ dependency) =>
								dependency.method ? methodDepNode(dependency) : cloneDependency(dependency.node),
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
/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string, inferDependencies?: boolean, nativeReads?: boolean }} [options] */
export function annotateHookCalls(ast, options = {}) {
	const { analysis, inferred } = analyzeInternal(ast, options);
	return rebuildWithHookMetadata(ast, analysis, inferred, false, options.nativeReads === true);
}

/**
 * Full-compiler entry: rebuild the module with hook annotations AND inferred
 * dependency arrays inserted at each candidate call. Copy-on-write — the input
 * AST is never modified; callers must use the returned module.
 */
/** @param {any} ast @param {{ onlyImported?: boolean, hookRuntimeModules?: readonly string[], filename?: string, onRuntimeHelper?: (name: string) => void, nativeReads?: boolean }} [options] */
export function applyHookDependencies(ast, options = {}) {
	const { analysis, inferred } = analyzeInternal(ast, options);
	// The inserted `_$__methodDep(...)` calls need their aliased runtime import;
	// the caller owns import assembly, so report the requirement rather than
	// splicing an ImportDeclaration into a module whose runtime request
	// ('octane' vs 'octane/server') this pass cannot know.
	if (options.onRuntimeHelper !== undefined) {
		outer: for (const result of inferred.values()) {
			for (const dependency of result.dependencies) {
				if (dependency.method) {
					options.onRuntimeHelper(METHOD_DEP_IMPORT);
					break outer;
				}
			}
		}
	}
	return rebuildWithHookMetadata(ast, analysis, inferred, true, options.nativeReads === true).ast;
}
