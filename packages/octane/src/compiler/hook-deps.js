// Compiler-owned dependency inference for hooks whose dependency list is
// omitted. The same analysis feeds the full TSRX/TSX compiler and the
// surgical plain-TS hook pass, keeping custom hooks and components aligned.

const DEPENDENCY_HOOKS = new Map([
	['useEffect', { callback: 0, deps: 1 }],
	['useLayoutEffect', { callback: 0, deps: 1 }],
	['useInsertionEffect', { callback: 0, deps: 1 }],
	['useMemo', { callback: 0, deps: 1 }],
	['useCallback', { callback: 0, deps: 1 }],
	['useImperativeHandle', { callback: 1, deps: 2 }],
]);

// Results whose identity is guaranteed for the lifetime of a hook cell. A
// useCallback result is deliberately absent: it is memoized, but its identity
// can still change when its own dependencies change.
const STABLE_RESULT_HOOKS = new Set(['useRef', 'useEffectEvent']);
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
			module: scope.kind === 'module',
			stable: false,
			octaneImport: null,
		};
		scope.bindings.set(name, binding);
	}
	if (details?.octaneImport) binding.octaneImport = details.octaneImport;
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

function predeclareDirect(statements, scope) {
	for (const original of statements || []) {
		if (original.type === 'ImportDeclaration') {
			for (const specifier of original.specifiers || []) {
				const imported = specifier.imported?.name;
				declareName(scope, specifier.local.name, {
					octaneImport: original.source?.value === 'octane' ? imported : null,
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

function unwrapValue(node) {
	while (node && TS_VALUE_WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function canonicalHookName(call, scope, onlyImported) {
	const callee = unwrapValue(call?.callee);
	if (!callee || callee.type !== 'Identifier') return null;
	const binding = resolveBinding(scope, callee.name);
	if (binding?.octaneImport) return binding.octaneImport;
	if (onlyImported) return null;
	return callee.name;
}

function buildScopes(ast, onlyImported) {
	nextBindingId = 0;
	const moduleScope = createScope(null, 'module');
	const nodeScopes = new WeakMap();
	const functionScopes = new WeakMap();
	const declarators = [];
	const candidates = [];
	predeclareDirect(ast.body, moduleScope);
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
			if (node.type !== 'ArrowFunctionExpression' && node.id) {
				declareName(fnScope, node.id.name);
			}
			if (node.type !== 'ArrowFunctionExpression') declareName(fnScope, 'arguments');
			for (const param of node.params || []) declarePattern(param, fnScope);
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
			predeclareDirect(node.body, blockScope);
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

		if (node.type === 'CallExpression') {
			const name = canonicalHookName(node, scope, onlyImported);
			const config = DEPENDENCY_HOOKS.get(name);
			if (config && node.arguments.length === config.deps) {
				candidates.push({ call: node, scope, name, config });
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
	return { nodeScopes, functionScopes, declarators, candidates };
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

function markStableBindings(analysis, onlyImported) {
	let changed = true;
	while (changed) {
		changed = false;
		for (const { decl, bindings, kind } of analysis.declarators) {
			if (kind !== 'const' || !decl.init) continue;
			const init = unwrapValue(decl.init);
			const scope = analysis.nodeScopes.get(decl);
			const callName =
				init?.type === 'CallExpression' ? canonicalHookName(init, scope, onlyImported) : null;

			if (decl.id.type === 'Identifier') {
				let stable = callName !== null && STABLE_RESULT_HOOKS.has(callName);
				if (!stable && init?.type === 'Identifier') {
					stable = resolveBinding(scope, init.name)?.stable === true;
				}
				if (stable && bindings[0] && !bindings[0].binding.stable) {
					bindings[0].binding.stable = true;
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
					if (binding && !binding.stable) {
						binding.stable = true;
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
	return {
		node: original,
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
			binding.module ||
			binding.stable ||
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
			binding.module ||
			binding.stable ||
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

/**
 * Return inferred dependency expressions for every supported hook call whose
 * dependency argument is omitted. Explicit arrays, `null`, and any other
 * explicit dependency expression are left untouched.
 */
export function analyzeHookDependencies(ast, options = {}) {
	const onlyImported = options.onlyImported === true;
	const analysis = buildScopes(ast, onlyImported);
	markStableBindings(analysis, onlyImported);
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
		} else if (
			callback?.type === 'Identifier' ||
			callback?.type === 'MemberExpression' ||
			callback?.type === 'ChainExpression'
		) {
			dependencies = collectDependencies(callback, null, analysis);
		} else {
			const loc = candidate.call.loc?.start;
			const at = loc ? ` at ${options.filename || 'source'}:${loc.line}:${loc.column}` : '';
			throw new Error(
				`Cannot infer dependencies for ${candidate.name}${at}: the callback must be an inline function or a stable reference. Pass an explicit dependency array, or \`null\` to run on every render.`,
			);
		}
		inferred.set(candidate.call, {
			name: candidate.name,
			depsIndex: candidate.config.deps,
			dependencies,
		});
	}
	return inferred;
}

/** Add inferred arrays directly to a full-compiler AST. */
export function applyHookDependencies(ast, options = {}) {
	const inferred = analyzeHookDependencies(ast, options);
	for (const [call, result] of inferred) {
		call.arguments.splice(result.depsIndex, 0, {
			type: 'ArrayExpression',
			elements: result.dependencies.map((dependency) => cloneDependency(dependency.node)),
		});
	}
	return inferred;
}
