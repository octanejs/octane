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

function evalModule(mode: 'server' | 'client', rt: unknown): Record<string, any> {
	const src = mode === 'server' ? 'octane/server' : 'octane';
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'clsx-class.tsrx', { mode });
	code = code.replace(
		new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${src}['"];?`, 'g'),
		'const {$1} = __rt;',
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

	it('adopts a composed array class with no mismatch', async () => {
		const { html } = await ServerRT.renderToString(server.ArrayClass, { on: true });
		container.innerHTML = html;
		hydrateRoot(container, client.ArrayClass, { on: true });
		flushSync(() => {});
		expect(container.querySelector('div')!.className).toBe('a b c');
		const warned = errSpy.mock.calls.map((c) => String(c[0])).some((m) => m.includes('hydration'));
		expect(warned).toBe(false);
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
