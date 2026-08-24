/**
 * Experimental Valdi writer backend.
 *
 * This pass owns only template lowering. It emits the same JSXBootstrap writer
 * operations as Valdi's TSX compiler, then gives its JSX-free Program to the
 * existing client finisher for hook slots, inferred dependencies, TypeScript
 * erasure, and the single source-map print. It never enters the DOM planner or
 * constructs a universal renderer tree.
 */
import { builders as b } from '@tsrx/core';
import { parseModule } from '#octane/compiler-parser';
import { createLexicalAnalysis, validateRendererAst } from './compile-universal.js';
import { HOOK_NAMES } from './hook-names.js';
import {
	analyzeRendererBoundaries,
	assertRendererBoundaryAnalysis,
} from './renderer-boundaries.js';

/** Bump when the generated Valdi runtime contract changes. */
export const VALDI_COMPILER_ABI_VERSION = 1;

/** @typedef {'boolean' | 'number' | 'string' | 'function' | 'style'} ValdiWriterEffectiveType */
/**
 * A type-checker fact for one complete authored expression. Offsets are UTF-16
 * code units and `end` is exclusive. Nullish members are represented separately,
 * as in Valdi's own effective-type classification.
 * @typedef {{ start: number, end: number, effectiveType: ValdiWriterEffectiveType, isNullable: boolean }} ValdiWriterExpressionFact
 */
/** @typedef {{ version: 1, expressions: readonly ValdiWriterExpressionFact[] }} ValdiWriterFacts */

const VALDI_WRITER_TYPES = new Set(['boolean', 'number', 'string', 'function', 'style']);
const VALDI_HOOKS = new Set(['useState', 'useCallback', 'useLayoutEffect', 'useMemo', 'useRef']);

export const VALDI_COMPILER_RUNTIME_IMPORTS = new Set([
	...VALDI_HOOKS,
	'__methodDep',
	'__useStateWithGetter',
	'hookSlots',
	'withSlot',
]);

const AST_SKIP_KEYS = new Set([
	'end',
	'loc',
	'metadata',
	'parent',
	'range',
	'start',
	'returnType',
	'typeAnnotation',
	'typeArguments',
	'typeParameters',
]);
const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);
const TRANSPARENT_EXPRESSIONS = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
]);

function valdiError(state, node, message) {
	const start = node?.loc?.start;
	const at = start ? ` at ${state.filename}:${start.line}:${start.column}` : '';
	return new Error(`Octane Valdi compiler: ${message}${at}`);
}

function forEachChild(node, visit) {
	for (const [key, child] of Object.entries(node)) {
		if (!AST_SKIP_KEYS.has(key)) visit(child);
	}
}

function walk(root, visit) {
	const seen = new WeakSet();
	const descend = (node) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) descend(child);
			return;
		}
		if (visit(node) !== false) forEachChild(node, descend);
	};
	descend(root);
}

// Authored subtrees are shared and can be frozen. Only unlocated generated
// spines are rebuilt; every authored expression retains its precise location.
function withOrigin(root, origin) {
	const visit = (node) => {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let output = null;
			for (let index = 0; index < node.length; index++) {
				const child = visit(node[index]);
				if (output === null && child !== node[index]) output = node.slice(0, index);
				if (output !== null) output.push(child);
			}
			return output ?? node;
		}
		let output = null;
		if (typeof node.type === 'string' && node.loc == null && origin?.loc != null) {
			output = b.set_location({ ...node }, origin);
		}
		for (const [key, child] of Object.entries(node)) {
			if (AST_SKIP_KEYS.has(key)) continue;
			const next = visit(child);
			if (next !== child) {
				output ??= { ...node };
				output[key] = next;
			}
		}
		return output ?? node;
	};
	return visit(root);
}

function allocName(state, preferred) {
	let name = preferred;
	while (state.names.has(name)) name += '$';
	state.names.add(name);
	return name;
}

function helper(state, imported) {
	let local = state.helpers.get(imported);
	if (local === undefined) {
		local = allocName(state, `__octaneValdi${imported[0].toUpperCase()}${imported.slice(1)}`);
		state.helpers.set(imported, local);
	}
	return b.id(local);
}

function call(state, imported, args, origin) {
	return withOrigin(b.call(helper(state, imported), ...args), origin);
}

function writerCall(state, method, args, origin) {
	if (state.jsxFacade === null) {
		// Valdi's stock TSX output acquires the stable facade once per module.
		// Keep method lookup/receiver semantics and every other helper import live.
		helper(state, 'jsx');
		state.jsxFacade = allocName(state, '__octaneValdiJsxFacade');
	}
	return withOrigin(b.call(b.member(b.id(state.jsxFacade), method), ...args), origin);
}

function writerStatement(state, method, args, origin) {
	return withOrigin(b.stmt(writerCall(state, method, args, origin)), origin);
}

function unwrap(node) {
	while (TRANSPARENT_EXPRESSIONS.has(node?.type)) node = node.expression;
	return node;
}

