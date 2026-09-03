import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { hydrateRoot, flushSync } from '../src/index.js';
import { DynStyle, StaticStyle, StaticStyleAliases } from './_fixtures/style-px.tsrx';

// React parity: numeric style-object values get `px` — except 0, custom props, and
// the unitless set. Verified at every apply site: dynamic (runtime), static (compile-
// time bake), and SSR — which must all agree so hydration doesn't mismatch.

describe('numeric style px — dynamic (runtime)', () => {
	it('supports numeric scale and the cssFloat property alias through updates', () => {
		const r = mount(DynStyle, { s: { scale: 1.5, cssFloat: 'left' } });
		const element = r.find('#d') as HTMLElement;
		expect(element.style.getPropertyValue('scale')).toBe('1.5');
		expect(element.style.cssFloat).toBe('left');
		r.update(DynStyle, { s: { scale: 2, cssFloat: 'right' } });
		expect(element.style.getPropertyValue('scale')).toBe('2');
		expect(element.style.cssFloat).toBe('right');
		r.update(DynStyle, { s: {} });
		expect(element.style.getPropertyValue('scale')).toBe('');
		expect(element.style.cssFloat).toBe('');
		r.unmount();
	});
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
	it('preserves scale and cssFloat in static style objects', () => {
		const r = mount(StaticStyleAliases);
		const element = r.find('#aliases') as HTMLElement;
		expect(element.style.cssFloat).toBe('left');
		expect(element.style.getPropertyValue('scale')).toBe('1.5');
		r.unmount();
	});
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

function evalModule(mode: 'server' | 'client'): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), { id: 'style-px.tsrx', mode });
}

describe('numeric style px — SSR', () => {
	const server = evalModule('server');
	it('serialises numeric scale and cssFloat for hydration', async () => {
		const { html } = await ServerRT.renderToString(server.DynStyle, {
			s: { scale: 1.5, cssFloat: 'left' },
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		const element = container.querySelector('#d') as HTMLElement;
		expect(element.style.getPropertyValue('scale')).toBe('1.5');
		expect(element.style.cssFloat).toBe('left');
		const root = hydrateRoot(container, DynStyle, { s: { scale: 1.5, cssFloat: 'left' } });
		expect(container.querySelector('#d')).toBe(element);
		expect(element.style.cssFloat).toBe('left');
		root.unmount();
	});

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
	const server = evalModule('server');
	const client = evalModule('client');
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
		const warned = errSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.some((m: string) => m.includes('hydration'));
		expect(warned).toBe(false);
	});
});
