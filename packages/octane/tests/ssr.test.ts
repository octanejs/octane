import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { Counter as ClientCounter } from './_fixtures/basic.tsrx';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// SSR Phase 1: server render of static markup + dynamic text + attributes +
// nested components. The compiler (mode: 'server') emits HTML-string-building
// bodies that import from 'octane/server'; we eval them with that same
// runtime module injected, then call renderToString() and snapshot { html, css }.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	// Bind the server-runtime import to the live module, and capture exports.
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default (\w+);?/g, '__exports.default = $1;');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.tsrx`), 'utf8');

const basic = evalServer(fixture('basic'), 'basic.tsrx');
const ssr = evalServer(fixture('ssr'), 'ssr.tsrx');
const spreadHooks = evalServer(fixture('spread-hook-args'), 'spread-hook-args.tsrx');
const styleMap = evalServer(fixture('style-map'), 'style-map.tsrx');

describe('SSR Phase 1 — basic fixtures', () => {
	it('renders static markup, dynamic text, and attributes', async () => {
		expect(await RT.renderToString(basic.Hello)).toMatchSnapshot('Hello');
		expect(await RT.renderToString(basic.Counter, { n: 5 })).toMatchSnapshot('Counter');
		expect(await RT.renderToString(basic.Greet, { name: 'Ada' })).toMatchSnapshot('Greet');
		expect(await RT.renderToString(basic.Mixed)).toMatchSnapshot('Mixed');
	});

	it('renders SVG and MathML (static + dynamic attrs)', async () => {
		expect(await RT.renderToString(basic.SvgStatic)).toMatchSnapshot('SvgStatic');
		expect(
			await RT.renderToString(basic.SvgDynamic, { klass: 'c', w: 30, fill: 'blue' }),
		).toMatchSnapshot('SvgDynamic');
		expect(
			await RT.renderToString(basic.MathDynamic, { display: 'block', klass: 'm', value: 'x' }),
		).toMatchSnapshot('MathDynamic');
	});
});

describe('SSR Phase 1 — ssr fixture (style / spread / innerHTML / components / hooks / css)', () => {
	it('renders dynamic object style with camelCase keys', async () => {
		expect(
			await RT.renderToString(ssr.Styled, { klass: 'a', color: 'red', label: 'hi' }),
		).toMatchSnapshot('Styled');
	});

	it('renders boolean attributes, void elements, and dynamic attrs', async () => {
		expect(await RT.renderToString(ssr.Field, { value: 'v', disabled: true })).toMatchSnapshot(
			'Field-disabled',
		);
		expect(await RT.renderToString(ssr.Field, { value: 'v', disabled: false })).toMatchSnapshot(
			'Field-enabled',
		);
	});

	it('serializes spread attributes', async () => {
		expect(
			await RT.renderToString(ssr.Spread, { attrs: { id: 'x', 'data-k': '1' } }),
		).toMatchSnapshot('Spread');
	});

	it('emits innerHTML raw (unescaped)', async () => {
		expect(await RT.renderToString(ssr.Raw, { html: '<b>bold</b>' })).toMatchSnapshot('Raw');
	});

	it('emits dangerouslySetInnerHTML raw when carried through a spread', async () => {
		const { html } = await RT.renderToString(ssr.RawSpread, {
			attrs: { id: 'r', dangerouslySetInnerHTML: { __html: '<b>via spread</b>' } },
		});
		expect(html).toContain('id="r"'); // other spread attrs still serialized
		expect(html).toContain('class="base"');
		expect(html).toContain('<b>via spread</b>'); // raw HTML rendered as content
		expect(html).not.toContain('dangerouslysetinnerhtml'); // not a dead attribute
	});

	it('renders nested component composition', async () => {
		expect(await RT.renderToString(ssr.Card, { title: 'T', tag: 'new' })).toMatchSnapshot('Card');
	});

	it('collects scoped CSS into the css field', async () => {
		const out = await RT.renderToString(ssr.Scoped);
		expect(out).toMatchSnapshot('Scoped');
		expect(out.css).toContain('.box.tsrx-');
		expect(out.html).toContain('class="box tsrx-');
	});

	it('collects module style-map CSS while rendering a component that uses the map', () => {
		const out = RT.renderToString(styleMap.Picker, { kind: 'red' });
		expect(out.css).toContain('.red.tsrx-');
		expect(out.css).toContain('color: rgb(200, 0, 0)');
		expect(out.html).toMatch(/class="[^"]*\btsrx-[^"]+"/);
		expect(out.html).toMatch(/class="[^"]*\bred\b[^"]*"/);
	});

	it('preserves source-order cascade when a style map follows its component', () => {
		const mod = evalServer(
			`
				export function Card() @{
					<>
						<style>.tone { color: blue; }</style>
						<div class={theme.tone}>{'card'}</div>
					</>
				}
				const theme = <style>.tone { color: red; }</style>;
			`,
			'style-map-order.tsrx',
		);
		const { css } = RT.renderToString(mod.Card);
		expect(css.indexOf('color: blue')).toBeGreaterThan(-1);
		expect(css.indexOf('color: red')).toBeGreaterThan(css.indexOf('color: blue'));
	});
});

describe('SSR Phase 1 — semantics', () => {
	it('escapes dynamic text and attribute values', async () => {
		const out = await RT.renderToString(basic.Greet, { name: '<script>"x"' });
		expect(out.html).toContain('&lt;script&gt;');
		expect(out.html).not.toContain('<script>');
	});

	it.each([
		['ordinary text and quotes', 'safe "quoted" text', 'safe "quoted" text'],
		['an ampersand', '&', '&amp;'],
		['an opening angle bracket', '<', '&lt;'],
		['a closing angle bracket', '>', '&gt;'],
		['interleaved sensitive characters', '<&><&>', '&lt;&amp;&gt;&lt;&amp;&gt;'],
		['existing entities', '&amp;&lt;&#60;', '&amp;amp;&amp;lt;&amp;#60;'],
		[
			'hostile markup',
			'<img src=x onerror=alert(1)>&"',
			'&lt;img src=x onerror=alert(1)&gt;&amp;"',
		],
		[
			'unpaired surrogates and null characters',
			'😀\ud800&\udfff<\u0000>',
			'😀\ud800&amp;\udfff&lt;\u0000&gt;',
		],
	])('escapes %s identically in buffered and static markup', (_label, value, expected) => {
		const expectedMarkup = `<span>${expected}</span>`;
		expect(RT.renderToString(basic.Counter, { n: value }).html).toBe(expectedMarkup);
		expect(RT.renderToStaticMarkup(basic.Counter, { n: value }).html).toBe(expectedMarkup);
	});

	it('coerces escaped text exactly once and keeps nested server rendering isolated', () => {
		const coercions: string[] = [];
		const value = {
			[Symbol.toPrimitive](hint: string) {
				coercions.push(hint);
				expect(RT.renderToString(basic.Counter, { n: '<nested>&' }).html).toBe(
					'<span>&lt;nested&gt;&amp;</span>',
				);
				return '&<outer>';
			},
		};

		expect(RT.renderToString(basic.Counter, { n: value }).html).toBe(
			'<span>&amp;&lt;outer&gt;</span>',
		);
		expect(coercions).toEqual(['string']);
	});

	it('propagates text coercion failures without retrying coercion', () => {
		const failure = new Error('text coercion failed');
		const coerce = vi.fn(() => {
			throw failure;
		});

		expect(() => RT.renderToString(basic.Counter, { n: { [Symbol.toPrimitive]: coerce } })).toThrow(
			failure,
		);
		expect(coerce).toHaveBeenCalledTimes(1);
	});

	it('streams escaped text without introducing executable markup', async () => {
		const value = '&<script>alert("x")</script>&amp;';
		const stream = await RT.renderToReadableStream(basic.Counter, { n: value });
		const html = await new Response(stream).text();

		expect(html).toBe('<span>&amp;&lt;script&gt;alert("x")&lt;/script&gt;&amp;amp;</span>');
		expect(html).not.toContain('<script>');
	});

	it('hydrates escaped text by adopting the existing server-rendered node', () => {
		const value = '&<script>"quoted"</script>&amp;';
		const container = document.createElement('div');
		container.innerHTML = RT.renderToString(basic.Counter, { n: value }).html;
		const serverNode = container.querySelector('span');
		const root = hydrateRoot(container, ClientCounter, { n: value });
		flushSync(() => {});

		expect(container.querySelector('span')).toBe(serverNode);
		expect(serverNode?.textContent).toBe(value);
		expect(container.querySelector('script')).toBeNull();
		root.unmount();
	});

	it('hooks render their initial value; effects do NOT run on the server', async () => {
		const onEffect = vi.fn();
		const out = await RT.renderToString(ssr.HookView, { start: 7, onEffect });
		expect(out.html).toContain('<span class="n">7</span>');
		expect(out.html).toContain('<span class="d">14</span>'); // useMemo ran once
		expect(out.html).toMatch(/id=":in-[0-9a-z]+:"/); // deterministic useId
		expect(onEffect).not.toHaveBeenCalled(); // useEffect is a no-op on the server
	});

	it('keeps an omitted useRef value distinct from a spread-site slot', () => {
		expect(RT.renderToString(spreadHooks.SpreadRef).html).toContain('>u</p>');
	});

	it('returns the { html, css } shape', async () => {
		const out = await RT.renderToString(basic.Hello);
		expect(Object.keys(out).sort()).toEqual(['css', 'html']);
	});

	it('renders visible Activity content and skips hidden Activity work', async () => {
		const activity = evalServer(
			`
				import { Activity } from 'octane';
				function Child(props) @{
					props.onRender();
					<span class="activity-child">{'child'}</span>
				}
				export function C(props) @{
					<Activity mode={props.mode}><Child onRender={props.onRender} /></Activity>
				}
			`,
			'activity-ssr.tsrx',
		);
		const onRender = vi.fn();
		const visible = await RT.renderToString(activity.C, { mode: 'visible', onRender });
		expect(visible.html).toContain('<span class="activity-child">child</span>');
		expect(visible.html).toContain('<!--[-->');
		expect(onRender).toHaveBeenCalledTimes(1);

		onRender.mockClear();
		const hidden = await RT.renderToString(activity.C, { mode: 'hidden', onRender });
		expect(hidden.html).not.toContain('activity-child');
		expect(hidden.html).toContain('<!--[--><!--]-->');
		expect(onRender).not.toHaveBeenCalled();

		expect(RT.renderToStaticMarkup(activity.C, { mode: 'visible', onRender }).html).toBe(
			'<span class="activity-child">child</span>',
		);
		onRender.mockClear();
		expect(RT.renderToStaticMarkup(activity.C, { mode: 'hidden', onRender }).html).toBe('');
		expect(onRender).not.toHaveBeenCalled();
	});

	it('still rejects server-side Fragment refs', () => {
		expect(() =>
			compile(
				`export function C(p) @{ <Fragment ref={p.ref}><span>{'a'}</span></Fragment> }`,
				'fragment-ref.tsrx',
				{ mode: 'server' },
			),
		).toThrow(/does not support fragment refs/);
	});
});

describe('SSR — nested render entry isolation', () => {
	it('keeps a nested render hydratable inside static markup and preserves outer hint dedupe', () => {
		const mod = evalServer(
			`
        import { preload } from 'octane';
        function Child() @{ <span>{'nested'}</span> }
        export function Inner() @{
          preload('/nested-render.css', { as: 'style' });
          <div class="inner"><Child /></div>
        }
        export function Outer(props) @{
          preload('/outer-render.css', { as: 'style' });
          props.renderInner();
          preload('/outer-render.css', { as: 'style' });
          <main class="outer">{'outer'}</main>
        }
      `,
			'nested-render-isolation.tsrx',
		);
		let nested: { html: string; css: string } | undefined;
		const outer = RT.renderToStaticMarkup(mod.Outer, {
			renderInner: () => {
				nested = RT.renderToString(mod.Inner);
			},
		});

		expect(nested).toBeDefined();
		expect(nested!.html).toContain('<!--[-->');
		expect(nested!.html).toContain('href="/nested-render.css"');
		expect(outer.html).not.toContain('<!--[-->');
		expect(outer.html).not.toContain('<!--]-->');
		expect(outer.html).not.toContain('/nested-render.css');
		expect(outer.html.match(/href="\/outer-render\.css"/g)).toHaveLength(1);
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
		const out = (await RT.renderToString(mod.A)).html;
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
		const withFn = (await RT.renderToString(mod.F, { act: () => {} })).html;
		expect(withFn).not.toContain('action');
		expect(withFn).not.toContain('=>');
		const withStr = (await RT.renderToString(mod.F, { act: '/submit' })).html;
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
		const Root = () =>
			RT.createElement('main', { class: 'app' }, RT.createElement('h1', null, 'hi'));
		const { html } = await RT.renderToString(Root as any);
		expect(html).toContain('<main class="app"><h1>hi</h1></main>');
		expect(html).not.toContain('[object Object]');
	});

	it('renders a component-descriptor root and null root', async () => {
		const Inner = () => RT.createElement('span', null, 'x');
		const Root = () => RT.createElement(Inner, null);
		const { html } = await RT.renderToString(Root as any);
		expect(html).toContain('<span>x</span>');
		const { html: empty } = await RT.renderToString((() => null) as any);
		expect(empty).not.toContain('[object Object]');
	});
});

// `headChannel: 'separate'` exists for hosts that render into a `<head>`-bearing
// template they own instead of rendering the document. Folding has no `</head>`
// to target in a body-only render, so it prepends the metadata into the body -
// where a `<title>` loses to the template's and a canonical or description is
// ignored. Separate mode withholds it so the host can place it itself.
describe('SSR, hoisted head channel', () => {
	const HEAD_PAGE = `
		export function Page(props: { slug: string }) @{
			<>
				<title>{'Post: ' + props.slug}</title>
				<meta name="description" content="per-route description" />
				<main>body text</main>
			</>
		}
	`;
	const headPage = evalServer(HEAD_PAGE, 'head-channel.tsrx');

	it('folds metadata into html and omits the head field by default', async () => {
		for (const render of [RT.renderToString, RT.renderToStaticMarkup]) {
			const result = render(headPage.Page, { slug: 'a' });
			expect(result.head).toBeUndefined();
			expect(result.html).toContain('<title>Post: a</title>');
			expect(result.html).toContain('name="description"');
			// Prepended, since a body-only render has no `</head>`.
			expect(result.html.indexOf('<title')).toBeLessThan(result.html.indexOf('<main'));
		}
	});

	it('withholds metadata from html and hands it over on the head field', async () => {
		for (const render of [RT.renderToString, RT.renderToStaticMarkup]) {
			const { html, head } = render(headPage.Page, { slug: 'a' }, { headChannel: 'separate' });
			expect(html).not.toContain('<title');
			expect(html).not.toContain('name="description"');
			expect(html).toContain('<main>body text</main>');
			expect(head).toContain('<title>Post: a</title>');
			expect(head).toContain('name="description"');
		}
	});

	it('keeps the channel choice out of the rendered body bytes', async () => {
		// The metadata moves; nothing else may. This is what lets a host adopt
		// separate mode without re-baselining its hydratable output.
		const folded = RT.renderToString(headPage.Page, { slug: 'a' });
		const separated = RT.renderToString(headPage.Page, { slug: 'a' }, { headChannel: 'separate' });
		expect(separated.head! + separated.html).toBe(folded.html);
	});

	it('reports an empty head when a render hoists nothing', async () => {
		const Root = () => RT.createElement('main', null, 'x');
		const { html, head } = RT.renderToString(Root as any, undefined, {
			headChannel: 'separate',
		});
		expect(head).toBe('');
		expect(html).toContain('<main>x</main>');
	});
});
