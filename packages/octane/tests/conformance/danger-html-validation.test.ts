import { describe, expect, it, vi } from 'vitest';
import { Children, createElement, flushSync, hydrateRoot } from 'octane';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream } from '../_server-stream.js';
import * as client from './_fixtures/danger-html-validation.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/danger-html-validation.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const CONFLICT = /Can only set one of `children` or `props\.dangerouslySetInnerHTML`/;
const MALFORMED = /must be in the form `\{__html: \.\.\.\}`/;

function clientHtml(component: any, props: any): string {
	const result = mount(component, props);
	try {
		return result.container.innerHTML;
	} finally {
		result.unmount();
	}
}

function expectHydrationThrow(
	component: keyof typeof client,
	serverProps: any,
	clientProps: any,
	error: RegExp,
) {
	const container = document.createElement('div');
	container.innerHTML = ServerRuntime.renderToString(server[component] as any, serverProps).html;
	let root: ReturnType<typeof hydrateRoot> | undefined;
	const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(() => {
			root = hydrateRoot(container, client[component] as any, clientProps);
			flushSync(() => {});
		}).toThrow(error);
	} finally {
		root?.unmount();
		consoleError.mockRestore();
	}
}

async function expectStreamThrow(component: keyof typeof server, props: any, error: RegExp) {
	const result = await collectPipeableStream(server[component] as any, props);
	expect(result.html).toBe('');
	expect(result.errors).toHaveLength(1);
	expect(String(result.errors[0])).toMatch(error);
}

