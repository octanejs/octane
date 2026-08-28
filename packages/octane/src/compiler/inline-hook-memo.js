// Shared, AST-only lowering for memo sites which must retain their ordinary
// path-aware hook entry. The component compiler has a cheaper flat-cache tier;
// plain custom hooks and authored explicit slots cannot use that tier because
// their effective slot includes the caller's withSlot path.

import { builders as b } from '@tsrx/core';

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);
const VALUE_WRAPPERS = new Set([
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSInstantiationExpression',
	'ParenthesizedExpression',
]);
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

function unwrapValue(node) {
	while (node && VALUE_WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function walkEveryNode(root, visit) {
	function walk(node) {
		if (node === null || typeof node !== 'object') return true;
		if (Array.isArray(node)) {
			for (const child of node) if (!walk(child)) return false;
			return true;
		}
		if (visit(node) === false) return false;
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			if (!walk(node[key])) return false;
		}
		return true;
	}
	return walk(root);
}

function isHookShapedCall(node) {
	if (node.type !== 'CallExpression') return false;
	if (
		typeof node._octaneImportedHook === 'string' ||
		typeof node._octaneHookRuntimeImportedHook === 'string'
	) {
		return true;
	}
	const callee = unwrapValue(node.callee);
	const name =
		callee?.type === 'Identifier'
			? callee.name
			: callee?.type === 'MemberExpression' &&
				  !callee.computed &&
				  callee.property?.type === 'Identifier'
				? callee.property.name
				: null;
	return name === 'use' || (name !== null && /^use[A-Z]/.test(name));
}

function hasOwnScopeDeclaration(root) {
	function walk(node) {
		if (node === null || typeof node !== 'object') return false;
		if (Array.isArray(node)) return node.some(walk);
		if (node.type === 'FunctionDeclaration') return true;
		if (FUNCTION_TYPES.has(node.type)) return false;
		if (node.type === 'VariableDeclaration' && node.kind === 'var') return true;
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			if (walk(node[key])) return true;
		}
		return false;
	}
	return walk(root);
}

/**
 * Whether invoking this useMemo factory can be replaced by its body. Ordinary
 * functions deliberately keep their own this/arguments/new.target/name scope.
 * A direct eval or an opaque function directive also needs the original scope.
 * Hook-shaped calls cannot be moved behind a cache-hit branch.
 */
export function isInlineMemoFactorySafe(fn) {
	if (
		fn?.type !== 'ArrowFunctionExpression' ||
		fn.async ||
		fn.generator ||
		(fn.params?.length ?? 0) !== 0
	) {
		return false;
	}
	if (fn.body?.type === 'BlockStatement') {
		const first = fn.body.body?.[0];
		const expression = first?.type === 'ExpressionStatement' ? unwrapValue(first.expression) : null;
		if (typeof first?.directive === 'string' || typeof expression?.value === 'string') return false;
		if (hasOwnScopeDeclaration(fn.body)) return false;
	}
	return walkEveryNode(fn.body, (node) => {
		if (isHookShapedCall(node)) return false;
		if (node.type !== 'CallExpression') return true;
		const callee = unwrapValue(node.callee);
		return callee?.type !== 'Identifier' || callee.name !== 'eval';
	});
}

/** Attach origins only to generated scaffolding; authored subtrees stay shared. */
export function inheritHookMemoOrigin(root, origin) {
	if (origin?.loc == null) return root;
	function inherit(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) return node.map(inherit);
		if (typeof node.type !== 'string' || node.loc != null) return node;
		const out = {
			...node,
			start: origin.start,
			end: origin.end,
			loc: origin.loc,
		};
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			out[key] = inherit(node[key]);
		}
		return out;
	}
	return inherit(root);
}

function factoryExpression(name, fn, original) {
	if (name === 'useCallback') return original;
	if (fn.body.type !== 'BlockStatement') return fn.body;
	const statements = fn.body.body || [];
	if (statements.length === 0) return b.void0;
	if (statements.length === 1 && statements[0].type === 'ReturnStatement') {
		return statements[0].argument ?? b.void0;
	}
	return null;
}

