// Production-only whole-Program path for plain TypeScript/JavaScript hooks.
// Unlike slot-hooks' line-preserving fallback, every generated token here is
// AST and esrap prints the completed TypeScript Program exactly once.

import { builders as b, clone_ast_node as cloneAstNode, withDeferredImports } from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';
import { METHOD_DEP_IMPORT } from './hook-deps.js';
import { nativeReadActivationIndex } from './native-read-codegen.js';
import { adaptManualHookProviders } from './manual-hooks.js';
import {
	hasInlineMemoDirectEval,
	inheritHookMemoOrigin,
	lowerSlotMemoFunctions,
} from './inline-hook-memo.js';

const META_KEYS = new Set([
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
const PURE_COMMENTS = [{ type: 'Block', value: ' @__PURE__ ' }];

function mapChildren(node, visit) {
	if (node === null || typeof node !== 'object') return node;
	if (Array.isArray(node)) {
		let out = null;
		for (let i = 0; i < node.length; i++) {
			const mapped = visit(node[i]);
			if (out === null && mapped !== node[i]) out = node.slice(0, i);
			if (out !== null) out.push(mapped);
		}
		return out ?? node;
	}
	let out = null;
	for (const key in node) {
		if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
		const value = node[key];
		if (value === null || typeof value !== 'object') continue;
		const mapped = visit(value);
		if (mapped !== value) {
			if (out === null) out = { ...node };
			out[key] = mapped;
		}
	}
	return out ?? node;
}

function walkNodes(root, visit) {
	function walk(node, parent, field) {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, parent, field);
			return;
		}
		if (visit(node, parent, field) === false) return;
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			walk(node[key], node, key);
		}
	}
	walk(root, null, null);
}

function collectUsedNames(ast) {
	const names = new Set();
	walkNodes(ast, (node) => {
		if (node.type === 'Identifier') names.add(node.name);
	});
	return names;
}

function allocName(state, preferred) {
	let name = preferred;
	while (state.usedNames.has(name)) name += '$';
	state.usedNames.add(name);
	return name;
}

function requireHelper(state, imported, request = 'octane/internal/client') {
	const key = `${request}\0${imported}`;
	let helper = state.helpers.get(key);
	if (helper === undefined) {
		helper = { imported, local: allocName(state, `_$${imported}`), request };
		state.helpers.set(key, helper);
	}
	return helper.local;
}

function pure(node) {
	return { ...node, __octanePure: true };
}

function allocateHookSlot(state, origin) {
	const index = state.slotDeclarations.length;
	if (state.slotBase === null) state.slotBase = allocName(state, '_hs$');
	const name = allocName(state, `_h$${index}`);
	const offset =
		index === 0 ? b.id(state.slotBase) : b.binary('+', b.id(state.slotBase), b.literal(index));
	state.slotDeclarations.push(
		inheritHookMemoOrigin(b.const(name, pure(b.call('Symbol', offset))), origin),
	);
	return b.id(name, origin);
}

function inferredDependencyArray(inferred, state, origin) {
	return inheritHookMemoOrigin(
		b.array(
			inferred.dependencies.map((dependency) =>
				dependency.method
					? b.call(
							requireHelper(state, METHOD_DEP_IMPORT, 'octane'),
							cloneAstNode(dependency.method.root),
							b.literal(dependency.method.name),
							...(dependency.method.guarded ? [b.literal(true)] : []),
						)
					: cloneAstNode(dependency.node),
			),
		),
		origin,
	);
}

