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
 */

export const ARM_VALUE_RETURN_MESSAGE =
	'A directive arm can only end early with `return;` or `return null;`. Its output is ' +
	'the node it ends with, so a returned value has nothing to render in its place: ' +
	'render the alternative from an `@if`/`@else` arm instead.';

export const ARM_BREAK_MESSAGE =
	'`break` cannot leave the `@for` or `@switch` around a directive arm. End the arm ' +
	'early with `return;` instead, or filter the `@for` items to stop the list early.';

/**
 * How a jump statement relates to the arm whose setup holds it: 'exit' ends
 * the arm, 'value' (a value return) and 'break' (one that targets the
 * directive) have no arm meaning, and null stays JavaScript. `loop` and
 * `breakable` say whether an unlabeled `continue`/`break` here targets a loop
 * or `switch` inside the arm; a labeled jump always targets a label inside it.
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