/**
 * Recognize a memo with known dependencies and trustworthy hook provenance.
 * The caller slots/inserts inferred deps first, or explicitly allows an absent
 * raw slot for a manually composed custom-hook path. `expression === null`
 * means the safe factory needs statement-position lowering, never an IIFE.
 */
export function analyzeInlineMemoCall(call, options = {}) {
	call = unwrapValue(call);
	if (call?.type !== 'CallExpression' || call.optional) return null;
	// This cache also owns a native-read witness. The ordinary flat/slot memo
	// lowering only knows lexical dependencies and must not erase that evidence.
	if (call._octaneNativeInferredMemo === true) return null;
	const canonical = options.canonicalHookName?.(call);
	if (canonical === null) return null;
	const imported = canonical ?? call._octaneImportedHook ?? call._octaneHookRuntimeImportedHook;
	const callee = unwrapValue(call.callee);
	const name =
		imported ??
		(callee?.type === 'Identifier' &&
		(callee._octaneGenerated === true ||
			(options.allowUnbound === true && call._octaneUnboundCallee === true))
			? callee.name
			: null);
	if (name !== 'useMemo' && name !== 'useCallback') return null;
	if (
		call.arguments.length !== 3 &&
		!(options.allowMissingSlot === true && call.arguments.length === 2)
	) {
		return null;
	}
	if (call.arguments.some((argument) => argument.type === 'SpreadElement')) return null;
	const original = call.arguments[0];
	const fn = unwrapValue(original);
	if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return null;
	if (name === 'useMemo' && !isInlineMemoFactorySafe(fn)) return null;
	const dependency = unwrapValue(call.arguments[1]);
	let deps;
	if (dependency?.type === 'ArrayExpression') {
		deps = dependency.elements || [];
		if (deps.length > (options.maxDeps ?? 4)) return null;
		if (deps.some((element) => element == null || element.type === 'SpreadElement')) return null;
	} else if (dependency?.type === 'Literal' && dependency.value === null) {
		deps = null;
	} else {
		return null;
	}
	return {
		name,
		fn,
		deps,
		slot: call.arguments[2],
		expression: factoryExpression(name, fn, original),
		call,
	};
}

const assign = (left, right) => b.assignment('=', left, right);
const id = (name) => b.id(name);

// An anonymous function/class used as a return value or call argument has no
// inferred name. Moving it onto an identifier assignment must not silently
// give it the compiler's temporary name.
export function withoutInferredMemoName(expression) {
	const value = unwrapValue(expression);
	return value?.type === 'ArrowFunctionExpression' ||
		((value?.type === 'FunctionExpression' || value?.type === 'ClassExpression') && !value.id)
		? b.sequence([b.literal(0), expression])
		: expression;
}

function slotCall(entry, runtime) {
	return b.call(runtime('memoSlot'), entry.slot ?? b.void0, b.literal(entry.name));
}

/**
 * Build a closure-free sequence expression. `temp` allocates and registers a
 * function-local mutable binding; `runtime` registers an import and returns its
 * local name. Dependency expressions run exactly once, before the raw slot.
 */
export function buildSlotMemoExpression(entry, { temp, runtime }) {
	if (entry.expression === null) return null;
	const slot = temp('__hks');
	const sequence = [];
	const depNames = (entry.deps || []).map((dependency, index) => {
		const name = temp(`__hkd${index}`);
		sequence.push(assign(id(name), withoutInferredMemoName(dependency)));
		return name;
	});
	sequence.push(assign(id(slot), slotCall(entry, runtime)));
	if (entry.deps === null) {
		sequence.push(b.call(runtime('memoPublishAlways'), id(slot), entry.expression));
	} else {
		const previous = temp('__hke');
		sequence.push(
			assign(
				id(previous),
				b.call(runtime(`memoTake${depNames.length}`), id(slot), ...depNames.map(id)),
			),
		);
		sequence.push(
			b.conditional(
				b.binary('===', id(previous), b.null),
				b.call(runtime('memoPublish'), id(slot), entry.expression, ...depNames.map(id)),
				b.member(id(previous), 'value'),
			),
		);
	}
	return inheritHookMemoOrigin(b.sequence(sequence), entry.call);
}

