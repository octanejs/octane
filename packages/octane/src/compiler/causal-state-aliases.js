const TRANSPARENT_EXPRESSIONS = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

const SKIP_KEYS = new Set(['end', 'loc', 'metadata', 'parent', 'range', 'start', 'type']);
const AMBIGUOUS_BINDING = Symbol('ambiguous binding');

function unwrap(node) {
	let current = node;
	while (current && TRANSPARENT_EXPRESSIONS.has(current.type)) current = current.expression;
	return current;
}

function isFunction(node) {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	);
}

function createScope(parent, kind) {
	return { parent, kind, bindings: new Map() };
}

function addBinding(scope, name, binding) {
	if (typeof name !== 'string') return;
	let entries = scope.bindings.get(name);
	if (entries === undefined) {
		entries = [];
		scope.bindings.set(name, entries);
	}
	entries.push(binding);
}

function lookupBinding(scope, name) {
	for (let current = scope; current !== null; current = current.parent) {
		const entries = current.bindings.get(name);
		if (entries === undefined) continue;
		return entries.length === 1 ? entries[0] : AMBIGUOUS_BINDING;
	}
	return null;
}

function nearestVarScope(scope) {
	let current = scope;
	while (current.parent !== null && current.kind !== 'function') current = current.parent;
	return current;
}

function collectPatternNames(pattern, callback) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		callback(pattern.name);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		collectPatternNames(pattern.left, callback);
	} else if (pattern.type === 'RestElement') {
		collectPatternNames(pattern.argument, callback);
	} else if (pattern.type === 'ArrayPattern') {
		for (const item of pattern.elements ?? []) collectPatternNames(item, callback);
	} else if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			collectPatternNames(
				property.type === 'RestElement' ? property.argument : property.value,
				callback,
			);
		}
	}
}

function staticPropertyName(member) {
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

function staticDefinitionPropertyName(property) {
	if (!property || property.type === 'SpreadElement') return null;
	if (!property.computed && property.key?.type === 'Identifier') return property.key.name;
	if (
		property.key?.type === 'Literal' &&
		(typeof property.key.value === 'string' || typeof property.key.value === 'number')
	) {
		return String(property.key.value);
	}
	return null;
}

function propertyValue(object, name) {
	if (object?.type === 'ArrayExpression') {
		const index = Number(name);
		return Number.isInteger(index) && index >= 0 ? (object.elements?.[index] ?? null) : undefined;
	}
	if (object?.type !== 'ObjectExpression') return undefined;
	let unknownOverride = false;
	for (let index = (object.properties?.length ?? 0) - 1; index >= 0; index--) {
		const property = object.properties[index];
		const key = staticDefinitionPropertyName(property);
		if (key === null) {
			unknownOverride = true;
			continue;
		}
		if (key === name) {
			return unknownOverride || property.kind !== 'init' ? undefined : property.value;
		}
	}
	return undefined;
}

function isComponentTagName(node) {
	return (
		node?.type === 'MemberExpression' ||
		node?.type === 'JSXMemberExpression' ||
		((node?.type === 'Identifier' || node?.type === 'JSXIdentifier') &&
			!/^[a-z]/.test(node.name) &&
			!node.name.includes('-'))
	);
}

function isExportedDefinitionName(name) {
	return (
		name === 'default' ||
		(typeof name === 'string' && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name)))
	);
}

function combineStatuses(statuses) {
	if (statuses.some((status) => status === 'ambiguous')) return 'ambiguous';
	if (statuses.some((status) => status === 'resolved')) return 'resolved';
	if (statuses.some((status) => status === 'external')) return 'external';
	return 'safe';
}

/**
 * Resolve statically local component aliases to the function definition that
 * owns their causal provenance. Resolution follows lexical bindings rather
 * than spellings, so unrelated shadowing cannot poison a module-level alias.
 * Imported identities are terminal: their publishing package owns the marker.
 */
