import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { mount } from './_helpers.js';
import {
	BareDirectiveValue,
	DirectiveAttributeValue,
	ElementAttributeValue,
	ElementContainerChild,
	DirectiveContainerChild,
	ModuleDirectiveValue,
	CallbackDirective,
	CallbackTryDirective,
	NestedCallbackDirective,
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
	// Every control-flow directive, spelled against a `row` binding so each can be
	// dropped into a callback, and against `g` so each can be dropped at module
	// scope. `@try` has no control expression, which is why it has no frozen value.
	const DIRECTIVES: {
		name: string;
		inCallback: string;
		atModule: string;
		control: string | null;
	}[] = [
		{
			name: '@if',
			inCallback: '@if (row.ok) { <b>{row.label}</b> } @else { <i>none</i> }',
			atModule: '@if (g.on) { <armA /> } @else { <armB /> }',
			control: 'g.on',
		},
		{
			name: '@for',
			inCallback: '@for (const x of row.xs; key x) { <b>{row.label}</b> } @empty { <i>none</i> }',
			atModule: '@for (const x of g.xs; key x) { <armA /> } @empty { <armB /> }',
			control: 'g.xs',
		},
		{
			name: '@switch',
			inCallback: '@switch (row.k) { @case 1: { <b>{row.label}</b> } @default: { <i>none</i> } }',
			atModule: '@switch (g.k) { @case 1: { <armA /> } @default: { <armB /> } }',
			control: 'g.k',
		},
		{
			name: '@try',
			inCallback: '@try { <b>{row.label}</b> } @pending { <i>p</i> } @catch (e) { <i>none</i> }',
			atModule: '@try { <armA /> } @pending { <armP /> } @catch (e) { <armB /> }',
			control: null,
		},
	];

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

		const positions: [string, string][] = [
			[
				'a callback',
				`export function App(props: { rows: any[] }) @{
	const render = (row: any) => <Cell slot={<h1>@if (row.ok) { <tsA /> } @else { <tsB /> }</h1>} />;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'a module-level value',
				`const flag = { on: true };
const branch = @if (flag.on) { <tsA /> } @else { <tsB /> };
export function App() @{
	<div>{branch}</div>
}
`,
			],
			[
				'a module-level callback',
				`const render = (row: any) => <Cell slot={@if (row.ok) { <tsA /> } @else { <tsB /> }} />;
export function App(props: { rows: any[] }) @{
	<div>{props.rows.map(render)}</div>
}
`,
			],
		];

		for (const directive of DIRECTIVES) {
			it(`keeps ${directive.name} arms in the type view from a callback`, () => {
				const source = `export function App(props: { rows: any[] }) @{
	const render = (row: any) => <Cell slot={${directive.inCallback}} />;
	<div>{props.rows.map(render)}</div>
}
`;
				const { code } = compileToVolarMappings(source, 'App.tsrx') as { code: string };
				// Both arms have to survive for the type checker to see them.
				expect(code).toContain('row.label');
				expect(code).toContain('none');
			});

			it(`keeps ${directive.name} arms in the type view at module scope`, () => {
				const source = `export const g = { on: true, xs: [1], k: 1 };

const v = ${directive.atModule};

export function App() @{
	<div>{v}</div>
}
`;
				const { code } = compileToVolarMappings(source, 'App.tsrx') as { code: string };
				expect(code).toContain('armA');
				expect(code).toContain('armB');
			});
		}

		for (const [label, typeSource] of positions) {
			it(`keeps both arms for a directive in ${label}`, () => {
				// The type view carries the arms regardless of whether the emitters can
				// fold them — a module-level callback is rejected for output, but its
				// arms still have to type-check.
				const { code } = compileToVolarMappings(typeSource, 'App.tsrx') as { code: string };
				expect(code).toContain('tsA');
				expect(code).toContain('tsB');
			});
		}
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

	describe('captures across a callback boundary', () => {
		// A directive's arms are hoisted, so they cannot reach a callback's params
		// lexically. They do not need to: captured values arrive through the
		// construct's `__extra` env tuple, and that tuple is built at the
		// `createElement(_frag$N, …)` call site — which sits inside the callback. The
		// failure this guards is silent, since the module still parses and only blows
		// up as a ReferenceError once the arm renders.
		const sources: [string, string][] = [
			[
				'attribute value',
				`export function App(props: { rows: { ok: boolean; label: string }[] }) @{
	const render = (row: { ok: boolean; label: string }) =>
		<Cell slot={<h1>@if (row.ok) { <b>{row.label}</b> } @else { <i>none</i> }</h1>} />;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'child position',
				`export function App(props: { rows: { ok: boolean; label: string }[] }) @{
	const render = (row: { ok: boolean; label: string }) =>
		<div>@if (row.ok) { <b>{row.label}</b> } @else { <i>none</i> }</div>;
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'nested callbacks',
				`export function App(props: { rows: { ok: boolean; label: string }[] }) @{
	const outer = (row: { ok: boolean; label: string }) => (suffix: string) =>
		<div>@if (row.ok) { <b>{row.label + suffix}</b> } @else { <i>none</i> }</div>;
	<div>{props.rows.map((row) => outer(row)('!'))}</div>
}
`,
			],
		];

		for (const [label, source] of sources) {
			for (const mode of ['client', 'server'] as const) {
				it(`threads a callback param into the hoisted arms at ${label} (${mode})`, () => {
					const { code } = compile(source, 'App.tsrx', { mode });
					// `row` has to arrive through the construct's env channel — `__extra` on
					// the client, the sub's env array on the server — because the helpers
					// that read it are declared outside the callback.
					const bound =
						mode === 'client'
							? /const \[[^\]]*\brow\b[^\]]*\] = __extra/
							: /const \[[^\]]*\brow\b[^\]]*\] = __props/;
					expect(code).toMatch(bound);
				});
			}
		}

		for (const directive of DIRECTIVES) {
			for (const mode of ['client', 'server'] as const) {
				it(`threads a callback param through ${directive.name} (${mode})`, () => {
					const source = `export function App(props: { rows: any[] }) @{
	const render = (row: any) => <Cell slot={${directive.inCallback}} />;
	<div>{props.rows.map(render)}</div>
}
`;
					const { code } = compile(source, 'App.tsrx', { mode });
					const bound =
						mode === 'client'
							? /const \[[^\]]*\brow\b[^\]]*\] = __extra/
							: /const \[[^\]]*\brow\b[^\]]*\] = __props/;
					expect(code).toMatch(bound);
				});
			}
		}

		it('still lowers ordinary JSX values inside a callback', () => {
			// Folding must not disturb the plain-value path a callback already had.
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

	describe('runtime behavior of callback and module-level folds', () => {
		// Compiling is not the contract — rendering is. These mount, server-render and
		// hydrate the real fixtures, so a captured value that never arrives shows up
		// as wrong output rather than passing a source-shape assertion.
		it('renders a callback-owned directive that reads the callback param', () => {
			const result = mount(CallbackDirective as any, props);
			// `alpha` is longer than 3, `beta` is not — the arm choice is driven by the
			// callback's own parameter.
			expect(result.findAll('.cb-row').map((row) => row.getAttribute('data-id'))).toEqual([
				'a',
				'b',
			]);
			expect(result.find('[data-id="a"] .cb-long').textContent).toBe('alpha');
			expect(result.find('[data-id="b"] .cb-long').textContent).toBe('beta');

			result.update(CallbackDirective as any, { ...props, rows: [{ id: 'c', label: 'xy' }] });
			expect(result.find('[data-id="c"] .cb-short').textContent).toBe('xy');
			expect(result.findAll('.cb-long')).toHaveLength(0);
			result.unmount();
		});

		it('renders a nested-callback directive reading both scopes', () => {
			const result = mount(NestedCallbackDirective as any, props);
			// The arm reads the OUTER callback's `row` and the inner callback's `suffix`.
			expect(result.findAll('.nested-on').map((el) => el.textContent)).toEqual(['alpha!', 'beta!']);

			result.update(NestedCallbackDirective as any, { ...props, visible: false });
			expect(result.findAll('.nested-off').map((el) => el.textContent)).toEqual(['a!', 'b!']);
			result.unmount();
		});

		it('renders a callback-owned @try, including its @catch arm', () => {
			const ok = mount(CallbackTryDirective as any, props);
			expect(ok.findAll('.try-ok').map((el) => el.textContent)).toEqual(['alpha', 'beta']);
			ok.unmount();

			// The @catch arm reads the callback's `row` too, so a throwing read proves
			// the capture reaches every arm rather than just the happy one.
			const failing = mount(CallbackTryDirective as any, {
				...props,
				read: (row: { id: string }) => {
					throw new Error('boom-' + row.id);
				},
			});
			expect(failing.findAll('.try-error').map((el) => el.textContent)).toEqual([
				'a:boom-a',
				'b:boom-b',
			]);
			failing.unmount();
		});

		it('renders a module-level directive value', () => {
			const result = mount(ModuleDirectiveValue as any, {});
			expect(result.find('#module-if').textContent).toBe('module-on');
			result.unmount();
		});

		const serverCases: [string, string, Record<string, unknown>, string[]][] = [
			['CallbackDirective', 'CallbackDirective', props, ['alpha', 'beta', 'cb-long']],
			['CallbackTryDirective', 'CallbackTryDirective', props, ['alpha', 'beta', 'try-ok']],
			['NestedCallbackDirective', 'NestedCallbackDirective', props, ['alpha!', 'beta!']],
			['ModuleDirectiveValue', 'ModuleDirectiveValue', {}, ['module-on']],
		];

		for (const [label, exportName, componentProps, expected] of serverCases) {
			it(`server-renders ${label}`, () => {
				const { html } = ServerRuntime.renderToString(server[exportName], componentProps);
				for (const fragment of expected) expect(html).toContain(fragment);
			});
		}

		const hydrationCases: [string, any, any, Record<string, unknown>][] = [
			['CallbackDirective', CallbackDirective, server.CallbackDirective, props],
			['NestedCallbackDirective', NestedCallbackDirective, server.NestedCallbackDirective, props],
			['ModuleDirectiveValue', ModuleDirectiveValue, server.ModuleDirectiveValue, {}],
		];

		for (const [label, clientComponent, serverComponent, componentProps] of hydrationCases) {
			it(`hydrates ${label} onto its server markup`, () => {
				const { html } = ServerRuntime.renderToString(serverComponent, componentProps);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const before = container.querySelector('section');
				const root = hydrateRoot(container, clientComponent, componentProps);
				flushSync(() => {});
				expect(container.querySelector('section')).toBe(before);
				root.unmount();
				container.remove();
			});
		}
	});

	describe('JSX-bearing values in an attribute container', () => {
		// Not a directive, but the same lowering path: an element in an attribute
		// container whose child is a ternary over JSX, with another attribute after
		// it. Both branches must survive as descriptors rather than being dropped by
		// the child lowering.
		const source = `export function App(props: { ok: boolean }) {
	return (
		<Host
			slot={
				<button>
					{props.ok ? <Yes /> : <No />}
				</button>
			}
			onChange={(d: any) => handle(d)}
		/>
	);
}
`;

		for (const mode of ['client', 'server'] as const) {
			it(`lowers both ternary branches in ${mode} mode`, () => {
				const { code } = compile(source, 'App.tsx', { mode });
				expect(code).toContain('Yes');
				expect(code).toContain('No');
				// The attribute that follows the container is still bound.
				expect(code).toContain('onChange');
				const evaluable = code
					.replace(/^import[\s\S]*?from '[^']+';$/m, '')
					.replace(/^export /gm, '');
				expect(() => new Function(evaluable)).not.toThrow();
			});
		}
	});

	describe('module-level directive values', () => {
		// A module-level directive has no component body to own it and needs none: it
		// can only close over module bindings, which every hoisted helper already
		// sees, so its arms hoist to module scope beside it.
		const source = `const flag = { on: true };

const branch = @if (flag.on) { <armA /> } @else { <armB /> };

export function App() @{
	<div>{branch}</div>
}
`;

		for (const mode of ['client', 'server'] as const) {
			it(`folds a module-level directive value in ${mode} mode`, () => {
				const { code } = compile(source, 'App.tsrx', { mode });
				expect(code).toContain('armA');
				expect(code).toContain('armB');
				const evaluable = code
					.replace(/^import[\s\S]*?from '[^']+';$/m, '')
					.replace(/^export /gm, '');
				expect(() => new Function(evaluable)).not.toThrow();
			});
		}

		it('computes once at the point of definition, like a plain ternary', () => {
			// `const v = @if (…) { … }` is a module-level const, so it is computed where
			// it is written — exactly like `const v = cond ? <A/> : <B/>`, and like a
			// React element created at module scope. The client gets this from its hole
			// lowering; the server compiles the directive into a sub it calls per
			// render, so the control expression has to be lifted to the definition site
			// or the two emitters answer differently from the same input.
			const directive = `export const flag = { on: true };

const branch = @if (flag.on) { <b id="x">ON</b> } @else { <i id="x">OFF</i> };

export function App() @{
	<div>{branch}</div>
}
`;
			const ternary = directive.replace(
				'@if (flag.on) { <b id="x">ON</b> } @else { <i id="x">OFF</i> }',
				'flag.on ? <b id="x">ON</b> : <i id="x">OFF</i>',
			);

			const render = (source: string, id: string) => {
				const serverModule = loadCompiledFixtureSource(source, { id, mode: 'server' });
				const clientModule = loadCompiledFixtureSource(source, { id, mode: 'client' });
				// Both modules have loaded; flipping the flag now must change nothing,
				// because the value was already computed.
				serverModule.flag.on = false;
				clientModule.flag.on = false;
				const { html } = ServerRuntime.renderToString(serverModule.App, {});
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const root = hydrateRoot(container, clientModule.App, {});
				flushSync(() => {});
				const client = container.innerHTML.replace(/<!--[^>]*-->/g, '');
				root.unmount();
				container.remove();
				return { server: html.replace(/<!--[^>]*-->/g, ''), client };
			};

			const fromDirective = render(directive, '/freeze-directive.tsrx');
			const fromTernary = render(ternary, '/freeze-ternary.tsrx');

			// Frozen at definition, so the pre-mutation arm is what renders.
			expect(fromDirective.server).toContain('ON');
			expect(fromDirective.client).toContain('ON');
			// Server and client agree, and the directive agrees with the ternary.
			expect(fromDirective.client).toBe(fromDirective.server);
			expect(fromDirective.server).toBe(fromTernary.server);
			expect(fromDirective.client).toBe(fromTernary.client);
		});

		for (const directive of DIRECTIVES) {
			for (const mode of ['client', 'server'] as const) {
				it(`folds ${directive.name} at module scope (${mode})`, () => {
					const source = `export const g = { on: true, xs: [1], k: 1 };

const v = ${directive.atModule};

export function App() @{
	<div>{v}</div>
}
`;
					const { code } = compile(source, 'App.tsrx', { mode });
					expect(code).toContain('armA');
					expect(code).toContain('armB');
					const evaluable = code
						.replace(/^import[\s\S]*?from '[^']+';$/m, '')
						.replace(/^export /gm, '');
					expect(() => new Function(evaluable)).not.toThrow();
				});
			}

			it(`${directive.control === null ? 'has no control expression to freeze for' : 'freezes the control expression of'} ${directive.name}`, () => {
				const source = `export const g = { on: true, xs: [1], k: 1 };

const v = ${directive.atModule};

export function App() @{
	<div>{v}</div>
}
`;
				const { code } = compile(source, 'App.tsrx', { mode: 'server' });
				const definition = code.split('\n').find((line) => line.includes('const v =')) ?? '';
				if (directive.control === null) {
					// Nothing to lift: `@try` selects its arm from what the body does at
					// render time, which both emitters already do per render.
					expect(definition).not.toContain('env:');
				} else {
					// Read where the value is WRITTEN, so the server matches the client.
					expect(definition).toContain(`env: [${directive.control}]`);
				}
			});
		}

		it('freezes a bare identifier control, not just a member expression', () => {
			// A module `let` can be reassigned between the definition and the first
			// render. The client snapshots the identifier into a hole at the definition
			// site no matter what it is, so leaving it inline on the server — as an
			// "identifiers read the same either way" shortcut would — reintroduces the
			// divergence this lift exists to prevent.
			const source = `export let flag = true;

const branch = @if (flag) { <b id="x">ON</b> } @else { <i id="x">OFF</i> };

flag = false;

export function App() @{
	<div>{branch}</div>
}
`;
			const serverModule = loadCompiledFixtureSource(source, {
				id: '/freeze-ident.tsrx',
				mode: 'server',
			});
			const clientModule = loadCompiledFixtureSource(source, {
				id: '/freeze-ident.tsrx',
				mode: 'client',
			});
			const { html } = ServerRuntime.renderToString(serverModule.App, {});
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const root = hydrateRoot(container, clientModule.App, {});
			flushSync(() => {});
			const client = container.innerHTML.replace(/<!--[^>]*-->/g, '');
			root.unmount();
			container.remove();

			// `flag` was true when the value was defined, so both sides render the
			// pre-reassignment arm and agree.
			expect(html).toContain('ON');
			expect(client).toContain('ON');
			expect(client).toBe(html.replace(/<!--[^>]*-->/g, ''));
		});

		it('emits each mode against its own runtime', () => {
			// The fold has a client shape and a server shape. Emitting the client's DOM
			// helpers into a server module would import them from `octane/server`, where
			// they do not belong.
			const server = compile(source, 'App.tsrx', { mode: 'server' }).code;
			expect(server).not.toMatch(/_\$(ifBlock|forBlock|componentSlot|clone)\b/);
		});
	});

	describe('diagnostic for an unowned directive', () => {
		// Every value position an unowned directive can occupy has to report the
		// authored keyword. Reaching the printer instead yields
		// `Not implemented: JSXIfExpression`, which names an internal node type and
		// tells the author nothing about their source.
		// What remains unowned is a directive inside a MODULE-level callback: there is
		// no component context to compute an env tuple against, so its params cannot
		// be threaded into the hoisted arms. Inside a component body the same shapes
		// fold (see the capture tests above).
		const unowned: [string, string][] = [
			[
				'bare directive at an attribute value in a module-level callback',
				`const render = (row: any) => <Cell slot={@if (row.ok) { <a /> } @else { <b /> }} />;
export function App(props: { rows: any[] }) @{
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'bare directive in a container child in a module-level callback',
				`const render = (row: any) => <div>{@for (const x of row.xs; key x) { <a /> }}</div>;
export function App(props: { rows: any[] }) @{
	<div>{props.rows.map(render)}</div>
}
`,
			],
			[
				'element-wrapped directive in a module-level callback',
				`const render = (row: any) => <Cell slot={<h1>@switch (row.k) { @case 1: { <a /> } }</h1>} />;
export function App(props: { rows: any[] }) @{
	<div>{props.rows.map(render)}</div>
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
					expect(message).toMatch(/is not supported inside a module-level callback/);
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
