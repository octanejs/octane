import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../src/index.js';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { DynStyle, StaticStyle } from './_fixtures/style-px.tsrx';

// React parity: numeric style-object values get `px` — except 0, custom props, and
// the unitless set. Verified at every apply site: dynamic (runtime), static (compile-
// time bake), and SSR — which must all agree so hydration doesn't mismatch.

describe('numeric style px — dynamic (runtime)', () => {
	it('appends px to a non-unitless numeric value', () => {
		const r = mount(DynStyle, { s: { width: 100 } });
		expect((r.find('#d') as HTMLElement).style.width).toBe('100px');
		r.unmount();
	});

	it('camelCase key hyphenates AND gets px', () => {
		const r = mount(DynStyle, { s: { fontSize: 12 } });
		expect((r.find('#d') as HTMLElement).style.getPropertyValue('font-size')).toBe('12px');
		r.unmount();
	});

	it('leaves unitless properties unitless (opacity, zIndex, lineHeight)', () => {
		const r = mount(DynStyle, { s: { opacity: 0.5, zIndex: 3, lineHeight: 2 } });
		const el = r.find('#d') as HTMLElement;
		// A wrongly-appended "0.5px" / "3px" would be rejected by CSSOM → empty string.
		expect(el.style.opacity).toBe('0.5');
		expect(el.style.zIndex).toBe('3');
		expect(el.style.lineHeight).toBe('2');
		r.unmount();
	});

	it('never adds px to a custom property (`--x`)', () => {
		const r = mount(DynStyle, { s: { '--gap': 8 } });
		expect((r.find('#d') as HTMLElement).style.getPropertyValue('--gap')).toBe('8');
		r.unmount();
	});

	it('leaves string values untouched', () => {
		const r = mount(DynStyle, { s: { width: '50%' } });
		expect((r.find('#d') as HTMLElement).style.width).toBe('50%');
		r.unmount();
	});
});

describe('numeric style px — static (compile-time bake)', () => {
	it('bakes the style attribute with px + unitless + kebab, matching the dynamic path', () => {
		const r = mount(StaticStyle);
		// Static object styles are serialized into the template `style="…"` attribute
		// in CSSOM shape (declarations TERMINATED with `;`) so a baked style is
		// byte-identical to the same style written through el.style.
		expect((r.find('#s') as HTMLElement).getAttribute('style')).toBe(
			'width: 100px; opacity: 0.5; line-height: 2; margin-top: 0; z-index: 3; background-color: red;',
		);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// SSR output + hydration parity.
// ---------------------------------------------------------------------------

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/style-px.tsrx');

function evalModule(mode: 'server' | 'client', rt: unknown): Record<string, any> {
	const src = mode === 'server' ? 'octane/server' : 'octane';
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'style-px.tsrx', { mode });
	code = code.replace(
		new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${src}['"];?`, 'g'),
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(rt, {});
}

describe('numeric style px — SSR', () => {
	const server = evalModule('server', ServerRT);

	it('serialises a dynamic object style with px / unitless / 0 / custom-prop rules', async () => {
		const { html } = await ServerRT.renderToString(server.DynStyle, {
			s: { width: 100, opacity: 0.5, marginTop: 0, zIndex: 5, fontSize: 12, '--gap': 8 },
		});
		expect(html).toContain('width:100px');
		expect(html).toContain('opacity:0.5');
		expect(html).toContain('margin-top:0;'); // 0 → no px
		expect(html).toContain('z-index:5'); // unitless
		expect(html).toContain('font-size:12px'); // camelCase → kebab + px
		expect(html).toContain('--gap:8'); // custom prop → no px
	});

	it('static object style serialises identically to the client bake', async () => {
		const { html } = await ServerRT.renderToString(server.StaticStyle, {});
		expect(html).toContain(
			'style="width: 100px; opacity: 0.5; line-height: 2; margin-top: 0; z-index: 3; background-color: red;"',
		);
	});
});

describe('numeric style px — hydration parity', () => {
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

	it('adopts a numeric object style with no mismatch', async () => {
		const style = { width: 100, opacity: 0.5, zIndex: 3 };
		const { html } = await ServerRT.renderToString(server.DynStyle, { s: style });
		container.innerHTML = html;
		hydrateRoot(container, client.DynStyle, { s: { ...style } });
		flushSync(() => {});
		expect((container.querySelector('#d') as HTMLElement).style.width).toBe('100px');
		const warned = errSpy.mock.calls.map((c) => String(c[0])).some((m) => m.includes('hydration'));
		expect(warned).toBe(false);
	});
});
