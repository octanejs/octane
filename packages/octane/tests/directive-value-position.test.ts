import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import { mount } from './_helpers.js';
import {
	BareDirectiveValue,
	DirectiveAttributeValue,
	ElementAttributeValue,
	ElementContainerChild,
	DirectiveContainerChild,
} from './_fixtures/directive-value-position.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/directive-value-position.tsrx';
const server = loadServerFixture(FIXTURE);

const rows = [
	{ id: 'a', label: 'alpha' },
	{ id: 'b', label: 'beta' },
];
const props = { visible: true, rows, mode: 'primary' };

// A directive is compiler-owned template syntax. Value positions — an attribute
// value, an expression container, a setup initializer — lower through the
// descriptor path rather than the template walk, and that path used to drop the
// directive silently, emit a bare `{expr}` block that could not parse, or hand
// the raw TSRX node to the printer. Every case below is one of those positions.
describe('directives at value position', () => {
	describe('client', () => {
		it('renders a directive used as the whole initializer', () => {
			const result = mount(BareDirectiveValue as any, props);
			expect(result.find('#bare-if').textContent).toBe('shown');
			expect(result.findAll('.bare-row').map((row) => row.textContent)).toEqual(['alpha', 'beta']);

			result.update(BareDirectiveValue as any, { ...props, visible: false, rows: [] });
			expect(result.find('#bare-if').textContent).toBe('hidden');
			expect(result.findAll('.bare-row')).toHaveLength(0);
			expect(result.find('#bare-empty').textContent).toBe('none');
			result.unmount();
		});

		it('renders a directive standing directly at an attribute value', () => {
			const result = mount(DirectiveAttributeValue as any, props);
			expect(result.find('.panel #attr-mode').textContent).toBe('Primary');

			result.update(DirectiveAttributeValue as any, { ...props, mode: 'other' });
			expect(result.find('.panel #attr-mode').textContent).toBe('Secondary');
			result.unmount();
		});

		it('renders an element attribute value whose children hold a directive', () => {
			const result = mount(ElementAttributeValue as any, props);
			const heading = result.find('.panel .attr-heading');
			expect(heading.querySelector('#attr-el-if')!.textContent).toBe('yes');
			// The directive sits between two authored text runs; both survive.
			expect(heading.textContent).toContain('before');
			expect(heading.textContent).toContain('after');

			result.update(ElementAttributeValue as any, { ...props, visible: false });
			expect(result.find('.panel #attr-el-if').textContent).toBe('no');
			result.unmount();
		});

		it('renders an element in a child expression container whose children hold a directive', () => {
			const result = mount(ElementContainerChild as any, props);
			const heading = result.find('.container-heading');
			expect(heading.querySelector('#container-el-if')!.textContent).toBe('yes');
			// The static sibling and the directive's output are both children of the
			// value element, in source order.
			expect(Array.from(heading.children).map((child) => child.id)).toEqual([
				'container-sibling',
				'container-el-if',
			]);

			result.update(ElementContainerChild as any, { ...props, visible: false });
			expect(result.find('#container-el-if').textContent).toBe('no');
			result.unmount();
		});

		it('renders a directive directly inside a child expression container', () => {
			const result = mount(DirectiveContainerChild as any, props);
			expect(result.find('.container-row').textContent).toBe('alpha');

			// The @catch arm is reachable, so the boundary really was compiled.
			const failing = mount(DirectiveContainerChild as any, {
				...props,
				read: () => {
					throw new Error('offline');
				},
			});
			expect(failing.find('#container-error').textContent).toBe('failed: offline');
			failing.unmount();
			result.unmount();
		});
	});

	describe('server', () => {
		const cases: [string, string, Record<string, unknown>, string[]][] = [
			['BareDirectiveValue', 'BareDirectiveValue', props, ['shown', 'alpha', 'beta']],
			['DirectiveAttributeValue', 'DirectiveAttributeValue', props, ['Primary']],
			['ElementAttributeValue', 'ElementAttributeValue', props, ['before', 'yes', 'after']],
			['ElementContainerChild', 'ElementContainerChild', props, ['yes']],
			['DirectiveContainerChild', 'DirectiveContainerChild', props, ['alpha']],
		];

		for (const [label, exportName, componentProps, expected] of cases) {
			it(`emits the directive's content for ${label}`, () => {
				const { html } = ServerRuntime.renderToString(server[exportName], componentProps);
				for (const fragment of expected) expect(html).toContain(fragment);
			});
		}

		it('renders the alternate arms too', () => {
			const { html } = ServerRuntime.renderToString(server.BareDirectiveValue, {
				...props,
				visible: false,
				rows: [],
			});
			expect(html).toContain('hidden');
			expect(html).toContain('none');
		});
	});

	describe('hydration', () => {
		const cases: [string, any, any][] = [
			['BareDirectiveValue', BareDirectiveValue, server.BareDirectiveValue],
			['DirectiveAttributeValue', DirectiveAttributeValue, server.DirectiveAttributeValue],
			['ElementAttributeValue', ElementAttributeValue, server.ElementAttributeValue],
			['ElementContainerChild', ElementContainerChild, server.ElementContainerChild],
			['DirectiveContainerChild', DirectiveContainerChild, server.DirectiveContainerChild],
		];

		for (const [label, clientComponent, serverComponent] of cases) {
			it(`adopts the server markup for ${label} without re-creating it`, () => {
				const { html } = ServerRuntime.renderToString(serverComponent, props);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const before = container.querySelector('section');
				const root = hydrateRoot(container, clientComponent, props);
				flushSync(() => {});
				// Hydration adopts, it does not replace: the server's own element
				// survives, which is the proof the client's block layout matched.
				expect(container.querySelector('section')).toBe(before);
				root.unmount();
				container.remove();
			});
		}
	});

	describe('type-only output', () => {
		// The `to_ts` path feeds the TypeScript plugin and Volar. A dropped
		// directive there is a silent loss of type checking over the arms.
		const source = `export function App(props: { ok: boolean; rows: { id: string }[] }) @{
	const branch = @if (props.ok) { <tsif /> } @else { <tselse /> };
	<div>
		<Panel slot={<h1>@for (const row of props.rows; key row.id) { <tsrow /> }</h1>} />
		{branch}
	</div>
}
`;

		it('keeps every arm in the emitted TypeScript', () => {
			const { code } = compileToVolarMappings(source, 'App.tsrx') as { code: string };
			for (const arm of ['tsif', 'tselse', 'tsrow']) expect(code).toContain(arm);
		});
	});

	describe('emitted module', () => {
		// The bare-initializer case used to emit `const v = {createElement(...)}` —
		// an object literal containing a call expression, which is a syntax error.
		// Nothing downstream reported it because no test executed that output.
		const source = `export function App(props: { ok: boolean }) @{
	const branch = @if (props.ok) { <b /> } @else { <i /> };
	<div>{branch}</div>
}
`;

		for (const mode of ['client', 'server'] as const) {
			it(`is parseable JavaScript in ${mode} mode`, () => {
				const { code } = compile(source, 'App.tsrx', { mode });
				const evaluable = code
					.replace(/^import[\s\S]*?from '[^']+';$/m, '')
					.replace(/^export /gm, '');
				expect(() => new Function(evaluable)).not.toThrow();
			});
		}
	});

	describe('return-JSX bodies', () => {
		// `function C() { return <jsx> }` owns its returned JSX exactly as a `@{}`
		// body owns its render output, so a directive in one of its attribute values
		// or expression containers belongs to it. The client and server reach that
		// JSX through different emitters, and they have to agree.
		const cases: [string, string][] = [
			[
				'attribute value',
				`export function App(props: { ok: boolean }) {
	return <Child prop={<h1>@if (props.ok) { <armA /> } @else { <armB /> }</h1>} />;
}
`,
			],
			[
				'expression-container child',
				`export function App(props: { ok: boolean }) {
	return <div>{<h1>@if (props.ok) { <armA /> } @else { <armB /> }</h1>}</div>;
}
`,
			],
			[
				'bare directive at an attribute value',
				`export function App(props: { ok: boolean }) {
	return <Child prop={@if (props.ok) { <armA /> } @else { <armB /> }} />;
}
`,
			],
		];

		for (const [label, source] of cases) {
			it(`compiles a directive at a ${label} in both modes`, () => {
				for (const mode of ['client', 'server'] as const) {
					const { code } = compile(source, 'App.tsrx', { mode });
					// Both arms survive, so the directive was folded rather than dropped.
					expect(code, mode).toContain('armA');
					expect(code, mode).toContain('armB');
				}
			});
		}
	});

	describe('ownership across a callback boundary', () => {
		// A directive's arms are hoisted into the body that owns them, and the values
		// they read are threaded in from that body. A callback is a separate lexical
		// owner, so folding one of its directives into the enclosing component would
		// hoist arms that read the callback's params into a scope without them —
		// producing a module-scope helper referencing a free variable.
		const inCallback = `export function App(props: { rows: { ok: boolean; label: string }[] }) @{
	const render = (row: { ok: boolean; label: string }) =>
		<Cell slot={<h1>@if (row.ok) { <b>{row.label}</b> } @else { <i>none</i> }</h1>} />;
	<div>{props.rows.map(render)}</div>
}
`;

		for (const mode of ['client', 'server'] as const) {
			it(`rejects a value-position directive owned by a callback in ${mode} mode`, () => {
				expect(() => compile(inCallback, 'App.tsrx', { mode })).toThrow(
					/owning component to hoist into/,
				);
			});
		}

		it('never emits a hoisted arm that reads a callback param as a free variable', () => {
			// The failure this guards is silent: the module still parses, and only
			// blows up as a ReferenceError once the arm renders.
			for (const mode of ['client', 'server'] as const) {
				let code: string;
				try {
					code = compile(inCallback, 'App.tsrx', { mode }).code;
				} catch {
					continue; // Rejected outright, which is the stronger outcome.
				}
				const hoisted = code.match(/^function (?:__then|__else|__sif|__scase)[\s\S]*?^}/gm) ?? [];
				for (const arm of hoisted) expect(arm).not.toMatch(/\brow\./);
			}
		});

		it('still lowers ordinary JSX values inside a callback', () => {
			// The boundary must switch off the directive fold only — a callback that
			// returns plain JSX still lowers to a descriptor.
			const source = `export function App(props: { rows: { label: string }[] }) @{
	const render = (row: { label: string }) => <Cell slot={<h1>{row.label}</h1>} />;
	<div>{props.rows.map(render)}</div>
}
`;
			for (const mode of ['client', 'server'] as const) {
				const { code } = compile(source, 'App.tsrx', { mode });
				expect(code).toContain('createElement');
				expect(code).toContain('row.label');
			}
		});
	});

	describe('diagnostic for an unowned directive', () => {
		// Every value position an unowned directive can occupy has to report the
		// authored keyword. Reaching the printer instead yields
		// `Not implemented: JSXIfExpression`, which names an internal node type and
		// tells the author nothing about their source.
		const unowned: [string, string][] = [
			[
				'bare directive at an attribute value inside a callback',
				`export function App(props: { rows: any[] }) @{
	const render = (row: any) => <Cell slot={@if (row.ok) { <a /> } @else { <b /> }} />;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'bare directive in a container child inside a callback',
				`export function App(props: { rows: any[] }) @{
	const render = (row: any) => <div>{@for (const x of row.xs; key x) { <a /> }}</div>;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'element-wrapped directive inside a callback',
				`export function App(props: { rows: any[] }) @{
	const render = (row: any) => <Cell slot={<h1>@switch (row.k) { @case 1: { <a /> } }</h1>} />;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'module-level initializer with no owning body',
				`const v = @try { <a /> } @catch (e) { <b /> };
export function App() @{
	<div>{v}</div>
}
`,
			],
		];

		for (const [label, source] of unowned) {
			for (const mode of ['client', 'server'] as const) {
				it(`names the authored keyword for a ${label} (${mode})`, () => {
					let message = '';
					try {
						compile(source, 'App.tsrx', { mode });
					} catch (error) {
						message = String((error as Error).message);
					}
					expect(message).toMatch(/is not supported at this value position/);
					// The authored spelling, not the parser's node type.
					expect(message).toMatch(/`@(if|for|switch|try)`/);
					expect(message).not.toMatch(/Not implemented/);
				});
			}
		}

		it('leaves an `@{ … }` sub-template to its own handling', () => {
			// `() => @{ … }` is a supported sub-template owned by rewriteTsrxBlocks,
			// not a set of directive arms, so the unowned-directive advice must not
			// claim it.
			const source = `export function App(props: { label: string; target: any }) @{
	const slot = () => @{
		<div class="from-tsrx">{props.label}</div>
	};
	<div class="host">{createPortal(slot, props.target)}</div>
}
`;
			const { code } = compile(source, 'App.tsrx', { mode: 'client' });
			expect(code).toContain('from-tsrx');
		});
	});
});