function isTemplate(node) {
	return (
		node?.type === 'Element' ||
		node?.type === 'Fragment' ||
		(typeof node?.type === 'string' && node.type.startsWith('JSX'))
	);
}

function assertNoTemplate(node, state, context) {
	walk(node, (child) => {
		if (isTemplate(child) || child.type === 'Tsrx' || child.type === 'Tsx') {
			throw valdiError(state, child, `${context} is not supported by the Valdi writer target.`);
		}
	});
	return node;
}

// Only an actual Octane import (including aliases) or the compiler's unbound
// builtin shorthand is a builtin. A locally bound useEffect/object.useEffect
// is a custom hook by Octane's reserved use[A-Z] convention, not an import of
// the unsupported effect phase.
function importedHookName(node, state) {
	const callee = unwrap(node?.callee);
	if (callee?.type === 'Identifier') {
		const binding = state.lexical.resolveBinding(
			state.lexical.nodeScopes.get(callee) ?? state.lexical.rootScope,
			callee.name,
		);
		if (binding?.scope === state.lexical.rootScope && state.runtimeImports.has(callee.name)) {
			return state.runtimeImports.get(callee.name);
		}
		if (binding === null || binding === undefined) {
			if (HOOK_NAMES.has(callee.name) || callee.name === 'use' || callee.name === 'useContext') {
				return callee.name;
			}
		}
		return null;
	}
	return null;
}

function slotHookName(node, state) {
	const imported = importedHookName(node, state);
	if (imported !== null) return imported;
	const callee = unwrap(node?.callee);
	if (
		callee?.type === 'Identifier' &&
		/^use[A-Z]/.test(callee.name) &&
		callee.name !== 'useContext'
	)
		return callee.name;
	if (
		callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property?.type === 'Identifier' &&
		/^use[A-Z]/.test(callee.property.name) &&
		callee.property.name !== 'useContext'
	) {
		return callee.property.name;
	}
	return null;
}

function validateRuntimeImports(ast, state) {
	for (const node of ast.body ?? []) {
		if (node.importKind === 'type' || node.exportKind === 'type') continue;
		if (
			(node.specifiers?.length ?? 0) > 0 &&
			node.specifiers.every(
				(specifier) => specifier.importKind === 'type' || specifier.exportKind === 'type',
			)
		)
			continue;
		const request = node.source?.value;
		if (request === 'server') {
			throw valdiError(state, node, '`module server` RPC imports are not supported yet.');
		}
		if (typeof request !== 'string' || (request !== 'octane' && !request.startsWith('octane/')))
			continue;
		if (node.type !== 'ImportDeclaration' || request !== 'octane') {
			throw valdiError(state, node, `runtime request ${JSON.stringify(request)} is unsupported.`);
		}
		for (const specifier of node.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			if (specifier.type !== 'ImportSpecifier') {
				throw valdiError(state, specifier, 'Valdi modules require named imports from octane.');
			}
			const name = specifier.imported?.name ?? specifier.imported?.value;
			if (!VALDI_HOOKS.has(name)) {
				throw valdiError(
					state,
					specifier,
					`runtime import ${JSON.stringify(name)} has no Valdi writer implementation.`,
				);
			}
			state.runtimeImports.set(specifier.local.name, name);
		}
	}
	walk(ast, (node) => {
		if (node.type === 'TSModuleDeclaration' && node.declare !== true && node.kind === 'module') {
			throw valdiError(state, node, '`module server` is not supported yet.');
		}
		if (node.type !== 'CallExpression') return;
		const name = importedHookName(node, state);
		if (
			(HOOK_NAMES.has(name) || name === 'use' || name === 'useContext') &&
			!VALDI_HOOKS.has(name)
		) {
			throw valdiError(state, node, `hook ${JSON.stringify(name)} is not supported yet.`);
		}
	});
}

function hasOwnTemplate(fn) {
	let found = false;
	walk(fn.body, (node) => {
		if (FUNCTION_TYPES.has(node.type)) return false;
		if (isTemplate(node)) {
			found = true;
			return false;
		}
	});
	return found;
}

function componentShape(node) {
	const exportKind =
		node.type === 'ExportNamedDeclaration'
			? 'named'
			: node.type === 'ExportDefaultDeclaration'
				? 'default'
				: null;
	const declaration = exportKind === null ? node : node.declaration;
	if (declaration?.type === 'FunctionDeclaration') {
		return { node, fn: declaration, name: declaration.id?.name, exportKind };
	}
	if (
		exportKind === 'default' &&
		(declaration?.type === 'FunctionExpression' || declaration?.type === 'ArrowFunctionExpression')
	) {
		return { node, fn: declaration, name: declaration.id?.name, exportKind };
	}
	if (declaration?.type === 'VariableDeclaration' && declaration.declarations?.length === 1) {
		const item = declaration.declarations[0];
		const fn = unwrap(item.init);
		if (
			item.id?.type === 'Identifier' &&
			(fn?.type === 'FunctionExpression' || fn?.type === 'ArrowFunctionExpression')
		) {
			return { node, fn, name: item.id.name, exportKind };
		}
	}
	return null;
}

