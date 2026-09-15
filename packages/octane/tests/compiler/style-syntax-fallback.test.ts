// @vitest-environment node

/**
 * Replays the tsrx parser spec table for the RFC "lexically scoped `<style>`
 * blocks, `$class`, `apply`" syntax (`STYLE_SYNTAX_CASES`, shipped by the
 * linked `@tsrx/core` test harness) through Octane's Node parser entry
 * (`#octane/compiler-parser` → `src/compiler/parser.node.js`): the native
 * `@tsrx/oxc` parser goes first and the JavaScript parser (`parser.browser.js`)
 * takes over when the native one throws a `SyntaxError`.
 *
 * Every case is checked structurally the way `packages/tsrx/tests/utils/
 * parser.test.js` does, and the test additionally records which parser
 * produced the tree. `NEEDS_FALLBACK` pins the forms `@tsrx/oxc` cannot parse
 * today; once the upstream port ships, the pinned-list test fails and the
 * expected action is to shrink the list (and eventually delete the fallback).
 *
 * A native rejection is a translated `SyntaxError` or, for a source carrying a
 * `<style>` expression child (`<style>{css}</style>`), the bare `Error` the
 * facade's CSS reader raises after its error translation. The Node entry
 * (`parser.node.js`) retries both in JavaScript; the probe mirrors that rule.
 */

import { describe, expect, it } from 'vitest';
import { parseModule as parseNativeModule } from '@tsrx/oxc/tsrx-core-compat';
import { parseModule } from '#octane/compiler-parser';
import { parseModule as parseJavaScriptModule } from '../../src/compiler/parser.browser.js';
import { STYLE_SYNTAX_CASES } from '@tsrx/core/test-harness/style-syntax';

type Shape = (typeof STYLE_SYNTAX_CASES)[number]['expected'] & object;
type StyleShape = Extract<Shape, { type: 'JSXStyleElement' }>;
type AnyNode = Record<string, any>;

const FILENAME = 'App.tsrx';

/**
 * Spec cases whose source the native parser rejects today, so the JavaScript
 * fallback produces the tree. Every other case parses natively. When
 * `@tsrx/oxc` ships the scoped-style port, entries disappear from this list
 * (the summary printed by the pinned-list test shows the new state); update
 * the list rather than the parser wiring.
 */
const NEEDS_FALLBACK = [
	// Multiple outputs are rejected in strict mode by both parsers.
	// Collection mode now preserves the native recovery tree and diagnostics.
	'style before the output node in a @{} body is the multiple-outputs error',
	'style after the output node in a @{} body is the multiple-outputs error',
	'style beside the output node in an @if consequent is the multiple-outputs error',
	'style beside the output node in a @for body is the multiple-outputs error',
	'style beside the output node in a @try block is the multiple-outputs error',
];

// --- native-parser probe ----------------------------------------------------

interface NativeOutcome {
	accepted: boolean;
	error?: string;
}