function replaceOwnReturns(root, result, label) {
	function rewrite(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let out = null;
			for (let i = 0; i < node.length; i++) {
				const mapped = rewrite(node[i]);
				if (out === null && mapped !== node[i]) out = node.slice(0, i);
				if (out !== null) out.push(mapped);
			}
			return out ?? node;
		}
		if (FUNCTION_TYPES.has(node.type)) return node;
		if (node.type === 'ReturnStatement') {
			return inheritHookMemoOrigin(
				b.block([
					b.stmt(assign(id(result), withoutInferredMemoName(node.argument ?? b.void0))),
					{ ...b.break, label: id(label) },
				]),
				node,
			);
		}
		let out = null;
		for (const key in node) {
			if (META_KEYS.has(key) || key.startsWith('_octane')) continue;
			const mapped = rewrite(node[key]);
			if (mapped !== node[key]) {
				if (out === null) out = { ...node };
				out[key] = mapped;
			}
		}
		return out ?? node;
	}
	return rewrite(root);
}

/**
 * Statement-position counterpart for a multi-statement factory. The caller
 * owns `target` and retains the authored declaration/return after this block,
 * preserving its const/let binding and temporal dead zone.
 */
export function buildSlotMemoStatements(entry, { temp, runtime }, target) {
	const slot = temp('__hks');
	const statements = [];
	const depNames = (entry.deps || []).map((dependency, index) => {
		const name = temp(`__hkd${index}`);
		statements.push(b.stmt(assign(id(name), withoutInferredMemoName(dependency))));
		return name;
	});
	statements.push(b.stmt(assign(id(slot), slotCall(entry, runtime))));
	const value = temp('__hkv');
	let compute;
	if (entry.expression !== null) {
		compute = [b.stmt(assign(id(value), withoutInferredMemoName(entry.expression)))];
	} else {
		const label = temp('__hkl', true);
		const body = replaceOwnReturns(entry.fn.body, value, label);
		// A finally break/continue can cancel a pending return and let the
		// original factory fall through. Clear its abandoned result only on
		// normal completion; real returns break past this statement.
		const fallthrough = inheritHookMemoOrigin(b.stmt(assign(id(value), b.void0)), entry.fn.body);
		compute = [b.labeled(label, { ...body, body: [...body.body, fallthrough] })];
	}
	const publish = b.stmt(
		assign(
			target,
			entry.deps === null
				? b.call(runtime('memoPublishAlways'), id(slot), id(value))
				: b.call(runtime('memoPublish'), id(slot), id(value), ...depNames.map(id)),
		),
	);
	if (entry.deps === null) {
		statements.push(...compute, publish);
	} else {
		const previous = temp('__hke');
		statements.push(
			b.stmt(
				assign(
					id(previous),
					b.call(runtime(`memoTake${depNames.length}`), id(slot), ...depNames.map(id)),
				),
			),
			b.if(
				b.binary('===', id(previous), b.null),
				b.block([...compute, publish]),
				b.stmt(assign(target, b.member(id(previous), 'value'))),
			),
		);
	}
	return inheritHookMemoOrigin(b.block(statements), entry.call);
}

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

function replaceWrappedValue(node, replacement) {
	return VALUE_WRAPPERS.has(node?.type)
		? { ...node, expression: replaceWrappedValue(node.expression, replacement) }
		: replacement;
}

/** New bindings and imports must be invisible to every lexical direct eval. */
export function hasInlineMemoDirectEval(root) {
	let found = false;
	walkNodes(root, (node) => {
		// A descendant function's direct eval can inspect this function's
		// lexical environment too. New outer cache bindings must stay invisible
		// to it, even when the descendant itself contains no lowered memo.
		if (
			node.type === 'CallExpression' &&
			unwrapValue(node.callee)?.type === 'Identifier' &&
			unwrapValue(node.callee).name === 'eval'
		) {
			found = true;
		}
		return !found;
	});
	return found;
}