function collectComponents(ast, state) {
	const referenced = new Set();
	walk(ast, (node) => {
		const name = node.openingElement?.name;
		if (name?.type === 'JSXIdentifier' && !/^[a-z]/.test(name.name)) referenced.add(name.name);
	});
	for (const node of ast.body ?? []) {
		const shape = componentShape(node);
		if (shape === null) continue;
		if (
			!hasOwnTemplate(shape.fn) &&
			!referenced.has(shape.name) &&
			shape.exportKind !== 'default' &&
			!(shape.exportKind === 'named' && /^[A-Z]/.test(shape.name ?? ''))
		) {
			continue;
		}
		const declaration = node.declaration ?? node;
		if (declaration.type === 'VariableDeclaration' && declaration.kind !== 'const') {
			throw valdiError(state, declaration, 'component function bindings must use const.');
		}
		shape.name ??= allocName(state, '__octaneValdiDefault');
		state.components.set(shape.name, shape);
		state.componentNodes.set(node, shape);
	}
}

function forEachAssignmentBinding(pattern, visit) {
	const node = unwrap(pattern);
	if (node?.type === 'Identifier') visit(node);
	else if (node?.type === 'RestElement') forEachAssignmentBinding(node.argument, visit);
	else if (node?.type === 'AssignmentPattern') forEachAssignmentBinding(node.left, visit);
	else if (node?.type === 'ArrayPattern') {
		for (const element of node.elements) forEachAssignmentBinding(element, visit);
	} else if (node?.type === 'ObjectPattern') {
		for (const property of node.properties) {
			forEachAssignmentBinding(
				property.type === 'RestElement' ? property.argument : property.value,
				visit,
			);
		}
	}
}

function validateComponentBindings(ast, state) {
	const lexical = state.lexical;
	const assertStable = (identifier) => {
		const shape = state.components.get(identifier.name);
		if (shape === undefined) return;
		const scope = lexical.resolveBinding(
			lexical.nodeScopes.get(identifier) ?? lexical.rootScope,
			identifier.name,
		)?.scope;
		let componentBinding = scope === lexical.rootScope;
		// The lexical analysis also records a declaration's self-name in its
		// parameter scope. It denotes the component unless a parameter shadows it.
		if (
			!componentBinding &&
			shape.fn.type === 'FunctionDeclaration' &&
			shape.fn.id?.name === identifier.name &&
			scope === lexical.nodeScopes.get(shape.fn.id)
		) {
			componentBinding = true;
			for (const parameter of shape.fn.params ?? []) {
				forEachAssignmentBinding(parameter, (binding) => {
					if (binding.name === identifier.name) componentBinding = false;
				});
			}
		}
		if (componentBinding) {
			throw valdiError(state, identifier, 'component bindings must not be reassigned.');
		}
	};
	walk(ast, (node) => {
		if (node.type === 'AssignmentExpression') forEachAssignmentBinding(node.left, assertStable);
		else if (node.type === 'UpdateExpression')
			forEachAssignmentBinding(node.argument, assertStable);
		else if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
			forEachAssignmentBinding(node.left, assertStable);
		}
	});
}

function hasRenderTimeCalls(fn) {
	let found = false;
	walk(fn, (node) => {
		if (node !== fn && FUNCTION_TYPES.has(node.type)) return false;
		if (node.type === 'CallExpression' || node.type === 'NewExpression') {
			found = true;
			return false;
		}
	});
	return found;
}

function attributeValue(attribute, state) {
	if (attribute.value == null) return withOrigin(b.literal(true), attribute);
	const value =
		attribute.value.type === 'JSXExpressionContainer'
			? attribute.value.expression
			: attribute.value;
	if (!value || value.type === 'JSXEmptyExpression') {
		throw valdiError(state, attribute, 'empty attribute expressions are unsupported.');
	}
	return assertNoTemplate(value, state, 'JSX-valued attributes');
}

function attributeEntries(node, state) {
	return (node.openingElement?.attributes ?? node.attributes ?? []).map((attribute) => {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			return {
				name: null,
				value: assertNoTemplate(attribute.argument, state, 'JSX-valued spread attributes'),
				origin: attribute,
			};
		}
		const name = attribute.name?.type === 'JSXIdentifier' ? attribute.name.name : null;
		if (name === null) throw valdiError(state, attribute, 'namespaced attributes are unsupported.');
		if (name === 'ref' || name === 'children') {
			throw valdiError(state, attribute, `authored ${name} props are not supported yet.`);
		}
		return { name, value: attributeValue(attribute, state), origin: attribute };
	});
}

function isStaticAttribute(value) {
	const node = unwrap(value);
	return (
		(node?.type === 'Literal' &&
			(node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))) ||
		(node?.type === 'UnaryExpression' &&
			(node.operator === '+' || node.operator === '-') &&
			node.argument?.type === 'Literal' &&
			typeof node.argument.value === 'number')
	);
}

