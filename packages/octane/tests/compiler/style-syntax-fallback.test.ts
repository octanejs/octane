// @vitest-environment node

/**
 * Replays the tsrx parser spec table for the RFC "lexically scoped `<style>`
 * blocks, `$class`, `apply`" syntax (`STYLE_SYNTAX_CASES`, shipped by the
 * linked `@tsrx/core` test harness) through Octane's Node parser entry
 * (`#octane/compiler-parser` → `src/compiler/parser.node.js`): the native
 * `oxc-tsrx` parser goes first and the JavaScript parser (`parser.browser.js`)
 * takes over when the native one throws a `SyntaxError`.
 *
 * Every case is checked structurally the way `packages/tsrx/tests/utils/
 * parser.test.js` does, and the test additionally records which parser
 * produced the tree. `NEEDS_FALLBACK` pins the forms `oxc-tsrx` cannot parse
 * today; once the upstream port ships, the pinned-list test fails and the
 * expected action is to shrink the list (and eventually delete the fallback).
 *
 * A native rejection is a translated `SyntaxError` or, for a source carrying a
 * `<style>` expression child (`<style>{css}</style>`), the bare `Error` the
 * facade's CSS reader raises after its error translation. The Node entry
 * (`parser.node.js`) retries both in JavaScript; the probe mirrors that rule.
 */

import { describe, expect, it } from 'vitest';
import { parseModule as parseNativeModule } from 'oxc-tsrx/tsrx-core-compat';
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
 * `oxc-tsrx` ships the scoped-style port, entries disappear from this list
 * (the summary printed by the pinned-list test shows the new state); update
 * the list rather than the parser wiring.
 */
const NEEDS_FALLBACK = [
	'self-closing <style /> without apply',
	'self-closing <style apply={theme} />',
	'self-closing <style apply={[a, b]} />',
	'self-closing <style apply={ns.dark} />',
	'self-closing <style ref={r} apply={theme} /> keeps every attribute in order',
	'bodied <style apply={t}>…</style> keeps its sheet, css, scope hash and apply',
	'style before the output node in a @{} body',
	'style after the output node in a @{} body',
	'styles both before and after the output node in a @{} body',
	'nested @{} with its own style',
	'assigned @{} block: a theme in its setup and an applying fragment output',
	'style siblings inside @if consequent and @else',
	'style siblings inside @for body and @empty',
	'style siblings inside @switch case and default',
	'style siblings inside @try, @pending and @catch',
	'two non-style output nodes in a @{} body is a recoverable error on the second node',
];

/**
 * Spec cases the native parser accepts but whose tree diverges from the spec
 * shape, so the Node entry (which trusts a native success) returns the
 * divergent tree today. Pinned with `it.fails`; remove entries as oxc-tsrx
 * catches up.
 */
const NATIVE_SHAPE_DIVERGES: Record<string, string> = {
	'only a style and no output node in a @{} body':
		"oxc-tsrx makes the lone <style> the code block's `render` (body []) instead of a body sibling with `render: null`",
	'only a style inside an @if consequent':
		'oxc-tsrx omits `css` on a self-closed <style /> (spec: css is the empty string)',
	'multiple sibling style blocks inside one fragment':
		'oxc-tsrx omits `css` on a self-closed <style /> (spec: css is the empty string)',
	'module-scope assigned self-closed block':
		'oxc-tsrx omits `css` on a self-closed <style /> (spec: css is the empty string)',
};

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
					(outcome.error ? `\n              oxc-tsrx: ${outcome.error}` : ''),
			)
			.join('\n');
		console.info(`style syntax spec table — parser per case:\n${summary}`);

		const needsFallback = outcomes.filter((o) => !o.accepted).map((o) => o.name);
		// A difference here means oxc-tsrx changed what it accepts (most likely
		// the scoped-style port landed): update NEEDS_FALLBACK to the new set.
		expect(needsFallback).toEqual(NEEDS_FALLBACK);
		expect(NEEDS_FALLBACK.length).toBeGreaterThan(0);
	});

	it('pins only names that exist in the spec table', () => {
		const names = new Set(STYLE_SYNTAX_CASES.map((spec) => spec.name));
		for (const name of NEEDS_FALLBACK) expect(names.has(name), name).toBe(true);
		for (const name of Object.keys(NATIVE_SHAPE_DIVERGES)) {
			expect(names.has(name), name).toBe(true);
			// A case cannot both need the fallback and be natively mis-shaped.
			expect(NEEDS_FALLBACK, name).not.toContain(name);
		}
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

			const divergence = NATIVE_SHAPE_DIVERGES[spec.name];
			const nodeIt = divergence ? it.fails : it;
			nodeIt(
				`${spec.name}: the Node entry (native first) matches the spec shape` +
					(divergence ? ` (known failure: ${divergence})` : ''),
				() => {
					const errors: any[] = [];
					const ast = parseModule(spec.source, FILENAME, { collect: true, errors, comments: [] });
					expect(errors).toEqual([]);
					assertShape(spec.locate(ast), spec.expected!);
				},
			);
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

			it(`${spec.name}: the Node entry surfaces a SyntaxError`, () => {
				// parser.node.js only publishes a fallback result that carries no
				// errors; a recovered tree with diagnostics rethrows the native
				// rejection instead. So today the combined entry throws here, and
				// the native message — not the spec's — is what callers see. When
				// oxc-tsrx learns the recoverable form this assertion flips.
				const errors: any[] = [];
				expect(() => parseModule(spec.source, FILENAME, { collect: true, errors })).toThrow(
					SyntaxError,
				);
				expect(probeNative(spec.source).accepted).toBe(false);
			});
		}
	});
});
