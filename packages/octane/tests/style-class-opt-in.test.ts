import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// RFC tsrx-org/RFCs#1: `apply` stamps a theme on every element of a scope;
// reading `theme.$class` is the selective form. A block whose `$class` is read
// anywhere in the module is a theme (every selector kept, `div.<hash>`), and
// only the elements that carry the class match its element selectors — a child
// component's elements included, when the class arrives through a prop.

const SOURCE = `
function Card({ parentClass }: { parentClass: string }) @{
	<>
		<style>.local { padding: 0; }</style>
		<article class={parentClass}>
			<h2 class={parentClass}>{'title'}</h2>
		</article>
	</>
}

export function App() @{
	const theme = <style>
		div { color: blue; }
		.card { color: red; }
	</style>;
	<>
		<Card parentClass={theme.$class} />
		<div class={theme.$class}>{'opted in'}</div>
		<div class={theme.card}>{'card'}</div>
		<p>{'untouched'}</p>
	</>
}
`;

const ID = 'style-class-opt-in.tsrx';
const COMPILE_OPTIONS = { hmr: false, dev: false };

function compiled(mode: 'client' | 'server'): string {
	return compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode }).code;
}

function injection(code: string, hash: string): string {
	const match = code.match(new RegExp(`injectStyle\\("${hash}",\\s*"((?:[^"\\\\]|\\\\.)*)"`));
	if (!match) throw new Error(`no injectStyle for ${hash}`);
	return match[1];
}

function hashes(code: string): { theme: string; local: string } {
	// The class map opens with `$class`; the child's block is the `.local` sheet.
	const theme = code.match(/'\$class': '(tsrx-[a-z0-9]+)', 'card':/i)![1];
	const local = code.match(/injectStyle\("(tsrx-[a-z0-9]+)", "\.local\./i)![1];
	expect(theme).not.toBe(local);
	return { theme, local };
}

function load(mode: 'client' | 'server') {
	return loadCompiledFixtureSource(SOURCE, { id: ID, mode, compileOptions: COMPILE_OPTIONS });
}

describe('$class opt-in — a block whose $class is read is a theme', () => {
	it.for(['client', 'server'] as const)(
		'[%s] keeps the element selector and stamps only the opted-in elements',
		(mode) => {
			const code = compiled(mode);
			const { theme, local } = hashes(code);
			// Nothing exports or applies `theme`; the `$class` reads alone keep
			// `div.<hash>` (an unapplied local block would prune it).
			const css = injection(code, theme);
			expect(css).toContain(`div.${theme} { color: blue; }`);
			expect(css).toContain(`.card.${theme} { color: red; }`);
			expect(css).not.toContain('(unused)');
			expect(code).toContain(`'card': '${theme} card'`);
			// The child stamps the passed class before its own scope hash.
			expect(code).toContain(`\`\${_$normalizeClass(parentClass)} ${local}\``);
			// The untouched sibling stays a static `<p>` with no class at all.
			expect(code).toContain('<p>');
			expect(code).not.toMatch(/<p\$\{|<p class/);
		},
	);

	it('client: the opted-in element reads theme.$class at runtime', () => {
		const code = compiled('client');
		expect(code).toContain('_$setClassAttrIfChanged(theme.$class,');
		expect(code).toContain('_$setClassAttrIfChanged(theme.card,');
		expect(code).toContain("Card, { 'parentClass': theme.$class }");
	});

	it('server: the theme is a lazily injecting map and the child uses ssrAttr', () => {
		const code = compiled('server');
		const { theme } = hashes(code);
		expect(code).toContain(`const theme = _$styleMap("${theme}",`);
		expect(code).toContain('_$ssrAttr("class", __sp0, "article"');
		expect(code).toContain('_$ssrAttr("class", __sp0, "h2"');
		expect(code).toContain('_$ssrComponent(__s, Card, { "parentClass": theme.$class })');
	});

	it('client: only the elements carrying $class pick up the theme rules', () => {
		const client = load('client');
		const { theme, local } = hashes(compiled('client'));
		const r = mount(client.App);
		const byText = (selector: string, text: string) => {
			const el = r.findAll(selector).find((node) => node.textContent === text);
			if (!el) throw new Error(`no <${selector}> with text ${JSON.stringify(text)}`);
			return el as HTMLElement;
		};

		const optedIn = byText('div', 'opted in');
		expect(optedIn.className).toBe(theme);
		expect(getComputedStyle(optedIn).color).toBe('rgb(0, 0, 255)');

		const card = byText('div', 'card');
		expect(card.className).toBe(`${theme} card`);
		expect(getComputedStyle(card).color).toBe('rgb(255, 0, 0)');

		const untouched = byText('p', 'untouched');
		expect(untouched.className).toBe('');
		expect(getComputedStyle(untouched).color).not.toBe('rgb(0, 0, 255)');

		const article = r.find('article');
		const heading = r.find('h2');
		expect(article.className).toBe(`${theme} ${local}`);
		expect(heading.className).toBe(`${theme} ${local}`);
		r.unmount();
	});

	it('server: renderToString injects the theme and classes the right elements only', async () => {
		const server = load('server');
		const { theme, local } = hashes(compiled('server'));
		const { html, css } = await ServerRuntime.renderToString(server.App, {});
		expect(css).toContain(`div.${theme} { color: blue; }`);
		expect(css).not.toContain('(unused)');
		expect(html).toContain(
			`<article class="${theme} ${local}"><h2 class="${theme} ${local}">title</h2></article>`,
		);
		expect(html).toContain(`<div class="${theme}">opted in</div>`);
		expect(html).toContain(`<div class="${theme} card">card</div>`);
		expect(html).toContain('<p>untouched</p>');
	});
});
