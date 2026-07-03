import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// SSR Phase 1: server render of static markup + dynamic text + attributes +
// nested components. The compiler (mode: 'server') emits HTML-string-building
// bodies that import from 'octane/server'; we eval them with that same
// runtime module injected, then call render() and snapshot { head, body, css }.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	// Bind the server-runtime import to the live module, and capture exports.
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default (\w+);?/g, '__exports.default = $1;');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.tsrx`), 'utf8');

const basic = evalServer(fixture('basic'), 'basic.tsrx');
const ssr = evalServer(fixture('ssr'), 'ssr.tsrx');

describe('SSR Phase 1 — basic fixtures', () => {
	it('renders static markup, dynamic text, and attributes', async () => {
		expect(await RT.render(basic.Hello)).toMatchSnapshot('Hello');
		expect(await RT.render(basic.Counter, { n: 5 })).toMatchSnapshot('Counter');
		expect(await RT.render(basic.Greet, { name: 'Ada' })).toMatchSnapshot('Greet');
		expect(await RT.render(basic.Mixed)).toMatchSnapshot('Mixed');
	});

	it('renders SVG and MathML (static + dynamic attrs)', async () => {
		expect(await RT.render(basic.SvgStatic)).toMatchSnapshot('SvgStatic');
		expect(await RT.render(basic.SvgDynamic, { klass: 'c', w: 30, fill: 'blue' })).toMatchSnapshot(
			'SvgDynamic',
		);
		expect(
			await RT.render(basic.MathDynamic, { display: 'block', klass: 'm', value: 'x' }),
		).toMatchSnapshot('MathDynamic');
	});
});

describe('SSR Phase 1 — ssr fixture (style / spread / innerHTML / components / hooks / css)', () => {
	it('renders dynamic object style with camelCase keys', async () => {
		expect(await RT.render(ssr.Styled, { klass: 'a', color: 'red', label: 'hi' })).toMatchSnapshot(
			'Styled',
		);
	});

	it('renders boolean attributes, void elements, and dynamic attrs', async () => {
		expect(await RT.render(ssr.Field, { value: 'v', disabled: true })).toMatchSnapshot(
			'Field-disabled',
		);
		expect(await RT.render(ssr.Field, { value: 'v', disabled: false })).toMatchSnapshot(
			'Field-enabled',
		);
	});

	it('serializes spread attributes', async () => {
		expect(await RT.render(ssr.Spread, { attrs: { id: 'x', 'data-k': '1' } })).toMatchSnapshot(
			'Spread',
		);
	});

	it('emits innerHTML raw (unescaped)', async () => {
		expect(await RT.render(ssr.Raw, { html: '<b>bold</b>' })).toMatchSnapshot('Raw');
	});

	it('emits dangerouslySetInnerHTML raw when carried through a spread', async () => {
		const { body } = await RT.render(ssr.RawSpread, {
			attrs: { id: 'r', dangerouslySetInnerHTML: { __html: '<b>via spread</b>' } },
		});
		expect(body).toContain('id="r"'); // other spread attrs still serialized
		expect(body).toContain('class="base"');
		expect(body).toContain('<b>via spread</b>'); // raw HTML rendered as content
		expect(body).not.toContain('dangerouslysetinnerhtml'); // not a dead attribute
	});

	it('renders nested component composition', async () => {
		expect(await RT.render(ssr.Card, { title: 'T', tag: 'new' })).toMatchSnapshot('Card');
	});

	it('collects scoped CSS into the css field', async () => {
		const out = await RT.render(ssr.Scoped);
		expect(out).toMatchSnapshot('Scoped');
		expect(out.css).toContain('.box.tsrx-');
		expect(out.body).toContain('class="box tsrx-');
	});
});

describe('SSR Phase 1 — semantics', () => {
	it('escapes dynamic text and attribute values', async () => {
		const out = await RT.render(basic.Greet, { name: '<script>"x"' });
		expect(out.body).toContain('&lt;script&gt;');
		expect(out.body).not.toContain('<script>');
	});

	it('hooks render their initial value; effects do NOT run on the server', async () => {
		const onEffect = vi.fn();
		const out = await RT.render(ssr.HookView, { start: 7, onEffect });
		expect(out.body).toContain('<span class="n">7</span>');
		expect(out.body).toContain('<span class="d">14</span>'); // useMemo ran once
		expect(out.body).toMatch(/id=":in-[0-9a-z]+:"/); // deterministic useId
		expect(onEffect).not.toHaveBeenCalled(); // useEffect is a no-op on the server
	});

	it('returns the { head, body, css } shape', async () => {
		const out = await RT.render(basic.Hello);
		expect(Object.keys(out).sort()).toEqual(['body', 'css', 'head']);
		expect(out.head).toBe('');
	});

	it('still rejects truly-unsupported server constructs (e.g. <Activity>)', () => {
		// Control flow is supported as of Phase 3; Activity is not.
		expect(() =>
			compile(
				`export function C(p) @{ <Activity mode="hidden"><span>{'a'}</span></Activity> }`,
				'c.tsrx',
				{
					mode: 'server',
				},
			),
		).toThrow(/does not support `<Activity>`/);
	});
});

describe('SSR — ssrSpread attribute-name validation', () => {
	it('skips injection-unsafe attr names but keeps valid ones', () => {
		const out = RT.ssrSpread({
			'data-x': '1',
			'aria-label': 'ok',
			'xlink:href': '#a',
			'bad name': '2',
			'x onload=alert(1)': '1',
			'a>': '1',
			c: '<>',
		});
		// Valid names (including data-*, aria-*, namespaced) are emitted; values
		// are still escaped by escapeAttr (which escapes `&` and `"`).
		expect(out).toContain(' data-x="1"');
		expect(out).toContain(' aria-label="ok"');
		expect(out).toContain(' xlink:href="#a"');
		expect(out).toContain(' c="<>"');
		// Injection-unsafe names are dropped entirely — never reach the output.
		expect(out).not.toContain('bad name');
		expect(out).not.toContain('onload');
		expect(out).not.toContain('a>');
		expect(out).not.toContain('alert');
	});
});

