import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// SSR of JSX tags that resolve to a HOST tag STRING at runtime. Two regimes:
//   - TEMPLATE position (`@{ … }` body): `<props.parts.title>` lowers to
//     `ssrComponent(__s, props.parts.title, …)` — the string branch serializes
//     the host element inside the component's one-block range, so the client's
//     componentSlot adopts it uniformly on hydration.
//   - VALUE position (`.tsx` return / `{expr}` hole): the de-opt descriptor
//     path (`ssrChild` → `ssrHostElement`) — already string-aware.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/host-string-tag.tsrx',
);

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const mod = evalServer(readFileSync(FIXTURE, 'utf8'), 'host-string-tag.tsrx');

describe('SSR host string tags — template position', () => {
	it('serializes a member-expression tag as a host element in one block range', async () => {
		const { html } = await RT.renderToString(mod.Card, {
			parts: { title: 'h1' },
			text: 'Hi',
			klass: 'big',
		});
		expect(html).toBe(
			'<div id="card"><!--[--><h1 id="t" class="big"><!--[-->Hi<!--]--></h1><!--]--></div>',
		);
	});

	it('serializes a variable tag wrapping a component child (nested block)', async () => {
		const { html } = await RT.renderToString(mod.Wrap, { tag: 'article' });
		expect(html).toContain('<article id="inner">');
		expect(html).toContain('count:0');
		// The component child inside the dynamic host carries its own block range.
		expect(html).toMatch(/<article id="inner"><!--\[-->.*<!--\]--><\/article>/);
	});

	it('serializes a childless dynamic VOID tag self-closed', async () => {
		const { html } = await RT.renderToString(mod.Bare, { tag: 'hr' });
		expect(html).toBe('<div id="bare"><!--[--><hr data-x="1"/><!--]--></div>');
	});

	it('drops event/ref props from the serialized element', async () => {
		const { html } = await RT.renderToString(mod.Clicky, { tag: 'button' });
		expect(html).toContain('<button id="btn">');
		expect(html).not.toContain('onPick');
		expect(html).not.toContain('onClick');
		expect(html).not.toContain('ref=');
	});

	it('emits NO hydration markers under renderToStaticMarkup', async () => {
		const { html } = await RT.renderToStaticMarkup(mod.Card, {
			parts: { title: 'h2' },
			text: 'Hi',
			klass: null,
		});
		expect(html).toBe('<div id="card"><h2 id="t">Hi</h2></div>');
	});

	it('rejects an invalid (markup-injecting) tag like React', async () => {
		await expect(async () =>
			RT.renderToString(mod.Card, {
				parts: { title: 'div><img src=x onerror=alert(1)>' },
				text: 'x',
			}),
		).rejects.toThrow(/Invalid tag/);
	});
});

// VALUE position (.tsx return bodies) — the MDX shape (`<_components.h1>` in a
// compiled document body). These lower to createElement descriptors / direct
// ssrComponent calls whose tag expression is evaluated at runtime.
const vmod = evalServer(
	`
	export function MemberSole(props) {
		return <props.parts.title class="title">hi</props.parts.title>;
	}
	export function MemberFragment(props) {
		return <>
			<props.parts.title>Heading</props.parts.title>
			<props.parts.body>Text</props.parts.body>
		</>;
	}
	export function MemberNested(props) {
		return <props.c.ul class="list">
			<props.c.li>a</props.c.li>
			<props.c.li>b</props.c.li>
		</props.c.ul>;
	}
	export function DynamicTag(props) {
		const T = props.tag;
		return <{T} id="d">{props.label}</{T}>;
	}
	export function VoidTag(props) {
		return <props.parts.rule class="sep"/>;
	}
	export function Filtered(props) {
		return <props.parts.title key="k" ref={props.ref} onClick={props.onClick} data-x="1">t</props.parts.title>;
	}
	function Fancy(props) {
		return <em class="fancy">{props.children}</em>;
	}
	export function Overridable(props) {
		const parts = { title: props.useFancy ? Fancy : 'h1' };
		return <parts.title>Title</parts.title>;
	}
	`,
	'host-string-tags-value.tsrx',
);

describe('SSR host string tags — value position (.tsx return)', () => {
	it('renders a sole member tag string as a host element', async () => {
		const { html } = await RT.renderToString(vmod.MemberSole, { parts: { title: 'h1' } });
		expect(html).toContain('<h1 class="title">hi</h1>');
		const r = RT.renderToStaticMarkup(vmod.MemberSole, { parts: { title: 'h2' } });
		// Static markup: no hydration markers at all.
		expect(r.html).toBe('<h2 class="title">hi</h2>');
	});

	it('renders every member tag of a fragment return', async () => {
		const { html } = await RT.renderToString(vmod.MemberFragment, {
			parts: { title: 'h1', body: 'p' },
		});
		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<p>Text</p>');
	});

	it('renders nested member tags (list-in-list, the MDX markdown shape)', async () => {
		const r = RT.renderToStaticMarkup(vmod.MemberNested, { c: { ul: 'ul', li: 'li' } });
		expect(r.html).toBe('<ul class="list"><li>a</li><li>b</li></ul>');
	});

	it('renders a `<{expr}/>` dynamic tag resolving to a string', async () => {
		const { html } = await RT.renderToString(vmod.DynamicTag, { tag: 'button', label: 'go' });
		expect(html).toContain('<button id="d">go</button>');
	});

	it('serializes a void host tag without a closing tag', async () => {
		const r = RT.renderToStaticMarkup(vmod.VoidTag, { parts: { rule: 'hr' } });
		expect(r.html).toBe('<hr class="sep"/>');
	});

	it('drops key/ref/event props and keeps attrs (client parity)', async () => {
		const r = RT.renderToStaticMarkup(vmod.Filtered, {
			parts: { title: 'span' },
			ref: () => {},
			onClick: () => {},
		});
		expect(r.html).toBe('<span data-x="1">t</span>');
	});

	it('dispatches by RUNTIME kind: the same tag site renders a component when overridden', async () => {
		const asString = RT.renderToStaticMarkup(vmod.Overridable, { useFancy: false });
		expect(asString.html).toBe('<h1>Title</h1>');
		const asComp = RT.renderToStaticMarkup(vmod.Overridable, { useFancy: true });
		expect(asComp.html).toBe('<em class="fancy">Title</em>');
	});
});
