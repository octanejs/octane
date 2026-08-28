import { createLexicalAnalysis } from './compile-universal.js';
import { analyzeRendererBoundaries } from './renderer-boundaries.js';
import { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ, nativeReadDiagnostic } from './native-read-facts.js';
export { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ } from './native-read-facts.js';

const SIGNALS_MODULE = 'octane/signals';
const CLIENT_MODULE = 'octane/signals/client';
const LOCAL_MODULES = new Set([CLIENT_MODULE, 'octane/signals/server']);
const HANDLE_TYPES = new Set(['SignalHandle', 'Resource', 'WritableSignal', 'DerivedSignal']);
const SIGNAL_METHODS = new Set(['signal$', 'derived$', 'asyncSignal$']);
const LOCAL_HOOKS = new Set(['useSignal$']);
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

export function assertNativeReadOptions(options) {
	if (options?.nativeReads !== undefined && typeof options.nativeReads !== 'boolean') {
		throw new TypeError('Octane nativeReads must be a boolean.');
	}
	if (
		options?.nativeReads === true &&
		options.renderer?.target != null &&
		options.renderer.target !== 'dom'
	) {
		throw new Error('Octane nativeReads currently supports only the DOM client and server.');
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
	if (options.nativeReads !== true) {
		for (const statement of ast.body ?? []) {
			if (
				statement.type !== 'ImportDeclaration' ||
				statement.importKind === 'type' ||
				!LOCAL_MODULES.has(statement.source?.value)
			)
				continue;
			const capability = (statement.specifiers ?? []).find(
				(specifier) =>
					specifier.importKind !== 'type' &&
					(specifier.type === 'ImportNamespaceSpecifier' ||
						LOCAL_HOOKS.has(specifier.imported?.name ?? specifier.imported?.value)),
			);
			if (capability)
				return [
					nativeReadDiagnostic(
						'OCTANE_NATIVE_READ_OPT_IN',
						source,
						filename,
						capability.start ?? statement.start,
						capability.end ?? statement.end,
						'Local native signal hooks require nativeReads: true in the Octane compiler configuration.',
					),
				];
		}
		return [];
	}
	if (options.rendererBoundaries && Object.keys(options.rendererBoundaries).length > 0) {
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
					`Octane nativeReads currently supports only the DOM client and server; renderer ${JSON.stringify(unsupported.childRenderer)} has no native-read integration.`,
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
	function declareTypeName(name) {
		if (typeof name !== 'string') return;
		if (typeDeclarations.has(name)) ambiguousTypes.add(name);
		typeDeclarations.set(name, true);
	}
	const runtimeModules = new Set(['octane', ...(options.__hookRuntimeModules ?? [])]);
	function recordFor(node, scope = lexical.nodeScopes.get(node)) {
		if (node?.type !== 'Identifier') return null;
		const binding = lexical.resolveBinding(scope, node.name);
		if (binding === null) return null;
		let names = records.get(binding.scope);
		if (names === undefined) records.set(binding.scope, (names = new Map()));
		let record = names.get(node.name);
		if (record === undefined) {
			record = { name: node.name, declarations: [], expressions: [], forced: null };
			names.set(node.name, record);
			allRecords.push(record);
		}
		return record;
	}
	function declare(pattern, expression, path = [], scope) {
		if (!pattern) return;
		if (pattern.type === 'Identifier') {
			const record = recordFor(pattern, scope);
			if (record) {
				record.declarations.push(pattern);
				if (expression) record.expressions.push({ expression, path });
			}
		} else if (pattern.type === 'AssignmentPattern') {
			declare(pattern.left, expression, path, scope);
			declare(pattern.left, pattern.right, [], scope);
		} else if (pattern.type === 'RestElement') {
			declare(pattern.argument, null, [], scope);
		} else if (pattern.type === 'ArrayPattern') {
			for (let index = 0; index < pattern.elements.length; index++)
				declare(pattern.elements[index], expression, [...path, String(index)], scope);
		} else if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				const key = propertyName(property.key, property.computed);
				if (key !== null) declare(property.value, expression, [...path, key], scope);
				else if (property.type === 'RestElement') declare(property.argument, null, [], scope);
			}
		} else if (pattern.type === 'TSParameterProperty') {
			declare(pattern.parameter, expression, path, scope);
		}
	}
	function importedValue(module, name) {
		if (module === SIGNALS_MODULE && name === 'createScope')
			return { kind: 'builtin', name: 'createScope' };
		if (LOCAL_MODULES.has(module) && name === 'useDerived$')
			return { kind: 'unsupportedHook', name };
		if (LOCAL_MODULES.has(module) && LOCAL_HOOKS.has(name))
			return { kind: 'builtin', name, capability: true };
		if (runtimeModules.has(module) && name === 'useMemo')
			return { kind: 'builtin', name: 'useMemo' };
		return UNKNOWN;
	}
	for (const node of nodes) {
		if (node.type === 'ImportDeclaration') {
			const module = node.source.value;
			for (const specifier of node.specifiers ?? []) {
				declareTypeName(specifier.local?.name);
				const name = specifier.imported?.name ?? specifier.imported?.value;
				if (module === SIGNALS_MODULE) {
					if (HANDLE_TYPES.has(name)) nativeTypes.set(specifier.local.name, HANDLE);
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
		} else if (node.type === 'TSTypeParameter') {
			declareTypeName(typeof node.name === 'string' ? node.name : node.name?.name);
		}
	}

	let recordCache;
	let functionCache;
	const activeRecords = new Set();
	const activeFunctions = new Set();
	function typeValue(annotation, active = new Set()) {
		if (!annotation) return UNKNOWN;
		if (annotation.type === 'TSTypeAnnotation') return typeValue(annotation.typeAnnotation, active);
		if (annotation.type === 'TSTypeReference') {
			const name = annotation.typeName;
			if (name?.type === 'Identifier') {
				if (ambiguousTypes.has(name.name)) return UNKNOWN;
				if (nativeTypes.has(name.name)) return nativeTypes.get(name.name);
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
				HANDLE_TYPES.has(name.right.name)
			)
				return HANDLE;
		} else if (annotation.type === 'TSTypeLiteral') {
			const properties = new Map();
			for (const member of annotation.members ?? []) {
				const name = propertyName(member.key, member.computed);
				if (name !== null) properties.set(name, typeValue(member.typeAnnotation, active));
			}
			return { kind: 'object', properties };
		} else if (annotation.type === 'TSUnionType' || annotation.type === 'TSIntersectionType') {
			return mergeValues(annotation.types.map((entry) => typeValue(entry, active)));
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
	function mergeValues(values) {
		for (const value of values) if (value.kind === 'handle') return HANDLE;
		return values.find((value) => value.kind !== 'unknown') ?? UNKNOWN;
	}
	function memberValue(value, name) {
		if (value.kind === 'object') return value.properties.get(name) ?? UNKNOWN;
		if (value.kind === 'namespace') return importedValue(value.module, name);
		if (value.kind === 'scope' && SIGNAL_METHODS.has(name))
			return { kind: 'builtin', name, capability: true };
		if (value.kind === 'scope' && name === 'get')
			return { kind: 'builtin', name: 'get', read: true };
		if (value.kind === 'scope' && name === 'isPending')
			return { kind: 'builtin', name, read: true };
		if (value.kind === 'scope' && name === 'set') return { kind: 'builtin', name: 'set' };
		if (value.kind === 'handle' && name === 'set') return { kind: 'builtin', name: 'set' };
		if (value.kind === 'handle' && (name === 'get' || name === 'latest' || name === 'snapshot'))
			return { kind: 'builtin', name, read: true };
		return UNKNOWN;
	}
	function recordValue(record) {
		if (record === null) return UNKNOWN;
		if (record.forced && record.forced.kind !== 'unknown') return record.forced;
		if (recordCache.has(record)) return recordCache.get(record);
		if (activeRecords.has(record)) return UNKNOWN;
		activeRecords.add(record);
		const values = record.declarations.map((node) => typeValue(node.typeAnnotation));
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
		function addReturn(expression) {
			const node = unwrap(expression);
			if (node?.type === 'CallExpression' && valueOf(node.callee).name === 'set') return;
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
		};
		activeFunctions.delete(fn);
		functionCache.set(fn, result);
		return result;
	}
	function valueOf(input) {
		const node = unwrap(input);
		if (!node) return UNKNOWN;
		if (node.type === 'Identifier') return recordValue(recordFor(node));
		if (FUNCTION_TYPES.has(node.type)) return functionValue(node);
		if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
			return memberValue(valueOf(node.object), propertyName(node.property, node.computed));
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = valueOf(node.callee);
			if (callee.kind === 'function') return callee.result;
			if (callee.kind === 'builtin') {
				if (callee.name === 'createScope') return SCOPE;
				if (SIGNAL_METHODS.has(callee.name) || LOCAL_HOOKS.has(callee.name)) return HANDLE;
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
		if (node.type === 'ArrayExpression')
			return {
				kind: 'object',
				properties: new Map(
					(node.elements ?? []).map((element, index) => [String(index), valueOf(element)]),
				),
			};
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
	for (const record of allRecords) {
		const value = recordValue(record);
		for (const declaration of record.declarations) checkName(declaration, record.name, value);
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
				'useDerived$ is not available in this experimental integration. Create derived$ on an explicitly owned Scope and pass the handle to the component.',
			);
		} else if (node.type === 'Property' && parents.get(node)?.type === 'ObjectExpression') {
			checkName(node.key, propertyName(node.key, node.computed), valueOf(node.value));
		} else if (node.type === 'AssignmentExpression' && node.operator === '=') {
			const left = unwrap(node.left);
			if (left?.type === 'MemberExpression')
				checkName(left.property, propertyName(left.property, left.computed), valueOf(node.right));
		} else if (node.type === 'ExportSpecifier' && parents.get(node)?.source == null) {
			checkName(node.exported, node.exported.name ?? node.exported.value, valueOf(node.local));
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
