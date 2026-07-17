import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// Member-expression / dynamic JSX tags (`<obj.tag/>`, `<{expr}/>`) whose RUNTIME
// value is a host tag STRING — e.g. MDX's `_components.h1` mapping, unoverridden.
// The client value-lowers these to `createElement(obj.tag, …)` descriptors and the
// de-opt renderer accepts a string type; the server's `ssrComponent` must match by
// routing a string comp to the host-element serializer (in the same single
// `<!--[-->…<!--]-->` block a component body gets) instead of CALLING it.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

// Value-position (.tsx return) bodies — the MDX shape (`<_components.h1>` in a
// compiled document body) — plus template (`@{}`) bodies with the same tags.
const mod = evalServer(
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
	export function TemplateMember(props) @{
		<section><props.parts.title>hi</props.parts.title></section>
	}
	export function TemplateDynamic(props) @{
		<div><{props.tag}>x</{props.tag}></div>
	}
	export function TemplateHole(props) @{
		<div><props.parts.title>n={props.value}</props.parts.title></div>
	}
	function Inner(props) @{
		<b id="x">inner</b>
	}
	export function TemplateComponentChild(props) @{
		<div><props.tag><Inner/></props.tag></div>
	}
	export function TemplateVoid(props) @{
		<div><props.tag data-x="1"/></div>
	}
	export function TemplateFiltered(props) @{
		<div><props.tag ref={props.tagRef} onClick={props.onPick} data-x="1">t</props.tag></div>
	}
	`,
	'host-string-tags.tsrx',
);

describe('SSR — member/dynamic tags resolving to host tag strings (value position)', () => {
	it('renders a sole member tag string as a host element', async () => {
		const { html } = await RT.renderToString(mod.MemberSole, { parts: { title: 'h1' } });
		expect(html).toContain('<h1 class="title">hi</h1>');
		const r = await RT.renderToStaticMarkup(mod.MemberSole, { parts: { title: 'h2' } });
		// Static markup: no hydration markers at all.
		expect(r.html).toBe('<h2 class="title">hi</h2>');
	});

	it('renders every member tag of a fragment return', async () => {
		const { html } = await RT.renderToString(mod.MemberFragment, {
			parts: { title: 'h1', body: 'p' },
		});
		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<p>Text</p>');
	});

	it('renders nested member tags (list-in-list, the MDX markdown shape)', async () => {
		const r = await RT.renderToStaticMarkup(mod.MemberNested, { c: { ul: 'ul', li: 'li' } });
		expect(r.html).toBe('<ul class="list"><li>a</li><li>b</li></ul>');
	});

	it('renders a `<{expr}/>` dynamic tag resolving to a string', async () => {
		const { html } = await RT.renderToString(mod.DynamicTag, { tag: 'button', label: 'go' });
		expect(html).toContain('<button id="d">go</button>');
	});

	it('serializes a void host tag without a closing tag', async () => {
		const r = await RT.renderToStaticMarkup(mod.VoidTag, { parts: { rule: 'hr' } });
		expect(r.html).toBe('<hr class="sep"/>');
	});

	it('drops key/ref/event props and keeps attrs (client parity)', async () => {
		const r = await RT.renderToStaticMarkup(mod.Filtered, {
			parts: { title: 'span' },
			ref: () => {},
			onClick: () => {},
		});
		expect(r.html).toBe('<span data-x="1">t</span>');
	});

	it('dispatches by RUNTIME kind: the same tag site renders a component when overridden', async () => {
		const asString = await RT.renderToStaticMarkup(mod.Overridable, { useFancy: false });
		expect(asString.html).toBe('<h1>Title</h1>');
		const asComp = await RT.renderToStaticMarkup(mod.Overridable, { useFancy: true });
		expect(asComp.html).toBe('<em class="fancy">Title</em>');
	});

	it('rejects an injection-unsafe tag string (React parity)', () => {
		expect(() =>
			RT.renderToString(mod.MemberSole, { parts: { title: 'h1><img onerror=x>' } }),
		).toThrow('Invalid tag');
	});
});

describe('SSR — member/dynamic tags resolving to host tag strings (template position)', () => {
	it('renders a member tag string inside a template body', async () => {
		const { html } = await RT.renderToString(mod.TemplateMember, { parts: { title: 'h2' } });
		// ONE block — the component site's own adoption range around the element.
		// The `__schildren$N` render fn's HTML inlines as the element's PLAIN
		// content (`<h2>hi</h2>`, the static-tag / client de-opt shape), NOT as a
		// nested component body (`<h2><!--[-->hi<!--]--></h2>`).
		expect(html).toContain('<section><!--[--><h2>hi</h2><!--]--></section>');
	});

	it('renders a dynamic tag string inside a template body (clean static markup)', async () => {
		const r = await RT.renderToStaticMarkup(mod.TemplateDynamic, { tag: 'strong' });
		expect(r.html).toBe('<div><strong>x</strong></div>');
	});

	it('keeps template holes inside a string tag hydratable (their own blocks, inline content)', async () => {
		const { html } = await RT.renderToString(mod.TemplateHole, {
			parts: { title: 'h3' },
			value: 42,
		});
		// The hole carries its own `<!--[-->…<!--]-->` (a renderable hole always
		// does); the element's static text stays plain.
		expect(html).toContain('<h3>n=<!--[-->42<!--]--></h3>');
	});

	it('keeps a COMPONENT child block-wrapped inside the inline content', async () => {
		const { html } = await RT.renderToString(mod.TemplateComponentChild, { tag: 'article' });
		// The children fn inlines, but a component inside it is still a hydration
		// boundary with its own block range.
		expect(html).toContain(
			'<div><!--[--><article><!--[--><b id="x">inner</b><!--]--></article><!--]--></div>',
		);
	});

	it('serializes a childless dynamic VOID tag self-closed', async () => {
		const { html } = await RT.renderToString(mod.TemplateVoid, { tag: 'hr' });
		expect(html).toContain('<div><!--[--><hr data-x="1"/><!--]--></div>');
	});

	it('drops event/ref props from a template-position string tag', async () => {
		const r = await RT.renderToStaticMarkup(mod.TemplateFiltered, {
			tag: 'button',
			tagRef: () => {},
			onPick: () => {},
		});
		expect(r.html).toBe('<div><button data-x="1">t</button></div>');
	});
});
