import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../src/index.js';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync, normalizeClass } from '../src/index.js';
import {
	ArrayClass,
	ObjectClass,
	NestedClass,
	ClassNameArray,
	SpreadClass,
	ExplicitThenSpreadClass,
	SpreadThenExplicitClass,
	MultipleClassSpreads,
	SvgClass,
	Toggling,
	ScopedArray,
	ScopedNullish,
} from './_fixtures/clsx-class.tsrx';

// clsx-style `class` / `className` composition (strings, numbers, arrays, objects, and
// any nesting). Intentional divergence from React, which coerces an array className to a
// comma-joined string. The runtime helper is verified against the exact clsx algorithm.

describe('normalizeClass — clsx semantics', () => {
	it('passes strings through and stringifies truthy numbers', () => {
		expect(normalizeClass('a b')).toBe('a b');
		expect(normalizeClass(5)).toBe('5');
		expect(normalizeClass(0)).toBe('');
		expect(normalizeClass('0')).toBe('0');
	});

	it('drops nullish / boolean / empty', () => {
		expect(normalizeClass(null)).toBe('');
		expect(normalizeClass(undefined)).toBe('');
		expect(normalizeClass(false)).toBe('');
		expect(normalizeClass(true)).toBe('');
		expect(normalizeClass('')).toBe('');
		expect(normalizeClass([])).toBe('');
		expect(normalizeClass({})).toBe('');
	});

	it('composes arrays (falsy entries drop out)', () => {
		expect(normalizeClass(['a', false && 'b', 'c'])).toBe('a c');
		expect(normalizeClass(['a', 0 && 'z', 'b'])).toBe('a b');
		expect(normalizeClass([null, undefined, '', 'keep'])).toBe('keep');
	});

	it('composes objects (truthy keys, in order)', () => {
		expect(normalizeClass({ a: true, b: false, c: 1 })).toBe('a c');
		expect(normalizeClass({ active: true, disabled: 0 })).toBe('active');
	});

	it('composes deep nesting', () => {
		expect(normalizeClass(['a', { b: true, c: false }, ['d', ['e']]])).toBe('a b d e');
		expect(normalizeClass(['btn', { active: true, disabled: 0 }, ['extra']])).toBe(
			'btn active extra',
		);
	});
});