function normalizeWriterFacts(facts, sourceLength, filename) {
	if (facts === undefined) return null;
	const invalid = (message) => {
		throw new TypeError(`Octane Valdi writer facts for ${filename}: ${message}`);
	};
	if (
		facts === null ||
		typeof facts !== 'object' ||
		Array.isArray(facts) ||
		facts.version !== 1 ||
		!Array.isArray(facts.expressions)
	) {
		invalid('expected version 1 and an expressions array.');
	}
	const ranges = new Map();
	for (let index = 0; index < facts.expressions.length; index++) {
		const fact = facts.expressions[index];
		if (
			fact === null ||
			typeof fact !== 'object' ||
			Array.isArray(fact) ||
			!Number.isInteger(fact.start) ||
			!Number.isInteger(fact.end) ||
			fact.start < 0 ||
			fact.end <= fact.start ||
			fact.end > sourceLength ||
			!VALDI_WRITER_TYPES.has(fact.effectiveType) ||
			typeof fact.isNullable !== 'boolean'
		) {
			invalid(`invalid expression record at index ${index}.`);
		}
		const key = `${fact.start}:${fact.end}`;
		const previous = ranges.get(key);
		if (
			previous !== undefined &&
			(previous.effectiveType !== fact.effectiveType || previous.isNullable !== fact.isNullable)
		) {
			invalid(`conflicting expression records at ${key}.`);
		}
		ranges.set(key, fact);
	}
	return ranges;
}

function suppliedAttributeKind(expression, state) {
	if (state.writerFacts === null) return null;
	// Never unwrap or follow bindings here: a fact about a subexpression or a
	// different occurrence does not prove the complete authored attribute value.
	// In particular, explicit keys may have replaced that value with a temporary.
	// Valdi's typed writers also clear nullish values, so its effective type is
	// sufficient even when the type-checker record has isNullable: true.
	return state.writerFacts.get(`${expression.start}:${expression.end}`)?.effectiveType ?? null;
}

// Only immutable bindings with proven initializers are followed. A mutable
// local, imported value, parameter, or shadowing loop item must not inherit an
// outer binding's type. These records live for one compilation, not at runtime.
function collectAttributeBindings(ast, lexical) {
	const bindings = new WeakMap();
	walk(ast, (node) => {
		if (node.type !== 'VariableDeclaration' || node.kind !== 'const' || node.declare) return;
		for (const declaration of node.declarations ?? []) {
			if (declaration.id?.type !== 'Identifier' || declaration.init == null) continue;
			const name = declaration.id.name;
			const scope = lexical.resolveBinding(
				lexical.nodeScopes.get(declaration.id) ?? lexical.rootScope,
				name,
			)?.scope;
			if (scope === undefined) continue;
			let locals = bindings.get(scope);
			if (locals === undefined) bindings.set(scope, (locals = new Map()));
			locals.set(name, { initializer: declaration.init, kind: undefined, resolving: false });
		}
	});
	return bindings;
}

function attributeBindingKind(identifier, state) {
	const lexical = state.lexical;
	const scope = lexical.resolveBinding(
		lexical.nodeScopes.get(identifier) ?? lexical.rootScope,
		identifier.name,
	)?.scope;
	const binding =
		scope === undefined
			? undefined
			: state.attributeFacts.bindings.get(scope)?.get(identifier.name);
	if (binding === undefined || binding.resolving) return null;
	if (binding.kind !== undefined) return binding.kind;
	binding.resolving = true;
	binding.kind = attributeExpressionKind(binding.initializer, state);
	binding.resolving = false;
	return binding.kind;
}