// Match the surgical pass's base-hook and custom-hook slot policy: imported and
// module-declared custom hooks get a withSlot boundary, other helpers keep their
// authored call. Existing explicit memo slots are already the effective third
// argument, so no unused fourth argument is added.
function slotBaseHooks(ast, state, options) {
	function visit(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) return mapChildren(node, visit);
		if (!options.manualSlots) {
			const deleting = node.type === 'UnaryExpression' && node.operator === 'delete';
			const lowered = lowerHookMethodChain(
				deleting ? node.argument : node,
				{
					locals: options.hookLocals,
					allocateName: (name) => allocName(state, name),
					visit,
					requireReceiver: () => requireHelper(state, 'callWithReceiver'),
					wrap: (call, origin) =>
						inheritHookMemoOrigin(
							b.call(
								requireHelper(state, 'withSlot', 'octane'),
								allocateHookSlot(state, origin),
								b.arrow([], call),
							),
							origin,
						),
				},
				deleting,
			);
			if (lowered !== null) return inheritHookMemoOrigin(lowered, node);
		}
		if (!options.manualSlots && hookMethodName(node, options.hookLocals) !== null) {
			assertSynchronousHookMethod(node);
			const slot = allocateHookSlot(state, node);
			const mapped = mapChildren(node, visit);
			return inheritHookMemoOrigin(
				b.call(requireHelper(state, 'withSlot', 'octane'), slot, b.arrow([], mapped)),
				node,
			);
		}
		if (!options.manualSlots && node.type === 'CallExpression' && node._octaneCustomHookCall) {
			const slot = allocateHookSlot(state, node);
			const mapped = mapChildren(node, visit);
			const callee = mapped.typeArguments
				? {
						type: 'TSInstantiationExpression',
						expression: mapped.callee,
						typeArguments: mapped.typeArguments,
					}
				: mapped.callee;
			return {
				...mapped,
				callee: b.id(requireHelper(state, 'withSlot', 'octane'), node),
				typeArguments: null,
				// Keep foreign/default parameters and arguments.length unchanged;
				// Octane base aliases resolve their slot from this call's path.
				arguments: [slot, callee, ...mapped.arguments],
			};
		}
		const imported =
			node.type === 'CallExpression'
				? (node._octaneImportedHook ??
					(options.nativeReads ? node._octaneHookRuntimeImportedHook : undefined))
				: undefined;
		if (imported === undefined || !options.hookNames.has(imported)) {
			return mapChildren(node, visit);
		}
		const inferred = options.inferred.get(node);
		const explicitMemoSlot =
			(imported === 'useMemo' || imported === 'useCallback') &&
			inferred === undefined &&
			node.arguments.length === 3 &&
			!node.arguments.some((argument) => argument.type === 'SpreadElement');
		const slot = options.manualSlots || explicitMemoSlot ? null : allocateHookSlot(state, node);
		const mapped = mapChildren(node, visit);
		const args = mapped.arguments.slice();
		if (inferred !== undefined) {
			args.splice(inferred.depsIndex, 0, inferredDependencyArray(inferred, state, node));
		}
		let callee = mapped.callee;
		if (options.getterCalls.has(node) && options.stateGetterHelpers[imported]) {
			callee = b.id(requireHelper(state, options.stateGetterHelpers[imported], 'octane'), node);
		}
		if (node._octaneNativeInferredMemo === true) {
			callee = b.id(requireHelper(state, 'nativePuMemo'), node);
		}
		if (slot !== null) {
			if (
				(imported === 'useState' || imported === 'useRef') &&
				args.some((arg) => arg.type === 'SpreadElement')
			) {
				const fn = mapped.typeArguments
					? {
							type: 'TSInstantiationExpression',
							expression: callee,
							typeArguments: mapped.typeArguments,
						}
					: callee;
				return {
					...mapped,
					callee: b.id(requireHelper(state, 'withSlot', 'octane'), node),
					typeArguments: null,
					arguments: [slot, fn, ...args],
				};
			}
			if (args.length === 0 && (imported === 'useState' || imported === 'useRef'))
				args.push(b.id('undefined', node));
			args.push(slot);
		}
		return { ...mapped, callee, arguments: args };
	}
	return visit(ast);
}

function collectComments(ast) {
	const comments = new Map();
	const seen = new WeakSet();
	function visit(node) {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			(node.type === 'Block' || node.type === 'Line') &&
			typeof node.value === 'string' &&
			node.loc
		) {
			comments.set(`${node.start}:${node.end}`, node);
			return;
		}
		for (const key in node) {
			if (key === 'loc' || key === 'metadata' || key === 'parent') continue;
			visit(node[key]);
		}
	}
	visit(ast);
	return [...comments.values()].sort((left, right) => left.start - right.start);
}

