import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import {
	createElement as createClientElement,
	flushSync,
	Fragment as ClientFragment,
	FragmentInstance,
	hydrateRoot,
} from '../src/index.js';
import { Counter as ClientCounter } from './_fixtures/basic.tsrx';
import { SpreadFragmentObjectRef as ClientSpreadFragment } from './conformance/_fixtures/fragment-refs.tsrx';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// SSR Phase 1: server render of static markup + dynamic text + attributes +
// nested components. The compiler (mode: 'server') emits HTML-string-building
// bodies that import from 'octane/server'; we eval them with that same
// runtime module injected, then call renderToString() and snapshot { html, css }.

function evalServer(
	source: string,
	file: string,
	options: Record<string, unknown> = {},
): Record<string, any> {
	let { code } = compile(source, file, { ...options, mode: 'server' });
	// Bind the server-runtime import to the live module, and capture exports.
	code = code.replace(
		/import\s+\*\s+as\s+(\w+)\s+from\s+['"]octane\/server['"];?/g,
		'const $1 = __rt;',
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/(?:server|internal\/server)['"];?/g,
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

describe.each([
	{ name: 'development', dev: true },
	{ name: 'production', dev: false },
])('SSR single-spread host content in $name compilation', ({ dev }) => {
	const mod = evalServer(
		`
			export function Spread(props) @{
				<div {...props.attrs} />
			}
			export function Ordered(props) @{
				<section
					data-before={props.read('before')}
					{...props.attrs}
					data-after={props.read('after')}
				/>
			}
			export function SpreadFloatStyle(props) @{
				<div {...props.attrs}>
					<style href="spread-inline-tokens" precedence="default">
						.spread-tokens { color: teal; }
					</style>
				</div>
			}
		`,
		`single-spread-host-${dev ? 'development' : 'production'}.tsrx`,
		{ dev, hmr: false },
	);

	it('renders spread children as escaped text or ordinary child elements', () => {
		expect(RT.renderToString(mod.Spread, { attrs: { children: '<safe>' } }).html).toBe(
			'<div>&lt;safe&gt;</div>',
		);
		expect(RT.renderToString(mod.Spread, { attrs: { children: 0 } }).html).toBe('<div>0</div>');
		const element = RT.createElement('strong', { id: 'spread-child' }, 'rich');
		const html = RT.renderToString(mod.Spread, { attrs: { children: element } }).html;
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(container.querySelector('#spread-child')?.textContent).toBe('rich');
	});

	it('hoists a nested Float style resource from an otherwise empty spread host', () => {
		const { html } = RT.renderToString(mod.SpreadFloatStyle, {
			attrs: { id: 'spread-float-host' },
		});
		expect(html).toContain('data-href="spread-inline-tokens"');
		expect(html).toContain('data-precedence="default"');
		expect(html).toContain('.spread-tokens');
		expect(html).toContain('color: teal');
		expect(html).toContain('<div id="spread-float-host"></div>');
		expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<div'));
	});

	it('renders raw spread HTML and rejects conflicting or malformed content', () => {
		expect(
			RT.renderToString(mod.Spread, {
				attrs: { children: undefined, dangerouslySetInnerHTML: { __html: '<b>raw</b>' } },
			}).html,
		).toBe('<div><b>raw</b></div>');
		expect(
			RT.renderToString(mod.Spread, {
				attrs: { children: 'fallback', dangerouslySetInnerHTML: undefined },
			}).html,
		).toBe('<div>fallback</div>');
		expect(
			RT.renderToString(mod.Spread, {
				attrs: { dangerouslySetInnerHTML: { __html: null } },
			}).html,
		).toBe('<div></div>');
		expect(() =>
			RT.renderToString(mod.Spread, {
				attrs: { children: '', dangerouslySetInnerHTML: { __html: '<b>raw</b>' } },
			}),
		).toThrow();
		expect(() =>
			RT.renderToString(mod.Spread, { attrs: { dangerouslySetInnerHTML: {} } }),
		).toThrow();
	});

	it('ignores inherited and non-enumerable spread content properties', () => {
		const attrs = Object.create({
			children: 'inherited',
			dangerouslySetInnerHTML: { __html: '<b>inherited</b>' },
		}) as Record<string, unknown>;
		Object.defineProperty(attrs, 'children', { value: 'hidden', enumerable: false });
		Object.defineProperty(attrs, 'title', { value: 'visible', enumerable: true });
		expect(RT.renderToString(mod.Spread, { attrs }).html).toBe('<div title="visible"></div>');
		expect(RT.renderToString(mod.Spread, { attrs: null }).html).toBe('<div></div>');
	});

	it('snapshots string and symbol getters exactly once in authored prop order', () => {
		const observed: string[] = [];
		const attrs = {} as Record<PropertyKey, unknown>;
		for (const [key, value] of [
			['title', 'spread title'],
			['children', '<escaped child>'],
		] as const) {
			Object.defineProperty(attrs, key, {
				enumerable: true,
				get() {
					observed.push(`spread:${key}`);
					return value;
				},
			});
		}
		Object.defineProperty(attrs, Symbol('ignored'), {
			enumerable: true,
			get() {
				observed.push('spread:symbol');
				return 'ignored';
			},
		});
		const html = RT.renderToString(mod.Ordered, {
			attrs,
			read(key: string) {
				observed.push(`direct:${key}`);
				return key;
			},
		}).html;
		expect(observed).toEqual([
			'direct:before',
			'spread:title',
			'spread:children',
			'spread:symbol',
			'direct:after',
		]);
		expect(html).toBe(
			'<section data-before="before" title="spread title" data-after="after">&lt;escaped child&gt;</section>',
		);
	});

	it('serializes attributes before reading a spread raw-HTML getter', () => {
		const observed: string[] = [];
		const markup = {
			get __html() {
				observed.push('read:html');
				return '<strong>raw content</strong>';
			},
		};
		const attrs = {
			get title() {
				observed.push('spread:title');
				return {
					toString() {
						observed.push('serialize:title');
						return 'visible title';
					},
				};
			},
			get dangerouslySetInnerHTML() {
				observed.push('spread:html');
				return markup;
			},
			get children() {
				observed.push('spread:children');
				return null;
			},
		};
		const html = RT.renderToString(mod.Ordered, {
			attrs,
			read(key: string) {
				observed.push(`direct:${key}`);
				return key;
			},
		}).html;
		expect(observed).toEqual([
			'direct:before',
			'spread:title',
			'spread:html',
			'spread:children',
			'direct:after',
			'serialize:title',
			'read:html',
		]);
		expect(html).toBe(
			'<section data-before="before" title="visible title" data-after="after"><strong>raw content</strong></section>',
		);
	});
});

describe('SSR Phase 1 — semantics', () => {
	it('compares server memo dependencies with Object.is across render-phase retries', () => {
		const memo = evalServer(
			`
				import { useMemo, useState } from 'octane';
				export function Memo(props) @{
					const [updated, setUpdated] = useState(false);
					const dependency = updated ? props.second : props.first;
					const label = useMemo(() => props.compute(dependency), [dependency]);
					if (!updated) setUpdated(true);
					<output>{label as string}</output>
				}
			`,
			'server-memo-dependency-equality.tsrx',
		);
		const signedZeroValues: number[] = [];
		expect(
			RT.renderToString(memo.Memo, {
				first: -0,
				second: 0,
				compute(value: number) {
					signedZeroValues.push(value);
					return Object.is(value, -0) ? 'negative zero' : 'positive zero';
				},
			}).html,
		).toBe('<output>positive zero</output>');
		expect(signedZeroValues.map((value) => Object.is(value, -0))).toEqual([true, false]);

		const nanValues: number[] = [];
		expect(
			RT.renderToString(memo.Memo, {
				first: Number.NaN,
				second: Number.NaN,
				compute(value: number) {
					nanValues.push(value);
					return `stable ${nanValues.length}`;
				},
			}).html,
		).toBe('<output>stable 1</output>');
		expect(nanValues).toHaveLength(1);
	});

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

	it('renders Fragment refs without attaching them and keeps static markup markerless', async () => {
		const fragment = evalServer(
			`export function C(props) @{ <main><Fragment ref={props.ref}><span>{props.label as string}</span></Fragment></main> }`,
			'fragment-ref.tsrx',
		);
		const callback = vi.fn();
		const props = { ref: callback, label: 'server fragment' };
		const { html } = RT.renderToString(fragment.C, props);
		const parsed = document.createElement('div');
		parsed.innerHTML = html;

		expect(parsed.querySelector('main > span')?.textContent).toBe('server fragment');
		expect(callback).not.toHaveBeenCalled();
		expect(RT.renderToStaticMarkup(fragment.C, props).html).toBe(
			'<main><span>server fragment</span></main>',
		);
		expect(callback).not.toHaveBeenCalled();

		const stream = await RT.renderToReadableStream(fragment.C, props);
		expect(await new Response(stream).text()).toBe(html);
		expect(callback).not.toHaveBeenCalled();
	});

	it('evaluates Fragment ref expressions before children without attaching the ref', () => {
		const fragment = evalServer(
			`export function C(props) @{ <Fragment ref={props.observe('ref', props.ref)}><span>{props.observe('child', props.label) as string}</span></Fragment> }`,
			'fragment-ref-order.tsrx',
		);
		const calls: string[] = [];
		const callback = vi.fn();
		const { html } = RT.renderToString(fragment.C, {
			ref: callback,
			label: 'ordered',
			observe: (phase: string, value: unknown) => {
				calls.push(phase);
				return value;
			},
		});

		const parsed = document.createElement('div');
		parsed.innerHTML = html;
		expect(parsed.querySelector('span')?.textContent).toBe('ordered');
		expect(calls).toEqual(['ref', 'child']);
		expect(callback).not.toHaveBeenCalled();
	});

	it('server-renders, streams, and hydrates spread-supplied Fragment refs', async () => {
		const fragment = evalServer(
			`import { Fragment } from 'octane'; export function C(props) @{ <div id="spread-parent"><Fragment {...props.spread}><button id="spread-child">{'spread'}</button></Fragment></div> }`,
			'fragment-ref-spread.tsrx',
		);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const props = { spread: { ref: fragRef } };
		const { html } = RT.renderToString(fragment.C, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		const serverChild = container.querySelector('#spread-child');

		expect(serverChild?.textContent).toBe('spread');
		expect(fragRef.current).toBeNull();
		expect(RT.renderToStaticMarkup(fragment.C, props).html).toBe(
			'<div id="spread-parent"><button id="spread-child">spread</button></div>',
		);
		expect(fragRef.current).toBeNull();
		const stream = await RT.renderToReadableStream(fragment.C, props);
		expect(await new Response(stream).text()).toBe(html);
		expect(fragRef.current).toBeNull();

		const root = hydrateRoot(container, ClientSpreadFragment, props);
		flushSync(() => {});
		expect(container.querySelector('#spread-child')).toBe(serverChild);
		expect(fragRef.current).toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(fragRef.current).toBeNull();
	});

	it.each([
		[
			'template',
			`export function C(props) @{ <Fragment {...props.observe('first:expression', props.first)} ref={props.observe('explicit', props.explicit)} {...props.observe('last:expression', props.last)}><span>{props.observe('child', 'ordered') as string}</span></Fragment> }`,
			'tsrx',
		],
		[
			'returned automatic JSX',
			`/** @jsxImportSource octane */ import { Fragment as Group } from 'octane'; export function C(props) { return <Group {...props.observe('first:expression', props.first)} ref={props.observe('explicit', props.explicit)} {...props.observe('last:expression', props.last)}><span>{props.observe('child', 'ordered')}</span></Group>; }`,
			'tsx',
		],
		[
			'returned namespaced TSRX',
			`import * as Octane from 'octane'; export function C(props) { return <Octane.Fragment {...props.observe('first:expression', props.first)} ref={props.observe('explicit', props.explicit)} {...props.observe('last:expression', props.last)}><span>{props.observe('child', 'ordered') as string}</span></Octane.Fragment>; }`,
			'tsrx',
		],
	] as const)(
		'evaluates %s spread Fragment refs and getters once in authored order on the server',
		async (_kind, source, extension) => {
			const fragment = evalServer(source, `fragment-ref-spread-order.${extension}`);
			const calls: string[] = [];
			const firstRef = vi.fn();
			const explicit = vi.fn();
			const lastRef = vi.fn();
			const first = {
				get ref() {
					calls.push('first:getter');
					return firstRef;
				},
			};
			const last = {
				get ref() {
					calls.push('last:getter');
					return lastRef;
				},
			};
			const props = {
				first,
				last,
				explicit,
				observe: (label: string, value: unknown) => {
					calls.push(label);
					return value;
				},
			};
			const expected = [
				'first:expression',
				'first:getter',
				'explicit',
				'last:expression',
				'last:getter',
				'child',
			];

			const { html } = RT.renderToString(fragment.C, props);
			expect(calls).toEqual(expected);
			calls.length = 0;
			expect(RT.renderToStaticMarkup(fragment.C, props).html).toBe('<span>ordered</span>');
			expect(calls).toEqual(expected);
			calls.length = 0;
			const stream = await RT.renderToReadableStream(fragment.C, props);
			expect(await new Response(stream).text()).toBe(html);
			expect(calls).toEqual(expected);
			expect(firstRef).not.toHaveBeenCalled();
			expect(explicit).not.toHaveBeenCalled();
			expect(lastRef).not.toHaveBeenCalled();
		},
	);

	it.each([
		[
			'aliased',
			`import { Fragment as Group } from 'octane'; export function C(props) @{ <main><Group ref={props.ref}><span>{props.label as string}</span></Group></main> }`,
		],
		[
			'namespaced',
			`import * as Octane from 'octane'; export function C(props) @{ <main><Octane.Fragment ref={props.ref}><span>{props.label as string}</span></Octane.Fragment></main> }`,
		],
		[
			'automatic-jsx',
			`/** @jsxImportSource octane */ import { Fragment as Group } from 'octane'; export function C(props) { return <main><Group ref={props.ref}><span>{props.label as string}</span></Group></main>; }`,
		],
	] as const)('renders a %s imported Fragment without attaching its ref', (kind, source) => {
		const extension = kind === 'automatic-jsx' ? 'tsx' : 'tsrx';
		const fragment = evalServer(source, `fragment-ref-${kind}.${extension}`);
		const callback = vi.fn();
		const props = { ref: callback, label: 'server alias' };

		expect(RT.renderToStaticMarkup(fragment.C, props).html).toBe(
			'<main><span>server alias</span></main>',
		);
		expect(callback).not.toHaveBeenCalled();
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

	it('server-renders and hydrates nested public Fragment descriptors with refs', async () => {
		const outerRef: { current: FragmentInstance | null } = { current: null };
		const innerRef = vi.fn();
		const props = { outerRef, innerRef };
		const ServerRoot = (input: typeof props) =>
			RT.createElement(
				RT.Fragment,
				{ ref: input.outerRef },
				RT.createElement('span', { id: 'descriptor-first' }, 'first'),
				RT.createElement(
					RT.Fragment,
					{ ref: input.innerRef, key: 'inner' },
					RT.createElement('strong', { id: 'descriptor-inner' }, 'inner'),
				),
			);
		const ClientRoot = (input: typeof props) =>
			createClientElement(
				ClientFragment,
				{ ref: input.outerRef },
				createClientElement('span', { id: 'descriptor-first' }, 'first'),
				createClientElement(
					ClientFragment,
					{ ref: input.innerRef, key: 'inner' },
					createClientElement('strong', { id: 'descriptor-inner' }, 'inner'),
				),
			);

		const { html } = RT.renderToString(ServerRoot as any, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		const first = container.querySelector('#descriptor-first');
		const inner = container.querySelector('#descriptor-inner');
		expect(first?.textContent).toBe('first');
		expect(inner?.textContent).toBe('inner');
		expect(outerRef.current).toBeNull();
		expect(innerRef).not.toHaveBeenCalled();
		expect(RT.renderToStaticMarkup(ServerRoot as any, props).html).toBe(
			'<span id="descriptor-first">first</span><strong id="descriptor-inner">inner</strong>',
		);
		expect(outerRef.current).toBeNull();
		expect(innerRef).not.toHaveBeenCalled();
		const stream = await RT.renderToReadableStream(ServerRoot as any, props);
		expect(await new Response(stream).text()).toBe(html);
		expect(innerRef).not.toHaveBeenCalled();

		const root = hydrateRoot(container, ClientRoot, props);
		flushSync(() => {});
		expect(container.querySelector('#descriptor-first')).toBe(first);
		expect(container.querySelector('#descriptor-inner')).toBe(inner);
		expect(outerRef.current).toBeInstanceOf(FragmentInstance);
		expect(innerRef).toHaveBeenCalledOnce();
		expect(innerRef.mock.calls[0]?.[0]).toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(outerRef.current).toBeNull();
		expect(innerRef.mock.calls.at(-1)?.[0]).toBeNull();
	});

	it('hydrates empty, text, and populated Fragment descriptors inside a host in place', () => {
		const emptyRef: { current: FragmentInstance | null } = { current: null };
		const populatedRef: { current: FragmentInstance | null } = { current: null };
		const textRef: { current: FragmentInstance | null } = { current: null };
		const props = { emptyRef, populatedRef, textRef };
		const ServerRoot = (input: typeof props) =>
			RT.createElement(
				'main',
				{ id: 'descriptor-host' },
				RT.createElement(RT.Fragment, { ref: input.emptyRef, key: 'empty' }),
				RT.createElement(
					RT.Fragment,
					{ ref: input.populatedRef },
					RT.createElement('span', { id: 'descriptor-populated' }, 'populated'),
				),
				RT.createElement(RT.Fragment, { ref: input.textRef }, 'descriptor text'),
				RT.createElement('em', { id: 'descriptor-after' }, 'after'),
			);
		const ClientRoot = (input: typeof props) =>
			createClientElement(
				'main',
				{ id: 'descriptor-host' },
				createClientElement(ClientFragment, { ref: input.emptyRef, key: 'empty' }),
				createClientElement(
					ClientFragment,
					{ ref: input.populatedRef },
					createClientElement('span', { id: 'descriptor-populated' }, 'populated'),
				),
				createClientElement(ClientFragment, { ref: input.textRef }, 'descriptor text'),
				createClientElement('em', { id: 'descriptor-after' }, 'after'),
			);

		const container = document.createElement('div');
		container.innerHTML = RT.renderToString(ServerRoot as any, props).html;
		const host = container.querySelector('#descriptor-host');
		const populated = container.querySelector('#descriptor-populated');
		const after = container.querySelector('#descriptor-after');
		expect(emptyRef.current).toBeNull();
		expect(populatedRef.current).toBeNull();
		expect(textRef.current).toBeNull();
		expect(RT.renderToStaticMarkup(ServerRoot as any, props).html).toBe(
			'<main id="descriptor-host"><span id="descriptor-populated">populated</span>descriptor text<em id="descriptor-after">after</em></main>',
		);

		const root = hydrateRoot(container, ClientRoot, props);
		flushSync(() => {});
		expect(container.querySelector('#descriptor-host')).toBe(host);
		expect(container.querySelector('#descriptor-populated')).toBe(populated);
		expect(container.querySelector('#descriptor-after')).toBe(after);
		expect(emptyRef.current).toBeInstanceOf(FragmentInstance);
		expect(populatedRef.current).toBeInstanceOf(FragmentInstance);
		expect(textRef.current).toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(emptyRef.current).toBeNull();
		expect(populatedRef.current).toBeNull();
		expect(textRef.current).toBeNull();
	});

	it.each([null, undefined])(
		'preserves a hydrated Fragment descriptor when an explicit %s ref becomes live',
		(initialRef) => {
			type DescriptorProps = {
				fragmentRef: { current: FragmentInstance | null } | null | undefined;
			};
			const ServerRoot = (input: DescriptorProps) =>
				RT.createElement(
					RT.Fragment,
					{ ref: input.fragmentRef },
					RT.createElement('span', { id: 'descriptor-toggle' }, 'toggle'),
				);
			const ClientRoot = (input: DescriptorProps) =>
				createClientElement(
					ClientFragment,
					{ ref: input.fragmentRef },
					createClientElement('span', { id: 'descriptor-toggle' }, 'toggle'),
				);
			const container = document.createElement('div');
			container.innerHTML = RT.renderToString(ServerRoot as any, { fragmentRef: initialRef }).html;
			const serverChild = container.querySelector('#descriptor-toggle');
			const root = hydrateRoot(container, ClientRoot, { fragmentRef: initialRef });
			flushSync(() => {});
			expect(container.querySelector('#descriptor-toggle')).toBe(serverChild);

			const liveRef: { current: FragmentInstance | null } = { current: null };
			flushSync(() => root.render(ClientRoot, { fragmentRef: liveRef }));
			const fragment = liveRef.current;
			expect(fragment).toBeInstanceOf(FragmentInstance);
			expect(container.querySelector('#descriptor-toggle')).toBe(serverChild);

			flushSync(() => root.render(ClientRoot, { fragmentRef: null }));
			expect(liveRef.current).toBeNull();
			expect(container.querySelector('#descriptor-toggle')).toBe(serverChild);

			flushSync(() => root.render(ClientRoot, { fragmentRef: liveRef }));
			expect(liveRef.current).toBe(fragment);
			expect(container.querySelector('#descriptor-toggle')).toBe(serverChild);
			root.unmount();
			expect(liveRef.current).toBeNull();
		},
	);
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