function directiveEnd(statements) {
	let index = 0;
	while (index < statements.length) {
		const statement = statements[index];
		const expression =
			statement?.type === 'ExpressionStatement' ? unwrapValue(statement.expression) : null;
		if (typeof statement?.directive !== 'string' && typeof expression?.value !== 'string') break;
		index++;
	}
	return index;
}

/** Whether an authored function belongs to an opaque execution transform. */
export function hasInlineMemoOpaqueDirective(fn) {
	if (fn.body?.type !== 'BlockStatement' && fn.body?.type !== 'JSXCodeBlock') return false;
	const statements = fn.body.body || [];
	const end = directiveEnd(statements);
	for (let i = 0; i < end; i++) {
		const value = statements[i].directive ?? unwrapValue(statements[i].expression)?.value;
		if (value !== 'use strict' && value !== 'use strong') return true;
	}
	return false;
}

/** Adding body-local cache temporaries must not alter eval or opaque code. */
export function isInlineMemoOwnerSafe(fn) {
	return (
		fn._octaneInlineMemoOpaqueOwner !== true &&
		!hasInlineMemoDirectEval(fn.body) &&
		!hasInlineMemoOpaqueDirective(fn)
	);
}

/**
 * Lower already-slotted memo calls throughout a Program. The owning compiler
 * supplies collision-free names and runtime import registration; this pass
 * creates only AST and leaves the owning Program print to that compiler.
 */