// esrap's visitor for each listed parent field prints these nodes itself, so
// they have no visitor of their own. They are printable only in those fields.
// TSTemplateLiteralType.quasis is deliberately absent: esrap 2.3 drops the
// final quasi (the parser emits template literal types as a TSLiteralType
// over a TemplateLiteral, so authored code never reaches that visitor).
const PARENT_PRINTED = new Map([
	['TemplateElement', ['TemplateLiteral.quasis']],
	['SwitchCase', ['SwitchStatement.cases']],
	['CatchClause', ['TryStatement.handler']],
	['ImportDefaultSpecifier', ['ImportDeclaration.specifiers']],
	['ImportNamespaceSpecifier', ['ImportDeclaration.specifiers']],
	[
		'ImportAttribute',
		[
			'ImportDeclaration.attributes',
			'ExportNamedDeclaration.attributes',
			'ExportAllDeclaration.attributes',
		],
	],
	['TSDeclareMethod', ['MethodDefinition.value']],
]);

// esrap 2.3 has a visitor for each of these shapes, but it would print other
// code: a build error, different runtime behavior, or lost authored types.
function misprints(node) {
	switch (node.type) {
		case 'TSModuleDeclaration':
			// It reads `global`, not the parser's `kind`, and writes `global global`.
			return node.kind === 'global' && node.global !== true;
		case 'ImportDeclaration':
			// `import type {} from 'x'` would become the side-effect `import 'x'`.
			return node.importKind === 'type' && node.specifiers.length === 0;
		case 'ChainExpression':
			return nonNullEndsChain(node);
		case 'AssignmentExpression':
		case 'AssignmentPattern':
			// An assignment target cast loses its parentheses: `x as T = value`.
			return isTypeCast(node.left);
		case 'UpdateExpression':
			return isTypeCast(node.argument);
		case 'MethodDefinition':
			// It writes `abstract` before the accessibility and `override` before `static`.
			return (node.abstract && node.accessibility != null) || (node.static && node.override);
		case 'Property':
			// A concise method writes its own parameters, without type parameters.
			return (
				node.value.type === 'FunctionExpression' &&
				(node.method || node.kind !== 'init') &&
				node.value.typeParameters != null
			);
		case 'ArrayPattern':
			return node.typeAnnotation != null;
		case 'ClassDeclaration':
		case 'ClassExpression':
			// The parser reads `extends Base<T>` before a line-broken body as an
			// instantiation expression, printed as `extends (Base<T>)`.
			return node.superClass?.type === 'TSInstantiationExpression';
		case 'TaggedTemplateExpression':
			return node.typeArguments != null;
	}
	return false;
}

function isTypeCast(node) {
	return node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression';
}

// esrap parenthesizes a non-null assertion used as a member object or callee.
// Followed by a non-optional link, with an optional link below it, `a?.b!.c`
// would print as `(a?.b!).c` and throw where it short-circuited on a nullish
// `a`. (`(a?.b!)?.c` still short-circuits, so an optional link above is safe.)
function nonNullEndsChain(chain) {
	let wrapped = false;
	let node = chain.expression;
	while (true) {
		if (node.type === 'TSNonNullExpression') {
			node = node.expression;
		} else if (node.type === 'MemberExpression' || node.type === 'CallExpression') {
			if (wrapped && node.optional) return true;
			const inner = node.type === 'MemberExpression' ? node.object : node.callee;
			if (inner.type === 'TSNonNullExpression' && !node.optional) wrapped = true;
			node = inner;
		} else {
			return false;
		}
	}
}

function canPrintProgram(ast, visitors) {
	let supported = true;
	walkNodes(ast, (node, parent, field) => {
		if (
			typeof node.type === 'string' &&
			typeof visitors[node.type] !== 'function' &&
			!PARENT_PRINTED.get(node.type)?.includes(`${parent?.type}.${field}`)
		) {
			supported = false;
		}
		return supported;
	});
	return supported;
}

function printsFaithfully(program) {
	let faithful = true;
	walkNodes(program, (node) => {
		if (misprints(node)) faithful = false;
		return faithful;
	});
	return faithful;
}

/**
 * Try the whole-AST path using the already parsed, hook-annotated authored
 * Program. Returning null asks the caller to retain its surgical behavior.
 */
