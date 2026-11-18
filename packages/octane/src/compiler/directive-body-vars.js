/**
 * TSRX lowers an `@if`, `@for`, `@switch` or `@try` body, and an `@{ … }` block
 * that is not a function's own body, into a function of its own, so a `var`
 * there would not reach the enclosing function. assertNoDirectiveBodyVars
 * rejects one once on the authored module, ahead of every compiler, with the
 * code and message `@tsrx/core` gives the same mistake on its own targets.
 */

import { TSRX_ERRORS } from '@tsrx/core';

const WALK_SKIP_KEYS = new Set([
	'type',
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'tsrx_tokens',
	'tsrx_keyword_tokens',
]);

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
]);

const SCOPE_BOUNDARY_TYPES = new Set([...FUNCTION_TYPES, 'ClassDeclaration', 'ClassExpression']);

export function assertNoDirectiveBodyVars(ast, source, filename) {
	if (!source.includes('var')) return;
	const file = filename.split(/[\\/]/).pop();
	const visit = (node, parent, inBody) => {
		if (Array.isArray(node)) {
			for (const child of node) {
				if (child !== null && typeof child === 'object') visit(child, parent, inBody);
			}
			return;
		}
		if (inBody && node.type === 'VariableDeclaration' && node.kind === 'var' && !node.declare) {
			const at = node.loc ? ` (${file}:${node.loc.start.line}:${node.loc.start.column})` : '';
			throw Object.assign(new Error(TSRX_ERRORS.DIRECTIVE_BODY_VAR.message + at), {
				code: TSRX_ERRORS.DIRECTIVE_BODY_VAR.code,
			});
		}
		const childrenInBody =
			DIRECTIVE_TYPES.has(node.type) ||
			(node.type === 'JSXCodeBlock' &&
				!(FUNCTION_TYPES.has(parent?.type) && parent.body === node)) ||
			(inBody && !SCOPE_BOUNDARY_TYPES.has(node.type));
		for (const key in node) {
			if (WALK_SKIP_KEYS.has(key)) continue;
			const child = node[key];
			if (child === null || typeof child !== 'object') continue;
			// An `@for` head is not part of its body.
			const head = node.type === 'JSXForExpression' && child !== node.body && child !== node.empty;
			visit(child, node, childrenInBody && !head);
		}
	};
	visit(ast, null, false);
}
