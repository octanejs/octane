import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from './compile-universal.js';
import { analyzeRendererBoundaries } from './renderer-boundaries.js';
import { isDomBindingDirective } from './dom-binding-directive.js';
import { HOOK_NAMES } from './hook-names.js';
import { isComponentTag, isKnownTextChildExpression } from './render-classification.js';
import { SYNCHRONOUS_ARRAY_CALLBACKS } from './strong-render-policy.js';
import { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ, nativeReadDiagnostic } from './native-read-facts.js';
export { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ } from './native-read-facts.js';

const SIGNALS_MODULE = 'octane/signals';
const CLIENT_MODULE = 'octane/signals/client';
const SIGNAL_MODULES = new Set([SIGNALS_MODULE, CLIENT_MODULE, 'octane/signals/server']);
const LOCAL_MODULES = new Set([CLIENT_MODULE, 'octane/signals/server']);
const HANDLE_TYPES = new Set(['SignalHandle', 'Resource', 'WritableSignal', 'DerivedSignal']);
const DEFINITE_HANDLE_TYPES = new Set([...HANDLE_TYPES, 'QuerySignal', 'OptimisticSignal']);
const SIGNAL_METHODS = new Set(['signal$', 'derived$']);
const READ_METHODS = ['get', 'latest', 'snapshot'];
const SIGNAL_FACTORIES = new Set(['signal$', 'derived$', 'query$', 'createResource']);
const LOCAL_HOOKS = new Set(['useSignal$']);
const ERROR_CONSTRUCTORS = new Set([
	'Error',
	'EvalError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'TypeError',
	'URIError',
	'AggregateError',
]);
// Runtime callbacks that can execute while the hook is rendering. Effect and
// layout callbacks are deliberately absent; their reads are imperative.
const RENDER_CALLBACKS = new Map([
	['useMemo', [0]],
	['useState', [0]],
	['useLazyRef', [0]],
	['useReducer', [2]],
	['useLinkedState', [1]],
	['useSyncExternalStore', [1, 2]],
	['isPending', [0]],
]);
const FUNCTION_TYPES = new Set([
	'ArrowFunctionExpression',
	'FunctionDeclaration',
	'FunctionExpression',
]);
const RENDER_NODES = new Set([
	'JSXElement',
	'JSXFragment',
	'JSXCodeBlock',
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);
const STATEMENT_LIST_TYPES = new Set(['BlockStatement', 'JSXCodeBlock', 'Program']);
const WRAPPERS = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSInstantiationExpression',
	'ChainExpression',
]);
const SKIP_KEYS = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
]);
const UNKNOWN = Object.freeze({ kind: 'unknown' });
const HANDLE = Object.freeze({ kind: 'handle' });
const SCOPE = Object.freeze({ kind: 'scope' });
const NULLISH = Object.freeze({ kind: 'nullish' });
const NUMBER = Object.freeze({ kind: 'number' });
const PRIMITIVE = Object.freeze({ kind: 'primitive' });
const ROOT = Object.freeze({ kind: 'root' });

function isRenderValue(value) {
	return value?.kind === 'renderOutput' || value?.kind === 'renderChoice';
}

function unwrap(node) {
	while (node && WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function children(node, visit) {
	for (const key in node) {
		if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) if (child && typeof child === 'object') visit(child);
		} else if (value && typeof value === 'object') {
			visit(value);
		}
	}
}

function propertyName(node, computed = false) {
	if (!node) return null;
	if (!computed && (node.type === 'Identifier' || node.type === 'JSXIdentifier')) return node.name;
	return typeof node.value === 'string' || typeof node.value === 'number'
		? String(node.value)
		: null;
}

/**
 * Native reads are an explicit module capability. A runtime signals import,
 * including a bare import for opaque readers, opts the entire module into
 * capturing actual reads. Type-only imports and `$` names alone do not.
 */
export function nativeReadOptions(ast, options) {
	const nativeReads = ast.body.some(
		(node) =>
			node.type === 'ImportDeclaration' &&
			node.importKind !== 'type' &&
			(node.source?.value === SIGNALS_MODULE || LOCAL_MODULES.has(node.source?.value)) &&
			(node.specifiers.length === 0 ||
				node.specifiers.some((specifier) => specifier.importKind !== 'type')),
	);
	// Recorded from the authored parse: later preparation (dom bindings, renderer
	// boundaries) can rewrite the module and drop its type-only imports.
	return { ...options, nativeReads, __signalModuleImport: importsSignalModule(ast) };
}

/**
 * Any import from a signals entry, including a type-only `SignalHandle`
 * import, marks a module that expects handles in ordinary props. It admits
 * handle bindings in opaque holes without enabling native reads.
 */
export function importsSignalModule(ast) {
	return ast.body.some(
		(node) => node.type === 'ImportDeclaration' && SIGNAL_MODULES.has(node.source?.value),
	);
}

export function assertNativeReadOptions(options) {
	if (
		options?.nativeReads === true &&
		options.renderer?.target != null &&
		options.renderer.target !== 'dom'
	) {
		throw new Error('Octane native signal reads support only the DOM client and server.');
	}
}

/**
 * Native names describe a capability, not a compiler purity or hook promise.
 * This optional source pass follows known imports and lexical aliases. The
 * separate TypeScript entry covers opaque imported types; runtime read capture
 * is never conditional on either pass proving a name or a call target.
 */
