import { collectReassignedBindings } from './hook-deps.js';

const STATE_HOOKS = new Set(['useState', 'useReducer', 'useLinkedState']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const ARRAY_MUTATORS = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift',
]);
const LOCAL_VALUE_HOOKS = new Set([
	...STATE_HOOKS,
	'useMemo',
	'useCallback',
	'useRef',
	'useId',
	'useEffectEvent',
	'useDeferredValue',
	'useTransition',
	'useSyncExternalStore',
	'useActionState',
	'useFormState',
	'useFormStatus',
	'useOptimistic',
]);
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
const UNDEFINED_VALUE = 1;
const NULL_VALUE = 2;
const NULLISH_VALUE = UNDEFINED_VALUE | NULL_VALUE;
const FALSY_VALUE = 4;
const TRUTHY_VALUE = 8;
const UNKNOWN_VALUE = NULLISH_VALUE | FALSY_VALUE | TRUTHY_VALUE;
const UNKNOWN_PRIMITIVE = Symbol('unknown primitive');
const NO_RETURN_VALUE = Symbol('no return value');
const OTHER_BINDING = { kind: 'other' };
const SNAPSHOT_BINDING = { kind: 'snapshot' };
const ARRAY_SNAPSHOT_BINDING = { kind: 'snapshot', array: true };
const STATE_TUPLE_BINDING = { kind: 'state-tuple', snapshot: SNAPSHOT_BINDING };
const ARRAY_STATE_TUPLE_BINDING = { kind: 'state-tuple', snapshot: ARRAY_SNAPSHOT_BINDING };
const UNDEFINED_BINDING = { kind: 'constant', value: UNDEFINED_VALUE, primitive: undefined };
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
export const STRONG_RENDER_SNAPSHOT_MUTATION = 'OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION';
export const STRONG_RETAINED_ROW_MUTATION = 'OCTANE_STRONG_RETAINED_ROW_MUTATION';
export const STRONG_RENDER_IMPURE_CALL = 'OCTANE_STRONG_RENDER_IMPURE_CALL';
export const STRONG_RENDER_EFFECT_EVENT_CALL = 'OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL';
export const STRONG_EFFECT_EVENT_DEPENDENCY = 'OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY';
export const STRONG_DIRECTIVE_PLACEMENT = 'OCTANE_STRONG_DIRECTIVE_PLACEMENT';
export const STRONG_HOOK_LOCALITY = 'OCTANE_STRONG_HOOK_LOCALITY';
export const STRONG_EVENT_HANDLER_LOCALITY = 'OCTANE_STRONG_EVENT_HANDLER_LOCALITY';

function primitiveValueMask(value) {
	return value === undefined
		? UNDEFINED_VALUE
		: value === null
			? NULL_VALUE
			: value
				? TRUTHY_VALUE
				: FALSY_VALUE;
}

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

function addPatternNames(pattern, bindings, value, overwrite = true) {
	if (pattern == null) return;
	switch (pattern.type) {
		case 'Identifier':
			if (overwrite || !bindings.has(pattern.name)) bindings.set(pattern.name, value);
			break;
		case 'RestElement':
			addPatternNames(pattern.argument, bindings, value, overwrite);
			break;
		case 'AssignmentPattern':
			addPatternNames(pattern.left, bindings, value, overwrite);
			break;
		case 'TSParameterProperty':
			addPatternNames(pattern.parameter, bindings, value, overwrite);
			break;
		case 'ArrayPattern':
			for (const element of pattern.elements ?? [])
				addPatternNames(element, bindings, value, overwrite);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties ?? []) {
				addPatternNames(property.argument ?? property.value, bindings, value, overwrite);
			}
	}
}

function bindSnapshotPattern(pattern, value, bind) {
	if (pattern?.type === 'Identifier') {
		bind(pattern, value);
	} else if (pattern?.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			if (property.type === 'Property') {
				bindSnapshotPattern(property.value, SNAPSHOT_BINDING, bind);
			}
		}
	} else if (pattern?.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) {
			bindSnapshotPattern(element, SNAPSHOT_BINDING, bind);
		}
	}
	// Rest copies and default expressions can produce new mutable values.
}

function declarationOf(statement) {
	return statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
		? statement.declaration
		: statement;
}

function nearestFunctionScope(scope) {
	let current = scope;
	while (current?.parent && current.kind !== 'function' && current.kind !== 'retained-row') {
		current = current.parent;
	}
	return current;
}

function declarationScope(scope, kind) {
	return kind === 'var' ? nearestFunctionScope(scope) : scope;
}

class BindingMap extends Map {
	constructor(clock) {
		super();
		this.clock = clock;
		this.revision = 0;
	}

	set(name, value) {
		if (!super.has(name) || super.get(name) !== value) this.revision = ++this.clock.value;
		return super.set(name, value);
	}

	delete(name) {
		const deleted = super.delete(name);
		if (deleted) this.revision = ++this.clock.value;
		return deleted;
	}

	clear() {
		if (this.size !== 0) this.revision = ++this.clock.value;
		super.clear();
	}
}

function scopeRevision(scope) {
	let revision = 0;
	for (let current = scope; current; current = current.parent) {
		revision = Math.max(revision, current.bindings.revision);
	}
	return revision;
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
				addPatternNames(declaration.id, target.bindings, OTHER_BINDING, node.kind !== 'var');
			}
		} else if (node?.type === 'FunctionDeclaration' && node.id?.name) {
			scope.bindings.set(node.id.name, { kind: 'callback', node, scope });
		} else if (node?.type === 'ClassDeclaration' && node.id?.name) {
			scope.bindings.set(node.id.name, { kind: 'other' });
		}
	}
}

function createScope(
	parent,
	kind,
	statements = [],
	params = [],
	isReassigned = parent?.isReassigned,
) {
	const scope = {
		parent,
		kind,
		bindings: new BindingMap(parent?.bindings.clock ?? { value: 0 }),
		isReassigned,
	};
	for (const param of params) addPatternNames(param, scope.bindings, { kind: 'other' });
	predeclareStatements(statements, scope);
	return scope;
}

function resolve(scope, name) {
	for (let current = scope; current; current = current.parent) {
		if (!current.bindings.has(name)) continue;
		const binding = current.bindings.get(name);
		// Function declarations are writable, unlike const callback aliases.
		// The source-binding proof is shared by every lexical activation.
		if (
			binding?.kind === 'callback' &&
			binding.node.type === 'FunctionDeclaration' &&
			current.isReassigned?.(binding.node.id)
		) {
			return OTHER_BINDING;
		}
		return binding;
	}
	return null;
}

