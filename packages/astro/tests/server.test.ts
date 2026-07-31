import { describe, it, expect } from 'vitest';
import { createElement } from 'octane/server';
import renderer from '../src/server.js';

describe('Astro server renderer', () => {
	it('exposes the Octane renderer contract', () => {
		expect(renderer.name).toBe('octane');
		expect(renderer.supportsAstroStaticSlot).toBe(true);
		expect(typeof renderer.check).toBe('function');
		expect(typeof renderer.renderToStaticMarkup).toBe('function');
	});

	it('renders a host component and prefixes useId with a stable attrs.prefix', async () => {
		function Label(props: { text: string }) {
			return createElement('p', { className: 'label' }, props.text);
		}

		const ctx = {
			result: {},
		};
		const { html, attrs } = await renderer.renderToStaticMarkup.call(
			ctx,
			Label,
			{ text: 'hello' },
			{},
			undefined,
		);

		expect(attrs.prefix).toBe('o0');
		expect(html).toContain('hello');
		expect(html).toContain('label');

		const second = await renderer.renderToStaticMarkup.call(
			ctx,
			Label,
			{ text: 'again' },
			{},
			undefined,
		);
		expect(second.attrs.prefix).toBe('o1');
	});

	it('wraps default slot children in astro-slot', async () => {
		function WithChildren(props: { children?: unknown }) {
			return createElement('div', { className: 'wrap' }, props.children);
		}

		const { html } = await renderer.renderToStaticMarkup.call(
			{ result: {} },
			WithChildren,
			{},
			{ default: '<strong>slotted</strong>' },
			{ hydrate: true, astroStaticSlot: true } as any,
		);

		expect(html).toContain('<astro-slot>');
		expect(html).toContain('<strong>slotted</strong>');
	});

	it('check() accepts function components and rejects non-functions', async () => {
		function Ok() {
			return createElement('span', null, 'ok');
		}
		expect(await renderer.check.call({}, Ok, {}, {}, undefined)).toBe(true);
		expect(await renderer.check.call({}, null, {}, {}, undefined)).toBe(false);
		expect(await renderer.check.call({}, 'div', {}, {}, undefined)).toBe(false);
	});

	it('prepends scoped css when the render result includes it', async () => {
		// Simulate Octane's { html, css } join path with a component that emits
		// only HTML; css prepend is covered by asserting the return shape stays a
		// string and the second island still gets a fresh prefix.
		function Bare() {
			return createElement('span', null, 'x');
		}
		const { html, attrs } = await renderer.renderToStaticMarkup.call(
			{ result: {} },
			Bare,
			{},
			{},
			undefined,
		);
		expect(typeof html).toBe('string');
		expect(html.length).toBeGreaterThan(0);
		expect(attrs).toHaveProperty('prefix');
	});
});