describe('SSR — static-literal attribute fast paths', () => {
	it('serialises static aria-* boolean literals as enumerated "true"/"false"', async () => {
		// React parity, mirroring ssrAttr's dynamic-path handling: aria-* is
		// ENUMERATED, so `aria-hidden={false}` must serialize as "false" (not
		// drop) and `aria-expanded={true}` as "true" (not a bare attribute).
		// A non-aria boolean literal keeps the generic handling (false drops).
		const mod = evalServer(
			`export function A() @{ <div aria-hidden={false} aria-expanded={true} hidden={false}>{'x'}</div> }`,
			'aria-static.tsrx',
		);
		const out = (await RT.render(mod.A)).body;
		expect(out).toContain(' aria-hidden="false"');
		expect(out).toContain(' aria-expanded="true"');
		expect(out).not.toContain(' hidden');
	});
});

describe('SSR — React 19 function form actions', () => {
	it('drops a function-valued action/formAction; string values still serialize', async () => {
		// A function action is submit wiring for the client's setFormAction —
		// serializing it would put function source into the HTML as a navigable
		// URL. Mirrors the client's tag+name condition.
		const mod = evalServer(
			`export function F(props) @{
				<form action={props.act}>
					<button formAction={props.act}>{'go'}</button>
				</form>
			}`,
			'fn-action.tsrx',
		);
		const withFn = (await RT.render(mod.F, { act: () => {} })).body;
		expect(withFn).not.toContain('action');
		expect(withFn).not.toContain('=>');
		const withStr = (await RT.render(mod.F, { act: '/submit' })).body;
		expect(withStr).toContain(' action="/submit"');
		expect(withStr).toContain(' formaction="/submit"');
	});
});

describe('SSR — plain-.ts root returning a createElement descriptor', () => {
	// A root authored in plain .ts (the shape every @octanejs binding produces)
	// returns a descriptor, not an HTML string. render() must normalize it
	// through ssrChild exactly like ssrComponent does for child components —
	// previously the descriptor object itself became the body
	// ('[object Object]').
	it('renders a host-descriptor root', async () => {
		const Root = () => RT.createElement('main', { class: 'app' }, RT.createElement('h1', null, 'hi'));
		const { body } = await RT.render(Root as any);
		expect(body).toContain('<main class="app"><h1>hi</h1></main>');
		expect(body).not.toContain('[object Object]');
	});

	it('renders a component-descriptor root and null root', async () => {
		const Inner = () => RT.createElement('span', null, 'x');
		const Root = () => RT.createElement(Inner, null);
		const { body } = await RT.render(Root as any);
		expect(body).toContain('<span>x</span>');
		const { body: empty } = await RT.render((() => null) as any);
		expect(empty).not.toContain('[object Object]');
	});
});