// Keep source-level proofs local to this target. Unknown expressions use the
// generic setter; an integration can provide exact checked expression facts.
function attributeExpressionKind(expression, state) {
	const node = unwrap(expression);
	if (node?.type === 'Literal') {
		const kind = typeof node.value;
		return kind === 'string' || kind === 'number' || kind === 'boolean' ? kind : null;
	}
	if (node?.type === 'TemplateLiteral') return 'string';
	if (node?.type === 'Identifier') return attributeBindingKind(node, state);
	if (node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression')
		return 'function';
	if (node?.type === 'ConditionalExpression') {
		const consequent = attributeExpressionKind(node.consequent, state);
		return consequent === attributeExpressionKind(node.alternate, state) ? consequent : null;
	}
	if (node?.type === 'BinaryExpression' && node.operator === '+') {
		return attributeExpressionKind(node.left, state) === 'string' ||
			attributeExpressionKind(node.right, state) === 'string'
			? 'string'
			: null;
	}
	if (node?.type === 'CallExpression' && importedHookName(node, state) === 'useCallback') {
		return attributeExpressionKind(node.arguments?.[0], state) === 'function' ? 'function' : null;
	}
	return null;
}

function encodedKeyExpression(state, prototype, keys, origin) {
	// Key encoding belongs to the adapter. Prototypes and returned keys are
	// opaque: generated code never reads their fields or assumes a string format.
	return call(state, 'valdiKey', [prototype, ...keys], origin);
}

function keyExpression(state, prototype, keys, explicit, origin) {
	const base =
		keys.length === 0
			? b.unary('void', b.literal(0))
			: encodedKeyExpression(state, prototype, keys, origin);
	if (explicit === null) return withOrigin(base, origin);
	return withOrigin(
		b.conditional(
			b.binary('==', explicit, b.literal(null)),
			base,
			encodedKeyExpression(state, prototype, [...keys, explicit], origin),
		),
		origin,
	);
}

function mergedAttributes(entries, state, origin) {
	const keyName = allocName(state, '__octaneValdiKey');
	const refName = allocName(state, '__octaneValdiRef');
	const childrenName = allocName(state, '__octaneValdiChildren');
	const propsName = allocName(state, '__octaneValdiProps');
	const expression = b.object(
		entries.map((entry) =>
			entry.name === null
				? b.spread(entry.value)
				: b.prop('init', b.literal(entry.name), entry.value, entry.name === '__proto__'),
		),
	);
	const pattern = b.object_pattern([
		b.prop('init', b.id('key'), b.id(keyName)),
		b.prop('init', b.id('ref'), b.id(refName)),
		b.prop('init', b.id('children'), b.id(childrenName)),
		b.rest(b.id(propsName)),
	]);
	const prelude = [
		b.const(pattern, expression),
		b.if(
			b.logical(
				'||',
				b.binary('!==', b.id(refName), b.unary('void', b.literal(0))),
				b.binary('!==', b.id(childrenName), b.unary('void', b.literal(0))),
			),
			b.block([
				b.throw_error('Octane Valdi compiler: spread ref/children props are not supported yet.'),
			]),
			null,
		),
	];
	return {
		prelude: prelude.map((statement) => withOrigin(statement, origin)),
		key: withOrigin(b.id(keyName), origin),
		props: withOrigin(b.id(propsName), origin),
	};
}

function prepareAttributes(entries, state, origin) {
	if (entries.some((entry) => entry.name === null)) {
		return { ...mergedAttributes(entries, state, origin), statics: [], dynamic: [], spread: true };
	}
	const counts = new Map();
	for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
	const hasKey = counts.has('key');
	const prelude = [];
	const statics = [];
	const dynamic = [];
	let key = null;
	for (const entry of entries) {
		if (entry.name !== 'key' && counts.get(entry.name) === 1 && isStaticAttribute(entry.value)) {
			statics.push(withOrigin(b.literal(entry.name), entry.origin), entry.value);
			continue;
		}
		let value = entry.value;
		if (hasKey) {
			const name = allocName(state, '__octaneValdiAttribute');
			prelude.push(withOrigin(b.const(name, value), entry.origin));
			value = withOrigin(b.id(name), entry.origin);
		}
		if (entry.name === 'key') key = value;
		else dynamic.push({ ...entry, value, originalValue: entry.value });
	}
	return { prelude, statics, dynamic, key, spread: false };
}

function setterForAttribute(entry, state) {
	if (entry.name === 'style') return 'setAttributeStyle';
	const value = unwrap(entry.originalValue);
	const literalKind = value?.type === 'Literal' ? typeof value.value : null;
	const kind =
		literalKind === 'boolean' || literalKind === 'number'
			? literalKind
			: (attributeExpressionKind(entry.originalValue, state) ??
				suppliedAttributeKind(entry.originalValue, state));
	// These names have extra work in Valdi's generic writer. Only select a
	// typed writer whose contract includes that same normalization/observation.
	if (
		entry.name === 'ref' ||
		entry.name === '$ref' ||
		entry.name === '$onLayout' ||
		((entry.name === 'class' || entry.name === '$class') && kind !== 'string') ||
		((entry.name === 'onVisibilityChanged' || entry.name === 'onViewportChanged') &&
			kind !== 'function')
	)
		return 'setAttribute';
	if (kind === 'boolean') return 'setAttributeBool';
	if (kind === 'number') return 'setAttributeNumber';
	if (kind === 'string') return 'setAttributeString';
	if (kind === 'function') return 'setAttributeFunction';
	if (kind === 'style') return 'setAttributeStyle';
	return 'setAttribute';
}

function componentExpression(name, state, origin) {
	if (name?.type !== 'JSXIdentifier' && name?.type !== 'Identifier') {
		throw valdiError(state, origin, 'dynamic component tags are not supported yet.');
	}
	const lexical = state.lexical;
	const binding = lexical.resolveBinding(
		lexical.nodeScopes.get(name) ?? lexical.rootScope,
		name.name,
	);
	const current = state.currentComponent;
	const selfScope = current?.fn.id
		? lexical.resolveBinding(lexical.nodeScopes.get(current.fn.id) ?? lexical.rootScope, name.name)
				?.scope
		: null;
	if (
		binding === null ||
		binding === undefined ||
		(binding.scope !== lexical.rootScope &&
			!(current?.name === name.name && binding.scope === selfScope)) ||
		(binding.importSource === null && !state.components.has(name.name))
	) {
		throw valdiError(
			state,
			origin,
			'component tags must name a stable imported or module component.',
		);
	}
	return withOrigin(b.id(name.name), name);
}

function hoistPrototype(state, method, args, origin) {
	const name = allocName(state, `__octaneValdiPrototype${state.prototypes.length}`);
	state.prototypes.push(withOrigin(b.const(name, writerCall(state, method, args, origin)), origin));
	return withOrigin(b.id(name), origin);
}

function elementName(node) {
	return node.openingElement?.name ?? node.name;
}

function intrinsicTag(node) {
	const name = elementName(node);
	const tag = name?.type === 'JSXIdentifier' || name?.type === 'Identifier' ? name.name : null;
	return typeof tag === 'string' && (/^[a-z]/.test(tag) || tag.includes('-')) ? tag : null;
}

function emitIntrinsicContents(node, state, attrs) {
	const statements = [];
	if (attrs.spread) {
		statements.push(
			withOrigin(b.stmt(call(state, 'setValdiAttributes', [attrs.props], node)), node),
		);
	} else {
		for (const entry of attrs.dynamic) {
			statements.push(
				writerStatement(
					state,
					setterForAttribute(entry, state),
					[b.literal(entry.name), entry.value],
					entry.origin,
				),
			);
		}
	}
	// Valdi matches children within this virtual parent. Its own key already
	// consumed the pending loop path; only loops below it need new key parts.
	statements.push(...emitNodes(node.children ?? [], state, [], false));
	return statements;
}

function isEmptyChild(node) {
	return (
		node == null ||
		(node.type === 'JSXText' && /^[\s;]*$/.test(node.value ?? '')) ||
		(node.type === 'JSXExpressionContainer' && node.expression?.type === 'JSXEmptyExpression')
	);
}

function emitElement(node, state, keys) {
	const name = elementName(node);
	const tag = intrinsicTag(node);
	const intrinsic = tag !== null;
	const entries = attributeEntries(node, state);
	const attrs = prepareAttributes(entries, state, node);
	const prototypeArgs = intrinsic ? [b.literal(tag)] : [];
	if (attrs.statics.length > 0) prototypeArgs.push(b.array(attrs.statics));
	const prototype = hoistPrototype(
		state,
		intrinsic ? 'makeNodePrototype' : 'makeComponentPrototype',
		prototypeArgs,
		node,
	);
	const key = keyExpression(state, prototype, keys, attrs.key, node);
	const statements = [...attrs.prelude];
	if (intrinsic) {
		if (tag === 'slot' || tag === 'slotted' || tag === 'style') {
			throw valdiError(state, node, `<${tag}> is not supported by the Valdi writer target.`);
		}
		statements.push(writerStatement(state, 'beginRender', [prototype, key], node));
		statements.push(...emitIntrinsicContents(node, state, attrs));
		statements.push(writerStatement(state, 'endRender', [], node.closingElement ?? node));
		return statements;
	}
	const component = componentExpression(name, state, node);
	const children = (node.children ?? []).filter((child) => !isEmptyChild(child));
	if (children.length !== 0) {
		throw valdiError(state, node, 'component children/render props are not supported yet.');
	}
	statements.push(
		writerStatement(
			state,
			'beginComponent',
			[call(state, 'getValdiComponentConstructor', [component], node), prototype, key],
			node,
		),
	);
	if (attrs.spread) {
		statements.push(writerStatement(state, 'setViewModelFull', [attrs.props], node));
	} else {
		for (const entry of attrs.dynamic) {
			statements.push(
				writerStatement(
					state,
					'setViewModelProperty',
					[b.literal(entry.name), entry.value],
					entry.origin,
				),
			);
		}
	}
	statements.push(writerStatement(state, 'endComponent', [], node.closingElement ?? node));
	return statements;
}

function emitFor(node, state, keys) {
	if (node.await || node.statementType === 'ForInStatement') {
		throw valdiError(state, node, 'only synchronous @for-of is supported.');
	}
	if (!node.key) throw valdiError(state, node, '@for requires an explicit key.');
	if (node.left?.type !== 'VariableDeclaration' || node.left.declarations?.length !== 1) {
		throw valdiError(state, node, '@for requires one item binding.');
	}
	walk(node.body, (child) => {
		if (FUNCTION_TYPES.has(child.type)) return false;
		if (child.type === 'CallExpression' && slotHookName(child, state) !== null) {
			throw valdiError(
				state,
				child,
				'hooks directly inside @for are not supported yet; use a child component.',
			);
		}
	});
	const keyName = allocName(state, '__octaneValdiItemKey');
	const indexName = node.index || node.empty ? allocName(state, '__octaneValdiIndex') : null;
	const prefix = [];
	if (node.index) {
		prefix.push(b.const(node.index, b.update('++', b.id(indexName), false)));
	} else if (indexName !== null) {
		prefix.push(b.stmt(b.update('++', b.id(indexName), false)));
	}
	prefix.push(b.const(keyName, assertNoTemplate(node.key, state, '@for keys containing JSX')));
	const body = b.block([
		...prefix.map((statement) => withOrigin(statement, node)),
		...emitNodes(
			node.body?.body ?? [],
			state,
			[...keys, withOrigin(b.id(keyName), node.key)],
			false,
		),
	]);
	const output = [];
	if (indexName !== null) output.push(withOrigin(b.let(indexName, b.literal(0)), node));
	output.push(
		withOrigin(
			b.for_of(node.left, assertNoTemplate(node.right, state, '@for sources containing JSX'), body),
			node,
		),
	);
	if (node.empty) {
		output.push(
			withOrigin(
				b.if(
					b.binary('===', b.id(indexName), b.literal(0)),
					b.block(emitNodes(node.empty.body ?? [], state, keys, false)),
					null,
				),
				node.empty,
			),
		);
	}
	return output;
}

function emitIf(node, state, keys) {
	const alternate = node.alternate;
	return [
		withOrigin(
			b.if(
				assertNoTemplate(node.test, state, '@if conditions containing JSX'),
				b.block(emitNodes(node.consequent?.body ?? [node.consequent], state, keys, false)),
				alternate == null
					? null
					: alternate.type === 'JSXIfExpression'
						? emitIf(alternate, state, keys)[0]
						: b.block(emitNodes(alternate.body ?? [alternate], state, keys, false)),
			),
			node,
		),
	];
}

function isNullishOutput(node, state) {
	const value = unwrap(node);
	return (
		value == null ||
		(value.type === 'Literal' && (value.value === null || typeof value.value === 'boolean')) ||
		(value.type === 'Identifier' &&
			value.name === 'undefined' &&
			state.lexical.resolveBinding(
				state.lexical.nodeScopes.get(value) ?? state.lexical.rootScope,
				value.name,
			) == null) ||
		(value.type === 'UnaryExpression' && value.operator === 'void')
	);
}

function emitRenderable(node, state, keys) {
	const value = unwrap(node);
	if (isNullishOutput(value, state)) {
		return value?.type === 'UnaryExpression'
			? [withOrigin(b.stmt(assertNoTemplate(value, state, 'JSX inside a void expression')), node)]
			: [];
	}
	if (value?.type === 'ConditionalExpression') {
		return [
			withOrigin(
				b.if(
					assertNoTemplate(value.test, state, 'conditional JSX tests'),
					b.block(emitRenderable(value.consequent, state, keys)),
					b.block(emitRenderable(value.alternate, state, keys)),
				),
				node,
			),
		];
	}
	if (value?.type === 'LogicalExpression' && value.operator === '&&') {
		return [
			withOrigin(
				b.if(
					assertNoTemplate(value.left, state, 'conditional JSX tests'),
					b.block(emitRenderable(value.right, state, keys)),
					null,
				),
				node,
			),
		];
	}
	if (value?.type === 'JSXElement' || value?.type === 'Element')
		return emitElement(value, state, keys);
	if (value?.type === 'JSXFragment' || value?.type === 'Fragment')
		return emitNodes(value.children ?? [], state, keys, false);
	if (value?.type === 'JSXForExpression') return emitFor(value, state, keys);
	if (value?.type === 'JSXIfExpression') return emitIf(value, state, keys);
	throw valdiError(
		state,
		node,
		`unsupported renderable ${value?.type ?? 'value'}; render text with a <label value={...} />.`,
	);
}

function rewriteComponentStatement(node, state, keys, allowReturn) {
	if (node?.type === 'ReturnStatement') {
		if (!allowReturn) {
			throw valdiError(state, node, 'early returns inside template regions are not supported yet.');
		}
		return withOrigin(
			b.block([...emitRenderable(node.argument, state, keys), b.return(null)]),
			node,
		);
	}
	if (FUNCTION_TYPES.has(node?.type)) {
		return assertNoTemplate(node, state, 'nested component declarations');
	}
	if (node?.type === 'BlockStatement') {
		return { ...node, body: emitNodes(node.body ?? [], state, keys, allowReturn) };
	}
	if (node?.type === 'IfStatement') {
		return {
			...node,
			test: assertNoTemplate(node.test, state, 'JavaScript conditions containing JSX'),
			consequent: rewriteComponentStatement(node.consequent, state, keys, allowReturn),
			alternate: node.alternate
				? rewriteComponentStatement(node.alternate, state, keys, allowReturn)
				: null,
		};
	}
	if (!allowReturn && (node?.type === 'BreakStatement' || node?.type === 'ContinueStatement')) {
		throw valdiError(
			state,
			node,
			'JavaScript jumps inside template regions are not supported yet.',
		);
	}
	return assertNoTemplate(node, state, 'JSX in JavaScript setup');
}

function emitNodes(nodes, state, keys, allowReturn) {
	const output = [];
	for (const node of nodes) {
		if (isEmptyChild(node)) continue;
		if (node.type === 'JSXText') {
			if (state.renderer.text === 'ignore') continue;
			throw valdiError(
				state,
				node,
				'authored text children are unsupported; use <label value={...} />.',
			);
		}
		if (node.type === 'JSXExpressionContainer') {
			output.push(...emitRenderable(node.expression, state, keys));
		} else if (isTemplate(node)) {
			output.push(...emitRenderable(node, state, keys));
		} else {
			output.push(rewriteComponentStatement(node, state, keys, allowReturn));
		}
	}
	return output;
}

function emitComponent(shape, state) {
	const { fn, name, exportKind } = shape;
	if (fn.async || fn.generator) {
		throw valdiError(state, fn, 'async/generator components are not supported yet.');
	}
	for (const parameter of fn.params ?? [])
		assertNoTemplate(parameter, state, 'component parameters');
	state.currentComponent = shape;
	let statements;
	if (fn.body?.type === 'JSXCodeBlock') {
		statements = [
			...emitNodes(fn.body.body ?? [], state, [], true),
			...emitRenderable(fn.body.render, state, []),
		];
	} else if (fn.body?.type === 'BlockStatement') {
		statements = emitNodes(fn.body.body ?? [], state, [], true);
	} else {
		statements = emitRenderable(fn.body, state, []);
	}
	state.currentComponent = null;
	// A named expression called `name` would shadow the outer branded component
	// inside its own body, breaking recursive <Name /> calls. The raw writer body
	// gets a distinct binding; authored self-references keep the public descriptor.
	const renderName = allocName(state, `__octaneValdiRender${name}`);
	const render = withOrigin(
		b.function(b.id(renderName), fn.params ?? [], b.block(statements), false, fn.typeParameters),
		fn,
	);
	const options = b.object([b.prop('init', b.id('hasHooks'), b.literal(hasRenderTimeCalls(fn)))]);
	const declaration = withOrigin(
		b.const(name, call(state, 'defineValdiComponent', [render, options], fn)),
		fn,
	);
	if (exportKind === 'named') return [withOrigin(b.export(declaration), shape.node)];
	if (exportKind === 'default')
		return [declaration, withOrigin(b.export_default(b.id(name)), shape.node)];
	return [declaration];
}

/** Lower an authored module and finish it through the shared client pipeline. */
export function compileValdi(
	source,
	filename,
	renderer,
	compileClient,
	options = {},
	parsedAst = null,
) {
	if (
		!renderer ||
		typeof renderer.id !== 'string' ||
		typeof renderer.module !== 'string' ||
		renderer.target !== 'valdi'
	) {
		throw new TypeError('Octane Valdi compiler requires a resolved Valdi renderer.');
	}
	const ast = parsedAst ?? parseModule(source, filename);
	const state = {
		filename,
		renderer,
		names: new Set(),
		helpers: new Map(),
		jsxFacade: null,
		prototypes: [],
		components: new Map(),
		componentNodes: new Map(),
		currentComponent: null,
		runtimeImports: new Map(),
		lexical: createLexicalAnalysis(ast),
		attributeFacts: null,
		writerFacts: normalizeWriterFacts(options.valdiWriterFacts, source.length, filename),
	};
	if (options.hmr !== undefined && options.hmr !== false) {
		throw valdiError(state, ast, 'HMR is not supported yet; compile with hmr: false.');
	}
	if (options.profile === true) {
		throw valdiError(
			state,
			ast,
			'Octane profiling is not supported by the Valdi writer target yet.',
		);
	}
	if (renderer.text === 'host') {
		throw valdiError(state, ast, 'host text is unsupported; use text: "reject" or "ignore".');
	}
	const boundaries = assertRendererBoundaryAnalysis(
		analyzeRendererBoundaries(source, {
			ast,
			filename,
			rendererBoundaries: options.rendererBoundaries,
		}),
	);
	if (boundaries.boundaries.length > 0) {
		throw valdiError(state, ast, 'cross-renderer boundaries are not supported yet.');
	}
	walk(ast, (node) => {
		if (
			(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
			typeof node.name === 'string'
		)
			state.names.add(node.name);
	});
	validateRuntimeImports(ast, state);
	validateRendererAst(ast, filename, renderer);
	state.attributeFacts = {
		bindings: collectAttributeBindings(ast, state.lexical),
	};
	collectComponents(ast, state);
	validateComponentBindings(ast, state);
	const body = [];
	for (const node of ast.body ?? []) {
		const shape = state.componentNodes.get(node);
		if (shape !== undefined) body.push(...emitComponent(shape, state));
		else body.push(assertNoTemplate(node, state, 'JSX outside a component'));
	}
	const origin = ast.body?.[0] ?? ast;
	const guard = withOrigin(
		b.stmt(call(state, 'assertValdiCompilerAbi', [b.literal(VALDI_COMPILER_ABI_VERSION)], origin)),
		origin,
	);
	const writerPrelude =
		state.jsxFacade === null
			? []
			: [withOrigin(b.const(state.jsxFacade, helper(state, 'jsx')), origin)];
	const imports = [withOrigin(b.imports([...state.helpers], renderer.module), origin)];
	return compileClient(
		{ ...ast, body: [...imports, ...writerPrelude, ...state.prototypes, ...body] },
		guard,
	);
}