function resolveScope(scope, name) {
	for (let current = scope; current; current = current.parent) {
		if (current.bindings.has(name)) return current;
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

// Template arms create their own hook lifetimes. A value used only by one arm
// can be declared there; a value used by siblings belongs to their parent.
// Keep this source-level check separate from the phase analysis above: it never
// annotates the parser tree or changes the code emitted for a valid module.
function strongLocalityDiagnostics(ast, source, filename, isReassigned) {
	const diagnostics = [];
	const values = [];
	const effects = [];
	const handlers = [];
	const effectByCall = new WeakMap();
	const valueByCall = new WeakMap();
	const hostAttributes = new WeakSet();
	const componentHandlers = new WeakSet();
	const moduleScope = createScope(null, 'module', ast.body ?? []);
	const mayHaveHoistedVars = source.includes('var');
	let activeHandler = null;
	let activeDerivedValue = null;

	function predeclareNestedVars(node, functionScope, root = true) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) predeclareNestedVars(child, functionScope, false);
			return;
		}
		if (
			FUNCTION_TYPES.has(node.type) ||
			(!root && node.type === 'JSXCodeBlock') ||
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXForExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXTryExpression' ||
			node.type === 'ClassDeclaration' ||
			node.type === 'ClassExpression' ||
			node.type === 'StaticBlock' ||
			(node.type?.startsWith('TS') && !TRANSPARENT_EXPRESSIONS.has(node.type))
		)
			return;
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const declaration of node.declarations ?? []) {
				addPatternNames(declaration.id, functionScope.bindings, OTHER_BINDING, false);
			}
		}
		for (const key in node) {
			if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) {
				predeclareNestedVars(node[key], functionScope, false);
			}
		}
	}

	function templateArm(node, parent, label, sameLifetime = false) {
		return { node, parent, label, sameLifetime };
	}

	function register(statements, scope, region) {
		if (region === null) return;
		for (const statement of statements ?? []) {
			const node = declarationOf(statement);
			if (node?.type === 'FunctionDeclaration' && node.id?.name) {
				const handler = { kind: 'locality-handler', node, region, uses: [] };
				scope.bindings.set(node.id.name, handler);
				handlers.push(handler);
			} else if (node?.type === 'VariableDeclaration' && node.kind === 'const') {
				for (const declaration of node.declarations ?? []) {
					const init = unwrap(declaration.init);
					const hook = init?.type === 'CallExpression' ? importedHook(init.callee, scope) : null;
					if (hook !== null && LOCAL_VALUE_HOOKS.has(hook)) {
						const value = {
							kind: 'locality-value',
							node: init,
							hook,
							region,
							uses: [],
							dependencies: new Set(),
							helpers: new Set(),
						};
						valueByCall.set(init, value);
						addPatternNames(declaration.id, scope.bindings, value);
						values.push(value);
					} else if (declaration.id?.type === 'Identifier' && FUNCTION_TYPES.has(init?.type)) {
						const handler = { kind: 'locality-handler', node: declaration, region, uses: [] };
						scope.bindings.set(declaration.id.name, handler);
						handlers.push(handler);
					}
				}
			} else if (node?.type === 'ExpressionStatement') {
				const call = unwrap(node.expression);
				if (call?.type !== 'CallExpression') continue;
				const hook = importedHook(call.callee, scope);
				if (!EFFECT_HOOKS.has(hook)) continue;
				const effect = { node: call, hook, region, dependencies: new Set(), helpers: new Set() };
				effectByCall.set(call, effect);
				effects.push(effect);
			}
		}
	}

	function block(body, parentScope, region, effect = null, template = false, event = null) {
		const scope = createScope(parentScope, template ? 'function' : 'block', body?.body ?? []);
		if (template && mayHaveHoistedVars) predeclareNestedVars(body, scope);
		register(body?.body, scope, region);
		for (const statement of body?.body ?? []) walk(statement, scope, region, effect, event);
		if (body?.render) walk(body.render, scope, region, effect, event);
	}

	function arm(body, scope, parent, directive, label) {
		if (body == null) return;
		if (body.type === 'BlockStatement' || body.type === 'JSXCodeBlock') {
			block(body, scope, templateArm(directive, parent, label), null, true);
		} else {
			walk(body, scope, parent);
		}
	}

	function conditionalArms(node, scope, region, effect) {
		walk(node.test, scope, region, effect);
		arm(node.consequent, scope, region, node, '@if arm');
		if (node.alternate?.type === 'IfStatement') {
			conditionalArms(node.alternate, scope, region, effect);
		} else {
			arm(node.alternate, scope, region, node, '@else arm');
		}
	}

	function useBinding(name, scope, region, effect, event) {
		const binding = resolve(scope, name);
		if (binding?.kind === 'locality-value') {
			if (effect !== null) {
				effect.dependencies.add(binding);
			} else if (activeDerivedValue !== null && activeDerivedValue !== binding) {
				activeDerivedValue.dependencies.add(binding);
			} else {
				binding.uses.push(activeHandler ? { viaHandler: activeHandler } : region);
			}
		} else if (binding?.kind === 'locality-handler') {
			if (activeDerivedValue !== null && effect === null) {
				binding.uses.push({ region, viaHandler: activeHandler, viaDerived: activeDerivedValue });
				activeDerivedValue.helpers.add(binding);
			} else {
				binding.uses.push({ region, event, viaHandler: activeHandler, effect });
				if (effect !== null) effect.helpers.add(binding);
			}
		}
	}

	function ownsTemplate(body, name) {
		body = unwrap(body);
		if (body?.type === 'JSXCodeBlock') return true;
		if (!/^[A-Z]/.test(name ?? '')) return false;
		if (body?.type === 'JSXElement' || body?.type === 'JSXFragment') return true;
		return (
			body?.type === 'BlockStatement' &&
			(body.body ?? []).some((statement) => {
				const argument = statement.type === 'ReturnStatement' ? unwrap(statement.argument) : null;
				return argument?.type === 'JSXElement' || argument?.type === 'JSXFragment';
			})
		);
	}

	function walkPatternExpressions(pattern, scope, region, effect) {
		if (pattern == null) return;
		switch (pattern.type) {
			case 'AssignmentPattern':
				walkPatternExpressions(pattern.left, scope, region, effect);
				walk(pattern.right, scope, region, effect);
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements ?? []) {
					walkPatternExpressions(element, scope, region, effect);
				}
				return;
			case 'ObjectPattern':
				for (const property of pattern.properties ?? []) {
					if (property.type === 'Property') {
						if (property.computed) walk(property.key, scope, region, effect);
						walkPatternExpressions(property.value, scope, region, effect);
					} else walkPatternExpressions(property, scope, region, effect);
				}
				return;
			case 'RestElement':
				walkPatternExpressions(pattern.argument, scope, region, effect);
				return;
			case 'TSParameterProperty':
				walkPatternExpressions(pattern.parameter, scope, region, effect);
				return;
		}
	}

	function walk(node, scope, region, effect = null, event = null) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, scope, region, effect, event);
			return;
		}
		if (TRANSPARENT_EXPRESSIONS.has(node.type)) {
			walk(node.expression, scope, region, effect, event);
			return;
		}
		if (node.type === 'TSEnumDeclaration') {
			for (const member of node.body?.members ?? node.members ?? []) {
				walk(member.initializer, scope, region, effect);
			}
			return;
		}
		if (node.type === 'TSModuleDeclaration') {
			walk(node.body, scope, region, effect);
			return;
		}
		if (node.type === 'TSModuleBlock') {
			const namespaceScope = createScope(scope, 'block', node.body ?? []);
			for (const statement of node.body ?? []) walk(statement, namespaceScope, region, effect);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		switch (node.type) {
			case 'ImportDeclaration':
			case 'JSXIdentifier':
			case 'Literal':
				return;
			case 'Identifier': {
				useBinding(node.name, scope, region, effect, event);
				return;
			}
			case 'ExportNamedDeclaration':
			case 'ExportDefaultDeclaration':
				walk(node.declaration, scope, region, effect);
				return;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression': {
				const previousHandler = activeHandler;
				const declared =
					node.type === 'FunctionDeclaration' && node.id?.name
						? resolve(scope, node.id.name)
						: null;
				const ownTemplate = ownsTemplate(node.body, node.id?.name ?? activeHandler?.node.id?.name);
				if (ownTemplate) activeHandler = null;
				else if (declared?.kind === 'locality-handler') activeHandler = declared;
				try {
					const body = node.body;
					// A new component owns its own template; ordinary closures retain the
					// owner's region so inline event callbacks count as local uses.
					const owner =
						ownTemplate || region === null ? templateArm(node, null, 'component') : region;
					const statements =
						body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock' ? body.body : [];
					const functionScope = createScope(scope, 'function', statements, node.params ?? []);
					if (mayHaveHoistedVars) predeclareNestedVars(body, functionScope);
					if (node.id?.name) functionScope.bindings.set(node.id.name, OTHER_BINDING);
					if (ownTemplate || region === null) register(statements, functionScope, owner);
					const parameterScope = createScope(scope, 'function', [], node.params ?? []);
					for (const parameter of node.params ?? []) {
						walkPatternExpressions(parameter, parameterScope, region, effect);
					}
					if (body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock') {
						for (const statement of statements ?? [])
							walk(statement, functionScope, owner, effect, event);
						if (body.render) walk(body.render, functionScope, owner, effect, event);
					} else {
						walk(body, functionScope, owner, effect, event);
					}
					return;
				} finally {
					activeHandler = previousHandler;
				}
			}
			case 'BlockStatement':
				block(node, scope, region, effect, false, event);
				return;
			case 'JSXCodeBlock':
				block(node, scope, templateArm(node, region, '@{} block', true), effect, true, event);
				return;
			case 'CatchClause': {
				const catchScope = createScope(scope, 'block', [], [node.param]);
				walkPatternExpressions(node.param, catchScope, region, effect);
				walk(node.body, catchScope, region, effect);
				return;
			}
			case 'ForStatement': {
				const loopScope = createScope(
					scope,
					'block',
					node.init?.type === 'VariableDeclaration' ? [node.init] : [],
				);
				walk(node.init, loopScope, region, effect);
				walk(node.test, loopScope, region, effect);
				walk(node.update, loopScope, region, effect);
				walk(node.body, loopScope, region, effect);
				return;
			}
			case 'ForInStatement':
			case 'ForOfStatement': {
				walk(node.right, scope, region, effect);
				const loopScope = createScope(
					scope,
					'block',
					node.left?.type === 'VariableDeclaration' ? [node.left] : [],
				);
				walk(node.left, loopScope, region, effect);
				walk(node.body, loopScope, region, effect);
				return;
			}
			case 'SwitchStatement': {
				walk(node.discriminant, scope, region, effect);
				const statements = (node.cases ?? []).flatMap((branch) => branch.consequent ?? []);
				const switchScope = createScope(scope, 'block', statements);
				register(statements, switchScope, region);
				for (const branch of node.cases ?? []) {
					walk(branch.test, switchScope, region, effect);
					for (const statement of branch.consequent ?? []) {
						walk(statement, switchScope, region, effect);
					}
				}
				return;
			}
			case 'StaticBlock': {
				const staticScope = createScope(scope, 'block', node.body ?? []);
				register(node.body, staticScope, region);
				for (const statement of node.body ?? []) walk(statement, staticScope, region, effect);
				return;
			}
			case 'ClassDeclaration':
			case 'ClassExpression': {
				walk(node.superClass, scope, region, effect);
				const classScope = createScope(scope, 'block', [], node.id ? [node.id] : []);
				walk(node.body, classScope, region, effect);
				return;
			}
			case 'MethodDefinition':
			case 'PropertyDefinition':
			case 'AccessorProperty':
				if (node.computed) walk(node.key, scope, region, effect);
				walk(node.value, scope, region, effect);
				return;
			case 'LabeledStatement':
				walk(node.body, scope, region, effect);
				return;
			case 'BreakStatement':
			case 'ContinueStatement':
				return;
			case 'JSXIfExpression':
				conditionalArms(node, scope, region, effect);
				return;
			case 'JSXForExpression': {
				walk(node.right, scope, region, effect);
				const rowScope = createScope(scope, 'function', [node.left]);
				addPatternNames(node.index, rowScope.bindings, OTHER_BINDING);
				for (const declaration of node.left?.declarations ?? []) {
					walkPatternExpressions(declaration.id, rowScope, region, effect);
				}
				walkPatternExpressions(node.index, rowScope, region, effect);
				walk(node.key, rowScope, region, effect);
				arm(node.body, rowScope, region, node, '@for row');
				arm(node.empty, scope, region, node, '@empty arm');
				return;
			}
			case 'JSXSwitchExpression':
				walk(node.discriminant, scope, region, effect);
				for (const branch of node.cases ?? []) {
					walk(branch.test, scope, region, effect);
					const owner = templateArm(
						branch,
						region,
						branch.test == null ? '@default arm' : '@case arm',
					);
					const caseScope = createScope(scope, 'function', branch.consequent ?? []);
					if (mayHaveHoistedVars) predeclareNestedVars(branch.consequent, caseScope);
					register(branch.consequent, caseScope, owner);
					for (const statement of branch.consequent ?? []) walk(statement, caseScope, owner);
				}
				return;
			case 'JSXTryExpression':
				arm(node.block, scope, region, node, '@try arm');
				arm(node.pending, scope, region, node, '@pending arm');
				if (node.handler) {
					const catchScope = createScope(
						scope,
						'block',
						[],
						[node.handler.param, node.handler.resetParam],
					);
					arm(node.handler.body, catchScope, region, node, '@catch arm');
				}
				return;
			case 'VariableDeclaration':
				for (const declaration of node.declarations ?? []) {
					walkPatternExpressions(declaration.id, scope, region, effect);
					const previousHandler = activeHandler;
					const declared =
						declaration.id?.type === 'Identifier' ? resolve(scope, declaration.id.name) : null;
					if (declared?.kind === 'locality-handler' && declared.node === declaration) {
						activeHandler = declared;
					}
					try {
						walk(declaration.init, scope, region, effect);
					} finally {
						activeHandler = previousHandler;
					}
				}
				return;
			case 'Property':
				if (node.computed) walk(node.key, scope, region, effect);
				walk(node.value, scope, region, effect);
				return;
			case 'MemberExpression':
				walk(node.object, scope, region, effect);
				if (node.computed) walk(node.property, scope, region, effect);
				return;
			case 'JSXElement': {
				const name = node.openingElement?.name;
				if (name?.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)) {
					for (const attribute of node.openingElement.attributes ?? []) {
						if (attribute.type === 'JSXAttribute') hostAttributes.add(attribute);
					}
				}
				walk(node.openingElement, scope, region, effect);
				walk(node.children, scope, region, effect);
				return;
			}
			case 'JSXOpeningElement': {
				let tag = node.name;
				const member = tag?.type === 'JSXMemberExpression';
				while (tag?.type === 'JSXMemberExpression') tag = tag.object;
				if (tag?.type === 'JSXIdentifier' && (member || /^[A-Z]/.test(tag.name))) {
					const binding = resolve(scope, tag.name);
					if (!member && binding?.kind === 'locality-handler') componentHandlers.add(binding);
					useBinding(tag.name, scope, region, effect, null);
				}
				walk(node.attributes, scope, region, effect);
				return;
			}
			case 'JSXAttribute': {
				const name = node.name?.name;
				const expression = unwrap(node.value?.expression);
				const attribute =
					hostAttributes.has(node) &&
					typeof name === 'string' &&
					/^on[A-Z]/.test(name) &&
					(expression?.type === 'Identifier' || FUNCTION_TYPES.has(expression?.type))
						? node
						: null;
				walk(node.value, scope, region, effect, attribute);
				return;
			}
			case 'CallExpression': {
				const localEffect = effectByCall.get(node) ?? effect;
				const previousDerived = activeDerivedValue;
				activeDerivedValue = valueByCall.get(node) ?? previousDerived;
				try {
					walk(node.callee, scope, region, localEffect, event);
					walk(node.arguments, scope, region, localEffect, event);
				} finally {
					activeDerivedValue = previousDerived;
				}
				return;
			}
			case 'MetaProperty':
				return;
		}
		for (const key in node) {
			if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) {
				walk(node[key], scope, region, effect, event);
			}
		}
	}

	for (const statement of ast.body ?? []) walk(statement, moduleScope, null);

	function within(region, ancestor) {
		for (let current = region; current !== null; current = current.parent) {
			if (current === ancestor) return true;
		}
		return false;
	}

	// A hook, the callbacks that capture it, and effects that observe it must
	// agree on one owner. Grouping these dependencies once avoids repeatedly
	// recalculating every owner for a chain of effects.
	const nodes = [...values, ...effects, ...handlers];
	const edges = new Map(nodes.map((node) => [node, new Set()]));
	const directUses = new Map(nodes.map((node) => [node, []]));
	function connect(left, right) {
		if (left === right || !edges.has(left) || !edges.has(right)) return;
		edges.get(left).add(right);
		edges.get(right).add(left);
	}
	for (const value of values) {
		for (const use of value.uses) {
			if (use?.viaHandler) connect(value, use.viaHandler);
			else directUses.get(value).push(use?.region ?? use);
		}
		for (const dependency of value.dependencies) connect(value, dependency);
		for (const helper of value.helpers) connect(value, helper);
	}
	for (const effect of effects) {
		for (const dependency of effect.dependencies) connect(effect, dependency);
		for (const helper of effect.helpers) connect(effect, helper);
		// An effect already declared in a nested block uses its dependencies
		// there. A parent effect can instead move with its dependencies.
		if (effect.region?.sameLifetime) directUses.get(effect).push(effect.region);
	}
	for (const handler of handlers) {
		for (const use of handler.uses) {
			if (use.viaHandler) connect(handler, use.viaHandler);
			else if (use.viaDerived) connect(handler, use.viaDerived);
			else if (use.effect) connect(handler, use.effect);
			else directUses.get(handler).push(use.region);
		}
		if (handler.uses.length === 0 || componentHandlers.has(handler)) {
			directUses.get(handler).push(handler.region);
		}
	}

	function commonAncestor(left, right) {
		for (let current = left; current !== null; current = current.parent) {
			if (within(right, current)) return current;
		}
		return null;
	}

	function canMoveInto(owner, declarationRegion) {
		for (let current = owner; current !== null; current = current.parent) {
			if (current === declarationRegion) return true;
			// A directive arm or keyed row changes hook lifetime. Only a
			// nested @{} block within the same lifetime can own this value.
			if (!current.sameLifetime) return false;
		}
		return false;
	}

	const visited = new Set();
	for (const node of nodes) {
		if (visited.has(node)) continue;
		const group = [];
		const pending = [node];
		visited.add(node);
		while (pending.length > 0) {
			const member = pending.pop();
			group.push(member);
			for (const neighbor of edges.get(member)) {
				if (visited.has(neighbor)) continue;
				visited.add(neighbor);
				pending.push(neighbor);
			}
		}
		let common;
		for (const member of group) {
			for (const use of directUses.get(member)) {
				common = common === undefined ? use : commonAncestor(common, use);
			}
		}
		if (common == null) continue;
		let owner = common;
		while (owner !== null && !group.every((member) => canMoveInto(owner, member.region))) {
			owner = owner.parent;
		}
		if (owner === null) continue;
		// A rewritten function declaration is not a stable capture of the hook
		// values seen in its original body. Check this only for candidate moves,
		// leaving the expensive reassignment scan lazy on ordinary modules.
		if (
			group.some(
				(member) =>
					member.kind === 'locality-handler' &&
					member.region !== owner &&
					member.node.type === 'FunctionDeclaration' &&
					isReassigned(member.node.id),
			)
		)
			continue;

		const toMove = group.filter(
			(member) => member.kind === 'locality-handler' && member.region !== owner,
		);
		const names = toMove
			.slice(0, 3)
			.map((helper) => helper.node.id?.name)
			.filter(Boolean);
		const helperText =
			toMove.length === 0
				? ''
				: ` and ${toMove.length === 1 ? 'its helper' : 'its helpers'} ${names.join(', ')}${toMove.length > 3 ? ` and ${toMove.length - 3} more` : ''}`;
		for (const member of group) {
			if (member.region === owner) continue;
			if (member.kind === 'locality-value') {
				diagnostics.push(
					diagnostic(
						STRONG_HOOK_LOCALITY,
						filename,
						member.node,
						`Move ${member.hook}${helperText} into the ${owner.label} at line ${owner.node.loc?.start?.line ?? 1}, before the JSX or local effect that uses its value.`,
					),
				);
			} else if (
				member.kind !== 'locality-handler' &&
				(member.dependencies.size > 0 || member.helpers.size > 0)
			) {
				diagnostics.push(
					diagnostic(
						STRONG_HOOK_LOCALITY,
						filename,
						member.node,
						`Move ${member.hook} into the ${owner.label} at line ${owner.node.loc?.start?.line ?? 1}, beside the local hook values it reads and before that scope's JSX output.`,
					),
				);
			}
		}
	}
	// A callback may safely move beside its sole event even when a hook it
	// captures is also consumed by the parent or by a sibling block. Determine
	// handler placement from handler uses separately from hook ownership.
	function handlerUseRegions(handler) {
		const regions = [];
		const seen = new Set();
		const pending = [handler];
		while (pending.length > 0) {
			const current = pending.pop();
			if (seen.has(current)) continue;
			seen.add(current);
			if (componentHandlers.has(current) || current.uses.length === 0) {
				regions.push(current.region);
				continue;
			}
			for (const use of current.uses) {
				if (use.viaHandler) pending.push(use.viaHandler);
				else if (use.viaDerived) regions.push(current.region);
				else regions.push(use.region);
			}
		}
		return regions;
	}
	for (const handler of handlers) {
		if (!handler.uses.some((use) => use.event != null)) continue;
		const uses = handlerUseRegions(handler);
		let common = uses[0];
		for (let index = 1; common != null && index < uses.length; index++) {
			common = commonAncestor(common, uses[index]);
		}
		let owner = common;
		while (owner !== null && !canMoveInto(owner, handler.region)) owner = owner.parent;
		if (owner == null || owner === handler.region) continue;
		if (handler.node.type === 'FunctionDeclaration' && isReassigned(handler.node.id)) continue;
		const name = handler.node.id?.name;
		const inlineAlternative =
			handler.uses.length === 1
				? ' Alternatively, define the callback inline at that event attribute.'
				: '';
		diagnostics.push(
			diagnostic(
				STRONG_EVENT_HANDLER_LOCALITY,
				filename,
				handler.node,
				`Move the ${name ?? 'event'} handler into the ${owner.label} at line ${owner.node.loc?.start?.line ?? 1}, before the JSX event attribute that uses it.${inlineAlternative}`,
			),
		);
	}
	return diagnostics;
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

	let reassignedBindings;
	function isReassigned(identifier) {
		reassignedBindings ??= collectReassignedBindings(ast);
		return reassignedBindings.has(identifier);
	}
	const moduleScope = createScope(null, 'module', ast.body ?? [], [], isReassigned);
	const activeCallbacks = new Set();
	const activeReturnCallbacks = new Set();
	const callResults = new WeakMap();
	const reportedDiagnostics = new WeakMap();
	const hoistedVarNames = new WeakMap();
	const mayHaveHoistedVars = source.includes('var');
	const renderRoots = new WeakSet();
	let hasNestedCodeBlock = false;
	const renderOutputs = new WeakMap();
	function hasRenderOutput(fn) {
		if (!FUNCTION_TYPES.has(fn?.type)) return false;
		const known = renderOutputs.get(fn);
		if (known !== undefined) return known;
		function containsJsx(value) {
			if (value == null || typeof value !== 'object') return false;
			if (Array.isArray(value)) return value.some(containsJsx);
			if (
				FUNCTION_TYPES.has(value.type) ||
				value.type === 'ClassDeclaration' ||
				value.type === 'ClassExpression'
			) {
				return false;
			}
			if (
				value.type === 'JSXCodeBlock' ||
				value.type === 'JSXElement' ||
				value.type === 'JSXFragment'
			) {
				return true;
			}
			for (const key in value) {
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane') && containsJsx(value[key]))
					return true;
			}
			return false;
		}
		const result = containsJsx(fn.body);
		renderOutputs.set(fn, result);
		return result;
	}
	function addNamedRenderRoot(fn, name) {
		if (
			FUNCTION_TYPES.has(fn?.type) &&
			(/^(?:unstable_)?use[A-Z0-9]/.test(name) || (/^[A-Z]/.test(name) && hasRenderOutput(fn)))
		) {
			renderRoots.add(fn);
		}
	}
	for (const statement of ast.body ?? []) {
		const declaration = declarationOf(statement);
		if (declaration?.type === 'VariableDeclaration') {
			for (const binding of declaration.declarations ?? []) {
				if (binding.id?.type === 'Identifier') {
					addNamedRenderRoot(unwrap(binding.init), binding.id.name);
				}
			}
		} else {
			addNamedRenderRoot(declaration, declaration?.id?.name ?? '');
			if (statement.type === 'ExportDefaultDeclaration' && hasRenderOutput(declaration)) {
				renderRoots.add(declaration);
			}
		}
	}
	let returnCycles = 0;
	let currentFunctionIsAsync = false;
	let currentFunctionChecksImpureCalls = false;
	let currentRetainedRowScope = null;

	function predeclareHoistedVars(node, scope) {
		if (!mayHaveHoistedVars || node == null) return;
		let names = hoistedVarNames.get(node);
		if (names === undefined) {
			names = new Map();
			function collect(value, root = true) {
				if (value == null || typeof value !== 'object') return;
				if (Array.isArray(value)) {
					for (const child of value) collect(child, false);
					return;
				}
				if (
					FUNCTION_TYPES.has(value.type) ||
					(!root && value.type === 'JSXCodeBlock') ||
					value.type === 'JSXIfExpression' ||
					value.type === 'JSXForExpression' ||
					value.type === 'JSXSwitchExpression' ||
					value.type === 'JSXTryExpression' ||
					value.type === 'ClassDeclaration' ||
					value.type === 'ClassExpression' ||
					value.type === 'StaticBlock' ||
					(value.type?.startsWith('TS') && !TRANSPARENT_EXPRESSIONS.has(value.type))
				) {
					return;
				}
				if (value.type === 'VariableDeclaration' && value.kind === 'var') {
					for (const declaration of value.declarations ?? []) {
						addPatternNames(declaration.id, names, OTHER_BINDING);
					}
				}
				for (const key in value) {
					if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) collect(value[key], false);
				}
			}
			collect(node);
			hoistedVarNames.set(node, names);
		}
		for (const name of names.keys()) {
			if (!scope.bindings.has(name)) scope.bindings.set(name, OTHER_BINDING);
		}
	}
	predeclareHoistedVars(ast, moduleScope);

	function report(code, node, message, suggestions = []) {
		let codes = reportedDiagnostics.get(node);
		if (codes?.has(code)) return;
		if (codes === undefined) reportedDiagnostics.set(node, (codes = new Set()));
		codes.add(code);
		diagnostics.push(diagnostic(code, filename, node, message, suggestions));
	}

	function reportSetter(node, phase) {
		const effect = phase === 'effect';
		const code = effect ? STRONG_EFFECT_STATE_UPDATE : STRONG_RENDER_STATE_UPDATE;
		const message = effect
			? 'Strong mode does not allow synchronous state updates inside effect setup. Derive the value during render or use useLinkedState when state follows another value.'
			: 'Strong mode does not allow state updates during render. Use useLinkedState when state needs to reset or change with another value.';
		report(code, node, message, [{ hook: 'useLinkedState' }]);
	}

	function reportRef(node) {
		report(
			STRONG_RENDER_REF_WRITE,
			node,
			'Strong mode does not allow writing to useRef.current during render. Move the write to an event or effect, or express the value as state.',
		);
	}

	function reportSnapshotMutation(node) {
		report(
			STRONG_RENDER_SNAPSHOT_MUTATION,
			node,
			'Strong mode does not allow mutating a state snapshot during render. Derive a local copy, or pass a new value to the state updater from an event.',
		);
	}

	function reportSnapshotWrite(target, scope) {
		const member = unwrap(target);
		if (member?.type === 'MemberExpression' && snapshotBinding(member.object, scope) !== null) {
			reportSnapshotMutation(member);
		}
	}

	function reportRetainedRowMutation(target, scope) {
		if (currentRetainedRowScope === null) return;
		const identifiers = [];
		function collectWriteRoots(value) {
			const node = unwrap(value);
			if (node?.type === 'Identifier') {
				identifiers.push(node);
			} else if (node?.type === 'MemberExpression') {
				collectWriteRoots(node.object);
			} else if (node?.type === 'AssignmentPattern') {
				collectWriteRoots(node.left);
			} else if (node?.type === 'ArrayPattern') {
				for (const element of node.elements ?? []) collectWriteRoots(element);
			} else if (node?.type === 'ObjectPattern') {
				for (const property of node.properties ?? []) {
					collectWriteRoots(property.argument ?? property.value);
				}
			} else if (node?.type === 'RestElement' || node?.type === 'TSParameterProperty') {
				collectWriteRoots(node.argument ?? node.parameter);
			}
		}
		collectWriteRoots(target);
		for (const identifier of identifiers) {
			const owner = resolveScope(scope, identifier.name);
			for (let outer = currentRetainedRowScope.parent; outer; outer = outer.parent) {
				if (owner !== outer) continue;
				report(
					STRONG_RETAINED_ROW_MUTATION,
					identifier,
					'Strong mode does not allow a keyed @for row to mutate a binding declared outside that row. Build mutable data before the @for, or derive each row only from its item and witnessed snapshots.',
				);
				return;
			}
		}
	}

	function reportImpureCall(node) {
		report(
			STRONG_RENDER_IMPURE_CALL,
			node,
			'Strong mode does not allow nondeterministic calls during render. Read time or randomness outside render and pass the result as a prop or state snapshot.',
		);
	}

	function unshadowedGlobal(node, scope, name) {
		const value = unwrap(node);
		return value?.type === 'Identifier' && value.name === name && resolve(scope, name) === null;
	}

	function impureStandardCall(callee, scope) {
		if (unshadowedGlobal(callee, scope, 'Date')) return true;
		if (callee?.type !== 'MemberExpression') return false;
		const object = unwrap(callee.object);
		if (
			object?.type !== 'Identifier' ||
			(object.name !== 'Date' && object.name !== 'Math' && object.name !== 'performance') ||
			resolve(scope, object.name) !== null
		) {
			return false;
		}
		const property = callee.computed
			? staticPrimitiveValue(callee.property, scope)
			: callee.property?.name;
		return object.name === 'Math' ? property === 'random' : property === 'now';
	}

	function reportEffectEventCall(node) {
		report(
			STRONG_RENDER_EFFECT_EVENT_CALL,
			node,
			'Strong mode does not allow calling an Effect Event during render. Call it from an effect or a later event or subscription callback.',
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
				statement.type === 'ReturnStatement' ||
				statement.type === 'ThrowStatement' ||
				statement.type === 'BreakStatement' ||
				statement.type === 'ContinueStatement'
			) {
				break;
			}
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

	function createFunctionScope(node, parentScope, args = null) {
		const body = node.body;
		const statements =
			body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock' ? body.body : [];
		const scope = createScope(parentScope, 'function', statements, node.params ?? []);
		predeclareHoistedVars(body, scope);
		if (node.type === 'FunctionExpression' && node.id?.name && !scope.bindings.has(node.id.name)) {
			scope.bindings.set(node.id.name, { kind: 'callback', node, scope: parentScope });
		}
		if (args !== null) {
			for (let index = 0; index < (node.params?.length ?? 0); index++) {
				const parameter = node.params[index];
				if (parameter.type === 'Identifier' && !isReassigned(parameter)) {
					scope.bindings.set(parameter.name, args[index] ?? UNDEFINED_BINDING);
				}
			}
		}
		return scope;
	}

	function definitelyDefined(value) {
		if (value?.kind === 'constant' && value.primitive !== UNKNOWN_PRIMITIVE) {
			return value.primitive !== undefined;
		}
		if (isCallableValue(value)) return (callableTruthiness(value) & UNDEFINED_VALUE) === 0;
		return (
			value?.kind === 'ref' ||
			value?.kind === 'state-tuple' ||
			(value?.kind === 'constant' && (value.value & UNDEFINED_VALUE) === 0)
		);
	}

	function visitParameters(node, parentScope, phase, args) {
		const parameters = node.params ?? [];
		const parameterScope = createScope(parentScope, 'function', [], parameters);
		if (
			node.type === 'FunctionExpression' &&
			node.id?.name &&
			!parameterScope.bindings.has(node.id.name)
		) {
			parameterScope.bindings.set(node.id.name, { kind: 'callback', node, scope: parentScope });
		}
		for (let index = 0; index < parameters.length; index++) {
			let parameter = parameters[index];
			if (parameter.type === 'TSParameterProperty') parameter = parameter.parameter;
			let value = args === null ? OTHER_BINDING : (args[index] ?? UNDEFINED_BINDING);
			if (parameter.type === 'AssignmentPattern') {
				visitPatternExpressions(parameter.left, parameterScope, phase);
				if (!definitelyDefined(value)) visit(parameter.right, parameterScope, phase);
				value =
					value.kind === 'constant' && value.primitive === undefined
						? expressionBinding(parameter.right, parameterScope)
						: definitelyDefined(value)
							? value
							: OTHER_BINDING;
				parameter = parameter.left;
			} else {
				visitPatternExpressions(parameter, parameterScope, phase);
			}
			if (parameter.type === 'Identifier' && !isReassigned(parameter)) {
				parameterScope.bindings.set(parameter.name, value);
			}
		}
		return parameterScope;
	}

	function visitFunction(node, parentScope, phase, args = null) {
		const enclosingFunctionIsAsync = currentFunctionIsAsync;
		const enclosingFunctionChecksImpureCalls = currentFunctionChecksImpureCalls;
		currentFunctionIsAsync = node.async === true;
		if (phase === 'render' && !activeCallbacks.has(node)) {
			// Ordinary module helpers may be used only by events. Check their
			// standard calls when a known render root invokes them synchronously.
			currentFunctionChecksImpureCalls =
				renderRoots.has(node) || node.body?.type === 'JSXCodeBlock';
		}
		try {
			const body = node.body;
			let functionScope;
			if ((node.params ?? []).every((parameter) => parameter.type === 'Identifier')) {
				functionScope = createFunctionScope(node, parentScope, args);
			} else {
				// Defaults run before the body environment exists. In particular,
				// body var/function declarations cannot shadow an outer default read.
				const parameterScope = visitParameters(node, parentScope, phase, args);
				functionScope = createScope(parameterScope, 'function');
				const names = new Map();
				for (const parameter of node.params ?? []) addPatternNames(parameter, names, OTHER_BINDING);
				for (const name of names.keys()) {
					functionScope.bindings.set(name, parameterScope.bindings.get(name));
				}
				if (body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock') {
					predeclareStatements(body.body, functionScope);
				}
				predeclareHoistedVars(body, functionScope);
			}
			if (body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock') {
				const executionPhase = visitStatements(body.body, functionScope, phase);
				if (body.render) visit(body.render, functionScope, executionPhase);
			} else {
				visit(body, functionScope, phase);
			}
		} finally {
			currentFunctionIsAsync = enclosingFunctionIsAsync;
			currentFunctionChecksImpureCalls = enclosingFunctionChecksImpureCalls;
		}
	}

	function visitPatternExpressions(pattern, scope, phase) {
		let executionPhase = phase;
		if (pattern?.type === 'TSParameterProperty') {
			return visitPatternExpressions(pattern.parameter, scope, phase);
		} else if (pattern?.type === 'Identifier') {
			if (executionPhase === 'render') reportRetainedRowMutation(pattern, scope);
		} else if (pattern?.type === 'AssignmentPattern') {
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
		} else if (pattern?.type === 'MemberExpression') {
			visit(pattern, scope, executionPhase);
			executionPhase = phaseAfter(pattern, executionPhase, true);
			if (executionPhase === 'render') {
				reportSnapshotWrite(pattern, scope);
				reportRetainedRowMutation(pattern, scope);
			}
		}
		return executionPhase;
	}

	function bindDeclarationValue(declaration, declarationKind, scope) {
		const target = declarationScope(scope, declarationKind);
		const initial = unwrap(declaration.init);
		function bind(identifier, value) {
			if (identifier?.type !== 'Identifier') return;
			target.bindings.set(
				identifier.name,
				declarationKind === 'const' || !isReassigned(identifier) ? value : OTHER_BINDING,
			);
		}
		const stateTuple = stateTupleBinding(initial, scope);
		const snapshot =
			stateTuple === null && declarationKind === 'const' ? snapshotBinding(initial, scope) : null;
		if (declaration.id?.type === 'ArrayPattern' && stateTuple) {
			bindSnapshotPattern(declaration.id.elements?.[0], stateTuple.snapshot, bind);
			const element = declaration.id.elements?.[1];
			const setter = element?.type === 'AssignmentPattern' ? element.left : element;
			bind(setter, { kind: 'setter' });
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
					bind(setter, { kind: 'setter' });
				} else if (key === 0 || key === '0') {
					bindSnapshotPattern(value, stateTuple.snapshot, bind);
				}
			}
		} else if (declaration.id?.type === 'Identifier') {
			if (stateTuple) {
				bind(declaration.id, stateTuple);
			} else if (
				initial?.type === 'CallExpression' &&
				importedHook(initial.callee, scope) === 'useRef'
			) {
				bind(declaration.id, { kind: 'ref' });
			} else if (declarationKind === 'const' && stateTupleUpdater(initial, scope)) {
				target.bindings.set(declaration.id.name, { kind: 'setter' });
			} else if (snapshot !== null) {
				target.bindings.set(declaration.id.name, snapshot);
			} else if (declarationKind === 'const' && initial?.type === 'Identifier') {
				const value = resolve(scope, initial.name);
				if (
					value?.kind === 'setter' ||
					value?.kind === 'ref' ||
					value?.kind === 'callback' ||
					value?.kind === 'callback-choice' ||
					value?.kind === 'effect-event' ||
					value?.kind === 'linked-options' ||
					value?.kind === 'linked-key' ||
					value?.kind === 'constant'
				) {
					target.bindings.set(declaration.id.name, value);
				} else if (value == null && initial.name === 'undefined') {
					target.bindings.set(declaration.id.name, UNDEFINED_BINDING);
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
			} else if (declarationKind === 'const') {
				const result = returnedExpression(initial, scope);
				if (result.callback !== null) {
					target.bindings.set(declaration.id.name, result.callback);
					return;
				}
				const primitive = result.primitive;
				let value = result.value;
				if (value === UNKNOWN_VALUE && primitive !== UNKNOWN_PRIMITIVE) {
					value = primitiveValueMask(primitive);
				}
				if (value !== UNKNOWN_VALUE) {
					target.bindings.set(declaration.id.name, {
						kind: 'constant',
						value,
						primitive,
					});
				}
			}
		} else if (snapshot !== null) {
			bindSnapshotPattern(declaration.id, snapshot, bind);
		}
	}

	function stateTupleBinding(expression, scope) {
		const node = unwrap(expression);
		if (node?.type === 'Identifier') {
			const binding = resolve(scope, node.name);
			return binding?.kind === 'state-tuple' ? binding : null;
		}
		if (node?.type !== 'CallExpression') return null;
		const hook = importedHook(node.callee, scope);
		if (!STATE_HOOKS.has(hook)) return null;
		// A known array initializer is a narrow mutator check, not a judgment
		// about arbitrary methods on object snapshots or opaque hook outputs.
		return hook === 'useState' && unwrap(node.arguments?.[0])?.type === 'ArrayExpression'
			? ARRAY_STATE_TUPLE_BINDING
			: STATE_TUPLE_BINDING;
	}

	function snapshotBinding(expression, scope) {
		const node = unwrap(expression);
		if (node?.type === 'Identifier') {
			const binding = resolve(scope, node.name);
			return binding?.kind === 'snapshot' ? binding : null;
		}
		if (node?.type !== 'MemberExpression') return null;
		const tuple = stateTupleBinding(node.object, scope);
		if (tuple !== null && node.computed === true) {
			const key = staticPrimitiveValue(node.property, scope);
			if (key === 0 || key === '0') return tuple.snapshot;
		}
		return snapshotBinding(node.object, scope) !== null ? SNAPSHOT_BINDING : null;
	}

	function bindDeclaration(declaration, declarationKind, scope, phase) {
		bindDeclarationValue(declaration, declarationKind, scope);
		visit(declaration.init, scope, phase);
		return visitPatternExpressions(declaration.id, scope, phaseAfter(declaration.init, phase));
	}

	function visitCallback(node, parentScope, phase, args = null) {
		// Calling a generator creates an iterator; its body has not run yet.
		if (node.generator === true || activeCallbacks.has(node)) return;
		activeCallbacks.add(node);
		try {
			visitFunction(node, parentScope, phase, args);
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
		if (expression?.type === 'CallExpression') {
			const result = callResult(expression, scope);
			return result === null ? UNKNOWN_PRIMITIVE : result.primitive;
		}
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
		if (expression?.type === 'CallExpression') {
			return callResult(expression, scope)?.value ?? UNKNOWN_VALUE;
		}
		if (expression?.type === 'Literal') {
			return primitiveValueMask(expression.value);
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
			return primitive === UNKNOWN_PRIMITIVE ? UNKNOWN_VALUE : primitiveValueMask(primitive);
		} else if (expression?.type === 'Identifier') {
			const binding = resolve(scope, expression.name);
			if (binding == null && expression.name === 'undefined') return UNDEFINED_VALUE;
			if (binding?.kind === 'constant') return binding.value;
			if (
				binding?.kind === 'callback' ||
				binding?.kind === 'effect-event' ||
				binding?.kind === 'setter' ||
				binding?.kind === 'ref' ||
				binding?.kind === 'state-tuple' ||
				binding?.kind === 'linked-key' ||
				binding?.kind === 'hook' ||
				binding?.kind === 'namespace'
			) {
				return TRUTHY_VALUE;
			}
			if (binding?.kind === 'callback-choice') return binding.value;
			if (binding?.kind === 'linked-options') {
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
			return UNDEFINED_VALUE;
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

	function isCallableValue(value) {
		return (
			value?.kind === 'callback' ||
			value?.kind === 'callback-choice' ||
			value?.kind === 'effect-event' ||
			value?.kind === 'setter'
		);
	}

	function callableTruthiness(value) {
		return value?.kind === 'callback-choice' ? value.value : TRUTHY_VALUE;
	}

	function callableChoice(values, value, complete) {
		// Keep the truthiness of non-callable alternatives too. `complete` says
		// there is no unknown callable alternative, which matters when this value
		// is itself invoked as a factory and we inspect its return value.
		const callbacks = [];
		const seen = new Set();
		const functions = new Map();
		function add(callback) {
			if (callback === null) return;
			if (callback.kind === 'callback-choice') {
				for (const child of callback.values) add(child);
				return;
			}
			if (callback.kind === 'callback') {
				let scopes = functions.get(callback.node);
				if (scopes?.has(callback.scope)) return;
				if (scopes === undefined) functions.set(callback.node, (scopes = new Set()));
				scopes.add(callback.scope);
			} else {
				const identity = callback.kind === 'setter' ? 'setter' : callback;
				if (seen.has(identity)) return;
				seen.add(identity);
			}
			callbacks.push(callback);
		}
		for (const callback of values) add(callback);
		if (callbacks.length === 0) return null;
		if (callbacks.length === 1 && value === TRUTHY_VALUE && complete) return callbacks[0];
		return { kind: 'callback-choice', values: callbacks, value, complete };
	}

	function knownNonCallable(expression, scope) {
		const node = unwrap(expression);
		return (
			staticPrimitiveValue(node, scope) !== UNKNOWN_PRIMITIVE ||
			node?.type === 'ObjectExpression' ||
			node?.type === 'ArrayExpression' ||
			node?.type === 'ClassExpression' ||
			(node?.type === 'Identifier' &&
				(resolve(scope, node.name)?.kind === 'ref' ||
					resolve(scope, node.name)?.kind === 'state-tuple'))
		);
	}

	function returnedExpression(expression, scope) {
		const node = unwrap(expression);
		if (node?.type === 'CallExpression') {
			const result = callResult(node, scope);
			if (result !== null) return result;
			return {
				callback: null,
				value: UNKNOWN_VALUE,
				primitive: UNKNOWN_PRIMITIVE,
				complete: false,
			};
		}
		const callback = callableValue(expression, scope);
		return {
			callback,
			value:
				expression == null
					? UNDEFINED_VALUE
					: callback === null
						? staticExpressionValue(expression, scope)
						: callableTruthiness(callback),
			primitive: expression == null ? undefined : staticPrimitiveValue(expression, scope),
			complete:
				callback === null
					? expression == null || knownNonCallable(expression, scope)
					: callback.kind !== 'callback-choice' || callback.complete,
		};
	}

	// Values and execution are separate. In particular, useMemo executes its
	// factory now, but a function returned by that factory is only a value.
	function callableValue(expression, scope) {
		const node = unwrap(expression);
		if (FUNCTION_TYPES.has(node?.type)) return { kind: 'callback', node, scope };
		if (node?.type === 'Identifier') {
			const binding = resolve(scope, node.name);
			return isCallableValue(binding) ? binding : null;
		}
		if (stateTupleUpdater(node, scope)) return { kind: 'setter' };
		if (node?.type === 'SequenceExpression') {
			return callableValue(node.expressions?.[node.expressions.length - 1], scope);
		}
		if (node?.type === 'ConditionalExpression' || node?.type === 'LogicalExpression') {
			const logical = node.type === 'LogicalExpression';
			const branches = logical
				? logicalExpressionBranches(node, scope)
				: conditionalExpressionBranches(node, scope);
			const values = [];
			if ((branches & 1) !== 0) {
				values.push(
					logical && node.operator === '&&'
						? { callback: null, complete: true }
						: returnedExpression(logical ? node.left : node.consequent, scope),
				);
			}
			if ((branches & 2) !== 0) {
				values.push(returnedExpression(logical ? node.right : node.alternate, scope));
			}
			return callableChoice(
				values.map((value) => value.callback),
				staticExpressionValue(node, scope),
				values.every((value) => value.complete),
			);
		}
		return node?.type === 'CallExpression' ? (callResult(node, scope)?.callback ?? null) : null;
	}

	function optionalCallCanSkip(node, scope) {
		let current = node;
		while (current != null) {
			if (current.type === 'ChainExpression') return false;
			if (TRANSPARENT_EXPRESSIONS.has(current.type)) {
				current = current.expression;
				continue;
			}
			if (current.type !== 'CallExpression' && current.type !== 'MemberExpression') return false;
			const target = current.type === 'CallExpression' ? current.callee : current.object;
			if (
				current.optional === true &&
				(staticExpressionValue(target, scope) & NULLISH_VALUE) !== 0
			) {
				return true;
			}
			current = target;
		}
		return false;
	}

	function callResult(node, scope) {
		const revision = scopeRevision(scope);
		let cached = callResults.get(scope);
		const previous = cached?.get(node);
		if (previous?.revision === revision) return previous.result;
		const cycles = returnCycles;
		const result = resolveCallResult(node, scope);
		// A call result belongs to this source call and lexical activation, not
		// merely its function AST. Ancestor bindings can become known later in a
		// statement list; a shared monotonic clock invalidates exactly those
		// results without invalidating callers when a new child scope is built.
		if (cycles === returnCycles && revision === scopeRevision(scope)) {
			if (cached === undefined) callResults.set(scope, (cached = new WeakMap()));
			cached.set(node, { revision, result });
		}
		return result;
	}

	function resolveCallResult(node, scope) {
		const hook = importedHook(node.callee, scope);
		let result;
		if (hook === 'useCallback') {
			result = returnedExpression(node.arguments?.[0], scope);
		} else if (hook === 'useEffectEvent') {
			result = {
				callback: { kind: 'effect-event', callback: callableValue(node.arguments?.[0], scope) },
				value: TRUTHY_VALUE,
				primitive: UNKNOWN_PRIMITIVE,
				complete: true,
			};
		} else if (hook === 'useMemo') {
			// Octane's client invokes a memo factory with positional dependencies;
			// SSR does not. Do not invent arguments for a parameterized hook factory.
			result = returnedCallable(callableValue(node.arguments?.[0], scope), null);
		} else {
			if (hook !== null) return null;
			const callback = callableValue(node.callee, scope);
			if (callback === null) return null;
			result = returnedCallable(callback, argumentValues(node.arguments, scope));
		}
		if (result === null) return null;
		if (!optionalCallCanSkip(node, scope)) return result;
		const value = result.value | UNDEFINED_VALUE;
		return {
			callback: callableChoice([result.callback], value, result.complete),
			value,
			primitive: result.primitive === undefined ? undefined : UNKNOWN_PRIMITIVE,
			complete: result.complete,
		};
	}

	function expressionBinding(expression, scope) {
		const node = unwrap(expression);
		if (node?.type === 'Identifier') {
			const binding = resolve(scope, node.name);
			if (
				isCallableValue(binding) ||
				binding?.kind === 'ref' ||
				binding?.kind === 'snapshot' ||
				binding?.kind === 'state-tuple' ||
				binding?.kind === 'constant' ||
				binding?.kind === 'linked-key'
			) {
				return binding;
			}
		}
		const snapshot = snapshotBinding(node, scope);
		if (snapshot !== null) return snapshot;
		const tuple = stateTupleBinding(node, scope);
		if (tuple !== null) return tuple;
		const result = returnedExpression(node, scope);
		if (result.callback !== null) return result.callback;
		return result.value === UNKNOWN_VALUE && result.primitive === UNKNOWN_PRIMITIVE
			? OTHER_BINDING
			: { kind: 'constant', primitive: result.primitive, value: result.value };
	}

	function argumentValues(args, scope) {
		if (args?.some((argument) => argument.type === 'SpreadElement')) return null;
		return (args ?? []).map((argument) => expressionBinding(argument, scope));
	}

	function mergePrimitive(left, right) {
		return left === NO_RETURN_VALUE || Object.is(left, right) ? right : UNKNOWN_PRIMITIVE;
	}

	function returnedCallable(value, args) {
		if (value?.kind === 'effect-event') return returnedCallable(value.callback, args);
		if (value?.kind === 'callback-choice') {
			if (!value.complete) return null;
			const results = value.values.map((callback) => returnedCallable(callback, args));
			if (results.some((result) => result === null)) return null;
			const truthiness = results.reduce((mask, result) => mask | result.value, 0);
			const complete = results.every((result) => result.complete);
			return {
				callback: callableChoice(
					results.map((result) => result.callback),
					truthiness,
					complete,
				),
				value: truthiness,
				primitive: results.reduce(
					(primitive, result) => mergePrimitive(primitive, result.primitive),
					NO_RETURN_VALUE,
				),
				complete,
			};
		}
		if (value?.kind !== 'callback') return null;
		const node = value.node;
		if (activeReturnCallbacks.has(node)) {
			returnCycles++;
			return null;
		}
		if (
			node.async === true ||
			node.generator === true ||
			(args === null && (node.params?.length ?? 0) !== 0) ||
			(node.params ?? []).some((parameter) => parameter.type !== 'Identifier')
		) {
			return null;
		}
		activeReturnCallbacks.add(node);
		try {
			// Each call owns its parameter environment. Caching by function AST
			// would conflate make(setState) with make(noop).
			const scope = createFunctionScope(node, value.scope, args);
			if (node.body?.type !== 'BlockStatement') return returnedExpression(node.body, scope);
			const result = factoryReturns(node.body.body, scope);
			if (result === null) return null;
			const truthiness = result.value | (result.fallsThrough ? UNDEFINED_VALUE : 0);
			const primitive = result.fallsThrough
				? mergePrimitive(result.primitive, undefined)
				: result.primitive;
			return {
				callback: callableChoice(result.callbacks, truthiness, result.complete),
				value: truthiness,
				primitive: primitive === NO_RETURN_VALUE ? UNKNOWN_PRIMITIVE : primitive,
				complete: result.complete,
			};
		} finally {
			activeReturnCallbacks.delete(node);
		}
	}

	function factoryReturns(statements, scope) {
		const result = {
			callbacks: [],
			value: 0,
			primitive: NO_RETURN_VALUE,
			complete: true,
			fallsThrough: true,
		};
		function merge(branch) {
			result.callbacks.push(...branch.callbacks);
			result.value |= branch.value;
			if (branch.primitive !== NO_RETURN_VALUE) {
				result.primitive = mergePrimitive(result.primitive, branch.primitive);
			}
			result.complete &&= branch.complete;
		}
		for (const statement of statements ?? []) {
			if (!result.fallsThrough) break;
			switch (statement.type) {
				case 'EmptyStatement':
				case 'FunctionDeclaration':
					break;
				case 'VariableDeclaration':
					if (statement.kind !== 'const') return null;
					for (const declaration of statement.declarations ?? []) {
						bindDeclarationValue(declaration, statement.kind, scope);
					}
					break;
				case 'ReturnStatement': {
					const returned = returnedExpression(statement.argument, scope);
					if (returned.callback !== null) result.callbacks.push(returned.callback);
					result.value |= statement.argument == null ? UNDEFINED_VALUE : returned.value;
					result.primitive = mergePrimitive(result.primitive, returned.primitive);
					result.complete &&= returned.complete;
					result.fallsThrough = false;
					break;
				}
				case 'ThrowStatement':
					result.fallsThrough = false;
					break;
				case 'BlockStatement': {
					const block = createScope(scope, 'block', statement.body);
					const branch = factoryReturns(statement.body, block);
					if (branch === null) return null;
					merge(branch);
					result.fallsThrough = branch.fallsThrough;
					break;
				}
				case 'IfStatement': {
					const branches = conditionalExpressionBranches(statement, scope);
					let fallsThrough = false;
					let exits = false;
					for (const [flag, child] of [
						[1, statement.consequent],
						[2, statement.alternate],
					]) {
						if ((branches & flag) === 0) continue;
						const branch = factoryReturns(child == null ? [] : [child], scope);
						if (branch === null) return null;
						merge(branch);
						fallsThrough ||= branch.fallsThrough;
						exits ||= !branch.fallsThrough;
					}
					// Continuing only one unknown branch requires path predicates in
					// every returned closure. Do not invent an impossible later return.
					if (fallsThrough && exits) return null;
					result.fallsThrough = fallsThrough;
					break;
				}
				case 'ExpressionStatement':
					if (typeof statement.directive === 'string') break;
					return null;
				default:
					// Loops, mutations, and try/finally need a fuller completion model.
					// An unknown result is safer than inventing an overridden return.
					return null;
			}
		}
		return result;
	}

	function visitCallable(value, origin, phase, args = null) {
		if (value?.kind === 'callback') {
			visitCallback(value.node, value.scope, phase, args);
		} else if (value?.kind === 'callback-choice') {
			for (const callback of value.values) visitCallable(callback, origin, phase, args);
		} else if (value?.kind === 'effect-event') {
			if (phase === 'render') reportEffectEventCall(origin);
			else if (phase === 'effect') visitCallable(value.callback, origin, phase, args);
		} else if (value?.kind === 'setter' && (phase === 'render' || phase === 'effect')) {
			reportSetter(origin, phase);
		}
	}

	function visitSynchronousHookCallback(value, scope, phase, stateInitializer = false) {
		const checkImpureCalls = currentFunctionChecksImpureCalls;
		// Lazy state initialization may read a clock or randomness. Keep its
		// existing state/ref/Effect Event checks at the synchronous render phase.
		if (stateInitializer) currentFunctionChecksImpureCalls = false;
		try {
			visitCallable(callableValue(value, scope), unwrap(value), phase);
		} finally {
			currentFunctionChecksImpureCalls = checkImpureCalls;
		}
	}

	function containsEffectEvent(value) {
		return (
			value?.kind === 'effect-event' ||
			(value?.kind === 'callback-choice' && value.values.some(containsEffectEvent))
		);
	}

	function visitExplicitDependencies(value, scope) {
		const node = unwrap(value);
		if (node?.type === 'ArrayExpression') {
			for (const element of node.elements ?? []) {
				if (element?.type === 'SpreadElement') {
					visitExplicitDependencies(element.argument, scope);
				} else if (containsEffectEvent(callableValue(element, scope))) {
					report(
						STRONG_EFFECT_EVENT_DEPENDENCY,
						unwrap(element),
						'Strong mode does not allow Effect Events in explicit hook dependency arrays. Effect Events are non-reactive; remove this dependency.',
					);
				}
			}
		} else if (node?.type === 'SequenceExpression') {
			visitExplicitDependencies(node.expressions?.[node.expressions.length - 1], scope);
		} else if (node?.type === 'ConditionalExpression' || node?.type === 'LogicalExpression') {
			const logical = node.type === 'LogicalExpression';
			const branches = logical
				? logicalExpressionBranches(node, scope)
				: conditionalExpressionBranches(node, scope);
			if ((branches & 1) !== 0)
				visitExplicitDependencies(logical ? node.left : node.consequent, scope);
			if ((branches & 2) !== 0)
				visitExplicitDependencies(logical ? node.right : node.alternate, scope);
		}
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
				if (node.type === 'JSXCodeBlock') hasNestedCodeBlock = true;
				const block = createScope(scope, 'block', node.body ?? []);
				const executionPhase = visitStatements(node.body, block, phase);
				if (node.render) visit(node.render, block, executionPhase);
				return;
			}
			case 'IfStatement': {
				visit(node.test, scope, phase);
				const branchPhase = phaseAfter(node.test, phase);
				const branches = conditionalExpressionBranches(node, scope);
				if ((branches & 1) !== 0) visit(node.consequent, scope, branchPhase);
				if ((branches & 2) !== 0) visit(node.alternate, scope, branchPhase);
				return;
			}
			case 'ConditionalExpression': {
				visit(node.test, scope, phase);
				const branchPhase = phaseAfter(node.test, phase);
				const branches = conditionalExpressionBranches(node, scope);
				if ((branches & 1) !== 0) visit(node.consequent, scope, branchPhase);
				if ((branches & 2) !== 0) visit(node.alternate, scope, branchPhase);
				return;
			}
			case 'LogicalExpression':
				visit(node.left, scope, phase);
				if ((logicalExpressionBranches(node, scope) & 2) !== 0) {
					visit(node.right, scope, phaseAfter(node.left, phase));
				}
				return;
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
				const wrapped =
					hook === 'memo' || hook === 'lazy' ? callableValue(node.arguments?.[0], scope) : null;
				const component =
					wrapped?.kind === 'callback' && (hook === 'memo' || hasRenderOutput(wrapped.node))
						? wrapped
						: null;
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
					if (
						(index !== synchronousCallbackIndex && !(index === 0 && component !== null)) ||
						!FUNCTION_TYPES.has(unwrap(argument)?.type)
					) {
						visit(argument, scope, executionPhase);
					}
					executionPhase = phaseAfter(argument, executionPhase);
				}
				const dependencyIndex =
					hook === 'useImperativeHandle'
						? 2
						: EFFECT_HOOKS.has(hook) || hook === 'useMemo' || hook === 'useCallback'
							? 1
							: -1;
				if (
					dependencyIndex !== -1 &&
					!node.arguments
						?.slice(0, dependencyIndex + 1)
						.some((argument) => argument.type === 'SpreadElement')
				) {
					visitExplicitDependencies(node.arguments?.[dependencyIndex], scope);
				}
				if (EFFECT_HOOKS.has(hook)) {
					visitSynchronousHookCallback(node.arguments?.[0], scope, 'effect');
					return;
				}
				if (hook === 'useState' || hook === 'useMemo') {
					visitSynchronousHookCallback(
						node.arguments?.[0],
						scope,
						executionPhase,
						hook === 'useState',
					);
					return;
				}
				if (hook === 'useReducer') {
					visitSynchronousHookCallback(node.arguments?.[2], scope, executionPhase, true);
					return;
				}
				if (hook === 'useLinkedState') {
					visitSynchronousHookCallback(node.arguments?.[1], scope, executionPhase);
					visitLinkedStateComparators(node.arguments?.[2], scope, executionPhase);
					return;
				}
				if (component !== null) {
					// memo owns a component callback. lazy also accepts a module
					// loader, so require JSX evidence before treating it as a render.
					const checkImpureCalls = currentFunctionChecksImpureCalls;
					currentFunctionChecksImpureCalls = true;
					try {
						visitCallback(component.node, component.scope, 'render');
					} finally {
						currentFunctionChecksImpureCalls = checkImpureCalls;
					}
					return;
				}
				if (executionPhase === 'render') {
					if (currentFunctionChecksImpureCalls && impureStandardCall(callee, scope)) {
						reportImpureCall(callee);
					}
					if (callee?.type === 'MemberExpression') {
						const method = callee.computed
							? staticPrimitiveValue(callee.property, scope)
							: callee.property?.name;
						if (ARRAY_MUTATORS.has(method)) {
							if (snapshotBinding(callee.object, scope)?.array === true) {
								reportSnapshotMutation(callee);
							}
							reportRetainedRowMutation(callee.object, scope);
						}
					}
				}
				if (
					executionPhase === 'render' ||
					executionPhase === 'effect' ||
					FUNCTION_TYPES.has(callee?.type)
				) {
					const callback = callableValue(callee, scope);
					if (callback !== null) {
						visitCallable(
							callback,
							callee,
							executionPhase,
							callback.kind === 'setter' ? null : argumentValues(node.arguments, scope),
						);
					}
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
				if (
					executionPhase === 'render' &&
					currentFunctionChecksImpureCalls &&
					node.arguments?.length === 0 &&
					unshadowedGlobal(callee, scope, 'Date')
				) {
					reportImpureCall(callee);
				}
				if (inlineConstructor) {
					visitCallback(callee, scope, executionPhase, argumentValues(node.arguments, scope));
				} else if (
					(executionPhase === 'render' || executionPhase === 'effect') &&
					binding?.kind === 'callback' &&
					(binding.node.type === 'FunctionExpression' ||
						binding.node.type === 'FunctionDeclaration') &&
					binding.node.async !== true &&
					binding.node.generator !== true
				) {
					visitCallback(
						binding.node,
						binding.scope,
						executionPhase,
						argumentValues(node.arguments, scope),
					);
				}
				return;
			}
			case 'TaggedTemplateExpression': {
				const tag = unwrap(node.tag);
				if (!FUNCTION_TYPES.has(tag?.type)) visit(node.tag, scope, phase);
				const tagPhase = phaseAfter(node.tag, phase, true);
				visit(node.quasi, scope, tagPhase);
				const executionPhase = phaseAfter(node.quasi, tagPhase);
				if (
					executionPhase === 'render' ||
					executionPhase === 'effect' ||
					FUNCTION_TYPES.has(tag?.type)
				) {
					const substitutions = argumentValues(node.quasi?.expressions, scope);
					visitCallable(
						callableValue(tag, scope),
						tag,
						executionPhase,
						substitutions === null
							? null
							: [
									{ kind: 'constant', value: TRUTHY_VALUE, primitive: UNKNOWN_PRIMITIVE },
									...substitutions,
								],
					);
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
				if (executionPhase === 'render') {
					if (currentRef(node.left, scope)) reportRef(node.left);
					reportSnapshotWrite(node.left, scope);
					reportRetainedRowMutation(node.left, scope);
				}
				return;
			}
			case 'UpdateExpression':
				if (phase === 'render' && currentRef(node.argument, scope)) reportRef(node.argument);
				visit(node.argument, scope, phase);
				if (phaseAfter(node.argument, phase, true) === 'render') {
					reportSnapshotWrite(node.argument, scope);
					reportRetainedRowMutation(node.argument, scope);
				}
				return;
			case 'UnaryExpression':
				visit(node.argument, scope, phase);
				if (node.operator === 'delete' && phaseAfter(node.argument, phase, true) === 'render') {
					reportSnapshotWrite(node.argument, scope);
					reportRetainedRowMutation(node.argument, scope);
				}
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
						addPatternNames(declaration.id, target.bindings, binding, node.init.kind !== 'var');
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
			case 'JSXForExpression': {
				visit(node.right, scope, phase);
				const executionPhase =
					currentFunctionIsAsync &&
					phase !== 'deferred' &&
					(alwaysAwaits(node.right) || node.await === true)
						? 'deferred'
						: phase;
				const row = createScope(scope, 'retained-row');
				if (node.left?.type === 'VariableDeclaration') {
					for (const declaration of node.left.declarations ?? []) {
						addPatternNames(declaration.id, row.bindings, OTHER_BINDING);
					}
				}
				addPatternNames(node.index, row.bindings, OTHER_BINDING);
				visit(node.left, row, executionPhase);
				const enclosingRetainedRowScope = currentRetainedRowScope;
				currentRetainedRowScope = row;
				try {
					visit(node.key, row, executionPhase);
					visit(node.body, row, executionPhase);
				} finally {
					currentRetainedRowScope = enclosingRetainedRowScope;
				}
				visit(node.empty, scope, executionPhase);
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
	if (hasNestedCodeBlock) {
		diagnostics.push(...strongLocalityDiagnostics(ast, source, filename, isReassigned));
	}
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