export function lowerSlotMemoFunctions(ast, options) {
	const state = { lowered: 0 };
	const analyze = (node) =>
		analyzeInlineMemoCall(node, {
			allowMissingSlot: options.allowMissingSlot === true,
			allowUnbound: options.allowUnbound === true,
			canonicalHookName: options.canonicalHookName,
		});

	function makeContext(fn) {
		const locals = [];
		return {
			enabled: isInlineMemoOwnerSafe(fn),
			locals,
			temp(preferred, labelOnly = false) {
				const name = options.allocateName(preferred);
				if (!labelOnly) locals.push(name);
				return name;
			},
			runtime(imported) {
				return options.requireRuntime(imported);
			},
		};
	}

	function visitFunction(fn) {
		const context = makeContext(fn);
		// Opaque execution directives can serialize or otherwise reinterpret the
		// entire function, including nested functions and classes. Do not add
		// cache code anywhere inside an owner whose scope must remain intact.
		if (!context.enabled) return fn;
		// Parameter initializers execute before body-local lets are initialized.
		// Only nested functions inside parameters may get their own lowering.
		const params = mapChildren(fn.params || [], (node) => visit(node, null));
		let body = visit(fn.body, context);
		if (context.locals.length > 0) {
			if (body.type !== 'BlockStatement') {
				body = inheritHookMemoOrigin(b.block([b.return(body)]), fn.body);
			}
			const at = directiveEnd(body.body);
			const declaration = inheritHookMemoOrigin(
				b.declaration(
					'let',
					context.locals.map((name) => b.declarator(name, null)),
				),
				fn.body,
			);
			body = {
				...body,
				body: [...body.body.slice(0, at), declaration, ...body.body.slice(at)],
			};
		}
		return params === fn.params && body === fn.body
			? fn
			: {
					...fn,
					params,
					body,
					...(fn.type === 'ArrowFunctionExpression'
						? { expression: body.type !== 'BlockStatement' }
						: null),
				};
	}

	function blockMemoOf(value, context) {
		if (!context?.enabled) return null;
		const entry = analyze(unwrapValue(value));
		return entry !== null && entry.expression === null ? entry : null;
	}

	function mappedEntry(entry, context) {
		const call = mapChildren(entry.call, (node) => visit(node, context));
		return analyze(call);
	}

	function lowerDirectValue(value, entry, context) {
		const result = context.temp('__hkr');
		const mapped = mappedEntry(entry, context);
		const block = buildSlotMemoStatements(mapped, context, b.id(result));
		state.lowered++;
		return {
			block,
			value: replaceWrappedValue(value, b.id(result, entry.call)),
		};
	}

	function visitStatementList(statements, context) {
		const out = [];
		let changed = false;
		for (const statement of statements) {
			if (statement.type === 'VariableDeclaration' && context?.enabled) {
				let pending = [];
				let split = false;
				for (const declaration of statement.declarations) {
					const entry = blockMemoOf(declaration.init, context);
					if (entry === null) {
						pending.push(visit(declaration, context));
						continue;
					}
					if (pending.length > 0) {
						out.push({ ...statement, declarations: pending });
						pending = [];
					}
					const lowered = lowerDirectValue(declaration.init, entry, context);
					out.push(lowered.block, {
						...statement,
						declarations: [{ ...declaration, init: lowered.value }],
					});
					split = true;
				}
				if (pending.length > 0) {
					const same =
						!split &&
						pending.every((declaration, index) => declaration === statement.declarations[index]);
					out.push(same ? statement : { ...statement, declarations: pending });
					if (!same) changed = true;
				}
				if (split) changed = true;
				continue;
			}
			const value =
				statement.type === 'ReturnStatement'
					? statement.argument
					: statement.type === 'ExpressionStatement'
						? statement.expression
						: null;
			const entry = blockMemoOf(value, context);
			if (entry !== null) {
				const lowered = lowerDirectValue(value, entry, context);
				out.push(
					lowered.block,
					statement.type === 'ReturnStatement'
						? { ...statement, argument: lowered.value }
						: { ...statement, expression: lowered.value },
				);
				changed = true;
				continue;
			}
			const mapped = visit(statement, context);
			if (mapped !== statement) changed = true;
			out.push(mapped);
		}
		return changed ? out : statements;
	}

	function visit(node, context) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) return mapChildren(node, (child) => visit(child, context));
		if (FUNCTION_TYPES.has(node.type)) return visitFunction(node);
		// Field initializers can execute after their enclosing function returns,
		// and several instances can share that function's lexical environment.
		// They cannot borrow its mutable cache temporaries. Methods still receive
		// their own function context when visited below this boundary.
		if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			return mapChildren(node, (child) => visit(child, null));
		}
		if (node.type === 'BlockStatement') {
			const body = visitStatementList(node.body, context);
			return body === node.body ? node : { ...node, body };
		}
		if (node.type === 'SwitchCase') {
			const test = visit(node.test, context);
			const consequent = visitStatementList(node.consequent, context);
			return test === node.test && consequent === node.consequent
				? node
				: { ...node, test, consequent };
		}
		// A braceless return/expression arm needs a block. Declarations are only
		// expanded by their owning statement list so their lexical scope survives.
		if (node.type === 'ReturnStatement' || node.type === 'ExpressionStatement') {
			const key = node.type === 'ReturnStatement' ? 'argument' : 'expression';
			const entry = blockMemoOf(node[key], context);
			if (entry !== null) {
				const lowered = lowerDirectValue(node[key], entry, context);
				return inheritHookMemoOrigin(
					b.block([lowered.block, { ...node, [key]: lowered.value }]),
					node,
				);
			}
		}
		if (node.type === 'CallExpression' && context?.enabled) {
			// Prove the original factory before visiting descendants. Otherwise an
			// inner lowered hook could disappear and incorrectly make its enclosing
			// memo factory look hook-free.
			const entry = analyze(node);
			const mapped = mapChildren(node, (child) => visit(child, context));
			if (entry !== null && entry.expression !== null) {
				const lowered = buildSlotMemoExpression(analyze(mapped), context);
				state.lowered++;
				return lowered;
			}
			return mapped;
		}
		return mapChildren(node, (child) => visit(child, context));
	}

	return { ast: visit(ast, null), lowered: state.lowered };
}