describe('clsx class composition — client mount', () => {
	it('array class — falsy entries drop out', () => {
		const on = mount(ArrayClass, { on: true });
		expect(on.find('div').className).toBe('a b c');
		on.unmount();
		const off = mount(ArrayClass, { on: false });
		expect(off.find('div').className).toBe('a c');
		off.unmount();
	});

	it('object class — truthy keys only', () => {
		const r = mount(ObjectClass, { active: true, disabled: false });
		expect(r.find('div').className).toBe('active');
		r.unmount();
		const r2 = mount(ObjectClass, { active: true, disabled: true });
		expect(r2.find('div').className).toBe('active disabled');
		r2.unmount();
	});

	it('nested mix of string + object + array', () => {
		const r = mount(NestedClass, { active: true, size: 'lg' });
		expect(r.find('div').className).toBe('btn active lg end');
		r.unmount();
		const r2 = mount(NestedClass, { active: false, size: 'sm' });
		expect(r2.find('div').className).toBe('btn sm end');
		r2.unmount();
	});

	it('className alias composes identically', () => {
		const r = mount(ClassNameArray, { y: true });
		expect(r.find('div').className).toBe('x y');
		r.unmount();
	});

	it('spread-supplied array class composes', () => {
		const r = mount(SpreadClass, { class: ['a', false, 'c'], id: 'sp' });
		const div = r.find('div');
		expect(div.className).toBe('a c');
		expect(div.getAttribute('id')).toBe('sp');
		r.unmount();
	});

	it('a later spread supplies the final composed class', () => {
		const r = mount(ExplicitThenSpreadClass, {
			href: '/story',
			attrs: { className: ['spread', { active: true }], 'data-style-src': 'title-link' },
		});
		const anchor = r.find('a');
		expect(anchor.className).toBe('spread active');
		expect(anchor.getAttribute('href')).toBe('/story');
		expect(anchor.getAttribute('data-style-src')).toBe('title-link');
		r.unmount();
	});

	it('a later explicit binding supplies the final composed class', () => {
		const r = mount(SpreadThenExplicitClass, {
			attrs: { className: ['spread', { active: true }], 'data-first': 'one' },
			cls: ['final', { selected: true }],
		});
		const div = r.find('div');
		expect(div.className).toBe('final selected');
		expect(div.getAttribute('data-first')).toBe('one');
		r.unmount();
	});

	it('the final of multiple class spreads owns the composed class', () => {
		const r = mount(MultipleClassSpreads, {
			base: 'base',
			first: { className: 'first', 'data-first': 'one' },
			second: { class: ['last', { active: true }], 'data-second': 'two' },
		});
		const div = r.find('div');
		expect(div.className).toBe('last active');
		expect(div.getAttribute('data-first')).toBe('one');
		expect(div.getAttribute('data-own')).toBe('own');
		expect(div.getAttribute('data-second')).toBe('two');
		r.unmount();
	});

	it('SVG element (read-only className) composes via setAttribute', () => {
		const r = mount(SvgClass, { on: true });
		// SVGElement.className is an SVGAnimatedString — read the attribute directly.
		expect(r.find('svg').getAttribute('class')).toBe('a b');
		r.unmount();
	});

	it('recomposes across updates', () => {
		const r = mount(Toggling);
		expect(r.find('#btn').className).toBe('btn');
		r.click('#btn');
		expect(r.find('#btn').className).toBe('btn on');
		r.click('#btn');
		expect(r.find('#btn').className).toBe('btn');
		r.unmount();
	});

	it('scoped component composes the array AND appends the scope hash', () => {
		const r = mount(ScopedArray, { on: true });
		const cls = r.find('div').className;
		// e.g. "a b tsrx-<hash>" — the composed classes precede the scope hash.
		expect(cls).toMatch(/^a b tsrx-[0-9a-f]+$/);
		r.unmount();
		const r2 = mount(ScopedArray, { on: false });
		expect(r2.find('div').className).toMatch(/^a tsrx-[0-9a-f]+$/);
		r2.unmount();
	});

	it('scoped component with a nullish class renders only the hash (never "undefined")', () => {
		const r = mount(ScopedNullish, { cls: undefined });
		const cls = r.find('div').className;
		expect(cls).not.toContain('undefined');
		expect(cls.trim()).toMatch(/^tsrx-[0-9a-f]+$/);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// SSR output + hydration parity. The server serialises the SAME composed class the
// client writes, so hydrating over server HTML produces no mismatch.
// ---------------------------------------------------------------------------

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/clsx-class.tsrx');
const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function evalModule(mode: 'server' | 'client', rt: unknown): Record<string, any> {
	const src = mode === 'server' ? 'octane/server' : 'octane';
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'clsx-class.tsrx', {
		mode,
		dev: mode === 'client' && !PROD_COMPILE,
	});
	code = code.replace(
		new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${src}['"];?`, 'g'),
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(rt, {});
}

describe('clsx class composition — SSR output', () => {
	const server = evalModule('server', ServerRT);

	it('serialises an array class', async () => {
		const { html } = await ServerRT.renderToString(server.ArrayClass, { on: true });
		expect(html).toContain('class="a b c"');
	});

	it('serialises an object class', async () => {
		const { html } = await ServerRT.renderToString(server.ObjectClass, {
			active: true,
			disabled: false,
		});
		expect(html).toContain('class="active"');
	});

	it('serialises one effective class when a spread follows an explicit class', async () => {
		const { html } = await ServerRT.renderToString(server.ExplicitThenSpreadClass, {
			href: '/story',
			attrs: { className: ['spread', { active: true }], 'data-style-src': 'title-link' },
		});
		expect(html).toBe('<a href="/story" class="spread active" data-style-src="title-link">x</a>');
	});

	it('serialises one effective class at its authored position after a spread', async () => {
		const { html } = await ServerRT.renderToString(server.SpreadThenExplicitClass, {
			attrs: { className: ['spread', { active: true }], 'data-first': 'one' },
			cls: ['final', { selected: true }],
		});
		expect(html).toBe('<div data-first="one" class="final selected">x</div>');
	});

	it('serialises one final class across multiple spreads', async () => {
		const { html } = await ServerRT.renderToString(server.MultipleClassSpreads, {
			base: 'base',
			first: { className: 'first', 'data-first': 'one' },
			second: { class: ['last', { active: true }], 'data-second': 'two' },
		});
		expect(html).toBe(
			'<div class="last active" data-first="one" data-own="own" data-second="two">x</div>',
		);
	});

	it('serialises a scoped array class with the hash appended', async () => {
		const { html } = await ServerRT.renderToString(server.ScopedArray, { on: true });
		expect(html).toMatch(/class="a b tsrx-[0-9a-f]+"/);
	});

	it('scoped nullish class serialises without the literal "undefined"', async () => {
		const { html } = await ServerRT.renderToString(server.ScopedNullish, { cls: undefined });
		expect(html).not.toContain('undefined');
		expect(html).toMatch(/class="\s*tsrx-[0-9a-f]+"/);
	});
});

describe('clsx class composition — hydration parity', () => {
	const server = evalModule('server', ServerRT);
	const client = evalModule('client', ClientRT);
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	async function hydrateClassCase(
		serverComponent: any,
		clientComponent: any,
		props: Record<string, unknown>,
		selector: string,
		expectedClass: string,
	): Promise<Element> {
		const { html } = await ServerRT.renderToString(serverComponent, props);
		container.innerHTML = html;
		const serverElement = container.querySelector(selector)!;
		expect(serverElement.getAttribute('class')).toBe(expectedClass);

		// A matching hydration must not briefly replay an earlier class writer. That
		// intermediate mutation is observable to application MutationObservers even
		// when the final DOM and server HTML are byte-equal.
		const observer = new MutationObserver(() => {});
		observer.observe(serverElement, {
			attributes: true,
			attributeFilter: ['class'],
			attributeOldValue: true,
		});

		hydrateRoot(container, clientComponent, props);
		flushSync(() => {});
		const classMutations = observer.takeRecords();
		observer.disconnect();

		const warned = errSpy.mock.calls.map((c) => String(c[0])).some((m) => m.includes('hydration'));
		expect(warned).toBe(false);
		expect(container.querySelector(selector)).toBe(serverElement);
		expect(serverElement.getAttribute('class')).toBe(expectedClass);
		expect(classMutations).toHaveLength(0);
		return serverElement;
	}

	async function hydrateStaticFallbackMismatch(
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
		expectedServerClass: string,
		tamperedClass?: string,
	): Promise<Element> {
		const { html } = await ServerRT.renderToString(server.ExplicitThenSpreadClass, serverProps);
		container.innerHTML = html;
		const serverAnchor = container.querySelector('a')!;
		expect(serverAnchor.getAttribute('class')).toBe(expectedServerClass);
		if (tamperedClass !== undefined) serverAnchor.setAttribute('class', tamperedClass);

		const observer = new MutationObserver(() => {});
		observer.observe(serverAnchor, {
			attributes: true,
			attributeFilter: ['class'],
			attributeOldValue: true,
		});

		hydrateRoot(container, client.ExplicitThenSpreadClass, clientProps);
		flushSync(() => {});
		const classMutations = observer.takeRecords();
		observer.disconnect();

		const warnings = errSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((m) => m.includes('hydration'));
		expect(warnings).toHaveLength(PROD_COMPILE ? 0 : 1);
		expect(container.querySelector('a')).toBe(serverAnchor);
		expect(serverAnchor.getAttribute('class')).toBe('story-title');
		expect(classMutations).toHaveLength(1);
		return serverAnchor;
	}

	it('adopts a composed array class with no mismatch', async () => {
		const { html } = await ServerRT.renderToString(server.ArrayClass, { on: true });
		container.innerHTML = html;
		hydrateRoot(container, client.ArrayClass, { on: true });
		flushSync(() => {});
		expect(container.querySelector('div')!.className).toBe('a b c');
		const warned = errSpy.mock.calls.map((c) => String(c[0])).some((m) => m.includes('hydration'));
		expect(warned).toBe(false);
	});

	it('adopts the effective class when a spread follows an explicit class', async () => {
		const props = {
			href: '/story',
			attrs: { className: ['spread', { active: true }], 'data-style-src': 'title-link' },
		};
		const serverAnchor = await hydrateClassCase(
			server.ExplicitThenSpreadClass,
			client.ExplicitThenSpreadClass,
			props,
			'a',
			'spread active',
		);
		expect(serverAnchor.getAttribute('href')).toBe('/story');
		expect(serverAnchor.getAttribute('data-style-src')).toBe('title-link');
	});

	it('adopts the static class fallback when a spread omits class', async () => {
		const props = {
			href: '/story',
			attrs: { 'data-style-src': 'title-link' },
		};
		const serverAnchor = await hydrateClassCase(
			server.ExplicitThenSpreadClass,
			client.ExplicitThenSpreadClass,
			props,
			'a',
			'story-title',
		);
		expect(serverAnchor.getAttribute('data-style-src')).toBe('title-link');
	});

	it('warns and restores the static class when the client spread removes server class', async () => {
		const serverProps = {
			href: '/story',
			attrs: { className: ['spread', { active: true }], 'data-style-src': 'title-link' },
		};
		const clientProps = {
			href: '/story',
			attrs: { 'data-style-src': 'title-link' },
		};
		const serverAnchor = await hydrateStaticFallbackMismatch(
			serverProps,
			clientProps,
			'spread active',
		);
		expect(serverAnchor.getAttribute('data-style-src')).toBe('title-link');
	});

	it('warns and restores the static class when matching server markup was tampered', async () => {
		const props = {
			href: '/story',
			attrs: { 'data-style-src': 'title-link' },
		};
		await hydrateStaticFallbackMismatch(props, props, 'story-title', 'tampered');
	});

	it('adopts the effective class when an explicit class follows a spread', async () => {
		const props = {
			attrs: { className: ['spread', { active: true }], 'data-first': 'one' },
			cls: ['final', { selected: true }],
		};
		const serverDiv = await hydrateClassCase(
			server.SpreadThenExplicitClass,
			client.SpreadThenExplicitClass,
			props,
			'div',
			'final selected',
		);
		expect(serverDiv.getAttribute('data-first')).toBe('one');
	});

	it('adopts one effective class across multiple spreads', async () => {
		const props = {
			base: 'base',
			first: { className: 'first', 'data-first': 'one' },
			second: { class: ['last', { active: true }], 'data-second': 'two' },
		};
		const serverDiv = await hydrateClassCase(
			server.MultipleClassSpreads,
			client.MultipleClassSpreads,
			props,
			'div',
			'last active',
		);
		expect(serverDiv.getAttribute('data-first')).toBe('one');
		expect(serverDiv.getAttribute('data-own')).toBe('own');
		expect(serverDiv.getAttribute('data-second')).toBe('two');
	});

	it('adopts a scoped composed class with no mismatch', async () => {
		const { html } = await ServerRT.renderToString(server.ScopedArray, { on: false });
		container.innerHTML = html;
		hydrateRoot(container, client.ScopedArray, { on: false });
		flushSync(() => {});
		expect(container.querySelector('div')!.className).toMatch(/^a tsrx-[0-9a-f]+$/);
		const warned = errSpy.mock.calls.map((c) => String(c[0])).some((m) => m.includes('hydration'));
		expect(warned).toBe(false);
	});
});
