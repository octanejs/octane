// Production-only whole-Program path for plain TypeScript/JavaScript hooks.
// Unlike slot-hooks' line-preserving fallback, every generated token here is
// AST and esrap prints the completed TypeScript Program exactly once.

import { builders as b, clone_ast_node as cloneAstNode } from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';
import { METHOD_DEP_IMPORT } from './hook-deps.js';
import { nativeReadActivationIndex } from './native-read-codegen.js';
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
	function walk(node) {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (visit(node) === false) return;
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			walk(node[key]);
		}
	}
	walk(root);
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
						)
					: cloneAstNode(dependency.node),
			),
		),
		origin,
	);
}

// Match the surgical pass's BASE-hook-only policy. Custom hooks remain normal
// calls; their compiled caller owns withSlot. Existing explicit memo slots are
// already the effective third argument, so no unused fourth argument is added.
function slotBaseHooks(ast, state, options) {
	function visit(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) return mapChildren(node, visit);
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
		const slot = explicitMemoSlot ? null : allocateHookSlot(state, node);
		const mapped = mapChildren(node, visit);
		const args = mapped.arguments.slice();
		if (inferred !== undefined) {
			args.splice(inferred.depsIndex, 0, inferredDependencyArray(inferred, state, node));
		}
		if (slot !== null) args.push(slot);
		let callee = mapped.callee;
		if (options.getterCalls.has(node) && options.stateGetterHelpers[imported]) {
			callee = b.id(requireHelper(state, options.stateGetterHelpers[imported], 'octane'), node);
		}
		if (node._octaneNativeInferredMemo === true) {
			callee = b.id(requireHelper(state, 'nativePuMemo'), node);
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

function canPrintProgram(ast, visitors) {
	let supported = true;
	walkNodes(ast, (node) => {
		if (typeof node.type === 'string' && typeof visitors[node.type] !== 'function') {
			supported = false;
			return false;
		}
		return supported;
	});
	return supported;
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
	const visitors = esrapTsx({
		comments: collectComments(ast),
		getLeadingComments: (node) => (node.__octanePure ? PURE_COMMENTS : undefined),
	});
	if (!canPrintProgram(ast, visitors)) return null;
	const state = {
		usedNames: collectUsedNames(ast),
		helpers: new Map(),
		slotBase: null,
		slotDeclarations: [],
	};
	let transformed = options.manualSlots ? ast : slotBaseHooks(ast, state, options);
	const lowered = lowerSlotMemoFunctions(transformed, {
		allocateName: (preferred) => allocName(state, preferred),
		requireRuntime: (imported) => requireHelper(state, imported),
		allowMissingSlot: options.manualSlots === true,
	});
	if (lowered.lowered === 0) return null;
	transformed = lowered.ast;
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
