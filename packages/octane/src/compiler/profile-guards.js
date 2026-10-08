// Dev-server erasure of Octane's own profiling guards.
//
// The runtime guards every profiling branch with the reserved
// `__OCTANE_PROFILE_ENABLED__` define. Production bundlers replace it with a
// literal, fold the guards, and tree-shake profiling.ts and devtools-hook.ts
// away. Vite's dev server does neither for client modules: it installs each
// define as a runtime global, so every guard stays a hot-path global read and
// both optional modules still load. This pass gives an Octane runtime module
// served by a dev server the shape a production build gives it.
//
// Like slot-hooks.js and runtime-requests.js, it is a narrow text edit: the
// parser locates each range, and source outside those ranges passes through
// unchanged. A removed range keeps its whitespace, line terminators included,
// so every authored line keeps its line number without a source map. It only:
//
// - replaces a guard that folds to a constant with that literal;
// - keeps the live arm of an `if`, conditional, or `&&`/`||` chain whose test
//   folds;
// - removes a top-level function or import that only the folded code used.
//
// Removing an unused import is sound only because the octane package declares
// its modules free of side effects (package.json `sideEffects`), which is what
// lets production bundlers drop the same imports. The caller restricts this
// pass to that package.

export const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';

// TypeScript nodes that hold runtime values. Every other `TS*` node is a type,
// which the TypeScript transform erases and which never reads the define.
const VALUE_TS_NODES = new Set([
	'TSAsExpression',
	'TSEnumBody',
	'TSEnumDeclaration',
	'TSEnumMember',
	'TSExportAssignment',
	'TSInstantiationExpression',
	'TSModuleBlock',
	'TSModuleDeclaration',
	'TSNonNullExpression',
	'TSParameterProperty',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const TRANSPARENT_TS_EXPRESSIONS = new Set([
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const NON_CHILD_KEYS = new Set(['type', 'start', 'end', 'range', 'loc', 'parent']);
const FUNCTION_OR_CLASS = new Set([
	'ArrowFunctionExpression',
	'ClassDeclaration',
	'ClassExpression',
	'FunctionDeclaration',
	'FunctionExpression',
]);

class Unsupported extends Error {}

// Stands in for whichever nested chain node holds an operand.
const OPERAND_PARENT = { type: 'LogicalExpression' };

function isNode(value) {
	return value !== null && typeof value === 'object' && typeof value.type === 'string';
}

function forEachChild(node, visit) {
	for (const key in node) {
		if (NON_CHILD_KEYS.has(key)) continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) if (isNode(child)) visit(child, node, key);
		} else if (isNode(value)) {
			visit(value, node, key);
		}
	}
}

// A type-only subtree, or a `declare` form that emits nothing.
function isErasedNode(node) {
	return (node.type.startsWith('TS') && !VALUE_TS_NODES.has(node.type)) || node.declare === true;
}

// Identifier positions that name something other than a variable.
function isNonReferenceName(parent, key) {
	switch (parent.type) {
		case 'MemberExpression':
			return key === 'property' && !parent.computed;
		case 'Property':
		case 'MethodDefinition':
		case 'PropertyDefinition':
		case 'AccessorProperty':
			return key === 'key' && !parent.computed;
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
			return key === 'label';
		case 'MetaProperty':
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			return true;
		case 'ExportSpecifier':
			return key === 'exported';
		default:
			return FUNCTION_OR_CLASS.has(parent.type) && key === 'id';
	}
}

// How one spelling of the reserved name is used: a read of the global define
// that a literal can replace in place, a property or label name, or anything
// else (a binding, a write, an export, a shorthand property), which this pass
// does not support.
function defineUse(parent, key) {
	if (isNonReferenceName(parent, key)) {
		const binds =
			parent.type.startsWith('Import') ||
			FUNCTION_OR_CLASS.has(parent.type) ||
			(parent.type === 'Property' && parent.shorthand);
		return binds ? 'unsupported' : 'name';
	}
	switch (parent.type) {
		case 'AssignmentExpression':
		case 'AssignmentPattern':
		case 'ForInStatement':
		case 'ForOfStatement':
			return key === 'left' ? 'unsupported' : 'read';
		case 'VariableDeclarator':
			return key === 'init' ? 'read' : 'unsupported';
		case 'Property':
			return parent.shorthand ? 'unsupported' : 'read';
		case 'UpdateExpression':
		case 'CatchClause':
		case 'ArrayPattern':
		case 'ObjectPattern':
		case 'RestElement':
		case 'ExportSpecifier':
			return 'unsupported';
		default:
			return FUNCTION_OR_CLASS.has(parent.type) && key === 'params' ? 'unsupported' : 'read';
	}
}

// Whether only the truthiness of the expression at `parent[key]` is observed.
function isTruthOnly(parent, key) {
	switch (parent.type) {
		case 'IfStatement':
		case 'ConditionalExpression':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
			return key === 'test';
		case 'UnaryExpression':
			return parent.operator === '!';
		default:
			return false;
	}
}

// A literal is a primary expression, so it can replace any expression in place.
function literalText(value) {
	if (typeof value === 'boolean') return String(value);
	return typeof value === 'string' ? JSON.stringify(value) : null;
}

/**
 * Fold the profiling guards in one Octane runtime module.
 *
 * @param {string} source
 * @param {any} program ESTree Program, with TypeScript nodes and UTF-16 offsets
 * @param {boolean} enabled
 * @returns {string | null} the rewritten source, or null when nothing changed or
 *   the module uses the reserved name in a way this pass does not support
 */
export function foldProfileGuards(source, program, enabled) {
	const occurrences = [];
	for (
		let index = source.indexOf(PROFILE_DEFINE);
		index !== -1;
		index = source.indexOf(PROFILE_DEFINE, index + PROFILE_DEFINE.length)
	) {
		occurrences.push(index);
	}
	if (occurrences.length === 0) return null;
	// Only subtrees that spell the define can fold, so the fold walk skips the
	// rest of the module.
	const mentionsDefine = (node) => {
		let low = 0;
		let high = occurrences.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (occurrences[middle] < node.start) low = middle + 1;
			else high = middle;
		}
		return low < occurrences.length && occurrences[low] < node.end;
	};

	/** @type {Array<{ start: number, end: number, text: string, order: number }>} */
	const edits = [];
	const replace = (start, end, text) => {
		if (start < end || text.length > 0) edits.push({ start, end, text, order: edits.length });
	};
	// Where an expression's first token matters: a statement or arrow body
	// that starts with `{` parses differently, and a `return`, `throw`, or
	// `yield` argument must start on the keyword's line.
	const heads = new Set();
	// Keep `kept` in place of `node`. Each folded construct sits where any
	// operand it keeps may sit, so only a head position needs parentheses.
	const keepExpression = (node, kept) => {
		const wrap = heads.has(node.start);
		replace(node.start, kept.start, wrap ? '(' : '');
		replace(kept.end, node.end, wrap ? ')' : '');
	};
	// A kept statement is braced unless it is already a block, so it can never
	// join the statement before it.
	const keepStatement = (node, kept) => {
		const braced = kept.type === 'BlockStatement';
		replace(node.start, kept.start, braced ? '' : '{');
		replace(kept.end, node.end, braced ? '' : '}');
	};

	// The constant value of an expression, or null. `profile` records whether
	// the define decided it; only those folds are applied.
	const evaluate = (node) => {
		switch (node.type) {
			case 'Identifier':
				return node.name === PROFILE_DEFINE ? { value: enabled, profile: true } : null;
			case 'Literal':
				return node.regex === undefined && node.bigint === undefined
					? { value: node.value, profile: false }
					: null;
			case 'ParenthesizedExpression':
				return evaluate(node.expression);
			case 'UnaryExpression': {
				if (node.operator !== '!' && node.operator !== 'typeof') return null;
				const argument = evaluate(node.argument);
				if (argument === null) return null;
				return {
					value: node.operator === '!' ? !argument.value : typeof argument.value,
					profile: argument.profile,
				};
			}
			case 'BinaryExpression': {
				if (!['===', '!==', '==', '!='].includes(node.operator)) return null;
				const left = evaluate(node.left);
				const right = left === null ? null : evaluate(node.right);
				if (right === null) return null;
				const equal =
					node.operator.length === 3 ? left.value === right.value : left.value == right.value;
				return {
					value: node.operator[0] === '=' ? equal : !equal,
					profile: left.profile || right.profile,
				};
			}
			case 'LogicalExpression': {
				let profile = false;
				let result = null;
				for (const operand of logicalOperands(node)) {
					result = evaluate(operand);
					if (result === null) return null;
					profile ||= result.profile;
					if (shortCircuits(node.operator, result.value)) break;
				}
				return { value: result.value, profile };
			}
			case 'ConditionalExpression': {
				const test = evaluate(node.test);
				if (test === null) return null;
				const branch = evaluate(test.value ? node.consequent : node.alternate);
				return branch === null
					? null
					: { value: branch.value, profile: branch.profile || test.profile };
			}
			default:
				return TRANSPARENT_TS_EXPRESSIONS.has(node.type) ? evaluate(node.expression) : null;
		}
	};

	// Whether an expression that may not have a constant value is constantly
	// truthy or falsy where only that is observed, as an `if` or conditional
	// test is. The operands it skips must have no side effects.
	const truthiness = (node) => {
		const constant = evaluate(node);
		if (constant !== null) return { value: !!constant.value, profile: constant.profile };
		switch (node.type) {
			case 'ParenthesizedExpression':
				return truthiness(node.expression);
			case 'UnaryExpression': {
				if (node.operator !== '!') return null;
				const argument = truthiness(node.argument);
				return argument === null ? null : { value: !argument.value, profile: argument.profile };
			}
			case 'LogicalExpression': {
				if (node.operator === '??') return null;
				const decides = node.operator === '||';
				for (const operand of logicalOperands(node)) {
					const known = truthiness(operand);
					if (known?.value === decides) return known.profile ? known : null;
					if (known === null && !isPure(operand)) return null;
				}
				return null;
			}
			default:
				return null;
		}
	};

	// `truthOnly`: only the value's truthiness is observed, as for an `if` test.
	const fold = (node, parent, key, truthOnly = false) => {
		if (!mentionsDefine(node) || isErasedNode(node)) return;
		switch (node.type) {
			case 'Identifier':
				if (node.name !== PROFILE_DEFINE) return;
				switch (defineUse(parent, key)) {
					case 'read':
						replace(node.start, node.end, literalText(enabled));
						return;
					case 'name':
						return;
					default:
						throw new Unsupported();
				}
			case 'IfStatement': {
				const test = truthiness(node.test);
				if (test === null || !test.profile) {
					if (!foldEffectfulTest(node)) break;
					return;
				}
				const kept = test.value ? node.consequent : node.alternate;
				if (kept === null) {
					// An empty statement keeps the statements around it apart, and is
					// still a statement where the parent needs one (`else`, a loop body).
					replace(node.start, node.end, ';');
					return;
				}
				keepStatement(node, kept);
				fold(kept, node, test.value ? 'consequent' : 'alternate');
				return;
			}
			case 'ConditionalExpression': {
				const test = truthiness(node.test);
				if (test === null || !test.profile) break;
				const kept = test.value ? node.consequent : node.alternate;
				keepExpression(node, kept);
				fold(kept, node, test.value ? 'consequent' : 'alternate');
				return;
			}
			case 'LogicalExpression':
				foldOperands(logicalOperands(node), node.operator, truthOnly);
				return;
			case 'ParenthesizedExpression':
				fold(node.expression, node, 'expression', truthOnly);
				return;
		}
		const constant = evaluate(node);
		if (constant !== null && constant.profile) {
			const text = literalText(constant.value);
			if (text !== null) {
				replace(node.start, node.end, text);
				return;
			}
		}
		const head =
			node.type === 'ExpressionStatement'
				? node.expression
				: node.type === 'ArrowFunctionExpression' || node.type === 'ExportDefaultDeclaration'
					? (node.body ?? node.declaration)
					: node.type === 'ReturnStatement' ||
						  node.type === 'ThrowStatement' ||
						  node.type === 'YieldExpression'
						? node.argument
						: null;
		if (head) heads.add(head.start);
		forEachChild(node, (child, childParent, childKey) =>
			fold(child, childParent, childKey, isTruthOnly(childParent, childKey)),
		);
	};

	// Fold the operands of one `a && b && c` chain together. A guard is often
	// only part of the list (`a && typeof X !== 'undefined' && X`), which the
	// parser nests as `(a && typeof X !== 'undefined') && X`, so folding node by
	// node would never see the guard as one subtree. Operands after the one that
	// decides the chain never run; a constant before it, which cannot decide it,
	// does not change its value. Where only truthiness is observed, neither does
	// a last operand that cannot decide it.
	const foldOperands = (operands, operator, truthOnly) => {
		const values = operands.map((operand) => (mentionsDefine(operand) ? evaluate(operand) : null));
		const decisive = values.findIndex(
			(value) => value !== null && shortCircuits(operator, value.value),
		);
		const last = decisive === -1 ? operands.length - 1 : decisive;
		const drop = operands.map((_, index) => {
			if (decisive !== -1 && !values[decisive].profile) return false;
			if (index > last) return true;
			const value = values[index];
			return (
				value !== null &&
				value.profile &&
				!shortCircuits(operator, value.value) &&
				(index < last || truthOnly)
			);
		});
		const kept = drop.flatMap((dropped, index) => (dropped ? [] : [index]));
		const constant = kept.length === 0 ? values[last] : kept.length === 1 ? values[kept[0]] : null;
		if (constant !== null && constant.profile && literalText(constant.value) !== null) {
			replace(operands[0].start, operands.at(-1).end, literalText(constant.value));
			return;
		}
		for (let start = 0; start < operands.length; start++) {
			if (!drop[start]) continue;
			let end = start;
			while (end + 1 < operands.length && drop[end + 1]) end++;
			if (start === 0) {
				const wrap = heads.has(operands[0].start);
				replace(operands[0].start, operands[end + 1].start, wrap ? '(' : '');
				if (wrap) replace(operands.at(-1).end, operands.at(-1).end, ')');
			} else {
				replace(operands[start - 1].end, operands[end].end, '');
			}
			start = end;
		}
		for (const index of kept) {
			const value = values[index];
			if (value !== null && value.profile && literalText(value.value) !== null) {
				replace(operands[index].start, operands[index].end, literalText(value.value));
			} else {
				fold(operands[index], OPERAND_PARENT, 'right', truthOnly);
			}
		}
	};

	// `if (a.b && typeof X !== 'undefined' && X) …`: the guard decides the test,
	// but the operands before it still run and may have effects (a getter, a
	// null object). Keep exactly those as a statement, then the branch the
	// guard selects: `{(a.b); …}`, which is what a production build emits.
	const foldEffectfulTest = (node) => {
		if (node.test.type !== 'LogicalExpression' || node.test.operator === '??') return false;
		const operands = logicalOperands(node.test);
		const decisive = operands.findIndex((operand) => {
			if (!mentionsDefine(operand)) return false;
			const known = truthiness(operand);
			return known !== null && known.profile && shortCircuits(node.test.operator, known.value);
		});
		if (decisive <= 0) return false;
		const value = node.test.operator === '||';
		const kept = value ? node.consequent : node.alternate;
		const prefix = operands.slice(0, decisive);
		replace(node.start, prefix[0].start, '{(');
		if (kept === null) {
			replace(prefix.at(-1).end, node.end, ');}');
		} else {
			replace(prefix.at(-1).end, kept.start, ');');
			replace(kept.end, node.end, '}');
		}
		foldOperands(prefix, node.test.operator, true);
		if (kept !== null) fold(kept, node, value ? 'consequent' : 'alternate');
		return true;
	};

	try {
		fold(program, null, null);
	} catch (error) {
		if (error instanceof Unsupported) return null;
		throw error;
	}
	if (edits.length === 0) return null;
	return applyEdits(source, [...edits, ...unusedDeclarationRemovals(program, edits)]);
}

function shortCircuits(operator, value) {
	return operator === '&&' ? !value : operator === '||' ? !!value : value != null;
}

// The operands of a left-nested chain of one logical operator, in order.
function logicalOperands(node) {
	const operands = [];
	let current = node;
	while (current.type === 'LogicalExpression' && current.operator === node.operator) {
		operands.push(current.right);
		current = current.left;
	}
	operands.push(current);
	return operands.reverse();
}

// Evaluating it can neither throw nor run code. A member read is excluded
// because a getter or a null object could do either.
function isPure(node) {
	switch (node.type) {
		case 'Identifier':
		case 'Literal':
		case 'ThisExpression':
			return true;
		case 'ParenthesizedExpression':
			return isPure(node.expression);
		case 'UnaryExpression':
			return ['!', 'typeof', 'void'].includes(node.operator) && isPure(node.argument);
		case 'BinaryExpression':
			return (
				(node.operator === '===' || node.operator === '!==') &&
				isPure(node.left) &&
				isPure(node.right)
			);
		case 'LogicalExpression':
			return isPure(node.left) && isPure(node.right);
		case 'ConditionalExpression':
			return isPure(node.test) && isPure(node.consequent) && isPure(node.alternate);
		default:
			return TRANSPARENT_TS_EXPRESSIONS.has(node.type) && isPure(node.expression);
	}
}

// Top-level functions and imports that only the folded code used. A function
// already unused before folding stays: removing it is not this pass's change.
function unusedDeclarationRemovals(program, edits) {
	const references = new Map();
	const collect = (node, parent, key) => {
		if (isErasedNode(node)) return;
		if (node.type === 'Identifier') {
			if (parent !== null && isNonReferenceName(parent, key)) return;
			let positions = references.get(node.name);
			if (positions === undefined) references.set(node.name, (positions = []));
			positions.push(node.start);
			return;
		}
		forEachChild(node, collect);
	};
	forEachChild(program, collect);

	const removed = [...edits].sort((left, right) => left.start - right.start);
	const isRemoved = (position, ranges) =>
		ranges.some((range) => range.start <= position && position < range.end);
	const count = (name, excluded, folded) =>
		(references.get(name) ?? []).filter(
			(position) => !isRemoved(position, excluded) && !(folded && isRemoved(position, removed)),
		).length;

	const functions = program.body.filter(
		(node) => node.type === 'FunctionDeclaration' && node.id !== null && node.body !== null,
	);
	const deadFunctions = [];
	for (let changed = true; changed;) {
		changed = false;
		for (const declaration of functions) {
			if (deadFunctions.includes(declaration)) continue;
			const name = declaration.id.name;
			if (count(name, [declaration], false) === 0) continue;
			if (count(name, [declaration, ...deadFunctions], true) !== 0) continue;
			deadFunctions.push(declaration);
			changed = true;
		}
	}

	const removals = deadFunctions.map((declaration) => ({
		start: declaration.start,
		end: declaration.end,
		text: ';',
		order: 0,
	}));
	for (const declaration of program.body) {
		if (declaration.type !== 'ImportDeclaration' || declaration.importKind === 'type') continue;
		const locals = declaration.specifiers
			.filter((specifier) => specifier.importKind !== 'type')
			.map((specifier) => specifier.local.name);
		if (
			locals.length > 0 &&
			locals.some((name) => count(name, [], false) > 0) &&
			locals.every((name) => count(name, deadFunctions, true) === 0)
		) {
			removals.push({ start: declaration.start, end: declaration.end, text: ';', order: 0 });
		}
	}
	return removals;
}

// Apply the edits. An edit inside a removed declaration is dropped with it,
// and each removed range keeps its whitespace, line terminators included. At
// one position an insertion precedes a replacement, and a later (inner)
// insertion precedes an earlier (outer) one, so parentheses nest. Partly
// overlapping edits would be a defect in this pass; the module is then served
// as authored, which is still correct.
function applyEdits(source, edits) {
	edits.sort(
		(left, right) =>
			left.start - right.start ||
			Number(right.start === right.end) - Number(left.start === left.end) ||
			right.end - left.end ||
			right.order - left.order,
	);
	let code = '';
	let offset = 0;
	for (const edit of edits) {
		if (edit.start < offset) {
			if (edit.end <= offset) continue;
			return null;
		}
		code +=
			source.slice(offset, edit.start) +
			edit.text +
			source.slice(edit.start, edit.end).replace(/\S+/g, '');
		offset = edit.end;
	}
	return code + source.slice(offset);
}