export function analyzeNativeReadDiagnostics(ast, source, filename, options = {}) {
	assertNativeReadOptions(options);
	const missingImport = !options.nativeReads;
	if (missingImport) {
		const escaped = source.includes('\\');
		// Inline import types have no ImportDeclaration; an escaped module path
		// still contains the `import` keyword. Retain both for provenance analysis.
		if (
			!options.__signalModuleImport &&
			!source.includes(SIGNALS_MODULE) &&
			!(escaped && source.includes('import'))
		)
			return [];
		// Every locally identifiable read spells a read method somewhere in the
		// module. Escaped property names retain a backslash, so still analyze them.
		if (!escaped && !READ_METHODS.some((name) => source.includes(name))) return [];
		// Source text can mention the module in comments or strings. Only an
		// actual import can establish the signal provenance this pass recognizes.
		if (!importsSignalModule(ast)) {
			let found = false;
			function findInlineImport(node) {
				if (!node || found) return;
				if (node.type === 'TSImportType' && SIGNAL_MODULES.has(node.source?.value)) found = true;
				else children(node, findInlineImport);
			}
			findInlineImport(ast);
			if (!found) return [];
		}
	}
	if (
		!missingImport &&
		options.rendererBoundaries &&
		Object.keys(options.rendererBoundaries).length > 0
	) {
		const { boundaries } = analyzeRendererBoundaries(source, {
			ast,
			filename,
			rendererBoundaries: options.rendererBoundaries,
		});
		const unsupported = boundaries.find(
			(boundary) =>
				boundary.childRenderer !== 'dom' &&
				options.rendererRegistry?.[boundary.childRenderer]?.target !== 'dom',
		);
		if (unsupported)
			return [
				nativeReadDiagnostic(
					'OCTANE_NATIVE_READ_TARGET',
					source,
					filename,
					unsupported.tagRange[0],
					unsupported.tagRange[1],
					`Octane native signal reads support only the DOM client and server; renderer ${JSON.stringify(unsupported.childRenderer)} has no native-read integration.`,
				),
			];
	}
	const nodes = [];
	const parents = new WeakMap();
	const seen = new WeakSet();
	function collect(node, parent) {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (typeof node.type !== 'string') return;
		parents.set(node, parent);
		nodes.push(node);
		children(node, (child) => collect(child, node));
	}
	collect(ast, null);
	const lexical = createLexicalAnalysis(ast);
	const records = new Map();
	const allRecords = [];
	const nativeTypes = new Map();
	const typeAliases = new Map();
	const typeDeclarations = new Map();
	const ambiguousTypes = new Set();
	// Runtime lexical analysis intentionally ignores ambient declarations. A
	// module-level ambient value still supplies a type contract for this pass.
	const ambientValues = new Set();
	if (missingImport)
		for (const statement of ast.body) {
			const declaration =
				statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
			if (declaration?.type === 'VariableDeclaration' && declaration.declare)
				for (const item of declaration.declarations)
					if (item.id.type === 'Identifier') ambientValues.add(item.id.name);
		}
	function declareTypeName(name) {
		if (typeof name !== 'string') return;
		if (typeDeclarations.has(name)) ambiguousTypes.add(name);
		typeDeclarations.set(name, true);
	}
	const runtimeModules = new Set(['octane', ...(options.__hookRuntimeModules ?? [])]);
	function recordFor(node, scope = lexical.nodeScopes.get(node)) {
		if (node?.type !== 'Identifier' && node?.type !== 'JSXIdentifier') return null;
		const binding =
			lexical.resolveBinding(scope, node.name) ??
			(ambientValues.has(node.name) ? { scope: lexical.rootScope } : null);
		if (binding === null) return null;
		let names = records.get(binding.scope);
		if (names === undefined) records.set(binding.scope, (names = new Map()));
		let record = names.get(node.name);
		if (record === undefined) {
			record = {
				name: node.name,
				scope: binding.scope,
				declarations: [],
				expressions: [],
				forced: null,
			};
			names.set(node.name, record);
			allRecords.push(record);
		}
		return record;
	}
	function declare(pattern, expression, path = [], scope, annotation = pattern?.typeAnnotation) {
		if (!pattern) return;
		if (pattern.type === 'Identifier') {
			const record = recordFor(pattern, scope);
			if (record) {
				record.declarations.push(pattern);
				if (expression) record.expressions.push({ expression, path });
				if (missingImport && annotation) (record.annotations ??= []).push({ annotation, path });
			}
		} else if (pattern.type === 'AssignmentPattern') {
			declare(pattern.left, expression, path, scope, annotation);
			declare(pattern.left, pattern.right, [], scope);
		} else if (pattern.type === 'RestElement') {
			declare(pattern.argument, null, [], scope);
		} else if (pattern.type === 'ArrayPattern') {
			for (let index = 0; index < pattern.elements.length; index++)
				declare(pattern.elements[index], expression, [...path, String(index)], scope, annotation);
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				const key = propertyName(property.key, property.computed);
				if (key !== null) declare(property.value, expression, [...path, key], scope, annotation);
				else if (property.type === 'RestElement') declare(property.argument, null, [], scope);
			}
		} else if (pattern.type === 'TSParameterProperty') {
			declare(pattern.parameter, expression, path, scope, annotation);
		}
	}
	function importedValue(module, name) {
		if (module === 'octane/behavior' && (name === 'adoptBindings' || name === 'mountBindings'))
			return { kind: 'builtin', name, bindingSource: true };
		if (module === SIGNALS_MODULE && name === 'createScope')
			return { kind: 'builtin', name: 'createScope' };
		if (SIGNAL_MODULES.has(module) && SIGNAL_FACTORIES.has(name))
			return { kind: 'builtin', name, capability: true };
		if (LOCAL_MODULES.has(module) && name === 'useDerived$')
			return { kind: 'unsupportedHook', name };
		if (LOCAL_MODULES.has(module) && LOCAL_HOOKS.has(name))
			return { kind: 'builtin', name, capability: true };
		if (
			runtimeModules.has(module) &&
			(name === 'useMemo' ||
				(missingImport &&
					(HOOK_NAMES.has(name) ||
						name === 'memo' ||
						name === 'createRoot' ||
						name === 'createElement')))
		)
			return { kind: 'builtin', name };
		return UNKNOWN;
	}
	for (const node of nodes) {
		if (node.type === 'ImportDeclaration') {
			const module = node.source.value;
			for (const specifier of node.specifiers ?? []) {
				declareTypeName(specifier.local?.name);
				const name = specifier.imported?.name ?? specifier.imported?.value;
				if (module === SIGNALS_MODULE || (missingImport && SIGNAL_MODULES.has(module))) {
					if ((missingImport ? DEFINITE_HANDLE_TYPES : HANDLE_TYPES).has(name))
						nativeTypes.set(specifier.local.name, HANDLE);
					if (name === 'Scope') nativeTypes.set(specifier.local.name, SCOPE);
					if (specifier.type === 'ImportNamespaceSpecifier')
						nativeTypes.set(specifier.local.name, { kind: 'namespace', module });
				}
				if (node.importKind === 'type' || specifier.importKind === 'type') continue;
				declare(specifier.local, null);
				const record = recordFor(specifier.local);
				if (record)
					record.forced =
						specifier.type === 'ImportNamespaceSpecifier'
							? { kind: 'namespace', module }
							: importedValue(module, name);
			}
		} else if (node.type === 'VariableDeclarator') {
			declare(node.id, node.init);
		} else if (FUNCTION_TYPES.has(node.type)) {
			if (node.id) {
				if (node.type === 'FunctionDeclaration')
					declare(node.id, node, [], lexical.nodeScopes.get(node));
				declare(node.id, node);
			}
			for (const param of node.params ?? []) declare(param, null);
		} else if (node.type === 'AssignmentExpression' && node.operator === '=') {
			declare(node.left, node.right);
			if (missingImport && node.left?.type === 'MemberExpression') {
				const record = recordFor(unwrap(node.left.object));
				if (record) record.hasMemberAssignment = true;
			}
		} else if (node.type === 'TSTypeAliasDeclaration') {
			declareTypeName(node.id.name);
			typeAliases.set(node.id.name, node.typeAnnotation);
		} else if (
			node.type === 'TSInterfaceDeclaration' ||
			node.type === 'ClassDeclaration' ||
			node.type === 'TSEnumDeclaration'
		) {
			declareTypeName(node.id?.name);
			if (missingImport && node.type === 'TSInterfaceDeclaration')
				typeAliases.set(node.id.name, node);
			if (missingImport && node.type === 'ClassDeclaration' && node.id)
				declare(node.id, node, [], lexical.nodeScopes.get(node));
		} else if (node.type === 'TSTypeParameter') {
			declareTypeName(node.name.name);
			if (missingImport && node.constraint) typeAliases.set(node.name.name, node.constraint);
		}
	}

	let recordCache;
	let functionCache;
	let parameterValues;
	let evaluatedValues;
	let returnedValues;
	let renderOutput;
	const activeRecords = new Set();
	const activeFunctions = new Set();
	const typeCache = new WeakMap();
	function typeValue(annotation, state) {
		if (!annotation) return UNKNOWN;
		state ??= { active: new Set(), cycles: 0 };
		if (missingImport && typeCache.has(annotation)) return typeCache.get(annotation);
		const cycles = state.cycles;
		const value = resolveTypeValue(annotation, state);
		// A result cut short by an ancestor cycle depends on that path. Cache
		// completed proofs only, including shared acyclic interface heritage.
		if (missingImport && state.cycles === cycles) typeCache.set(annotation, value);
		return value;
	}
	function resolveTypeValue(annotation, state) {
		if (annotation.type === 'TSTypeAnnotation' || annotation.type === 'TSParenthesizedType')
			return typeValue(annotation.typeAnnotation, state);
		if (
			annotation.type === 'TSTypeReference' ||
			(missingImport && annotation.type === 'TSInterfaceHeritage')
		) {
			const name = annotation.typeName ?? annotation.expression;
			if (name?.type === 'Identifier') {
				if (ambiguousTypes.has(name.name)) return UNKNOWN;
				if (nativeTypes.has(name.name)) return nativeTypes.get(name.name);
				if (
					missingImport &&
					(name.name === 'Array' || name.name === 'ReadonlyArray') &&
					!typeDeclarations.has(name.name)
				)
					return {
						kind: 'array',
						element: typeValue(annotation.typeArguments?.params?.[0], state),
					};
				if (typeAliases.has(name.name)) {
					if (state.active.has(name.name)) {
						state.cycles++;
						return UNKNOWN;
					}
					state.active.add(name.name);
					const value = typeValue(typeAliases.get(name.name), state);
					state.active.delete(name.name);
					return value;
				}
			} else if (
				name?.type === 'TSQualifiedName' &&
				name.left?.type === 'Identifier' &&
				!ambiguousTypes.has(name.left.name) &&
				nativeTypes.get(name.left.name)?.kind === 'namespace' &&
				((missingImport ? DEFINITE_HANDLE_TYPES : HANDLE_TYPES).has(name.right.name) ||
					(missingImport && name.right.name === 'Scope'))
			)
				return name.right.name === 'Scope' ? SCOPE : HANDLE;
		} else if (
			missingImport &&
			annotation.type === 'TSImportType' &&
			SIGNAL_MODULES.has(annotation.source?.value)
		) {
			if (DEFINITE_HANDLE_TYPES.has(annotation.qualifier?.name)) return HANDLE;
			if (annotation.qualifier?.name === 'Scope') return SCOPE;
		} else if (missingImport && annotation.type === 'TSInterfaceDeclaration') {
			const own = typeValue(annotation.body, state);
			let properties = own.properties;
			for (const base of annotation.extends ?? []) {
				const inherited = typeValue(base, state);
				if (inherited === HANDLE || inherited === SCOPE) return inherited;
				if (inherited.kind === 'object')
					for (const [name, value] of inherited.properties)
						if (!properties.has(name)) {
							if (properties === own.properties) properties = new Map(properties);
							properties.set(name, value);
						}
			}
			return properties === own.properties ? own : { kind: 'object', properties };
		} else if (
			annotation.type === 'TSTypeLiteral' ||
			(missingImport && annotation.type === 'TSInterfaceBody')
		) {
			const properties = new Map();
			for (const member of annotation.members ?? annotation.body ?? []) {
				const name = propertyName(member.key, member.computed);
				// Resolve only the property a read follows. Eager expansion both
				// loses recursive paths and can explode on branching type graphs.
				if (name !== null)
					properties.set(
						name,
						missingImport
							? { kind: 'typeMember', annotation: member.typeAnnotation }
							: typeValue(member.typeAnnotation, state),
					);
			}
			return { kind: 'object', properties };
		} else if (annotation.type === 'TSUnionType' || annotation.type === 'TSIntersectionType') {
			const values = annotation.types.map((entry) => typeValue(entry, state));
			if (missingImport && annotation.type === 'TSUnionType' && values.includes(NULLISH)) {
				const value = joinTypeValues(values.filter((entry) => entry !== NULLISH));
				return value !== UNKNOWN ? { kind: 'nullable', value } : UNKNOWN;
			}
			return annotation.type === 'TSIntersectionType'
				? mergePossibleValues(values)
				: missingImport
					? joinTypeValues(values)
					: mergeValues(values);
		} else if (missingImport && annotation.type === 'TSArrayType') {
			return { kind: 'array', element: typeValue(annotation.elementType, state) };
		} else if (
			missingImport &&
			annotation.type === 'TSTypeOperator' &&
			annotation.operator === 'readonly'
		) {
			const value = typeValue(annotation.typeAnnotation, state);
			return value.kind === 'array' ? value : UNKNOWN;
		} else if (missingImport && annotation.type === 'TSNumberKeyword') {
			return NUMBER;
		} else if (
			missingImport &&
			(annotation.type === 'TSStringKeyword' ||
				annotation.type === 'TSBooleanKeyword' ||
				annotation.type === 'TSBigIntKeyword')
		) {
			return PRIMITIVE;
		} else if (
			missingImport &&
			(annotation.type === 'TSNullKeyword' || annotation.type === 'TSUndefinedKeyword')
		) {
			return NULLISH;
		} else if (annotation.type === 'TSTupleType') {
			const properties = new Map(
				annotation.elementTypes.map((entry, index) => [String(index), typeValue(entry, state)]),
			);
			return missingImport
				? { kind: 'array', properties, element: UNKNOWN }
				: { kind: 'object', properties };
		}
		return UNKNOWN;
	}
	function resolveTypeMember(value) {
		return value?.kind === 'typeMember' ? typeValue(value.annotation) : value;
	}
	function seenPair(seen, left, right) {
		let matches = seen.get(left);
		if (matches?.has(right)) return true;
		if (!matches) seen.set(left, (matches = new WeakSet()));
		matches.add(right);
		return false;
	}
	function sameProof(left, right, seen) {
		if (left === right) return true;
		left = resolveTypeMember(left);
		right = resolveTypeMember(right);
		if (left === right) return true;
		if (!left || !right || left.kind !== right.kind) return false;
		if (left.kind === 'function') return left.fn === right.fn;
		if (left.kind === 'class') return left.node === right.node;
		if (left.kind === 'typeUnion') {
			seen ??= new WeakMap();
			if (seenPair(seen, left, right)) return true;
			return (
				left.values.length === right.values.length &&
				left.values.every((value, index) => sameProof(value, right.values[index], seen))
			);
		}
		if (left.kind === 'renderChoice')
			return (
				left.values.length === right.values.length &&
				left.values.every((value, index) => sameProof(value, right.values[index], seen))
			);
		if (left.kind === 'renderOutput')
			return (
				left.node === right.node &&
				sameProof(left.target, right.target, seen) &&
				sameProof(left.props, right.props, seen) &&
				left.children.length === right.children.length &&
				left.children.every((value, index) => sameProof(value, right.children[index], seen)) &&
				sameBindings(left.bindings, right.bindings, seen)
			);
		if (left.kind === 'builtin') return left.name === right.name && left.read === right.read;
		if (left.kind === 'namespace') return left.module === right.module;
		if (left.kind === 'nullable') return sameProof(left.value, right.value, seen);
		if (left.kind !== 'object' && left.kind !== 'array') return false;
		seen ??= new WeakMap();
		if (seenPair(seen, left, right)) return true;
		if (left.kind === 'array' && !sameProof(left.element, right.element, seen)) return false;
		if (left.properties === right.properties) return true;
		if (!left.properties || !right.properties || left.properties.size !== right.properties.size)
			return false;
		for (const [name, value] of left.properties)
			if (!sameProof(value, right.properties.get(name), seen)) return false;
		return true;
	}
	function sameBindings(left, right, seen) {
		return (
			left === right ||
			(left != null &&
				right != null &&
				left.size === right.size &&
				[...left].every(([record, value]) => sameProof(value, right.get(record), seen)))
		);
	}
	function mergePossibleValues(values) {
		for (const value of values) if (value.kind === 'handle') return HANDLE;
		return values.find((value) => value.kind !== 'unknown') ?? UNKNOWN;
	}
	function joinTypeValues(values) {
		const alternatives = [];
		for (const value of values)
			for (const entry of value.kind === 'typeUnion' ? value.values : [value])
				if (
					!alternatives.some(
						(existing) =>
							existing === entry || (entry.kind === 'builtin' && sameProof(existing, entry)),
					)
				)
					alternatives.push(entry);
		return alternatives.length === 1
			? alternatives[0]
			: alternatives.length
				? { kind: 'typeUnion', values: alternatives }
				: UNKNOWN;
	}
	function mergeValues(values) {
		if (!missingImport) return mergePossibleValues(values);
		const first = values[0];
		if (first && values.every((value) => sameProof(value, first))) return first;
		// Preserve independently reachable render results without treating an
		// ambiguous value as a definite signal receiver.
		if (values.some(isRenderValue)) {
			const alternatives = [];
			for (const value of values)
				for (const entry of value.kind === 'renderChoice' ? value.values : [value])
					if (!alternatives.some((existing) => sameProof(existing, entry)))
						alternatives.push(entry);
			return { kind: 'renderChoice', values: alternatives };
		}
		return UNKNOWN;
	}
	function memberValue(value, name, index = false) {
		// Project before joining: unrelated fields and recursive links do not
		// change whether every union branch proves the accessed member.
		if (value.kind === 'typeUnion')
			return joinTypeValues(value.values.map((entry) => memberValue(entry, name, index)));
		if (value.kind === 'object') return resolveTypeMember(value.properties.get(name)) ?? UNKNOWN;
		if (value.kind === 'root' && name === 'render')
			return { kind: 'builtin', name, renderComponent: true };
		if (value.kind === 'array') {
			if (index || /^\d+$/.test(name)) return value.properties?.get(name) ?? value.element;
		}
		if (value.kind === 'namespace') return importedValue(value.module, name);
		if (value.kind === 'scope' && SIGNAL_METHODS.has(name))
			return { kind: 'builtin', name, capability: true };
		if (value.kind === 'scope' && name === 'get')
			return { kind: 'builtin', name: 'get', read: true };
		if (value.kind === 'scope' && name === 'isPending')
			return { kind: 'builtin', name, read: !missingImport };
		if (value.kind === 'scope' && name === 'set') return { kind: 'builtin', name: 'set' };
		if (value.kind === 'handle' && name === 'set') return { kind: 'builtin', name: 'set' };
		if (value.kind === 'handle' && READ_METHODS.includes(name))
			return { kind: 'builtin', name, read: true };
		return UNKNOWN;
	}
	let literalReferences;
	let opaqueReferences;
	function closedReferences(record) {
		if (!literalReferences) {
			literalReferences = new Map();
			opaqueReferences = new Set();
			function index(candidate, parent, key) {
				if (!candidate || typeof candidate !== 'object') return;
				// Direct eval can reference a lexical binding without an AST reference.
				if (
					candidate.type === 'WithStatement' ||
					(candidate.type === 'CallExpression' && unwrap(candidate.callee)?.name === 'eval')
				) {
					opaqueReferences = null;
					return;
				}
				if (
					(candidate.type === 'Identifier' || candidate.type === 'JSXIdentifier') &&
					isIdentifierReference(candidate, parent, key, lexical)
				) {
					if (!lexical.nodeScopes.has(candidate)) opaqueReferences.add(candidate.name);
					else {
						const binding = recordFor(candidate);
						if (binding) {
							let references = literalReferences.get(binding);
							if (!references) literalReferences.set(binding, (references = { all: [] }));
							references.all.push(candidate);
						}
					}
				}
				forEachRuntimeAstChild(candidate, (child, childKey) => {
					if (opaqueReferences) index(child, candidate, childKey);
				});
			}
			index(ast, null, null);
		}
		return opaqueReferences && !opaqueReferences.has(record.name)
			? literalReferences.get(record)
			: null;
	}
	function localLiteral(record, type) {
		const declarator = parents.get(record?.declarations[0]);
		const declaration = parents.get(declarator);
		const literal = unwrap(declarator?.init);
		return record?.declarations.length === 1 &&
			declarator?.type === 'VariableDeclarator' &&
			declaration?.kind === 'const' &&
			parents.get(declaration)?.type !== 'ExportNamedDeclaration' &&
			literal?.type === type
			? literal
			: null;
	}
	function discardedMember(reference) {
		const member = parents.get(reference);
		const use = parents.get(member);
		return member?.type === 'MemberExpression' &&
			member.object === reference &&
			(use?.type === 'ExpressionStatement' ||
				(use?.type === 'UnaryExpression' && use.operator === 'void'))
			? member
			: null;
	}
	function arrayLengthRead(reference) {
		const member = parents.get(reference);
		if (
			member?.type !== 'MemberExpression' ||
			member.object !== reference ||
			propertyName(member.property, member.computed) !== 'length'
		)
			return false;
		let current = member;
		let parent = parents.get(current);
		while (WRAPPERS.has(parent?.type)) {
			current = parent;
			parent = parents.get(current);
		}
		return !(
			((parent?.type === 'AssignmentExpression' || parent?.type === 'AssignmentPattern') &&
				parent.left === current) ||
			parent?.type === 'UpdateExpression' ||
			(parent?.type === 'UnaryExpression' && parent.operator === 'delete') ||
			((parent?.type === 'ForInStatement' || parent?.type === 'ForOfStatement') &&
				parent.left === current) ||
			parent?.type === 'ArrayPattern' ||
			parent?.type === 'RestElement' ||
			(parent?.type === 'Property' && parents.get(parent)?.type === 'ObjectPattern')
		);
	}
	function ownLiteralProperty(object, member) {
		const name = propertyName(member.property, member.computed);
		if (name === null) return null;
		let setter = null;
		for (let index = object.properties.length - 1; index >= 0; index--) {
			const property = object.properties[index];
			if (property.type === 'SpreadElement') return null;
			const key = propertyName(property.key, property.computed);
			if (key === null) return null;
			if (key !== name) continue;
			// This syntax sets the prototype instead of defining an own property.
			if (
				key === '__proto__' &&
				!property.computed &&
				!property.method &&
				!property.shorthand &&
				property.kind === 'init'
			)
				continue;
			if (property.kind === 'set') setter ??= property;
			else return property.kind === 'get' ? property : (setter ?? property);
		}
		return setter;
	}
	function activeReferences(record, literal) {
		const references = closedReferences(record);
		if (!references) return null;
		return (references.active ??= references.all.filter((reference) => {
			if (literal.type === 'ArrayExpression') return !arrayLengthRead(reference);
			const member = discardedMember(reference);
			return !member || ownLiteralProperty(literal, member)?.kind !== 'init';
		}));
	}
	function recordValue(record) {
		if (record === null) return UNKNOWN;
		if (parameterValues?.has(record)) return parameterValues.get(record);
		if (record.forced && record.forced.kind !== 'unknown') return record.forced;
		if (recordCache.has(record)) return recordCache.get(record);
		if (activeRecords.has(record)) return UNKNOWN;
		activeRecords.add(record);
		const values = missingImport
			? []
			: record.declarations.map((node) => typeValue(node.typeAnnotation));
		if (missingImport && record.annotations?.length) {
			for (const { annotation, path } of record.annotations) {
				let value = typeValue(annotation);
				for (const name of path) value = memberValue(value, name);
				values.push(value);
			}
			// The authored type is the available contract for a typed binding;
			// an ambiguous contract cannot prove a signal even if its initializer can.
			let result = mergeValues(values);
			if (record.expressions.length)
				result = refineRenderValue(
					result,
					mergeValues(
						record.expressions.map(({ expression, path }) => {
							let value = valueOf(expression);
							for (const name of path) value = memberValue(value, name);
							return value;
						}),
					),
				);
			activeRecords.delete(record);
			recordCache.set(record, result);
			return result;
		}
		for (const { expression, path } of record.expressions) {
			let value = valueOf(expression);
			for (const name of path) value = memberValue(value, name);
			values.push(value);
		}
		const result = mergeValues(values);
		activeRecords.delete(record);
		recordCache.set(record, result);
		return result;
	}
	function refineRenderValue(contract, supplied, seen) {
		if (contract === supplied) return contract;
		if (
			(contract === UNKNOWN || contract.kind === 'typeUnion') &&
			(isRenderValue(supplied) ||
				supplied === PRIMITIVE ||
				supplied === NUMBER ||
				supplied === NULLISH)
		)
			return supplied;
		if (contract.kind === 'array' && supplied?.kind === 'array' && supplied.properties) {
			seen ??= new WeakMap();
			if (seenPair(seen, contract, supplied)) return contract;
			const element = contract.element ?? UNKNOWN;
			const properties = new Map();
			for (const [index, value] of supplied.properties)
				properties.set(
					index,
					refineRenderValue(
						resolveTypeMember(contract.properties?.get(index) ?? element),
						resolveTypeMember(value),
						seen,
					),
				);
			return { kind: 'array', properties, element };
		}
		if (contract.kind !== 'object' || supplied?.kind !== 'object') return contract;
		seen ??= new WeakMap();
		if (seenPair(seen, contract, supplied)) return contract;
		let properties = null;
		for (const [name, value] of contract.properties) {
			if (!supplied.properties.has(name)) continue;
			const original = resolveTypeMember(value);
			const refined = refineRenderValue(
				original,
				resolveTypeMember(supplied.properties.get(name)),
				seen,
			);
			if (refined !== original) (properties ??= new Map(contract.properties)).set(name, refined);
		}
		return properties ? { kind: 'object', properties } : contract;
	}
	function functionValue(fn) {
		if (functionCache.has(fn)) return functionCache.get(fn);
		if (activeFunctions.has(fn))
			return { kind: 'function', fn, result: UNKNOWN, reads: false, returns: false };
		activeFunctions.add(fn);
		const returned = [];
		let reads = false;
		let jsx = false;
		let returnsRender = false;
		let callsRenderHook = false;
		function producesRender(expression) {
			const node = unwrap(expression);
			if (node?.type === 'ConditionalExpression')
				return producesRender(node.consequent) || producesRender(node.alternate);
			if (node?.type === 'LogicalExpression')
				return producesRender(node.left) || producesRender(node.right);
			return isRenderValue(valueOf(expression));
		}
		function addReturn(expression) {
			const node = unwrap(expression);
			if (node?.type === 'CallExpression' && valueOf(node.callee).name === 'set') return;
			if (missingImport && producesRender(expression)) returnsRender = true;
			returned.push(valueOf(expression));
		}
		function visit(node) {
			if (!node || FUNCTION_TYPES.has(node.type)) return;
			if (
				node.type === 'JSXCodeBlock' ||
				node.type === 'JSXElement' ||
				node.type === 'JSXFragment'
			) {
				jsx = true;
			}
			if (node.type === 'ReturnStatement' && node.argument) addReturn(node.argument);
			if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
				const callee = valueOf(node.callee);
				if (callee.read === true || (callee.kind === 'function' && callee.reads)) reads = true;
				if (
					missingImport &&
					((callee.kind === 'builtin' && HOOK_NAMES.has(callee.name)) || callee.callsRenderHook)
				)
					callsRenderHook = true;
			}
			children(node, visit);
		}
		if (fn.body?.type !== 'BlockStatement' && fn.body?.type !== 'JSXCodeBlock') addReturn(fn.body);
		visit(fn.body);
		const result = {
			kind: 'function',
			fn,
			result: mergeValues(returned),
			reads,
			returns: returned.length > 0,
			jsx,
			returnsRender,
			callsRenderHook,
		};
		activeFunctions.delete(fn);
		functionCache.set(fn, result);
		return result;
	}
	function valueOf(input) {
		if (missingImport && (input?.type === 'TSAsExpression' || input?.type === 'TSTypeAssertion'))
			return refineRenderValue(typeValue(input.typeAnnotation), valueOf(input.expression));
		const node = unwrap(input);
		if (!node) return UNKNOWN;
		if (missingImport && evaluatedValues?.has(node)) return evaluatedValues.get(node);
		if (missingImport && RENDER_NODES.has(node.type)) return renderOutput(node);
		if (missingImport && (node.type === 'ClassDeclaration' || node.type === 'ClassExpression'))
			return { kind: 'class', node };
		if (missingImport && node.type === 'Literal' && typeof node.value === 'number') return NUMBER;
		if (missingImport && node.type === 'Literal' && node.value === null) return NULLISH;
		if (missingImport && node.type === 'Literal' && typeof node.value === 'boolean')
			return PRIMITIVE;
		if (missingImport && isKnownTextChildExpression(input, null)) return PRIMITIVE;
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
			const record = recordFor(node);
			const value = recordValue(record);
			return missingImport && record?.hasMemberAssignment
				? arrayValueAt(record, node, value)
				: value;
		}
		if (FUNCTION_TYPES.has(node.type)) return functionValue(node);
		if (
			node.type === 'MemberExpression' ||
			node.type === 'OptionalMemberExpression' ||
			node.type === 'JSXMemberExpression'
		) {
			let receiver = valueOf(node.object);
			// The nullish branch cannot invoke any member, regardless of whether
			// narrowing was written as a guard or as optional chaining.
			if (receiver.kind === 'nullable') receiver = receiver.value;
			return memberValue(
				receiver,
				propertyName(node.property, node.computed),
				node.computed && valueOf(node.property) === NUMBER,
			);
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = valueOf(node.callee);
			if (callee.kind === 'function') return callee.result;
			if (callee.kind === 'builtin') {
				if (missingImport && callee.name === 'memo') return valueOf(node.arguments[0]);
				if (missingImport && callee.name === 'createRoot') return ROOT;
				if (missingImport && callee.name === 'createElement') return renderOutput(node);
				if (callee.name === 'createScope') return SCOPE;
				if (
					SIGNAL_METHODS.has(callee.name) ||
					SIGNAL_FACTORIES.has(callee.name) ||
					LOCAL_HOOKS.has(callee.name)
				)
					return HANDLE;
			}
			return UNKNOWN;
		}
		if (node.type === 'ObjectExpression') {
			const properties = new Map();
			for (const property of node.properties ?? []) {
				if (property.type === 'SpreadElement') {
					const value = valueOf(property.argument);
					if (value.kind === 'object')
						for (const [name, entry] of value.properties) properties.set(name, entry);
				} else {
					const name = propertyName(property.key, property.computed);
					let value = valueOf(property.value);
					if (property.kind === 'get' && value.kind === 'function') value = value.result;
					if (name !== null) properties.set(name, value);
				}
			}
			return { kind: 'object', properties };
		}
		if (node.type === 'ArrayExpression') {
			const properties = new Map(
				(node.elements ?? []).map((element, index) => [String(index), valueOf(element)]),
			);
			return missingImport
				? { kind: 'array', properties, element: mergeValues([...properties.values()]) }
				: { kind: 'object', properties };
		}
		if (node.type === 'ConditionalExpression')
			return mergeValues([valueOf(node.consequent), valueOf(node.alternate)]);
		if (node.type === 'LogicalExpression')
			return mergeValues([valueOf(node.left), valueOf(node.right)]);
		if (node.type === 'SequenceExpression') return valueOf(node.expressions.at(-1));
		if (node.type === 'AssignmentExpression') return valueOf(node.right);
		return UNKNOWN;
	}
	function arrayValueAt(record, reference, value) {
		if (
			value.kind !== 'array' ||
			!value.properties ||
			record.annotations?.length !== 1 ||
			record.annotations[0].path.length !== 0
		)
			return value;
		const contract = typeValue(record.annotations[0].annotation);
		if (contract.kind !== 'array') return value;
		const literal = localLiteral(record, 'ArrayExpression');
		if (
			!literal ||
			literal.elements.some((element) => !element || element.type === 'SpreadElement')
		)
			return value;
		const lifetime = arrayLifetime(record, literal);
		if (!lifetime?.uses.has(reference)) return value;
		const { block, writes } = lifetime;
		let current = reference;
		while (current && parents.get(current) !== block) {
			current = parents.get(current);
			if (FUNCTION_TYPES.has(current?.type)) return value;
		}
		const end = block.render === current ? block.body.length : block.body.indexOf(current);
		let properties = null;
		for (let index = 0; index < end; index++) {
			const write = writes.get(block.body[index]);
			if (!write) continue;
			// Every write in this statement list dominates the use; other
			// references only observe length or consume the array in DOM slots.
			if (write.name === 'length') properties = new Map();
			else {
				properties ??= new Map(value.properties);
				properties.set(
					write.name,
					refineRenderValue(
						resolveTypeMember(contract.properties?.get(write.name) ?? contract.element ?? UNKNOWN),
						valueOf(write.assignment.right),
					),
				);
			}
		}
		// Assignment order does not change array iteration order. Dispatch must
		// see lower indices first, including indices filled after higher ones.
		if (properties?.size > 1)
			properties = new Map([...properties].sort(([left], [right]) => Number(left) - Number(right)));
		return properties ? { ...value, properties } : value;
	}
	function arrayLifetime(record, literal) {
		const indexed = closedReferences(record);
		if (!indexed) return null;
		if ('array' in indexed) return indexed.array;
		let block = null;
		const writes = new Map();
		const uses = new Set();
		for (const reference of activeReferences(record, literal)) {
			const member = parents.get(reference);
			const assignment = parents.get(member);
			const statement = parents.get(assignment);
			const container = parents.get(statement);
			const name =
				member?.type === 'MemberExpression' ? propertyName(member.property, member.computed) : null;
			if (
				member?.object === reference &&
				assignment?.type === 'AssignmentExpression' &&
				assignment.operator === '=' &&
				assignment.left === member &&
				statement?.type === 'ExpressionStatement' &&
				STATEMENT_LIST_TYPES.has(container?.type) &&
				(name === 'length'
					? unwrap(assignment.right)?.value === 0
					: name !== null && /^(0|[1-9]\d*)$/.test(name) && Number(name) < 2 ** 32 - 1)
			) {
				if (block && block !== container) return (indexed.array = null);
				block = container;
				writes.set(statement, { assignment, name });
			} else uses.add(reference);
		}
		if (!block || (uses.size > 1 && [...uses].some((reference) => !domArrayChild(reference))))
			return (indexed.array = null);
		return (indexed.array = { block, writes, uses });
	}
	function domArrayChild(reference) {
		const container = parents.get(reference);
		const parent = parents.get(container);
		return (
			container?.type === 'JSXExpressionContainer' &&
			container.expression === reference &&
			(parent?.type === 'JSXFragment' || (parent?.type === 'JSXElement' && !isComponentTag(parent)))
		);
	}
	function forcePattern(pattern, value) {
		pattern = unwrap(pattern);
		if (!pattern) return false;
		if (pattern.type === 'Identifier') {
			const record = recordFor(pattern);
			if (record && value.kind === 'handle' && record.forced?.kind !== 'handle') {
				record.forced = HANDLE;
				return true;
			}
			return false;
		}
		let changed = false;
		if (pattern.type === 'AssignmentPattern') return forcePattern(pattern.left, value);
		if (pattern.type === 'ArrayPattern') {
			for (let index = 0; index < pattern.elements.length; index++)
				changed =
					forcePattern(pattern.elements[index], memberValue(value, String(index))) || changed;
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? [])
				changed =
					forcePattern(
						property.value,
						memberValue(value, propertyName(property.key, property.computed)),
					) || changed;
		}
		return changed;
	}
	if (missingImport) {
		recordCache = new Map();
		functionCache = new WeakMap();
		parameterValues = new Map();
		evaluatedValues = new WeakMap();
		returnedValues = null;
		renderOutput = describeRenderOutput;
		const diagnostics = [];
		const activeRenderFunctions = new Set();
		const visitedContexts = new WeakMap();
		const visitedReads = new WeakSet();
		// The visitor carries every possible synchronous completion through a
		// statement. Only NORMAL paths continue into the next statement; finally
		// and catch can resume an abrupt completion, while await leaves render.
		// Renderer suspension is a thrown control value, distinct from await.
		const NORMAL = 1;
		const RETURN = 2;
		const THROW = 4;
		const SUSPEND = 8;
		const BREAK = 16;
		const CONTINUE = 32;
		const RENDER_SUSPEND = 64;
		const EXCEPTION = THROW | RENDER_SUSPEND;
		let constructionContext = null;
		let rendering = false;
		let dispatchReturns = false;
		function complete(state, exits) {
			state.exits = (state.exits & ~NORMAL) | exits;
		}
		function bindParameter(pattern, value) {
			if (!pattern || !value || value === UNKNOWN) return;
			if (pattern.type === 'Identifier') {
				const record = recordFor(pattern);
				if (record && record.expressions.length === 0) {
					const contract = record.annotations?.length ? recordValue(record) : null;
					const refined = contract ? refineRenderValue(contract, value) : value;
					if (refined !== contract) parameterValues.set(record, refined);
				}
			} else if (pattern.type === 'AssignmentPattern') bindParameter(pattern.left, value);
			else if (pattern.type === 'ObjectPattern') {
				for (const property of pattern.properties ?? [])
					bindParameter(
						property.value,
						memberValue(value, propertyName(property.key, property.computed)),
					);
			} else if (pattern.type === 'ArrayPattern') {
				for (let index = 0; index < pattern.elements.length; index++)
					bindParameter(pattern.elements[index], memberValue(value, String(index)));
			}
		}
		function lexicalBindings(node) {
			const scope = lexical.nodeScopes.get(node);
			return new Map(
				[...parameterValues].filter(
					([record]) => lexical.resolveBinding(scope, record.name)?.scope === record.scope,
				),
			);
		}
		function visitFunction(fn, arguments_ = [], construction = null, dispatchResult = false) {
			// A presentation view has its own renderer-free publication semantics;
			// sampled signal values there are intentionally not subscriptions.
			if (fn.generator || isDomBindingDirective(fn.body?.body?.[0]))
				return { exits: NORMAL, value: UNKNOWN };
			if (activeRenderFunctions.has(fn)) return { exits: NORMAL | EXCEPTION, value: UNKNOWN };
			activeRenderFunctions.add(fn);
			const previous = [
				recordCache,
				functionCache,
				parameterValues,
				evaluatedValues,
				returnedValues,
				constructionContext,
				dispatchReturns,
			];
			recordCache = new Map();
			functionCache = new WeakMap();
			evaluatedValues = new WeakMap();
			returnedValues = [];
			constructionContext = construction;
			dispatchReturns = dispatchResult;
			// Dynamic callers are not lexical parents. Keep only proofs the callee
			// can capture; retaining the call stack multiplies equivalent paths.
			parameterValues = lexicalBindings(fn);
			for (let index = 0; index < arguments_.length; index++)
				bindParameter(fn.params[index], arguments_[index]);
			let contexts = visitedContexts.get(fn);
			if (!contexts) visitedContexts.set(fn, (contexts = []));
			const visited = contexts.find(
				(context) =>
					context.rendering === rendering &&
					context.dispatchResult === dispatchResult &&
					context.construction === construction?.node &&
					sameBindings(context.parameters, parameterValues),
			);
			let result = visited?.result;
			if (!visited) {
				const state = { exits: NORMAL };
				for (const param of fn.params ?? []) visitRender(param, state);
				if (fn.body?.type === 'JSXCodeBlock') visitCodeBlock(fn.body, state, dispatchResult);
				else if (dispatchResult && fn.body?.type !== 'BlockStatement') visitOutput(fn.body, state);
				else visitRender(fn.body, state);
				if (state.exits & NORMAL)
					returnedValues.push(fn.body?.type === 'BlockStatement' ? NULLISH : valueOf(fn.body));
				result = {
					exits: fn.async
						? NORMAL
						: (state.exits & (NORMAL | RETURN) ? NORMAL : 0) | (state.exits & EXCEPTION),
					value: fn.async ? UNKNOWN : mergeValues(returnedValues),
				};
				contexts.push({
					parameters: parameterValues,
					construction: construction?.node,
					rendering,
					dispatchResult,
					result,
				});
			}
			[
				recordCache,
				functionCache,
				parameterValues,
				evaluatedValues,
				returnedValues,
				constructionContext,
				dispatchReturns,
			] = previous;
			activeRenderFunctions.delete(fn);
			return result;
		}
		function visitComponent(expression, arguments_ = []) {
			const node = unwrap(expression);
			if (node?.type === 'CallExpression' && valueOf(node.callee).name === 'createElement')
				return visitComponent(node.arguments[0], [valueOf(node.arguments[1])]);
			return visitComponentValue(valueOf(expression), arguments_);
		}
		function visitComponentValue(value, arguments_) {
			if (value.kind === 'function') {
				const previous = rendering;
				rendering = true;
				const { exits } = visitFunction(value.fn, arguments_, null, true);
				rendering = previous;
				return exits;
			}
			return NORMAL | EXCEPTION;
		}
		function visitExport(expression) {
			const value = valueOf(expression);
			if (value.kind !== 'function') return;
			if (value.fn.body?.type === 'JSXCodeBlock' || value.returnsRender || value.callsRenderHook)
				visitComponent(expression);
			else visitFunction(value.fn);
		}
		function jsxProps(opening, children_ = []) {
			const properties = new Map();
			for (const attribute of opening?.attributes ?? []) {
				if (attribute.type === 'JSXSpreadAttribute') {
					const spread = valueOf(attribute.argument);
					if (spread.kind === 'object')
						for (const [name, value] of spread.properties) properties.set(name, value);
					else properties.clear();
				} else {
					const name = propertyName(attribute.name);
					if (name !== null)
						properties.set(name, valueOf(attribute.value?.expression ?? attribute.value));
				}
			}
			const children = children_.filter((child) => child.type !== 'JSXText' || child.value.trim());
			if (children.length === 1) properties.set('children', childValue(children[0]));
			else if (children.length > 1)
				properties.set('children', {
					kind: 'array',
					properties: new Map(children.map((child, index) => [String(index), childValue(child)])),
				});
			return { kind: 'object', properties };
		}
		function literalProperty(member) {
			let object = unwrap(member.object);
			if (object?.type === 'Identifier') {
				const record = recordFor(object);
				const literal = localLiteral(record, 'ObjectExpression');
				const references = literal && activeReferences(record, literal);
				if (
					!references ||
					references.length > 1 ||
					(references.length === 1 && references[0] !== object)
				)
					return null;
				// Every other reference discards an own data property. The object
				// cannot have escaped or had this property replaced by an accessor.
				object = literal;
			}
			return object?.type === 'ObjectExpression' ? ownLiteralProperty(object, member) : null;
		}
		function reportRead(node) {
			if (!rendering || visitedReads.has(node)) return;
			visitedReads.add(node);
			diagnostics.push(
				nativeReadDiagnostic(
					'OCTANE_NATIVE_SIGNAL_IMPORT',
					source,
					filename,
					node.start,
					node.end,
					"A native signal read during render requires a runtime import from 'octane/signals'. Add import 'octane/signals' to this module; a type-only import does not enable read tracking.",
				),
			);
		}
		function freshArrayCallbackArguments(call) {
			const member = unwrap(call.callee);
			if (member?.type !== 'MemberExpression' || member.optional) return null;
			const name = propertyName(member.property, member.computed);
			if (!SYNCHRONOUS_ARRAY_CALLBACKS.has(name)) return null;
			const array = unwrap(member.object);
			if (
				array?.type !== 'ArrayExpression' ||
				array.elements.some((item) => !item || item.type === 'SpreadElement')
			)
				return null;
			const elements = [...array.elements];
			if (elements.length === 0) return null;
			// Only the freshly created receiver rules out an own method override.
			// Model the first invocation, which later callback mutations cannot alter.
			if (name === 'sort' || name === 'toSorted') {
				if (
					elements.length < 2 ||
					elements.some(
						(item) =>
							item.type !== 'Literal' &&
							['unknown', 'nullable', 'nullish'].includes(valueOf(item).kind),
					)
				)
					return null;
				const element = mergeValues(elements.map(valueOf));
				return [element, element];
			}
			if (name === 'reduce' || name === 'reduceRight') {
				if (name === 'reduceRight') elements.reverse();
				if (call.arguments.length > 1) return [valueOf(call.arguments[1]), valueOf(elements[0])];
				return elements.length > 1 ? [valueOf(elements[0]), valueOf(elements[1])] : null;
			}
			return [
				valueOf(
					elements[name === 'findLast' || name === 'findLastIndex' ? elements.length - 1 : 0],
				),
				NUMBER,
			];
		}
		function constantValue(expression, active = new Set()) {
			const node = unwrap(expression);
			if (node?.type === 'Literal') return { value: node.value };
			if (node?.type === 'UnaryExpression' && node.operator === '!') {
				const inner = constantValue(node.argument, active);
				return inner === null ? null : { value: !inner.value };
			}
			if (node?.type === 'Identifier') {
				const record = recordFor(node);
				const declarator = parents.get(record?.declarations[0]);
				if (
					record &&
					!active.has(record) &&
					record.expressions.length === 1 &&
					record.expressions[0].path.length === 0 &&
					declarator?.type === 'VariableDeclarator' &&
					parents.get(declarator)?.kind === 'const'
				) {
					active.add(record);
					return constantValue(record.expressions[0].expression, active);
				}
			}
			return null;
		}
		function intrinsicErrorConstruction(node) {
			return (
				node?.type === 'NewExpression' &&
				node.callee?.type === 'Identifier' &&
				ERROR_CONSTRUCTORS.has(node.callee.name) &&
				recordFor(node.callee) === null
			);
		}
		function primitiveConstant(expression) {
			const constant = constantValue(expression);
			return constant !== null && (constant.value === null || typeof constant.value !== 'object');
		}
		function thrownExits(expression) {
			return primitiveConstant(expression) || intrinsicErrorConstruction(unwrap(expression))
				? THROW
				: EXCEPTION;
		}
		function childValue(node) {
			if (node?.type === 'JSXText' || node?.expression?.type === 'JSXEmptyExpression')
				return PRIMITIVE;
			return valueOf(node?.type === 'JSXExpressionContainer' ? node.expression : node);
		}
		function describeRenderOutput(node) {
			let target = null;
			let props = null;
			let children = [];
			let bindings = null;
			if (node.type === 'JSXElement' && isComponentTag(node)) {
				const opening = node.openingElement;
				target = valueOf(opening.name.expression ?? opening.name);
				props = jsxProps(opening, node.children);
			} else if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
				children = (node.children ?? []).map(childValue);
			} else if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
				const tag = unwrap(node.arguments[0]);
				target = tag?.type === 'Literal' && typeof tag.value === 'string' ? null : valueOf(tag);
				props = valueOf(node.arguments[1]);
				children = node.arguments.slice(2).map(valueOf);
				if (children.length) {
					const properties = new Map(props.kind === 'object' ? props.properties : []);
					properties.set(
						'children',
						children.length === 1
							? children[0]
							: {
									kind: 'array',
									properties: new Map(children.map((child, index) => [String(index), child])),
								},
					);
					props = { kind: 'object', properties };
				} else if (props.kind === 'object' && props.properties.has('children'))
					children = [props.properties.get('children')];
			} else bindings = lexicalBindings(node);
			return { kind: 'renderOutput', node, target, props, children, bindings };
		}
		function dispatchValue(value, state) {
			if (!(state.exits & NORMAL)) return;
			value = resolveTypeMember(value);
			if (value.kind === 'nullable') value = value.value;
			if (value === PRIMITIVE || value === NUMBER || value === NULLISH || value === HANDLE) return;
			if (value.kind === 'renderChoice' || value.kind === 'typeUnion') {
				let exits = 0;
				for (const alternative of value.values) {
					const branch = { exits: NORMAL };
					dispatchValue(alternative, branch);
					exits |= branch.exits;
				}
				complete(state, exits);
				return;
			}
			if (value.kind === 'array' && value.properties) {
				for (const child of value.properties.values()) dispatchValue(child, state);
				return;
			}
			if (value.kind !== 'renderOutput') {
				state.exits |= EXCEPTION;
				return;
			}
			if (value.target) complete(state, visitComponentValue(value.target, [value.props]));
			else if (value.bindings) {
				const previous = [recordCache, functionCache, parameterValues, evaluatedValues];
				recordCache = new Map();
				functionCache = new WeakMap();
				parameterValues = value.bindings;
				evaluatedValues = new WeakMap();
				visitRender(value.node, state, true);
				[recordCache, functionCache, parameterValues, evaluatedValues] = previous;
			} else for (const child of value.children) dispatchValue(child, state);
		}
		function visitOutput(node, state) {
			if (!node) return;
			visitRender(node, state);
			dispatchValue(childValue(node), state);
		}
		function visitCodeBlock(node, state, dispatch) {
			for (const statement of node.body ?? []) visitRender(statement, state);
			if (dispatch) visitOutput(node.render, state);
			else visitRender(node.render, state);
		}
		function visitArm(node, state) {
			if (!node) return;
			const previous = [dispatchReturns, returnedValues];
			dispatchReturns = false;
			returnedValues = null;
			if (node.type === 'CatchClause') {
				visitRender(node.param, state);
				visitRender(node.resetParam, state);
				node = node.body;
			}
			const statements = Array.isArray(node) ? node : node.body;
			if (!Array.isArray(statements)) visitOutput(node, state);
			else
				for (let index = 0; index < statements.length; index++) {
					if (index === statements.length - 1) visitOutput(statements[index], state);
					else visitRender(statements[index], state);
				}
			if (state.exits & (RETURN | CONTINUE))
				state.exits = (state.exits & ~(RETURN | CONTINUE)) | NORMAL;
			[dispatchReturns, returnedValues] = previous;
		}
		function initializeInstance(node, state) {
			for (const member of node.body?.body ?? [])
				if (member.type === 'PropertyDefinition' && !member.static)
					visitRender(member.value, state);
		}
		function instantiateClass(node, state, arguments_, ancestors = new Set()) {
			if (ancestors.has(node) || node.decorators?.length) return;
			const active = new Set(ancestors).add(node);
			const members = node.body?.body ?? [];
			const constructor = members.find(
				(member) => member.type === 'MethodDefinition' && member.kind === 'constructor',
			);
			if (node.superClass && constructor) {
				complete(state, visitFunction(constructor.value, arguments_, { node, active }).exits);
				return;
			}
			if (node.superClass) {
				const base = valueOf(node.superClass);
				if (base.kind === 'class') instantiateClass(base.node, state, arguments_, active);
				else state.exits |= EXCEPTION;
			}
			initializeInstance(node, state);
			if (constructor && state.exits & NORMAL)
				complete(state, visitFunction(constructor.value, arguments_).exits);
		}
		function visitLoop(node, state) {
			const doWhile = node.type === 'DoWhileStatement';
			if (node.init) visitRender(node.init, state);
			if (!doWhile && node.test) visitRender(node.test, state);
			if (!(state.exits & NORMAL)) return;
			const test = node.test ? constantValue(node.test) : { value: true };
			if (!doWhile && test !== null && !test.value) return;
			const body = { exits: NORMAL };
			visitRender(node.body, body);
			if (body.exits & CONTINUE) body.exits = (body.exits & ~CONTINUE) | NORMAL;
			if (node.update) visitRender(node.update, body);
			if (doWhile && node.test) visitRender(node.test, body);
			const canExit =
				body.exits & BREAK ||
				(test === null && !doWhile) ||
				((test === null || !test.value) && body.exits & NORMAL);
			complete(state, (body.exits & (RETURN | EXCEPTION | SUSPEND)) | (canExit ? NORMAL : 0));
		}
		function visitIterableLoop(node, state) {
			visitRender(node.right, state);
			if (!(state.exits & NORMAL)) return;
			if (node.await) return complete(state, SUSPEND);
			const iterable = unwrap(node.right);
			const forOf = node.type !== 'ForInStatement';
			const visitBody = node.type === 'JSXForExpression' ? visitArm : visitRender;
			if (forOf && iterable?.type === 'ArrayExpression' && !iterable.elements.length)
				return visitBody(node.empty, state);
			const previous = [recordCache, functionCache, parameterValues];
			const value = valueOf(node.right);
			recordCache = new Map();
			functionCache = new WeakMap();
			parameterValues = new Map(parameterValues);
			if (forOf && value.kind === 'array') {
				const binding =
					node.left?.type === 'VariableDeclaration' ? node.left.declarations[0]?.id : node.left;
				bindParameter(binding, value.element);
			}
			const body = { exits: NORMAL };
			visitRender(node.left, body);
			visitRender(node.key, body);
			visitBody(node.body, body);
			[recordCache, functionCache, parameterValues] = previous;
			const nonempty =
				forOf && iterable?.type === 'ArrayExpression' && iterable.elements.length > 0;
			const empty = { exits: nonempty ? 0 : NORMAL };
			visitBody(node.empty, empty);
			const canExit = body.exits & (NORMAL | BREAK | CONTINUE);
			complete(
				state,
				(body.exits & (RETURN | EXCEPTION | SUSPEND)) | (canExit ? NORMAL : 0) | empty.exits,
			);
		}
		function visitSwitch(node, state) {
			visitRender(node.discriminant, state);
			if (!(state.exits & NORMAL)) return;
			const template = node.type === 'JSXSwitchExpression';
			function visitCase(entry, result) {
				if (template) visitArm(entry.consequent, result);
				else for (const statement of entry.consequent) visitRender(statement, result);
			}
			const discriminant = constantValue(node.discriminant);
			const values = node.cases.map((entry) => entry.test && constantValue(entry.test));
			if (
				discriminant !== null &&
				values.every((value, index) => value !== null || !node.cases[index].test)
			) {
				let selected = -1;
				let fallback = -1;
				for (let index = 0; index < node.cases.length; index++) {
					const entry = node.cases[index];
					if (!entry.test) fallback = index;
					else {
						visitRender(entry.test, state);
						if (values[index].value === discriminant.value) {
							selected = index;
							break;
						}
					}
				}
				if (selected < 0) selected = fallback;
				if (selected >= 0) {
					if (template) visitCase(node.cases[selected], state);
					else for (const entry of node.cases.slice(selected)) visitCase(entry, state);
				}
			} else {
				const unmatched = { exits: NORMAL };
				const matched = { exits: 0 };
				let hasDefault = false;
				for (const entry of node.cases) {
					if (entry.test) visitRender(entry.test, unmatched);
					else hasDefault = true;
					if (template) {
						const branch = { exits: unmatched.exits & NORMAL };
						visitCase(entry, branch);
						matched.exits |= branch.exits;
					} else {
						matched.exits |= unmatched.exits & NORMAL;
						visitCase(entry, matched);
					}
				}
				complete(state, matched.exits | (hasDefault ? unmatched.exits & ~NORMAL : unmatched.exits));
			}
			if (state.exits & BREAK) state.exits = (state.exits & ~BREAK) | NORMAL;
		}
		function visitTry(node, state) {
			const block = { exits: NORMAL };
			visitRender(node.block, block);
			let exits = block.exits;
			if (node.handler && exits & EXCEPTION) {
				const caught = { exits: NORMAL };
				visitRender(node.handler, caught);
				exits = (exits & ~EXCEPTION) | caught.exits;
			}
			if (node.finalizer && exits & ~SUSPEND) {
				const finalized = { exits: NORMAL };
				visitRender(node.finalizer, finalized);
				exits =
					(exits & SUSPEND) |
					(finalized.exits & ~NORMAL) |
					(finalized.exits & NORMAL ? exits & ~SUSPEND : 0);
			}
			complete(state, exits);
		}
		function visitTemplateTry(node, state) {
			// Each arm is a separate render helper. Its return/continue ends the
			// arm, not the surrounding component or either fallback.
			function arm(node) {
				const result = { exits: NORMAL };
				visitArm(node, result);
				return result.exits;
			}
			const primary = arm(node.block);
			let exits = primary & ~EXCEPTION;
			if (primary & THROW) exits |= node.handler ? arm(node.handler) : THROW;
			if (primary & RENDER_SUSPEND)
				exits |= node.pending
					? arm(node.pending)
					: options.mode === 'server'
						? NORMAL
						: RENDER_SUSPEND;
			complete(state, exits);
		}
		function visitRender(node, state, dispatchTemplate = false) {
			if (
				!node ||
				typeof node !== 'object' ||
				!(state.exits & NORMAL) ||
				FUNCTION_TYPES.has(node.type)
			)
				return;
			// Template values are inert until a render slot consumes them. JSX
			// descriptor construction still evaluates its authored props/children.
			if (
				RENDER_NODES.has(node.type) &&
				node.type !== 'JSXElement' &&
				node.type !== 'JSXFragment'
			) {
				if (!dispatchTemplate) return;
				if (node.type === 'JSXCodeBlock') return visitCodeBlock(node, state, true);
			}
			// Instance field initializers run when the class is instantiated, not
			// when its declaration is evaluated. A computed field name still runs now.
			if (node.type === 'PropertyDefinition' && !node.static) {
				if (node.computed) visitRender(node.key, state);
				return;
			}
			if (
				node.type === 'IfStatement' ||
				node.type === 'ConditionalExpression' ||
				node.type === 'JSXIfExpression'
			) {
				const visitBranch = node.type === 'JSXIfExpression' ? visitArm : visitRender;
				visitRender(node.test, state);
				if (!(state.exits & NORMAL)) return;
				const branch = constantValue(node.test);
				if (branch !== null) {
					const selected = branch.value ? node.consequent : node.alternate;
					visitBranch(selected, state);
					if (node.type === 'ConditionalExpression' && state.exits & NORMAL)
						evaluatedValues.set(node, valueOf(selected));
				} else {
					const consequent = { exits: NORMAL };
					const alternate = { exits: NORMAL };
					visitBranch(node.consequent, consequent);
					visitBranch(node.alternate, alternate);
					if (node.type === 'ConditionalExpression') {
						const values = [];
						if (consequent.exits & NORMAL) values.push(valueOf(node.consequent));
						if (alternate.exits & NORMAL) values.push(valueOf(node.alternate));
						evaluatedValues.set(node, mergeValues(values));
					}
					complete(state, consequent.exits | alternate.exits);
				}
				return;
			}
			if (node.type === 'LogicalExpression') {
				visitRender(node.left, state);
				if (!(state.exits & NORMAL)) return;
				const left = constantValue(node.left);
				if (
					left !== null &&
					((node.operator === '&&' && !left.value) ||
						(node.operator === '||' && left.value) ||
						(node.operator === '??' && left.value != null))
				) {
					evaluatedValues.set(node, valueOf(node.left));
					return;
				}
				const right = { exits: NORMAL };
				visitRender(node.right, right);
				const values = left === null ? [valueOf(node.left)] : [];
				if (right.exits & NORMAL) values.push(valueOf(node.right));
				evaluatedValues.set(node, mergeValues(values));
				complete(state, right.exits | (left === null ? NORMAL : 0));
				return;
			}
			if (node.type === 'TryStatement') return visitTry(node, state);
			if (node.type === 'JSXTryExpression') return visitTemplateTry(node, state);
			if (node.type === 'SwitchStatement' || node.type === 'JSXSwitchExpression')
				return visitSwitch(node, state);
			if (
				node.type === 'ForOfStatement' ||
				node.type === 'ForInStatement' ||
				node.type === 'JSXForExpression'
			)
				return visitIterableLoop(node, state);
			if (node.type === 'LabeledStatement') {
				visitRender(node.body, state);
				if (state.exits & BREAK) state.exits = (state.exits & ~BREAK) | NORMAL;
				return;
			}
			if (
				node.type === 'WhileStatement' ||
				node.type === 'DoWhileStatement' ||
				node.type === 'ForStatement'
			)
				return visitLoop(node, state);
			children(node, (child) => visitRender(child, state));
			if (!(state.exits & NORMAL)) return;
			if (node.type === 'JSXElement' || node.type === 'JSXFragment')
				evaluatedValues.set(node, describeRenderOutput(node));
			if (node.type === 'AwaitExpression') return complete(state, SUSPEND);
			if (node.type === 'ReturnStatement') {
				const value = node.argument ? valueOf(node.argument) : NULLISH;
				returnedValues?.push(value);
				if (dispatchReturns && node.argument) dispatchValue(value, state);
				if (state.exits & NORMAL) complete(state, RETURN);
				return;
			}
			if (node.type === 'ThrowStatement') return complete(state, thrownExits(node.argument));
			if (node.type === 'BreakStatement') return complete(state, BREAK);
			if (node.type === 'ContinueStatement') return complete(state, CONTINUE);
			if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
				const property = literalProperty(node);
				if (property?.kind === 'get') complete(state, visitFunction(property.value).exits);
				else if (!property) state.exits |= EXCEPTION;
			}
			if (node.type === 'NewExpression') {
				const target = valueOf(node.callee);
				if (target.kind === 'class')
					instantiateClass(target.node, state, node.arguments.map(valueOf));
				else state.exits |= intrinsicErrorConstruction(node) ? THROW : EXCEPTION;
			}
			if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
			if (node.callee?.type === 'Super' && constructionContext) {
				const base = valueOf(constructionContext.node.superClass);
				if (base.kind === 'class')
					instantiateClass(
						base.node,
						state,
						node.arguments.map(valueOf),
						constructionContext.active,
					);
				else state.exits |= EXCEPTION;
				initializeInstance(constructionContext.node, state);
				return;
			}
			const callee = valueOf(node.callee);
			if (callee.renderComponent === true) {
				const entry = unwrap(node.arguments[0]);
				if (entry?.type === 'JSXElement')
					visitComponent(entry.openingElement?.name, [jsxProps(entry.openingElement)]);
				else visitComponent(entry, [valueOf(node.arguments[1])]);
			}
			if (callee.read === true) reportRead(node);
			else if (callee.kind === 'function') {
				const result = visitFunction(callee.fn, node.arguments.map(valueOf));
				evaluatedValues.set(node, result.value);
				complete(state, result.exits);
				return;
			} else {
				const indices = callee.kind === 'builtin' ? RENDER_CALLBACKS.get(callee.name) : null;
				const arguments_ = indices
					? callee.name === 'useReducer'
						? [valueOf(node.arguments[1])]
						: callee.name === 'useLinkedState'
							? [valueOf(node.arguments[0])]
							: []
					: freshArrayCallbackArguments(node);
				if (arguments_ !== null) {
					let exits = indices ? NORMAL : 0;
					for (const index of indices ?? [0]) {
						const callback = valueOf(node.arguments[index]);
						if (callback.read === true) reportRead(node.arguments[index]);
						exits |=
							callback.kind === 'function' ? visitFunction(callback.fn, arguments_).exits : NORMAL;
					}
					complete(state, exits);
				}
			}
			state.exits |= EXCEPTION;
		}
		for (const statement of ast.body) {
			if (statement.type === 'ExportDefaultDeclaration') visitExport(statement.declaration);
			else if (
				statement.type === 'ExportNamedDeclaration' &&
				!statement.source &&
				statement.exportKind !== 'type'
			) {
				const declaration = statement.declaration;
				if (declaration?.type === 'VariableDeclaration')
					for (const item of declaration.declarations) visitExport(item.id);
				else if (declaration) visitExport(declaration);
				for (const specifier of statement.specifiers ?? [])
					if (specifier.exportKind !== 'type') visitExport(specifier.local);
			}
		}
		const moduleState = { exits: NORMAL };
		for (const statement of ast.body) visitRender(statement, moduleState);
		return diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	}
	// Calling a proven native get also proves its argument is a handle. Parameter
	// propagation is monotone: each lexical binding can acquire that proof once.
	// This is diagnostics only, and it does not rename or rewrite authored code.
	let changed;
	do {
		recordCache = new Map();
		functionCache = new WeakMap();
		changed = false;
		for (const node of nodes) {
			if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') continue;
			const callee = valueOf(node.callee);
			if (callee.kind === 'builtin' && callee.name === 'get') {
				changed = forcePattern(node.arguments[0], HANDLE) || changed;
			} else if (callee.kind === 'function') {
				for (let index = 0; index < callee.fn.params.length; index++)
					changed =
						forcePattern(callee.fn.params[index], valueOf(node.arguments[index])) || changed;
			}
		}
	} while (changed);
	// BindingSource uses a fixed protocol key even when its snapshot carries
	// native handles. Exempt only callbacks reached through the source argument
	// of a directly imported bindings API, never arbitrary getSnapshot methods.
	const bindingSnapshots = new WeakSet();
	for (const node of nodes) {
		if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') continue;
		if (recordFor(unwrap(node.callee))?.forced?.bindingSource !== true) continue;
		const snapshot = memberValue(valueOf(node.arguments[2]), 'getSnapshot');
		if (snapshot.kind === 'function') bindingSnapshots.add(snapshot.fn);
	}
	function containsHandle(value, active = new Set()) {
		if (value.kind === 'handle') return true;
		if (value.kind !== 'object' || active.has(value)) return false;
		active.add(value);
		for (const entry of value.properties.values()) if (containsHandle(entry, active)) return true;
		return false;
	}
	function isCapability(value) {
		return (
			value.kind === 'handle' ||
			value.capability === true ||
			value.read === true ||
			(value.kind === 'function' &&
				!value.jsx &&
				(containsHandle(value.result) || (value.reads && value.returns)))
		);
	}
	const diagnostics = [];
	const reported = new WeakMap();
	function report(code, node, message) {
		let codes = reported.get(node);
		if (codes?.has(code)) return;
		if (codes === undefined) reported.set(node, (codes = new Set()));
		codes.add(code);
		diagnostics.push(
			nativeReadDiagnostic(
				code,
				source,
				filename,
				node.start ?? 0,
				node.end ?? node.start ?? 0,
				message,
			),
		);
	}
	function checkName(node, name, value) {
		if (typeof name !== 'string' || name.endsWith('$') || !isCapability(value)) return;
		// Data keys are not JavaScript bindings. Keep durable identity strings and
		// arbitrary map/array keys outside the capability naming convention.
		if (!/^[$A-Z_a-z][$\w]*$/.test(name)) return;
		report(
			NATIVE_SIGNAL_NAME,
			node,
			`Native signal handles and functions exposing handles or live reads must end in $. Rename ${JSON.stringify(name)} to ${JSON.stringify(name + '$')}; sampled values keep ordinary names.`,
		);
	}
	function createsCapability(node, value) {
		node = unwrap(node);
		if (!node || !isCapability(value)) return false;
		return (
			node.type === 'CallExpression' ||
			node.type === 'OptionalCallExpression' ||
			FUNCTION_TYPES.has(node.type)
		);
	}
	function isDomStyleProperty(node) {
		let object = parents.get(node);
		let container = parents.get(object);
		while (
			container &&
			(WRAPPERS.has(container.type) ||
				(container.type === 'LogicalExpression' &&
					(container.operator !== '&&' || container.right === object)) ||
				(container.type === 'ConditionalExpression' &&
					(container.consequent === object || container.alternate === object)))
		) {
			object = container;
			container = parents.get(object);
		}
		if (container?.type !== 'JSXExpressionContainer') return false;
		const attribute = parents.get(container);
		if (attribute?.type !== 'JSXAttribute' || attribute.name?.name !== 'style') return false;
		const opening = parents.get(attribute);
		const tag = opening?.name;
		return tag?.type === 'JSXIdentifier' && /^[a-z]/.test(tag.name);
	}
	for (const record of allRecords) {
		const value = recordValue(record);
		if (
			record.expressions.some(({ expression }) =>
				createsCapability(expression, valueOf(expression)),
			)
		) {
			for (const declaration of record.declarations) checkName(declaration, record.name, value);
		}
	}
	for (const node of nodes) {
		if (
			(node.type === 'ImportSpecifier' && valueOf(node.local).kind === 'unsupportedHook') ||
			((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
				valueOf(node).kind === 'unsupportedHook')
		) {
			report(
				'OCTANE_NATIVE_SIGNAL_HOOK',
				node,
				'useDerived$ is not available. Create derived$ on an explicitly owned Scope and pass the handle to the component.',
			);
		} else if (node.type === 'Property' && parents.get(node)?.type === 'ObjectExpression') {
			const value = valueOf(node.value);
			const bindingSnapshot =
				propertyName(node.key, node.computed) === 'getSnapshot' &&
				bindingSnapshots.has(unwrap(node.value));
			if (!isDomStyleProperty(node) && !bindingSnapshot && createsCapability(node.value, value))
				checkName(node.key, propertyName(node.key, node.computed), value);
		} else if (node.type === 'AssignmentExpression' && node.operator === '=') {
			const left = unwrap(node.left);
			const value = valueOf(node.right);
			if (left?.type === 'MemberExpression' && createsCapability(node.right, value))
				checkName(left.property, propertyName(left.property, left.computed), value);
		} else if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = valueOf(node.callee);
			if (callee.kind === 'builtin' && callee.name === 'useMemo') {
				if (node.arguments.length === 1) continue;
				const dependency = unwrap(node.arguments[1]);
				if (dependency?.type === 'Literal' && dependency.value === null) continue;
				const callback = valueOf(node.arguments[0]);
				if (callback.read === true || (callback.kind === 'function' && callback.reads)) {
					report(
						NATIVE_MEMO_READ,
						node,
						'A live native signal read inside useMemo is not represented by an explicit dependency array. Omit the array to track native reads, or sample the signal during render and pass that value in the array. Explicit arrays are never rewritten; null runs the callback on every render.',
					);
				}
			}
		}
	}
	diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	return diagnostics;
}

export function assertNativeReadDiagnostics(ast, source, filename, options) {
	const diagnostics = analyzeNativeReadDiagnostics(ast, source, filename, options);
	if (diagnostics.length > 0) {
		const diagnostic = diagnostics[0];
		const error = new Error(`[${diagnostic.code}] ${diagnostic.message}`);
		error.diagnostic = diagnostic;
		error.code = diagnostic.code;
		error.loc = { line: diagnostic.start.line, column: diagnostic.start.column };
		throw error;
	}
	return diagnostics;
}
