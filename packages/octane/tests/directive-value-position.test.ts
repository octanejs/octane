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
});
