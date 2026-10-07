/** @import { Program } from 'estree' */

import { isLayoutWhitespace } from '@tsrx/core';

// `@tsrx/core` 0.5 gives template markup TSX's exact tree: the indentation
// between children is a `JSXText` of its own, and an `@case`/`@default` arm is
// one `BlockStatement` from its `{` to its `}`. Neither changes what renders:
// layout whitespace renders nothing under JSX's whitespace rule, and each arm
// already had its own scope. Octane's compilers consume the rendering tree, so
// every parse adopts it here once instead of every child walk and switch-arm
// reader learning to skip the layout nodes. Rewrites are copy-on-write; the
// parser's own nodes are never mutated.
//
// The editor's type-only output is printed by core, which keeps the line breaks
// around a comment child so that `{/* @ts-expect-error */}` stays on the line
// before the child it is about. An editor parse keeps the layout text beside a
// comment child and leaves the choice to core.

// Keys that never hold template markup.
const SKIP_KEYS = new Set([
	'loc',
	'range',
	'metadata',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
]);

/**
 * @param {Program} program
 * @param {boolean} [editor] keep the layout text beside comment children
 * @returns {Program}
 */
export function adoptTemplateShape(program, editor = false) {
	return /** @type {Program} */ (adopt(program, editor));
}

/**
 * @param {any} value
 * @param {boolean} editor
 * @returns {any}
 */
function adopt(value, editor) {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		/** @type {any[] | null} */
		let out = null;
		for (let i = 0; i < value.length; i++) {
			const item = value[i];
			const adopted =
				isLayoutWhitespace(item) &&
				!(editor && (isCommentChild(value[i - 1]) || isCommentChild(value[i + 1])))
					? null
					: adopt(item, editor);
			if (out === null && adopted !== item) out = value.slice(0, i);
			if (out !== null && adopted !== null) out.push(adopted);
		}
		return out ?? value;
	}
	/** @type {any} */
	let out = null;
	for (const key in value) {
		if (SKIP_KEYS.has(key)) continue;
		const child = value[key];
		if (child === null || typeof child !== 'object') continue;
		const adopted =
			key === 'consequent' ? adoptCaseArm(value, child, editor) : adopt(child, editor);
		if (adopted !== child) {
			out ??= { ...value };
			out[key] = adopted;
		}
	}
	return out ?? value;
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isCommentChild(node) {
	return (
		node?.type === 'JSXExpressionContainer' &&
		node.expression?.type === 'JSXEmptyExpression' &&
		node.expression.innerComments?.length > 0
	);
}

/**
 * A template `@case`/`@default` arm is the statement list inside its braces.
 * @param {any} parent
 * @param {any} consequent
 * @param {boolean} editor
 */
function adoptCaseArm(parent, consequent, editor) {
	if (
		parent.type === 'SwitchCase' &&
		consequent.length === 1 &&
		consequent[0].type === 'BlockStatement' &&
		consequent[0].metadata?.native_tsrx_template_block === true
	) {
		return adopt(consequent[0].body, editor);
	}
	return adopt(consequent, editor);
}
