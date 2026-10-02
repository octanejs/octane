/**
 * The `@for` header contract, shared by every target so a header means the same
 * thing on every renderer.
 *
 * `@for` lowers to a keyed row list over an iterable: `@for (const item of
 * items; key item.id)`. The parser also accepts a `for…in` header and a
 * C-style header, recording the statement form on `statementType`. No target
 * can lower either, and a target that read only the for-of fields compiled
 * `for…in` as `for…of` over the object. assertForOfHeaders rejects them once
 * on the authored module, ahead of every compiler.
 */

export const FOR_IN_MESSAGE =
	'`@for` iterates an iterable with `for…of`, so a `for…in` header is not supported. ' +
	"Iterate the object's keys instead: `@for (const name of Object.keys(object); key name)`.";

export const FOR_STATEMENT_MESSAGE =
	'`@for` iterates an iterable with `for…of`, so a C-style `(init; test; update)` header ' +
	'is not supported. Build the items first, for example ' +
	'`@for (const i of Array.from({ length: n }, (_, i) => i); key i)`.';

const WALK_SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);

/**
 * Reject the first `@for` directive whose header is not a for-of. Runs once per
 * module, on the authored AST, for every target.
 */
export function assertForOfHeaders(ast, source, filename) {
	if (!/@for\b/.test(source)) return;
	const file = filename.split(/[\\/]/).pop();
	const visit = (node) => {
		if (Array.isArray(node)) {
			for (const child of node) {
				if (child !== null && typeof child === 'object') visit(child);
			}
			return;
		}
		if (node.type === 'JSXForExpression' && node.statementType !== 'ForOfStatement') {
			const at = node.loc ? ` (${file}:${node.loc.start.line}:${node.loc.start.column})` : '';
			throw new Error(
				(node.statementType === 'ForInStatement' ? FOR_IN_MESSAGE : FOR_STATEMENT_MESSAGE) + at,
			);
		}
		for (const key in node) {
			if (WALK_SKIP_KEYS.has(key)) continue;
			const child = node[key];
			if (child !== null && typeof child === 'object') visit(child);
		}
	};
	visit(ast);
}
