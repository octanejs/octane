import { describe, it, expect } from 'vitest';
import { createElement, injectStyle } from 'octane/server';
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

	it('camelCases kebab and snake named slots into props and astro-slot names', async () => {
		function WithNamedSlots(props: { footerNote?: unknown; socialLinks?: unknown }) {
			return createElement('div', { className: 'panel' }, props.footerNote, props.socialLinks);
		}

		const { html } = await renderer.renderToStaticMarkup.call(
			{ result: {} },
			WithNamedSlots,
			{},
			{
				'footer-note': '<p>footer</p>',
				social_links: '<nav>links</nav>',
			},
			{ hydrate: true, astroStaticSlot: true } as any,
		);

		expect(html).toContain('<astro-slot name="footerNote">');
		expect(html).toContain('<astro-slot name="socialLinks">');
		expect(html).toContain('<p>footer</p>');
		expect(html).toContain('<nav>links</nav>');
		expect(html).not.toContain('name="footer-note"');
		expect(html).not.toContain('name="social_links"');
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
		function WithScopedStyle() {
			injectStyle('astro-test-hash', '.greeting{color:teal}');
			return createElement('span', { className: 'greeting' }, 'hi');
		}
		const { html } = await renderer.renderToStaticMarkup.call(
			{ result: {} },
			WithScopedStyle,
			{},
			{},
			undefined,
		);
		expect(html.startsWith('<style data-octane="astro-test-hash">')).toBe(true);
		expect(html).toContain('.greeting{color:teal}');
		expect(html).toContain('<span');
		expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<span'));
	});
});
