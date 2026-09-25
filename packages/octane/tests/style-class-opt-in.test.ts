import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { hasRuntimeValueArgument } from './_compiler-value-arguments.js';

// RFC tsrx-org/RFCs#1: `apply` stamps a theme on every element of a scope;
// reading `theme.$class` is the selective form. Assigned blocks keep every
// selector, and only the elements that carry the class match element selectors
// — a child component's elements included when the class arrives through a prop.

const SOURCE = `
function Card({ parentClass }: { parentClass: string }) @{
	<>
		<style>.local { padding: 0; }</style>
		<article class={['local', parentClass]}>
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

describe('$class opt-in — theme rules apply to class carriers', () => {
	it.for(['client', 'server'] as const)(
		'[%s] keeps the element selector and stamps only the opted-in elements',
		(mode) => {
			const code = compiled(mode);
			const { theme, local } = hashes(code);
			// Nothing exports or applies `theme`; its element rule still survives.
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
		expect(hasRuntimeValueArgument(code, 'theme.$class')).toBe(true);
		expect(hasRuntimeValueArgument(code, 'theme.card')).toBe(true);
		expect(code).toContain("Card, { 'parentClass': theme.$class }");
	});

	it('keeps local theme rules when $class is destructured', () => {
		const source = `export function Card() @{
	const theme = <style>div { color: rgb(11, 22, 33); }</style>;
	const { $class } = theme;
	<div class={$class}>{'themed'}</div>
}`;
		const id = 'destructured-theme.tsrx';
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: COMPILE_OPTIONS,
		});
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: COMPILE_OPTIONS,
		});
		const mounted = mount(client.Card);
		const div = mounted.find('div');
		const themeClass = div.className;
		expect(themeClass).toMatch(/^tsrx-[0-9a-f]+$/);
		expect(getComputedStyle(div).color).toBe('rgb(11, 22, 33)');
		const { html, css } = ServerRuntime.renderToString(server.Card, {});
		expect(html).toContain(`<div class="${themeClass}">themed</div>`);
		expect(css).toContain(`div.${themeClass} { color: rgb(11, 22, 33); }`);
		mounted.unmount();
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
		// The article keeps its own `local` class ahead of the passed theme
		// class and its scope hash; the heading carries only what it was given.
		expect(article.className).toBe(`local ${theme} ${local}`);
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
			`<article class="local ${theme} ${local}"><h2 class="${theme} ${local}">title</h2></article>`,
		);
		expect(html).toContain(`<div class="${theme}">opted in</div>`);
		expect(html).toContain(`<div class="${theme} card">card</div>`);
		expect(html).toContain('<p>untouched</p>');
	});
});

const NESTED_STYLE_SOURCE = `
export function Nested(props) @{
	<>
		<style>.a { color: red; } .b { color: blue; } .c { color: green; }</style>
		<i class={[style('a'), props.cond && style('b')]}>{'i'}</i>
		<b class={props.on ? style('a') : 'plain'}>{'b'}</b>
		<u class={\`\${style('a')} \${props.more}\`}>{'u'}</u>
		<s class={(style('c') as string)}>{'s'}</s>
	</>
}`;

for (const mode of ['client', 'server'] as const) {
	for (const dev of [true, false]) {
		it(`${mode} (${dev ? 'development' : 'production'}): nested style expressions stamp each element once`, () => {
			const module = loadCompiledFixtureSource(NESTED_STYLE_SOURCE, {
				id: 'nested-style-class.tsrx',
				mode,
				compileOptions: { dev, hmr: false },
			});
			for (const on of [false, true]) {
				const props = { on, cond: on, more: on ? 'extra' : '' };
				const mounted = mode === 'client' ? mount(module.Nested, props) : null;
				const rendered =
					mode === 'server' ? ServerRuntime.renderToString(module.Nested, props) : null;
				const container = mounted?.container ?? document.createElement('div');
				if (rendered !== null) container.innerHTML = rendered.html;
				try {
					const elements = [...container.querySelectorAll('i, b, u, s')];
					const classes = elements.map((element) => element.className.trim().split(/\s+/));
					const scope = classes[0].find((token) => token.startsWith('tsrx-'));
					expect(scope).toBeDefined();
					expect(classes).toEqual([
						on ? ['a', 'b', scope] : ['a', scope],
						[on ? 'a' : 'plain', scope],
						on ? ['a', 'extra', scope] : ['a', scope],
						[scope, 'c'],
					]);
					if (rendered !== null) {
						expect(rendered.css).toContain(`.a.${scope}`);
						expect(rendered.css).toContain(`.b.${scope}`);
						expect(rendered.css).toContain(`.c.${scope}`);
					} else {
						expect(getComputedStyle(elements[0]).color).toBe(
							on ? 'rgb(0, 0, 255)' : 'rgb(255, 0, 0)',
						);
					}
				} finally {
					mounted?.unmount();
				}
			}
		});
	}
}