export function inlinePlainHookMemos(ast, source, id, options) {
	// Even a sibling function's eval can observe newly added module imports.
	// Keep the entire rare-eval module on the unchanged surgical path.
	if (source.startsWith('#!') || hasInlineMemoDirectEval(ast)) return null;
	let hasMemo = false;
	let hasUse = false;
	walkNodes(ast, (node) => {
		if (node.type !== 'CallExpression') return;
		const imported = node._octaneImportedHook;
		if (imported === 'useMemo' || imported === 'useCallback') hasMemo = true;
		if (imported === 'use') hasUse = true;
	});
	// The existing parallel-use pass has its own grouping and warm behavior.
	// Keep those modules entirely on that path until both transforms share AST.
	if (!hasMemo || hasUse) return null;
	// esrap does not print an import's `phase`; without the wrapper an authored
	// `import.defer()` would reprint as an eager `import()`.
	const visitors = withDeferredImports(
		esrapTsx({
			comments: collectComments(ast),
			getLeadingComments: (node) =>
				node.__octanePure ||
				(node.type === 'CallExpression' && options.pureCalls?.get(node.start) === node.end)
					? PURE_COMMENTS
					: undefined,
		}),
	);
	if (!canPrintProgram(ast, visitors)) return null;
	const state = {
		usedNames: collectUsedNames(ast),
		helpers: new Map(),
		slotBase: null,
		slotDeclarations: [],
	};
	let transformed = slotBaseHooks(ast, state, options);
	const lowered = lowerSlotMemoFunctions(transformed, {
		allocateName: (preferred) => allocName(state, preferred),
		requireRuntime: (imported) => requireHelper(state, imported),
		allowMissingSlot: options.manualSlots === true,
	});
	if (lowered.lowered === 0) return null;
	transformed = lowered.ast;
	if (options.manualSlots) {
		transformed = adaptManualHookProviders(
			transformed,
			(name) => requireHelper(state, name, 'octane'),
			(preferred) => allocName(state, preferred),
		);
	}
	const origin = ast.body[0] ?? ast;
	const activation = options.nativeReadActivation
		? inheritHookMemoOrigin(
				b.stmt(b.call(requireHelper(state, 'enableNativeReadCollection'), b.literal(1))),
				origin,
			)
		: null;
	const trailing = [];
	if (state.slotDeclarations.length > 0) {
		const hookSlots = requireHelper(state, 'hookSlots', 'octane');
		trailing.push(
			inheritHookMemoOrigin(
				b.const(state.slotBase, pure(b.call(hookSlots, b.literal(state.slotDeclarations.length)))),
				origin,
			),
			...state.slotDeclarations,
		);
	}
	const byRequest = new Map();
	for (const helper of state.helpers.values()) {
		let specifiers = byRequest.get(helper.request);
		if (specifiers === undefined) byRequest.set(helper.request, (specifiers = []));
		specifiers.push(b.import_specifier(helper.imported, helper.local));
	}
	const imports = [...byRequest].map(([request, specifiers]) =>
		inheritHookMemoOrigin(b.import_declaration(specifiers, request), origin),
	);
	const start = nativeReadActivationIndex(transformed.body);
	const program = {
		...transformed,
		body:
			activation === null
				? [...transformed.body, ...imports, ...trailing]
				: [
						...transformed.body.slice(0, start),
						...imports,
						...trailing,
						activation,
						...transformed.body.slice(start),
					],
	};
	// Check the Program as printed: the hook lowering above can replace an
	// authored shape that esrap would misprint.
	if (!printsFaithfully(program)) return null;
	// One TS-preserving print, with real mappings. Never feed this generated code
	// back through the surgical pass or parse it into a second compiler pipeline.
	try {
		const printed = esrapPrint(program, visitors, {
			sourceMapSource: id,
			sourceMapContent: source,
		});
		return { code: printed.code, map: printed.map };
	} catch {
		// A parser can support a TypeScript shape before its esrap visitor does.
		// Unsupported authored syntax must remain the host toolchain's input,
		// rather than becoming a production-only compiler error.
		return null;
	}
}
import {
	hookMethodName,
	assertSynchronousHookMethod,
	lowerHookMethodChain,
} from './hook-methods.js';
