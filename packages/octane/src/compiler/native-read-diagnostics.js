import { createLexicalAnalysis } from './compile-universal.js';
import { analyzeRendererBoundaries } from './renderer-boundaries.js';
import { isDomBindingDirective } from './dom-binding-directive.js';
import { HOOK_NAMES } from './hook-names.js';
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
const RENDER_OUTPUT = Object.freeze({ kind: 'renderOutput' });
const NUMBER = Object.freeze({ kind: 'number' });
const ROOT = Object.freeze({ kind: 'root' });

function sameProof(left, right) {
	if (left === right) return true;
	if (!left || !right || left.kind !== right.kind) return false;
	if (left.kind === 'function') return left.fn === right.fn;
	if (left.kind === 'class') return left.node === right.node;
	if (left.kind === 'builtin') return left.name === right.name && left.read === right.read;
	if (left.kind === 'namespace') return left.module === right.module;
	if (left.kind === 'nullable') return sameProof(left.value, right.value);
	if (left.kind !== 'object' && left.kind !== 'array') return false;
	if (left.kind === 'array' && !sameProof(left.element, right.element)) return false;
	if (left.properties === right.properties) return true;
	if (!left.properties || !right.properties || left.properties.size !== right.properties.size)
		return false;
	for (const [name, value] of left.properties)
		if (!sameProof(value, right.properties.get(name))) return false;
	return true;
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
	const lexical = createLexicalAnalysis(ast);
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
	const activeRecords = new Set();
	const activeFunctions = new Set();
	function typeValue(annotation, active = new Set()) {
		if (!annotation) return UNKNOWN;
		if (annotation.type === 'TSTypeAnnotation' || annotation.type === 'TSParenthesizedType')
			return typeValue(annotation.typeAnnotation, active);
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
						element: typeValue(annotation.typeArguments?.params?.[0], active),
					};
				if (!active.has(name.name) && typeAliases.has(name.name)) {
					active.add(name.name);
					const value = typeValue(typeAliases.get(name.name), active);
					active.delete(name.name);
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
			const own = typeValue(annotation.body, active);
			for (const base of annotation.extends ?? []) {
				const inherited = typeValue(base, active);
				if (inherited === HANDLE || inherited === SCOPE) return inherited;
				if (inherited.kind === 'object')
					for (const [name, value] of inherited.properties)
						if (!own.properties.has(name)) own.properties.set(name, value);
			}
			return own;
		} else if (
			annotation.type === 'TSTypeLiteral' ||
			(missingImport && annotation.type === 'TSInterfaceBody')
		) {
			const properties = new Map();
			for (const member of annotation.members ?? annotation.body ?? []) {
				const name = propertyName(member.key, member.computed);
				if (name !== null) properties.set(name, typeValue(member.typeAnnotation, active));
			}
			return { kind: 'object', properties };
		} else if (annotation.type === 'TSUnionType' || annotation.type === 'TSIntersectionType') {
			const values = annotation.types.map((entry) => typeValue(entry, active));
			if (missingImport && annotation.type === 'TSUnionType' && values.includes(NULLISH)) {
				const value = mergeValues(values.filter((entry) => entry !== NULLISH));
				return value !== UNKNOWN ? { kind: 'nullable', value } : UNKNOWN;
			}
			return annotation.type === 'TSIntersectionType'
				? mergePossibleValues(values)
				: mergeValues(values);
		} else if (missingImport && annotation.type === 'TSArrayType') {
			return { kind: 'array', element: typeValue(annotation.elementType, active) };
		} else if (missingImport && annotation.type === 'TSNumberKeyword') {
			return NUMBER;
		} else if (
			missingImport &&
			(annotation.type === 'TSNullKeyword' || annotation.type === 'TSUndefinedKeyword')
		) {
			return NULLISH;
		} else if (annotation.type === 'TSTupleType') {
			return {
				kind: 'object',
				properties: new Map(
					annotation.elementTypes.map((entry, index) => [String(index), typeValue(entry, active)]),
				),
			};
		}
		return UNKNOWN;
	}
	function mergePossibleValues(values) {
		for (const value of values) if (value.kind === 'handle') return HANDLE;
		return values.find((value) => value.kind !== 'unknown') ?? UNKNOWN;
	}
	function mergeValues(values) {
		if (!missingImport) return mergePossibleValues(values);
		const first = values[0];
		return first && values.every((value) => sameProof(value, first)) ? first : UNKNOWN;
	}
	function memberValue(value, name, index = false) {
		if (value.kind === 'object') return value.properties.get(name) ?? UNKNOWN;
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
			const result = mergeValues(values);
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
			return valueOf(expression) === RENDER_OUTPUT;
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
			return typeValue(input.typeAnnotation);
		const node = unwrap(input);
		if (!node) return UNKNOWN;
		if (missingImport && (node.type === 'JSXElement' || node.type === 'JSXFragment'))
			return RENDER_OUTPUT;
		if (missingImport && (node.type === 'ClassDeclaration' || node.type === 'ClassExpression'))
			return { kind: 'class', node };
		if (missingImport && node.type === 'Literal' && typeof node.value === 'number') return NUMBER;
		if (node.type === 'Identifier' || node.type === 'JSXIdentifier')
			return recordValue(recordFor(node));
		if (FUNCTION_TYPES.has(node.type)) return functionValue(node);
		if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
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
				if (missingImport && callee.name === 'createElement') return RENDER_OUTPUT;
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
		const diagnostics = [];
		const activeRenderFunctions = new Set();
		const visitedContexts = new WeakMap();
		const visitedReads = new WeakSet();
		// The visitor carries every possible synchronous completion through a
		// statement. Only NORMAL paths continue into the next statement; finally
		// and catch can resume an abrupt completion, while await leaves render.
		const NORMAL = 1;
		const RETURN = 2;
		const THROW = 4;
		const SUSPEND = 8;
		const BREAK = 16;
		const CONTINUE = 32;
		let constructionContext = null;
		let rendering = false;
		function complete(state, exits) {
			state.exits = (state.exits & ~NORMAL) | exits;
		}
		function bindParameter(pattern, value) {
			if (!pattern || !value || value === UNKNOWN) return;
			if (pattern.type === 'Identifier') {
				const record = recordFor(pattern);
				if (record && !record.annotations?.length && record.expressions.length === 0)
					parameterValues.set(record, value);
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
		function visitFunction(fn, arguments_ = [], construction = null) {
			// A presentation view has its own renderer-free publication semantics;
			// sampled signal values there are intentionally not subscriptions.
			if (fn.generator || isDomBindingDirective(fn.body?.body?.[0])) return NORMAL;
			if (activeRenderFunctions.has(fn)) return NORMAL | THROW;
			activeRenderFunctions.add(fn);
			const previous = [recordCache, functionCache, parameterValues, constructionContext];
			recordCache = new Map();
			functionCache = new WeakMap();
			constructionContext = construction;
			// Dynamic callers are not lexical parents. Keep only proofs the callee
			// can capture; retaining the call stack multiplies equivalent paths.
			const outerScope = lexical.nodeScopes.get(fn);
			parameterValues = new Map(
				[...parameterValues].filter(
					([record]) => lexical.resolveBinding(outerScope, record.name)?.scope === record.scope,
				),
			);
			for (let index = 0; index < arguments_.length; index++)
				bindParameter(fn.params[index], arguments_[index]);
			let contexts = visitedContexts.get(fn);
			if (!contexts) visitedContexts.set(fn, (contexts = []));
			const visited = contexts.find(
				(context) =>
					context.rendering === rendering &&
					context.construction === construction?.node &&
					context.parameters.size === parameterValues.size &&
					[...context.parameters].every(([record, value]) =>
						sameProof(value, parameterValues.get(record)),
					),
			);
			let exits = visited?.exits;
			if (!visited) {
				const state = { exits: NORMAL };
				for (const param of fn.params ?? []) visitRender(param, state);
				visitRender(fn.body, state);
				exits = fn.async
					? NORMAL
					: (state.exits & (NORMAL | RETURN) ? NORMAL : 0) | (state.exits & THROW);
				contexts.push({
					parameters: parameterValues,
					construction: construction?.node,
					rendering,
					exits,
				});
			}
			[recordCache, functionCache, parameterValues, constructionContext] = previous;
			activeRenderFunctions.delete(fn);
			return exits;
		}
		function visitComponent(expression, arguments_ = []) {
			const node = unwrap(expression);
			if (node?.type === 'CallExpression' && valueOf(node.callee).name === 'createElement')
				return visitComponent(node.arguments[0], [valueOf(node.arguments[1])]);
			const value = valueOf(expression);
			if (value.kind === 'function') {
				const previous = rendering;
				rendering = true;
				visitFunction(value.fn, arguments_);
				rendering = previous;
			}
		}
		function visitExport(expression) {
			const value = valueOf(expression);
			if (value.kind !== 'function') return;
			if (value.fn.body?.type === 'JSXCodeBlock' || value.returnsRender || value.callsRenderHook)
				visitComponent(expression);
			else visitFunction(value.fn);
		}
		function jsxProps(opening) {
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
			return { kind: 'object', properties };
		}
		function literalProperty(member) {
			const object = unwrap(member.object);
			const name = propertyName(member.property, member.computed);
			if (object?.type !== 'ObjectExpression' || name === null) return null;
			for (let index = object.properties.length - 1; index >= 0; index--) {
				const property = object.properties[index];
				if (property.type === 'SpreadElement') return null;
				const key = propertyName(property.key, property.computed);
				if (key === null) return null;
				if (key === name) return property;
			}
			return null;
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
				complete(state, visitFunction(constructor.value, arguments_, { node, active }));
				return;
			}
			if (node.superClass) {
				const base = valueOf(node.superClass);
				if (base.kind === 'class') instantiateClass(base.node, state, arguments_, active);
				else state.exits |= THROW;
			}
			initializeInstance(node, state);
			if (constructor && state.exits & NORMAL)
				complete(state, visitFunction(constructor.value, arguments_));
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
			complete(state, (body.exits & (RETURN | THROW | SUSPEND)) | (canExit ? NORMAL : 0));
		}
		function visitIterableLoop(node, state) {
			visitRender(node.right, state);
			if (!(state.exits & NORMAL)) return;
			if (node.await) return complete(state, SUSPEND);
			const iterable = unwrap(node.right);
			const forOf = node.type !== 'ForInStatement';
			if (forOf && iterable?.type === 'ArrayExpression' && !iterable.elements.length)
				return visitRender(node.empty, state);
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
			visitRender(node.body, body);
			[recordCache, functionCache, parameterValues] = previous;
			const nonempty =
				forOf && iterable?.type === 'ArrayExpression' && iterable.elements.length > 0;
			const empty = { exits: nonempty ? 0 : NORMAL };
			visitRender(node.empty, empty);
			const canExit = body.exits & (NORMAL | BREAK | CONTINUE);
			complete(
				state,
				(body.exits & (RETURN | THROW | SUSPEND)) | (canExit ? NORMAL : 0) | empty.exits,
			);
		}
		function visitSwitch(node, state) {
			visitRender(node.discriminant, state);
			if (!(state.exits & NORMAL)) return;
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
				if (selected >= 0)
					for (const entry of node.cases.slice(selected))
						for (const statement of entry.consequent) visitRender(statement, state);
			} else {
				const unmatched = { exits: NORMAL };
				const matched = { exits: 0 };
				let hasDefault = false;
				for (const entry of node.cases) {
					if (entry.test) visitRender(entry.test, unmatched);
					else hasDefault = true;
					matched.exits |= unmatched.exits & NORMAL;
					for (const statement of entry.consequent) visitRender(statement, matched);
				}
				complete(state, matched.exits | (hasDefault ? unmatched.exits & ~NORMAL : unmatched.exits));
			}
			if (state.exits & BREAK) state.exits = (state.exits & ~BREAK) | NORMAL;
		}
		function visitTry(node, state) {
			const block = { exits: NORMAL };
			visitRender(node.block, block);
			let exits = block.exits;
			if (node.handler && exits & THROW) {
				const caught = { exits: NORMAL };
				visitRender(node.handler, caught);
				exits = (exits & ~THROW) | caught.exits;
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
		function visitRender(node, state) {
			if (
				!node ||
				typeof node !== 'object' ||
				!(state.exits & NORMAL) ||
				FUNCTION_TYPES.has(node.type)
			)
				return;
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
				visitRender(node.test, state);
				if (!(state.exits & NORMAL)) return;
				const branch = constantValue(node.test);
				if (branch !== null) visitRender(branch.value ? node.consequent : node.alternate, state);
				else {
					const consequent = { exits: NORMAL };
					const alternate = { exits: NORMAL };
					visitRender(node.consequent, consequent);
					visitRender(node.alternate, alternate);
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
				)
					return;
				const right = { exits: NORMAL };
				visitRender(node.right, right);
				complete(state, right.exits | (left === null ? NORMAL : 0));
				return;
			}
			if (node.type === 'TryStatement') return visitTry(node, state);
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
			if (node.type === 'AwaitExpression') return complete(state, SUSPEND);
			if (node.type === 'ReturnStatement') return complete(state, RETURN);
			if (node.type === 'ThrowStatement') return complete(state, THROW);
			if (node.type === 'BreakStatement') return complete(state, BREAK);
			if (node.type === 'ContinueStatement') return complete(state, CONTINUE);
			if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
				const property = literalProperty(node);
				if (property?.kind === 'get') complete(state, visitFunction(property.value));
				else if (!property) state.exits |= THROW;
			}
			if (node.type === 'NewExpression') {
				const target = valueOf(node.callee);
				if (target.kind === 'class')
					instantiateClass(target.node, state, node.arguments.map(valueOf));
				else state.exits |= THROW;
			}
			if (
				rendering &&
				node.type === 'JSXOpeningElement' &&
				node.name?.type === 'JSXIdentifier' &&
				/^[A-Z]/.test(node.name.name)
			)
				visitComponent(node.name, [jsxProps(node)]);
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
				else state.exits |= THROW;
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
				complete(state, visitFunction(callee.fn, node.arguments.map(valueOf)));
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
						exits |= callback.kind === 'function' ? visitFunction(callback.fn, arguments_) : NORMAL;
					}
					complete(state, exits);
				}
			}
			state.exits |= THROW;
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