/** Whether the native parser accepts the source on its own (no fallback). */
function probeNative(source: string): NativeOutcome {
	try {
		parseNativeModule(source, FILENAME);
		return { accepted: true };
	} catch (error) {
		const rejection =
			error instanceof SyntaxError ||
			(error instanceof Error &&
				error.name === 'Error' &&
				error.constructor === Error &&
				/<style\b[^>]*>\s*\{/.test(source));
		if (!rejection) throw error;
		return { accepted: false, error: (error as Error).message };
	}
}

// --- structural matcher -------------------------------------------------------

function found(value: unknown): AnyNode {
	expect(value).toBeDefined();
	expect(value).not.toBeNull();
	return value as AnyNode;
}

function blockBody(node: unknown): AnyNode[] {
	const block = found(node);
	expect(block.type).toBe('BlockStatement');
	return block.body;
}

function attributeName(attribute: AnyNode): string {
	return attribute.type === 'JSXAttribute' && attribute.name?.type === 'JSXIdentifier'
		? attribute.name.name
		: attribute.type;
}

function assertStyleShape(style: AnyNode, shape: StyleShape): void {
	expect(style.openingElement.name.name).toBe('style');
	expect(style.openingElement.selfClosing).toBe(shape.selfClosing);
	expect(style.openingElement.attributes.map(attributeName)).toEqual(shape.attributes);
	if ('apply' in shape) {
		const apply = style.openingElement.attributes.find(
			(attribute: AnyNode) => attributeName(attribute) === 'apply',
		);
		expect(found(apply).value.expression.type).toBe(shape.apply);
	}
	expect(style.children.map((child: AnyNode) => child.type)).toEqual(shape.children);
	expect(style.css).toBe(shape.css);
	expect(style.metadata?.styleScopeHash !== undefined).toBe(shape.hasScopeHash);
	if (shape.hasScopeHash) {
		expect(style.metadata.styleScopeHash).toBe(style.children[0]?.hash);
	}
	expect(style.closingElement !== null && style.closingElement !== undefined).toBe(
		shape.closingElement,
	);
}

/** A directive clause: `null` when absent, otherwise a block whose statements match. */
function assertClause(block: unknown, shapes: Shape[] | null): void {
	if (shapes === null) {
		expect(block ?? null).toBeNull();
		return;
	}
	assertShapes(blockBody(block), shapes);
}

function assertShapes(nodes: AnyNode[], shapes: Shape[]): void {
	expect(nodes.map((node) => node.type)).toEqual(shapes.map((shape) => shape.type));
	nodes.forEach((node, index) => assertShape(node, shapes[index]));
}

function assertShape(node: unknown, shape: Shape): void {
	const actual = found(node);
	expect(actual.type).toBe(shape.type);
	switch (shape.type) {
		case 'JSXStyleElement':
			assertStyleShape(actual, shape);
			break;
		case 'JSXElement':
			expect(actual.openingElement.name.name).toBe(shape.name);
			// A `<style>{css}</style>` host is an ordinary element: no css, no
			// sheet, no scope hash — only its expression-container children.
			if (shape.children) {
				expect(actual.css).toBeUndefined();
				expect(actual.metadata?.styleScopeHash).toBeUndefined();
				assertShapes(
					actual.children.filter(
						(child: AnyNode) => !(child.type === 'JSXText' && child.value.trim() === ''),
					),
					shape.children,
				);
			}
			break;
		case 'JSXFragment':
			assertShapes(actual.children, shape.children);
			break;
		case 'JSXCodeBlock':
			assertShapes(actual.body, shape.body);
			if (shape.render === null) expect(actual.render).toBeNull();
			else assertShape(actual.render, shape.render);
			break;
		case 'JSXIfExpression':
			assertClause(actual.consequent, shape.consequent);
			assertClause(actual.alternate, shape.alternate);
			break;
		case 'JSXForExpression':
			assertClause(actual.body, shape.body);
			assertClause(actual.empty, shape.empty);
			break;
		case 'JSXSwitchExpression':
			expect(actual.cases.length).toBe(shape.cases.length);
			actual.cases.forEach((switchCase: AnyNode, index: number) => {
				const expectedCase = shape.cases[index];
				expect(switchCase.test?.type ?? null).toBe(expectedCase.test);
				assertShapes(switchCase.consequent, expectedCase.consequent);
			});
			break;
		case 'JSXTryExpression':
			assertClause(actual.block, shape.block);
			assertClause(actual.pending, shape.pending);
			assertClause(actual.handler?.body, shape.handler);
			break;
		default:
			// Any other statement (setup code) is matched on `type` alone.
			break;
	}
}

// --- suite ----------------------------------------------------------------------

describe('style syntax spec table through the Node parser (native first, JS fallback)', () => {
	const positive = STYLE_SYNTAX_CASES.filter((spec) => !spec.error);
	const negative = STYLE_SYNTAX_CASES.filter((spec) => spec.error);

	it('vendors a non-empty spec table', () => {
		expect(positive.length).toBeGreaterThan(0);
		expect(negative.length).toBeGreaterThan(0);
	});

	it('takes the JavaScript fallback exactly for the pinned set of forms', () => {
		const outcomes = STYLE_SYNTAX_CASES.map((spec) => ({
			name: spec.name,
			...probeNative(spec.source),
		}));
		const summary = outcomes
			.map(
				(outcome) =>
					`  ${outcome.accepted ? 'native  ' : 'fallback'}  ${outcome.name}` +
					(outcome.error ? `\n              @tsrx/oxc: ${outcome.error}` : ''),
			)
			.join('\n');
		console.info(`style syntax spec table — parser per case:\n${summary}`);

		const needsFallback = outcomes.filter((o) => !o.accepted).map((o) => o.name);
		// A difference here means @tsrx/oxc changed what it accepts (most likely
		// the scoped-style port landed): update NEEDS_FALLBACK to the new set.
		expect(needsFallback).toEqual(NEEDS_FALLBACK);
		expect(NEEDS_FALLBACK.length).toBeGreaterThan(0);
	});

	it('pins only names that exist in the spec table', () => {
		const names = new Set(STYLE_SYNTAX_CASES.map((spec) => spec.name));
		for (const name of NEEDS_FALLBACK) expect(names.has(name), name).toBe(true);
	});

	describe('positive cases', () => {
		for (const spec of positive) {
			// The JavaScript parser is the reference implementation of the table:
			// its tree must always match, whichever parser the Node entry picks.
			it(`${spec.name}: the JavaScript parser matches the spec shape`, () => {
				const errors: any[] = [];
				const ast = parseJavaScriptModule(spec.source, FILENAME, { collect: true, errors });
				expect(errors).toEqual([]);
				assertShape(spec.locate(ast), spec.expected!);
			});

			it(`${spec.name}: the Node entry (native first) matches the spec shape`, () => {
				const errors: any[] = [];
				const ast = parseModule(spec.source, FILENAME, { collect: true, errors, comments: [] });
				expect(errors).toEqual([]);
				assertShape(spec.locate(ast), spec.expected!);
			});
		}
	});

	describe('negative cases', () => {
		for (const spec of negative) {
			it(`${spec.name}: the JavaScript parser reports the spec diagnostic`, () => {
				const errors: any[] = [];
				const ast = parseJavaScriptModule(spec.source, FILENAME, { collect: true, errors });
				expect(errors.map((error) => error.message)).toEqual([spec.error!.message]);
				if (spec.error!.start !== undefined) expect(errors[0].pos).toBe(spec.error!.start);
				if (spec.error!.end !== undefined) expect(errors[0].end).toBe(spec.error!.end);
				if (spec.expected) assertShape(spec.locate(ast), spec.expected);
			});

			it(`${spec.name}: the Node entry throws in strict mode and collects the spec diagnostic`, () => {
				expect(() => parseModule(spec.source, FILENAME)).toThrow(SyntaxError);
				const errors: any[] = [];
				const ast = parseModule(spec.source, FILENAME, { collect: true, errors });
				expect(errors.map((error) => error.message)).toEqual([spec.error!.message]);
				if (spec.error!.start !== undefined) expect(errors[0].pos).toBe(spec.error!.start);
				if (spec.error!.end !== undefined) expect(errors[0].end).toBe(spec.error!.end);
				if (spec.expected) assertShape(spec.locate(ast), spec.expected);
			});
		}
	});
});
