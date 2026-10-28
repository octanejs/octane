/**
 * A `@{ … }` body and every directive arm hold setup statements, then one
 * output node: an element, a fragment, a `@{ … }` block, or a directive. In
 * statement position `{children}` is therefore a JavaScript block around a
 * dead expression, not a hole, and the body renders nothing in its place. It
 * reads as a hole, so assertNoBareHoles rejects it once on the authored module,
 * ahead of every compiler. Braces around one expression statement do nothing
 * in JavaScript, so setup code never needs this shape. `@case` arms are the
 * exception: the parser reads a `{` there as a hole, and it renders.
 */

const BARE_HOLE_MESSAGE =
	'`{…}` in a `@{ … }` body or directive arm is a JavaScript block, not a hole, so it ' +
	'renders nothing. Wrap it in a fragment to render it, as in `<>{children}</>`, or ' +
	'remove the braces to keep it as setup code.';

const WALK_SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);

/**
 * Reject the first block statement holding a single expression statement among
 * the statements of a `@{ … }` body or an `@if`/`@else`, `@for`/`@empty`, or
 * `@try`/`@pending`/`@catch` arm. Runs once per module, on the authored AST,
 * for every target.
 */
export function assertNoBareHoles(ast, source, filename) {
	if (!/@(?:\{|(?:if|for|try)\b)/.test(source)) return;
	const file = filename.split(/[\\/]/).pop();
	const check = (body) => {
		if (body == null) return;
		// An `@else if` chain continues as a plain IfStatement.
		if (body.type === 'IfStatement') {
			check(body.consequent);
			check(body.alternate);
			return;
		}
		// The compilers also accept an arm that is a single node, or an `@else`
		// that is a JSXIfExpression, which the walk below checks on its own.
		if (!Array.isArray(body.body)) return;
		for (const statement of body.body) {
			if (
				statement.type === 'BlockStatement' &&
				statement.body.length === 1 &&
				statement.body[0].type === 'ExpressionStatement'
			) {
				const at = statement.loc
					? ` (${file}:${statement.loc.start.line}:${statement.loc.start.column})`
					: '';
				throw new Error(BARE_HOLE_MESSAGE + at);
			}
		}
	};
	const visit = (node) => {
		if (Array.isArray(node)) {
			for (const child of node) {
				if (child !== null && typeof child === 'object') visit(child);
			}
			return;
		}
		switch (node.type) {
			case 'JSXCodeBlock':
				check(node);
				break;
			case 'JSXIfExpression':
				check(node.consequent);
				check(node.alternate);
				break;
			case 'JSXForExpression':
				check(node.body);
				check(node.empty);
				break;
			case 'JSXTryExpression':
				check(node.block);
				check(node.pending);
				check(node.handler?.body);
				break;
		}
		for (const key in node) {
			if (WALK_SKIP_KEYS.has(key)) continue;
			const child = node[key];
			if (child !== null && typeof child === 'object') visit(child);
		}
	};
	visit(ast);
}