export function analyzeCausalComponentAliases(ast, options) {
	const moduleScope = createScope(null, 'module');
	const trustedFactories = new Set(options?.trustedFactories ?? []);
	const externalComponentBindings = Array.isArray(options?.externalComponentBindings)
		? options.externalComponentBindings.filter(
				(binding) => typeof binding?.owner === 'string' && typeof binding?.local === 'string',
			)
		: [];
	const runtimeModules = new Set([
		'octane',
		'octane/server',
		'octane/universal',
		...(options?.runtimeModules ?? []),
	]);
	const nodeScopes = new WeakMap();
	const mutationReferences = [];

	const bindUnsupportedPattern = (pattern, scope, node) => {
		collectPatternNames(pattern, (name) =>
			addBinding(scope, name, { kind: 'unsupported', node, mutated: false }),
		);
	};

	const collectBindings = (node, scope) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collectBindings(child, scope);
			return;
		}
		nodeScopes.set(node, scope);
		if (node.type === 'Program') {
			for (const statement of node.body ?? []) collectBindings(statement, scope);
			return;
		}
		if (node.type === 'ImportDeclaration') {
			for (const specifier of node.specifiers ?? []) {
				nodeScopes.set(specifier, scope);
				if (specifier.local) nodeScopes.set(specifier.local, scope);
				if (!specifier.local?.name) continue;
				const importedName =
					specifier.type === 'ImportDefaultSpecifier'
						? 'default'
						: specifier.type === 'ImportNamespaceSpecifier'
							? '*'
							: (specifier.imported?.name ?? specifier.imported?.value);
				addBinding(scope, specifier.local.name, {
					kind: 'import',
					source: node.source?.value,
					importedName,
					mutated: false,
				});
			}
			return;
		}
		if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
			if (node.declaration) collectBindings(node.declaration, scope);
			for (const specifier of node.specifiers ?? []) collectBindings(specifier, scope);
			return;
		}
		if (node.type === 'FunctionDeclaration') {
			if (node.id?.name) {
				addBinding(scope, node.id.name, {
					kind: 'function',
					node,
					mutated: false,
				});
				nodeScopes.set(node.id, scope);
			}
			const functionScope = createScope(scope, 'function');
			for (const parameter of node.params ?? []) {
				bindUnsupportedPattern(parameter, functionScope, parameter);
				collectBindings(parameter, functionScope);
			}
			collectBindings(node.body, functionScope);
			return;
		}
		if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
			const functionScope = createScope(scope, 'function');
			if (node.type === 'FunctionExpression' && node.id?.name) {
				addBinding(functionScope, node.id.name, {
					kind: 'function',
					node,
					mutated: false,
				});
				nodeScopes.set(node.id, functionScope);
			}
			for (const parameter of node.params ?? []) {
				bindUnsupportedPattern(parameter, functionScope, parameter);
				collectBindings(parameter, functionScope);
			}
			collectBindings(node.body, functionScope);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const blockScope = createScope(scope, 'block');
			for (const statement of node.body ?? []) collectBindings(statement, blockScope);
			if (node.render) collectBindings(node.render, blockScope);
			return;
		}
		if (node.type === 'CatchClause') {
			const catchScope = createScope(scope, 'block');
			if (node.param) {
				bindUnsupportedPattern(node.param, catchScope, node.param);
				collectBindings(node.param, catchScope);
			}
			collectBindings(node.body, catchScope);
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const loopScope = createScope(scope, 'block');
			if (node.type === 'ForStatement') {
				collectBindings(node.init, loopScope);
				collectBindings(node.test, loopScope);
				collectBindings(node.update, loopScope);
			} else {
				collectBindings(node.left, loopScope);
				// The iterable expression is evaluated before the loop declaration's
				// lexical environment becomes visible.
				collectBindings(node.right, scope);
			}
			collectBindings(node.body, loopScope);
			return;
		}
		if (node.type === 'SwitchStatement') {
			collectBindings(node.discriminant, scope);
			const switchScope = createScope(scope, 'block');
			for (const switchCase of node.cases ?? []) collectBindings(switchCase, switchScope);
			return;
		}
		if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			if (node.type === 'ClassDeclaration' && node.id?.name) {
				addBinding(scope, node.id.name, { kind: 'unsupported', node, mutated: false });
				nodeScopes.set(node.id, scope);
			}
			if (node.superClass) collectBindings(node.superClass, scope);
			const classScope = createScope(scope, 'class');
			if (node.type === 'ClassExpression' && node.id?.name) {
				addBinding(classScope, node.id.name, { kind: 'unsupported', node, mutated: false });
				nodeScopes.set(node.id, classScope);
			}
			collectBindings(node.body, classScope);
			return;
		}
		if (node.type === 'VariableDeclaration') {
			const bindingScope = node.kind === 'var' ? nearestVarScope(scope) : scope;
			for (const item of node.declarations ?? []) {
				nodeScopes.set(item, scope);
				if (item.id?.type === 'Identifier') {
					nodeScopes.set(item.id, bindingScope);
					addBinding(bindingScope, item.id.name, {
						kind: node.kind === 'const' ? 'const' : 'unsupported',
						node: item,
						value: item.init,
						mutated: false,
					});
				} else {
					bindUnsupportedPattern(item.id, bindingScope, item);
					collectBindings(item.id, bindingScope);
				}
				collectBindings(item.init, scope);
			}
			return;
		}
		if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
			collectPatternNames(
				node.type === 'AssignmentExpression' ? node.left : node.argument,
				(name) => mutationReferences.push({ scope, name }),
			);
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			collectBindings(node[key], scope);
		}
	};

	collectBindings(ast, moduleScope);
	for (const mutation of mutationReferences) {
		const binding = lookupBinding(mutation.scope, mutation.name);
		if (binding !== null && binding !== AMBIGUOUS_BINDING) binding.mutated = true;
	}

	// A const aggregate is not deeply immutable. Only static property reads and
	// immutable aggregate-alias chains are safe; exporting/passing/returning the
	// object, or mutating one of its members, makes literal provenance stale.
	const parents = new WeakMap();
	const parentKeys = new WeakMap();
	const indexParents = (node, parent = null, parentKey = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) indexParents(child, parent, parentKey);
			return;
		}
		if (parent !== null) {
			parents.set(node, parent);
			parentKeys.set(node, parentKey);
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			const value = node[key];
			if (Array.isArray(value)) {
				for (const child of value) indexParents(child, node, key);
			} else {
				indexParents(value, node, key);
			}
		}
	};
	indexParents(ast);
	const aggregateAliasSources = new Map();
	const addAggregateAlias = (target, source) => {
		let sources = aggregateAliasSources.get(target);
		if (sources === undefined) {
			sources = new Set();
			aggregateAliasSources.set(target, sources);
		}
		sources.add(source);
	};
	const markAggregateUses = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) markAggregateUses(child);
			return;
		}
		if (node.type === 'Identifier') {
			const binding = lookupBinding(nodeScopes.get(node) ?? moduleScope, node.name);
			if (binding !== null && binding !== AMBIGUOUS_BINDING && binding.kind === 'const') {
				const parent = parents.get(node);
				const key = parentKeys.get(node);
				const declarationId = parent?.type === 'VariableDeclarator' && key === 'id';
				const staticKey =
					(parent?.type === 'Property' && key === 'key' && !parent.computed) ||
					((parent?.type === 'MemberExpression' || parent?.type === 'JSXMemberExpression') &&
						key === 'property' &&
						!parent.computed);
				if (!declarationId && !staticKey) {
					let current = node;
					let next = parent;
					let memberRead = false;
					while (next && TRANSPARENT_EXPRESSIONS.has(next.type) && next.expression === current) {
						current = next;
						next = parents.get(current);
					}
					while (
						next &&
						(next.type === 'MemberExpression' || next.type === 'JSXMemberExpression') &&
						next.object === current &&
						staticPropertyName(next) !== null
					) {
						memberRead = true;
						current = next;
						next = parents.get(current);
						while (next && TRANSPARENT_EXPRESSIONS.has(next.type) && next.expression === current) {
							current = next;
							next = parents.get(current);
						}
					}
					const memberMutation =
						memberRead &&
						((next?.type === 'AssignmentExpression' && next.left === current) ||
							(next?.type === 'UpdateExpression' && next.argument === current) ||
							(next?.type === 'UnaryExpression' &&
								next.operator === 'delete' &&
								next.argument === current));
					if (memberMutation) {
						binding.aggregateEscaped = true;
					} else if (!memberRead) {
						let aliasNode = node;
						let aliasParent = parent;
						while (
							aliasParent &&
							(TRANSPARENT_EXPRESSIONS.has(aliasParent.type) ||
								aliasParent.type === 'ConditionalExpression' ||
								aliasParent.type === 'LogicalExpression' ||
								(aliasParent.type === 'SequenceExpression' &&
									aliasParent.expressions?.at(-1) === aliasNode))
						) {
							aliasNode = aliasParent;
							aliasParent = parents.get(aliasNode);
						}
						if (
							aliasParent?.type === 'VariableDeclarator' &&
							aliasParent.init === aliasNode &&
							aliasParent.id?.type === 'Identifier'
						) {
							const target = lookupBinding(
								nodeScopes.get(aliasParent.id) ?? moduleScope,
								aliasParent.id.name,
							);
							if (target !== null && target !== AMBIGUOUS_BINDING && target.kind === 'const') {
								addAggregateAlias(target, binding);
							} else {
								binding.aggregateEscaped = true;
							}
						} else {
							binding.aggregateEscaped = true;
						}
					}
				}
			}
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			markAggregateUses(node[key]);
		}
	};
	markAggregateUses(ast);
	let propagatedEscape = true;
	while (propagatedEscape) {
		propagatedEscape = false;
		for (const [target, sources] of aggregateAliasSources) {
			if (!target.aggregateEscaped) continue;
			for (const source of sources) {
				if (source.aggregateEscaped) continue;
				source.aggregateEscaped = true;
				propagatedEscape = true;
			}
		}
	}

	const bindingForIdentifier = (node) =>
		lookupBinding(nodeScopes.get(node) ?? moduleScope, node.name);
	const importedRuntimeFunctionName = (callee) => {
		const value = unwrap(callee);
		if (value?.type === 'Identifier') {
			const binding = bindingForIdentifier(value);
			return binding !== null &&
				binding !== AMBIGUOUS_BINDING &&
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
			const binding = bindingForIdentifier(value.object);
			const name = staticPropertyName(value);
			return binding !== null &&
				binding !== AMBIGUOUS_BINDING &&
				binding.kind === 'import' &&
				binding.importedName === '*' &&
				!binding.mutated &&
				runtimeModules.has(binding.source)
				? name
				: null;
		}
		return null;
	};

	const candidates = [];
	const addCandidate = (node, label) => {
		if (node) candidates.push({ node, label });
	};
	const addGetterReturnCandidates = (getter, label) => {
		const visit = (node) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (node !== getter.body && isFunction(node)) return;
			if (node.type === 'ReturnStatement') {
				addCandidate(node.argument, label);
				return;
			}
			for (const key in node) {
				if (SKIP_KEYS.has(key)) continue;
				visit(node[key]);
			}
		};
		visit(getter.body);
	};
	const collectCandidates = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collectCandidates(child);
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			const tag = node.openingElement?.name ?? node.id;
			if (tag?.type === 'JSXExpressionContainer') {
				addCandidate(tag.expression, 'dynamic component');
			} else if (isComponentTagName(tag)) {
				addCandidate(tag, 'component');
			}
		}
		if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
			if (/^use[A-Z]/.test(node.id.name) && node.init) {
				addCandidate(node.init, `custom-hook alias ${JSON.stringify(node.id.name)}`);
			}
		}
		if (node.type === 'Property') {
			const name = staticDefinitionPropertyName(node);
			if (
				node.kind === 'get' &&
				(/^[A-Z]/.test(name ?? '') || /^use[A-Z]/.test(name ?? '')) &&
				node.value
			) {
				addGetterReturnCandidates(node.value, `accessor member ${JSON.stringify(name)}`);
			} else if (node.kind === 'init' && /^use[A-Z]/.test(name ?? '') && node.value) {
				addCandidate(node.value, `custom-hook member ${JSON.stringify(name)}`);
			} else if (node.kind === 'init' && /^[A-Z]/.test(name ?? '') && node.value) {
				addCandidate(node.value, `component member ${JSON.stringify(name)}`);
			}
		}
		if (node.type === 'PropertyDefinition' || node.type === 'ClassProperty') {
			const name = staticDefinitionPropertyName(node);
			if (/^use[A-Z]/.test(name ?? '') && node.value) {
				addCandidate(node.value, `custom-hook field ${JSON.stringify(name)}`);
			}
		}
		if (node.type === 'ExportDefaultDeclaration') {
			addCandidate(node.declaration, 'default component export');
		}
		if (node.type === 'ExportNamedDeclaration' && node.source == null) {
			for (const specifier of node.specifiers ?? []) {
				const exported = specifier.exported?.name ?? specifier.exported?.value;
				if (isExportedDefinitionName(exported)) {
					addCandidate(specifier.local, `component export ${JSON.stringify(exported)}`);
				}
			}
			if (node.declaration?.type === 'VariableDeclaration') {
				for (const item of node.declaration.declarations ?? []) {
					if (item.id?.type === 'Identifier' && isExportedDefinitionName(item.id.name)) {
						addCandidate(item.init, `component export ${JSON.stringify(item.id.name)}`);
					}
				}
			} else if (
				(node.declaration?.type === 'FunctionDeclaration' ||
					node.declaration?.type === 'ClassDeclaration') &&
				isExportedDefinitionName(node.declaration.id?.name)
			) {
				addCandidate(
					node.declaration,
					`component export ${JSON.stringify(node.declaration.id.name)}`,
				);
			}
		}
		if (
			node.type === 'CallExpression' &&
			importedRuntimeFunctionName(node.callee) === 'createElement' &&
			node.arguments?.[0]
		) {
			addCandidate(node.arguments[0], 'createElement component');
		}
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'MemberExpression' &&
			!node.callee.computed &&
			node.callee.property?.type === 'Identifier' &&
			node.callee.property.name === 'render' &&
			node.arguments?.[0]
		) {
			addCandidate(node.arguments[0], 'root.render component');
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			collectCandidates(node[key]);
		}
	};
	collectCandidates(ast);

	const forcedFunctions = new WeakSet();
	const unresolved = [];
	const resolving = new Set();
	const lazyExternalBindings = new Set();

	const trustedExternalBinding = (binding, local, members) => {
		if (
			binding === null ||
			binding === AMBIGUOUS_BINDING ||
			binding.mutated ||
			binding.aggregateEscaped ||
			externalComponentBindings.length === 0
		) {
			return false;
		}
		let current = binding.node;
		while (current) {
			current = parents.get(current);
			if (!isFunction(current)) continue;
			const owner = current.id?.name;
			return externalComponentBindings.some(
				(descriptor) =>
					descriptor.owner === owner &&
					descriptor.local === local &&
					(descriptor.members === true) === members,
			);
		}
		return false;
	};

	const importedFactoryKind = (callee) => {
		const name = importedRuntimeFunctionName(callee);
		return name === 'memo' || name === 'lazy' ? name : null;
	};

	let resolveValue;
	let resolveAggregate;

	const resolveCanonicalThenable = (object) => {
		const then = propertyValue(object, 'then');
		if (
			!isFunction(then) ||
			then.async ||
			then.generator ||
			then.params?.length !== 1 ||
			then.params[0]?.type !== 'Identifier' ||
			then.body?.type !== 'BlockStatement' ||
			then.body.body?.length !== 1
		) {
			return 'ambiguous';
		}
		const statement = then.body.body[0];
		const call =
			statement?.type === 'ExpressionStatement'
				? unwrap(statement.expression)
				: statement?.type === 'ReturnStatement'
					? unwrap(statement.argument)
					: null;
		if (
			call?.type !== 'CallExpression' ||
			call.optional ||
			call.callee?.type !== 'Identifier' ||
			call.arguments?.length !== 1 ||
			call.arguments[0]?.type === 'SpreadElement' ||
			bindingForIdentifier(call.callee) !== bindingForIdentifier(then.params[0])
		) {
			return 'ambiguous';
		}
		return resolveLazyResult(call.arguments[0]);
	};

	const resolveLazyResult = (input) => {
		const node = unwrap(input);
		if (!node) return 'ambiguous';
		if (node.type === 'AwaitExpression') return resolveLazyResult(node.argument);
		if (node.type === 'ImportExpression') return 'external';
		if (
			node.type === 'CallExpression' &&
			(node.callee?.type === 'Import' || node.callee?.type === 'ImportExpression')
		) {
			return 'external';
		}
		if (node.type === 'ObjectExpression') {
			if (
				node.properties?.some(
					(property) =>
						property.type === 'SpreadElement' || staticDefinitionPropertyName(property) === null,
				)
			) {
				return 'ambiguous';
			}
			if (node.properties?.some((property) => staticDefinitionPropertyName(property) === 'then')) {
				return resolveCanonicalThenable(node);
			}
			const value = propertyValue(node, 'default');
			return value === undefined ? 'ambiguous' : resolveValue(value);
		}
		if (node.type === 'ConditionalExpression') {
			return combineStatuses([
				resolveLazyResult(node.consequent),
				resolveLazyResult(node.alternate),
			]);
		}
		if (node.type === 'LogicalExpression') {
			return combineStatuses([resolveLazyResult(node.left), resolveLazyResult(node.right)]);
		}
		if (node.type === 'SequenceExpression') {
			return resolveLazyResult(node.expressions?.at(-1));
		}
		if (node.type === 'CallExpression') {
			const callee = unwrap(node.callee);
			if (
				callee?.type === 'MemberExpression' &&
				staticPropertyName(callee) === 'resolve' &&
				callee.object?.type === 'Identifier' &&
				callee.object.name === 'Promise' &&
				bindingForIdentifier(callee.object) === null
			) {
				return resolveLazyResult(node.arguments?.[0]);
			}
			if (
				callee?.type === 'MemberExpression' &&
				staticPropertyName(callee) === 'then' &&
				resolveLazyResult(callee.object) === 'external'
			) {
				const callback = unwrap(node.arguments?.[0]);
				if (!isFunction(callback)) return 'ambiguous';
				const externalParameters = [];
				for (const parameter of callback.params ?? []) {
					if (parameter.type !== 'Identifier') return 'ambiguous';
					const binding = bindingForIdentifier(parameter);
					if (binding === null || binding === AMBIGUOUS_BINDING) return 'ambiguous';
					externalParameters.push(binding);
					lazyExternalBindings.add(binding);
				}
				try {
					return resolveLazyLoader(callback);
				} finally {
					for (const binding of externalParameters) lazyExternalBindings.delete(binding);
				}
			}
			return 'ambiguous';
		}
		return resolveValue(node);
	};

	const resolveLazyLoader = (input) => {
		const loader = unwrap(input);
		if (loader?.type === 'Identifier') {
			const binding = bindingForIdentifier(loader);
			if (binding === null || binding?.kind === 'import') return 'external';
			if (binding === AMBIGUOUS_BINDING || binding.mutated || resolving.has(binding)) {
				return 'ambiguous';
			}
			if (binding.kind === 'function') return resolveLazyLoader(binding.node);
			if (binding.kind !== 'const') return 'ambiguous';
			resolving.add(binding);
			try {
				return resolveLazyLoader(binding.value);
			} finally {
				resolving.delete(binding);
			}
		}
		if (!isFunction(loader)) return 'ambiguous';
		if (loader.type === 'ArrowFunctionExpression' && loader.expression) {
			return resolveLazyResult(loader.body);
		}
		if (loader.body?.type !== 'BlockStatement') return 'ambiguous';
		const returns = [];
		const visit = (node) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (node !== loader.body && isFunction(node)) return;
			if (node.type === 'ReturnStatement') {
				returns.push(resolveLazyResult(node.argument));
				return;
			}
			for (const key in node) {
				if (SKIP_KEYS.has(key)) continue;
				visit(node[key]);
			}
		};
		visit(loader.body);
		return returns.length === 0 ? 'ambiguous' : combineStatuses(returns);
	};

	resolveAggregate = (input) => {
		const node = unwrap(input);
		if (!node) return { status: 'ambiguous', values: [] };
		if (node.type === 'ObjectExpression' || node.type === 'ArrayExpression') {
			return { status: 'resolved', values: [node] };
		}
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			const binding = bindingForIdentifier(node);
			if (trustedExternalBinding(binding, node.name, true)) {
				return { status: 'external', values: [], external: true };
			}
			if (binding === null || binding?.kind === 'import' || lazyExternalBindings.has(binding)) {
				return { status: 'external', values: [], external: true };
			}
			if (
				binding === AMBIGUOUS_BINDING ||
				binding.mutated ||
				binding.aggregateEscaped ||
				binding.kind !== 'const' ||
				resolving.has(binding)
			) {
				return { status: 'ambiguous', values: [], external: false };
			}
			resolving.add(binding);
			try {
				return resolveAggregate(binding.value);
			} finally {
				resolving.delete(binding);
			}
		}
		if (node.type === 'ConditionalExpression') {
			const branches = [resolveAggregate(node.consequent), resolveAggregate(node.alternate)];
			if (branches.some((branch) => branch.status === 'ambiguous')) {
				return { status: 'ambiguous', values: [], external: false };
			}
			const values = branches.flatMap((branch) => branch.values);
			const external = branches.some(
				(branch) => branch.status === 'external' || branch.external === true,
			);
			return values.length === 0
				? { status: 'external', values: [], external }
				: { status: 'resolved', values, external };
		}
		if (node.type === 'LogicalExpression') {
			const branches = [resolveAggregate(node.left), resolveAggregate(node.right)];
			if (branches.some((branch) => branch.status === 'ambiguous')) {
				return { status: 'ambiguous', values: [], external: false };
			}
			const values = branches.flatMap((branch) => branch.values);
			const external = branches.some(
				(branch) => branch.status === 'external' || branch.external === true,
			);
			return values.length === 0
				? { status: 'external', values: [], external }
				: { status: 'resolved', values, external };
		}
		if (node.type === 'SequenceExpression') {
			return resolveAggregate(node.expressions?.at(-1));
		}
		if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
			const name = staticPropertyName(node);
			if (name === null) return { status: 'ambiguous', values: [], external: false };
			const parent = resolveAggregate(node.object);
			if (parent.status !== 'resolved') return parent;
			const values = [];
			let external = parent.external === true;
			for (const object of parent.values) {
				const value = propertyValue(object, name);
				const aggregate = value === undefined ? null : resolveAggregate(value);
				if (aggregate === null || aggregate.status === 'ambiguous') {
					return { status: aggregate?.status ?? 'ambiguous', values: [], external: false };
				}
				if (aggregate.status === 'external' || aggregate.external === true) external = true;
				values.push(...aggregate.values);
			}
			return values.length === 0
				? { status: 'external', values: [], external }
				: { status: 'resolved', values, external };
		}
		return { status: 'ambiguous', values: [], external: false };
	};

	resolveValue = (input) => {
		const node = unwrap(input);
		if (!node) return 'safe';
		if (isFunction(node)) {
			forcedFunctions.add(node);
			return 'resolved';
		}
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			const binding = bindingForIdentifier(node);
			if (trustedExternalBinding(binding, node.name, false)) return 'external';
			if (binding === null || binding?.kind === 'import' || lazyExternalBindings.has(binding)) {
				return 'external';
			}
			if (binding === AMBIGUOUS_BINDING || binding.mutated) return 'ambiguous';
			if (binding.kind === 'function') {
				forcedFunctions.add(binding.node);
				return 'resolved';
			}
			if (binding.kind !== 'const' || resolving.has(binding)) return 'ambiguous';
			resolving.add(binding);
			try {
				return resolveValue(binding.value);
			} finally {
				resolving.delete(binding);
			}
		}
		if (node.type === 'ConditionalExpression') {
			return combineStatuses([resolveValue(node.consequent), resolveValue(node.alternate)]);
		}
		if (node.type === 'LogicalExpression') {
			return combineStatuses([resolveValue(node.left), resolveValue(node.right)]);
		}
		if (node.type === 'SequenceExpression') return resolveValue(node.expressions?.at(-1));
		if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
			const name = staticPropertyName(node);
			if (name === null) return 'ambiguous';
			const aggregate = resolveAggregate(node.object);
			if (aggregate.status !== 'resolved') return aggregate.status;
			const statuses = aggregate.values.map((object) => {
				const value = propertyValue(object, name);
				return value === undefined ? 'ambiguous' : resolveValue(value);
			});
			if (aggregate.external === true) statuses.push('external');
			return combineStatuses(statuses);
		}
		if (node.type === 'CallExpression') {
			if (node.callee?.type === 'Identifier' && trustedFactories.has(node.callee.name)) {
				return 'resolved';
			}
			const factory = importedFactoryKind(node.callee);
			if (factory === 'memo') return resolveValue(node.arguments?.[0]);
			if (factory === 'lazy') return resolveLazyLoader(node.arguments?.[0]);
			return 'ambiguous';
		}
		if (
			node.type === 'Literal' ||
			node.type === 'NullLiteral' ||
			node.type === 'BinaryExpression' ||
			node.type === 'TemplateLiteral' ||
			node.type === 'UpdateExpression' ||
			node.type === 'JSXElement' ||
			node.type === 'JSXFragment' ||
			node.type === 'Element' ||
			node.type === 'Fragment' ||
			node.type === 'ObjectExpression' ||
			node.type === 'ArrayExpression' ||
			node.type === 'UnaryExpression'
		) {
			return 'safe';
		}
		return 'ambiguous';
	};

	const memoCalls = new WeakSet();
	const collectMemoCalls = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) collectMemoCalls(child);
			return;
		}
		if (node.type === 'CallExpression' && importedFactoryKind(node.callee) === 'memo') {
			memoCalls.add(node);
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			collectMemoCalls(node[key]);
		}
	};
	collectMemoCalls(ast);

	for (const candidate of candidates) {
		if (resolveValue(candidate.node) === 'ambiguous') unresolved.push(candidate);
	}

	return { forcedFunctions, memoCalls, unresolved };
}

export function assertNoUnresolvedCausalComponentAliases(analysis, filename) {
	if (analysis.unresolved.length === 0) return;
	const candidate = analysis.unresolved[0];
	const node = candidate.node;
	const error = new Error(
		`${filename}:${node.loc?.start?.line ?? 1}:${(node.loc?.start?.column ?? 0) + 1} ` +
			`Octane cannot prove the authored definition for this ${candidate.label} in the causal state model. Keep the component as an immutable local function/const alias (including conditional aliases), import it from its owning package, or move this module to an explicitly approved permissive boundary while it migrates.`,
	);
	error.code = 'OCTANE_CAUSAL_COMPONENT_ALIAS_UNRESOLVED';
	error.filename = filename;
	throw error;
}