describe('dangerouslySetInnerHTML validation', () => {
	// Per ReactDOMComponent-test.js:1852, 1879, 1888, and 2068.
	it('keeps compile-time errors to definitely conflicting static shapes', () => {
		const dynamic = `export function C(props) @{ <div dangerouslySetInnerHTML={props.d}>{props.c}</div> }`;
		const dynamicDanger = `export function C(props) @{ <div dangerouslySetInnerHTML={props.d}>text</div> }`;
		const overwritten = `export function C(props) @{ <div dangerouslySetInnerHTML={{__html: 'raw'}} {...props.spread}>text</div> }`;
		const directNullishWins = `export function C() @{ <div dangerouslySetInnerHTML={{__html: 'raw'}} dangerouslySetInnerHTML={null}>text</div> }`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(dynamic, 'dynamic-danger.tsrx', { mode })).not.toThrow();
			expect(() =>
				compile(dynamicDanger, 'dynamic-danger-static-child.tsrx', { mode }),
			).not.toThrow();
			expect(() => compile(overwritten, 'spread-overwrites-danger.tsrx', { mode })).not.toThrow();
			expect(() =>
				compile(directNullishWins, 'null-overwrites-danger.tsrx', { mode }),
			).not.toThrow();
			for (const child of ['{0}', '{false}', "{''}", '<span />']) {
				const source = `export function C(props) @{ <div dangerouslySetInnerHTML={{__html: props.h}}>${child}</div> }`;
				expect(() => compile(source, 'static-danger-conflict.tsrx', { mode })).toThrow(CONFLICT);
			}
		}
	});

	// Per ReactDOMComponent-test.js:2068 (stable) / :2103 (canary). A direct
	// `children` prop is still children, rather than a DOM attribute, when the
	// same host also supplies dangerouslySetInnerHTML.
	it('rejects a direct children prop together with dangerouslySetInnerHTML', () => {
		const source = `export function C() @{ <div children="" dangerouslySetInnerHTML={{__html: ''}} /> }`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, 'direct-children-danger.tsrx', { mode })).toThrow(CONFLICT);
		}
	});

	// React accepts null/undefined children because the conflict check is nullish,
	// not based on whether a value would produce visible DOM.
	// Per ReactDOMComponent-test.js:2068 — the conflict check treats only a
	// non-nullish children prop as present.
	it('accepts dynamic null/undefined children in client, server, stream, and hydration', async () => {
		for (const child of [null, undefined]) {
			const props = { danger: { __html: '<b>raw</b>' }, child };
			expect(clientHtml(client.DirectDangerChild, props)).toContain('<b>raw</b>');
			expect(ServerRuntime.renderToString(server.DirectDangerChild, props).html).toContain(
				'<b>raw</b>',
			);
			const streamed = await collectPipeableStream(server.DirectDangerChild, props);
			expect(streamed.errors).toEqual([]);
			expect(streamed.html).toContain('<b>raw</b>');

			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(server.DirectDangerChild, props).html;
			const root = hydrateRoot(container, client.DirectDangerChild, props);
			expect(container.querySelector('#direct-danger')?.innerHTML).toBe('<b>raw</b>');
			root.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:2068 (stable) / :2103 (canary), adapted to
	// JSX prop merging. A spread-held `children` value participates in the same
	// nullish conflict check, and only the final direct/spread writer is active.
	it('resolves spread and direct children props before validating raw HTML on the server', async () => {
		const danger = { __html: '<b>raw</b>' };
		for (const child of [0, false, '']) {
			const props = { first: { children: child }, second: {}, danger };
			expect(() => ServerRuntime.renderToString(server.SpreadChildrenDanger, props)).toThrow(
				CONFLICT,
			);
			await expectStreamThrow('SpreadChildrenDanger', props, CONFLICT);
		}

		for (const child of [null, undefined]) {
			const props = {
				first: { children: 'overwritten' },
				second: { children: child },
				danger,
			};
			expect(ServerRuntime.renderToString(server.SpreadChildrenDanger, props).html).toContain(
				'<b>raw</b>',
			);
		}

		const directNull = {
			spread: { children: 'overwritten' },
			child: null,
			danger,
		};
		expect(
			ServerRuntime.renderToString(server.SpreadThenDirectChildrenDanger, directNull).html,
		).toContain('<b>raw</b>');
		expect(() =>
			ServerRuntime.renderToString(server.SpreadThenDirectChildrenDanger, {
				...directNull,
				child: '',
			}),
		).toThrow(CONFLICT);
	});

	// Per ReactDOMComponent-test.js:1794/:1807 (stable) and :1829/:1842
	// (canary). Content supplied through a spread is still invalid on a void
	// element; nullish final writers remain inactive.
	it('rejects spread-held raw HTML and children on compiled void hosts', async () => {
		const invalidSpreads = [
			{ dangerouslySetInnerHTML: { __html: 'raw' } },
			{ children: '' },
			{ children: 0 },
			{ children: false },
		];
		for (const spread of invalidSpreads) {
			const props = { spread };
			expect(() => ServerRuntime.renderToString(server.VoidSpreadContent, props)).toThrow(
				/void element/,
			);
			await expectStreamThrow('VoidSpreadContent', props, /void element/);
			expect(() => mount(client.VoidSpreadContent, props)).toThrow(/void element/);
		}

		for (const spread of [
			{ dangerouslySetInnerHTML: null, children: null },
			{ dangerouslySetInnerHTML: undefined, children: undefined },
		]) {
			expect(clientHtml(client.VoidSpreadContent, { spread })).toContain(
				'id="void-spread-content"',
			);
			expect(ServerRuntime.renderToString(server.VoidSpreadContent, { spread }).html).toContain(
				'id="void-spread-content"',
			);
		}

		const directProps = { spread: { children: 'overwritten' }, child: null };
		expect(
			ServerRuntime.renderToString(server.VoidSpreadThenDirectChildren, directProps).html,
		).toContain('id="void-spread-direct-children"');
		expect(() =>
			ServerRuntime.renderToString(server.VoidSpreadThenDirectChildren, {
				...directProps,
				child: '',
			}),
		).toThrow(/void element/);
	});

	// Per ReactDOMComponent-test.js:1852 and :1897 — a nullish raw-HTML writer is
	// absent, while `{__html: null}` is a valid active writer with empty content.
	it('treats a dynamic null/undefined raw-HTML value as absent', () => {
		for (const danger of [null, undefined]) {
			const props = { danger, child: 0 };
			expect(clientHtml(client.DirectDangerChild, props)).toContain('>0</div>');
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(server.DirectDangerChild, props).html;
			expect(container.querySelector('#direct-danger')?.textContent).toBe('0');
		}
	});

	// Per ReactDOMComponent-test.js:2068 — update-time validation follows the
	// effective props for that render, allowing the inactive side to be nullish.
	it('switches between ordinary dynamic children and raw HTML when the other side is nullish', () => {
		const result = mount(client.DirectDangerChild, { danger: null, child: 'ordinary' });
		try {
			expect(result.container.textContent).toBe('ordinary');
			result.update(client.DirectDangerChild, {
				danger: { __html: '<b>raw</b>' },
				child: null,
			});
			expect(result.container.querySelector('#direct-danger')?.innerHTML).toBe('<b>raw</b>');
			result.update(client.DirectDangerChild, { danger: null, child: 'again' });
			expect(result.container.textContent).toBe('again');
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:2068.
	it('rejects a conflicting dynamic child introduced on update', () => {
		const result = mount(client.DirectDangerChild, { danger: null, child: 'ordinary' });
		try {
			expect(() =>
				result.update(client.DirectDangerChild, {
					danger: { __html: 'raw' },
					child: 0,
				}),
			).toThrow(CONFLICT);
		} finally {
			result.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1852 and :2068 — presence is nullish-based,
	// not based on whether the child would create visible DOM.
	it('rejects dynamic 0, false, empty string, and elements for direct and spread writers', async () => {
		const invalidChildren = [0, false, '', createElement('span')];
		for (const [component, propsFor] of [
			['DirectDangerChild', (child: any) => ({ danger: { __html: 'raw' }, child })],
			[
				'SpreadDangerChild',
				(child: any) => ({
					spread: { dangerouslySetInnerHTML: { __html: 'raw' } },
					child,
				}),
			],
		] as const) {
			for (const child of invalidChildren) {
				const props = propsFor(child);
				expect(() => mount(client[component], props)).toThrow(CONFLICT);
				expect(() => ServerRuntime.renderToString(server[component], props)).toThrow(CONFLICT);
				await expectStreamThrow(component, props, CONFLICT);
				const safeProps =
					component === 'DirectDangerChild'
						? { danger: null, child: null }
						: { spread: { dangerouslySetInnerHTML: null }, child: null };
				expectHydrationThrow(component, safeProps, props, CONFLICT);
			}
		}
	});

	// Per ReactDOMComponent-test.js:2068, adapted to JSX spread ordering: the
	// effective last writer determines whether raw HTML is active.
	it('preserves last-writer precedence across direct and spread raw-HTML props', () => {
		const html = { __html: '<b>raw</b>' };
		const cases = [
			[
				'DirectThenSpreadDangerChild',
				{ direct: html, spread: { dangerouslySetInnerHTML: undefined }, child: 'ordinary' },
			],
			[
				'SpreadThenDirectDangerChild',
				{ spread: { dangerouslySetInnerHTML: html }, direct: undefined, child: 'ordinary' },
			],
		] as const;
		for (const [component, props] of cases) {
			expect(clientHtml(client[component], props)).toContain('ordinary');
			expect(ServerRuntime.renderToString(server[component], props).html).toContain('ordinary');
		}

		const directThenSpread = mount(client.DirectThenSpreadDangerChild, {
			direct: { __html: '<i>direct</i>' },
			spread: { dangerouslySetInnerHTML: { __html: '<b>spread</b>' } },
			child: null,
		});
		try {
			expect(directThenSpread.container.innerHTML).toContain('<b>spread</b>');
			directThenSpread.update(client.DirectThenSpreadDangerChild, {
				direct: { __html: '<i>direct</i>' },
				spread: {},
				child: null,
			});
			expect(directThenSpread.container.innerHTML).toContain('<i>direct</i>');
			directThenSpread.update(client.DirectThenSpreadDangerChild, {
				direct: { __html: '<i>direct</i>' },
				spread: { dangerouslySetInnerHTML: undefined },
				child: 'ordinary',
			});
			expect(directThenSpread.container.textContent).toBe('ordinary');
		} finally {
			directThenSpread.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1852, :1879, and :1888, adapted to
	// source-ordered JSX spreads: only the effective final writer is validated.
	it('does not validate malformed raw-HTML writers that a later writer replaces', () => {
		for (const [component, props, expected] of [
			[
				'DirectThenSpreadDangerChild',
				{
					direct: 'malformed',
					spread: { dangerouslySetInnerHTML: { __html: '<b>spread</b>' } },
					child: null,
				},
				'<b>spread</b>',
			],
			[
				'SpreadThenDirectDangerChild',
				{
					spread: { dangerouslySetInnerHTML: 'malformed' },
					direct: { __html: '<i>direct</i>' },
					child: null,
				},
				'<i>direct</i>',
			],
		] as const) {
			expect(clientHtml(client[component], props)).toContain(expected);
			expect(ServerRuntime.renderToString(server[component], props).html).toContain(expected);
		}
	});

	// Per ReactDOMComponent-test.js:1852 and :2068, adapted to JSX expression
	// sequencing: resolving the final writer must not reorder or duplicate getters.
	it('preserves raw-HTML writer evaluation order around intervening props and spreads', () => {
		function scenario() {
			const log: string[] = [];
			const spread = {};
			Object.defineProperty(spread, 'dangerouslySetInnerHTML', {
				enumerable: true,
				get() {
					log.push('spread:danger');
					return null;
				},
			});
			return {
				log,
				props: {
					read(name: string) {
						log.push(name);
						return name === 'direct' ? 'malformed' : name;
					},
					getSpread() {
						log.push('spread:expression');
						return spread;
					},
				},
			};
		}

		const clientScenario = scenario();
		const result = mount(client.DangerEvaluationOrder, clientScenario.props);
		expect(clientScenario.log).toEqual([
			'direct',
			'middle',
			'spread:expression',
			'spread:danger',
			'after',
		]);
		result.unmount();

		const serverScenario = scenario();
		ServerRuntime.renderToString(server.DangerEvaluationOrder, serverScenario.props);
		expect(serverScenario.log).toEqual([
			'direct',
			'middle',
			'spread:expression',
			'spread:danger',
			'after',
		]);
	});

	// Per ReactDOMComponent-test.js:2068, using JSX's own-enumerable spread
	// semantics. Non-enumerable and inherited keys are not prop writers.
	it('ignores non-enumerable and inherited raw-HTML spread keys', () => {
		const inherited = Object.create({ dangerouslySetInnerHTML: { __html: 'inherited' } });
		const nonEnumerable = {};
		Object.defineProperty(nonEnumerable, 'dangerouslySetInnerHTML', {
			value: { __html: 'hidden' },
		});
		for (const spread of [inherited, nonEnumerable]) {
			const props = { spread, child: 'ordinary' };
			expect(clientHtml(client.SpreadDangerChild, props)).toContain('ordinary');
			expect(ServerRuntime.renderToString(server.SpreadDangerChild, props).html).toContain(
				'ordinary',
			);
		}
	});

	// Per ReactDOMComponent-test.js:1852 and :2068, adapted to compiled template
	// control flow: a directive is an authored child even when its branch is empty.
	it('rejects raw HTML on a host that also owns dynamic control-flow children', () => {
		for (const show of [false, true]) {
			const props = {
				spread: { dangerouslySetInnerHTML: { __html: 'raw' } },
				show,
			};
			expect(() => mount(client.SpreadDangerIf, props)).toThrow(CONFLICT);
			expect(() => ServerRuntime.renderToString(server.SpreadDangerIf, props)).toThrow(CONFLICT);
		}
	});

	// Per ReactDOMComponent-test.js:2068. A `void` child is nullish, but its
	// operand still evaluates whether or not a spread supplies raw HTML.
	it('preserves side effects in a nullish void child beside a potential raw-HTML spread', () => {
		for (const spread of [{}, { dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }]) {
			let clientRuns = 0;
			const result = mount(client.VoidSideEffectChild, {
				spread,
				onRun: () => clientRuns++,
			});
			expect(clientRuns).toBe(1);
			result.unmount();

			let serverRuns = 0;
			ServerRuntime.renderToString(server.VoidSideEffectChild, {
				spread,
				onRun: () => serverRuns++,
			});
			expect(serverRuns).toBe(1);
		}
	});

	// Per ReactDOMComponent-test.js:1852 and :2068.
	it('rejects definitely-present static children when a dynamic direct/spread writer activates', async () => {
		for (const [component, props, safeProps] of [
			['DirectDangerStaticChild', { danger: { __html: 'raw' } }, { danger: null }],
			[
				'SpreadDangerStaticChild',
				{ spread: { dangerouslySetInnerHTML: { __html: 'raw' } } },
				{ spread: { dangerouslySetInnerHTML: null } },
			],
		] as const) {
			expect(() => mount(client[component], props)).toThrow(CONFLICT);
			expect(() => ServerRuntime.renderToString(server[component], props)).toThrow(CONFLICT);
			await expectStreamThrow(component, props, CONFLICT);
			expectHydrationThrow(component, safeProps, props, CONFLICT);
		}
	});

	// Per ReactDOMComponent-test.js:1852, :1879, and :1888.
	it('rejects malformed values in direct and spread client/server paths', async () => {
		for (const malformed of ['raw', { nope: true }]) {
			for (const [component, props, safeProps] of [
				['DirectDangerChild', { danger: malformed, child: null }, { danger: null, child: null }],
				[
					'SpreadDangerChild',
					{ spread: { dangerouslySetInnerHTML: malformed }, child: null },
					{ spread: { dangerouslySetInnerHTML: null }, child: null },
				],
			] as const) {
				expect(() => mount(client[component], props)).toThrow(MALFORMED);
				expect(() => ServerRuntime.renderToString(server[component], props)).toThrow(MALFORMED);
				await expectStreamThrow(component, props, MALFORMED);
				expectHydrationThrow(component, safeProps, props, MALFORMED);
			}
		}
	});
});

describe('null-prototype invalid object diagnostics', () => {
	function invalidObject() {
		return Object.assign(Object.create(null), { alpha: 1, beta: 2 });
	}

	// Per ReactChildren-test.js:1109 and ReactDOMServerIntegrationElements-test.js:949.
	it('reports intended keys through Children APIs and client/server child rendering', () => {
		for (const run of [
			() => Children.toArray(invalidObject()),
			() => Children.map(invalidObject(), (child) => child),
			() => mount(client.InvalidObjectChild, { child: invalidObject() }),
			() => ServerRuntime.renderToString(server.InvalidObjectChild, { child: invalidObject() }),
			() => mount(client.NestedInvalidObjectChild, { child: invalidObject() }),
			() =>
				ServerRuntime.renderToString(server.NestedInvalidObjectChild, {
					child: invalidObject(),
				}),
		]) {
			expect(run).toThrow(/object with keys \{alpha, beta\}/);
		}
	});

	// Per ReactDOMServerIntegrationElements-test.js:1000, with a null-prototype
	// object exercising the same public invalid-element-type diagnostic.
	it('reports a null-prototype component type without an incidental coercion error', () => {
		const props = { type: invalidObject() };
		expect(() => mount(client.InvalidElementType, props)).toThrow(
			/Element type is invalid:.*object with keys \{alpha, beta\}/,
		);
	});
});
