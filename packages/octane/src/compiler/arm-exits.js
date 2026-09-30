/**
 * The directive-arm exit contract, shared by the DOM and universal compilers so
 * an arm means the same thing on every renderer.
 *
 * An arm (an @if/@else, @switch case, @try/@pending/@catch, or @for/@empty
 * body) renders the node it ends with. `return;`, `return null;`, and a
 * `continue;` that no inner loop owns end the arm early from anywhere in its
 * setup. A value return has nothing to render in the node's place, and a
 * `break` that targets the directive has no loop to leave in the compiled arm,
 * so both are compile errors. Each compiler walks an arm's setup itself,
 * stopping at nested functions, templates, and directives, which own their
 * jumps, and lowers an exit to its own arm shape.
 *
 * A `@{ … }` child block is a nested template with its own render scope, not
 * an arm, even as an arm's output: nothing ends it early, and the parser
 * already rejects `return` in one. Every target compiles the block apart from
 * the statements around it, so assertTemplateJumps rejects any `break` or
 * `continue` that would leave a block, and a labeled one that would leave an
 * arm, once on the authored module ahead of every compiler.
 */

export const ARM_VALUE_RETURN_MESSAGE =
	'A directive arm can only end early with `return;` or `return null;`. Its output is ' +
	'the node it ends with, so a returned value has nothing to render in its place: ' +
	'render the alternative from an `@if`/`@else` arm instead.';

export const ARM_BREAK_MESSAGE =
	'`break` cannot leave the `@for` or `@switch` around a directive arm. End the arm ' +
	'early with `return;` instead, or filter the `@for` items to stop the list early.';

export const ARM_LABEL_MESSAGE =
	'A labeled `break` or `continue` cannot leave a directive arm: an arm can only jump to ' +
	'a loop, `switch`, or label inside it. End the arm early with `return;` instead.';

export const BLOCK_JUMP_MESSAGE =
	'`break` and `continue` cannot leave a `@{ … }` block. A block is a nested template, ' +
	'not a directive arm, so it has no early exit: skip an `@for` row with `continue;` in ' +
	"the row's setup before its output, or render the part to leave out from an `@if` arm.";

/**
 * How a jump statement relates to the arm whose setup holds it: 'exit' ends
 * the arm, 'value' (a value return) and 'break' (one that targets the
 * directive) have no arm meaning, and null stays JavaScript. `loop` and
 * `breakable` say whether an unlabeled `continue`/`break` here targets a loop
 * or `switch` inside the arm. A labeled jump targets a label inside it, since
 * assertTemplateJumps rejects one that leaves the arm.
 */
export function armJump(node, loop, breakable) {
	switch (node.type) {
		case 'ReturnStatement':
			return node.argument == null ||
				(node.argument.type === 'Literal' && node.argument.value === null)
				? 'exit'
				: 'value';
		case 'ContinueStatement':
			return node.label == null && !loop ? 'exit' : null;
		case 'BreakStatement':
			return node.label == null && !breakable ? 'break' : null;
		default:
			return null;
	}
}

const WALK_SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);
const DIRECTIVE_TYPES = new Set([
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);
const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'StaticBlock',
]);
const LOOP_TYPES = new Set([
	'ForStatement',
	'ForOfStatement',
	'ForInStatement',
	'WhileStatement',
	'DoWhileStatement',
]);

// The template region a statement sits in. Outside every template, jumps are
// ordinary JavaScript and the parser resolves them.
const OUTSIDE = 0;
const ARM = 1;
const BLOCK = 2;

/**
 * Reject each `break` or `continue` that targets a statement outside the
 * `@{ … }` block, or (when labeled) the directive arm, whose setup holds it.
 * The parser resolves jumps lexically, so it accepts these, but every target
 * compiles a block or arm apart from the statements around it and would emit
 * a module that fails to load. An arm's unlabeled jumps are its exits, which
 * each compiler lowers or rejects (see armJump). Runs once per module, on the
 * authored AST, for every target.
 */
export function assertTemplateJumps(ast, source, filename) {
	// A module without a jump, or without a block or directive, has nothing to check.
	if (!/\b(?:break|continue)\b/.test(source) || !/@(?:\{|(?:if|for|switch|try)\b)/.test(source)) {
		return;
	}
	const file = filename.split(/[\\/]/).pop();
	const visit = (node, region, loop, breakable, labels) => {
		if (Array.isArray(node)) {
			for (const child of node) {
				if (child !== null && typeof child === 'object') {
					visit(child, region, loop, breakable, labels);
				}
			}
			return;
		}
		const type = node.type;
		if (type === 'JSXCodeBlock') {
			if (node.body) visit(node.body, BLOCK, false, false, null);
			if (node.render) visit(node.render, OUTSIDE, false, false, null);
			return;
		}
		if ((type === 'ContinueStatement' || type === 'BreakStatement') && region !== OUTSIDE) {
			const leaves =
				node.label != null
					? !labels?.has(node.label.name)
					: region === BLOCK && !(type === 'ContinueStatement' ? loop : breakable);
			if (leaves) {
				const at = node.loc ? ` (${file}:${node.loc.start.line}:${node.loc.start.column})` : '';
				throw new Error((region === BLOCK ? BLOCK_JUMP_MESSAGE : ARM_LABEL_MESSAGE) + at);
			}
			return;
		}
		if (FUNCTION_TYPES.has(type) || DIRECTIVE_TYPES.has(type)) {
			region = DIRECTIVE_TYPES.has(type) ? ARM : OUTSIDE;
			loop = breakable = false;
			labels = null;
		} else if (LOOP_TYPES.has(type)) {
			loop = breakable = true;
		} else if (type === 'SwitchStatement') {
			breakable = true;
		} else if (type === 'LabeledStatement') {
			labels = new Set(labels).add(node.label.name);
		}
		for (const key in node) {
			if (WALK_SKIP_KEYS.has(key)) continue;
			const child = node[key];
			if (child !== null && typeof child === 'object')
				visit(child, region, loop, breakable, labels);
		}
	};
	visit(ast, OUTSIDE, false, false, null);
}
