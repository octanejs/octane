/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'octane';
import createHydrator from '../src/client.js';

function Host(props: { footerNote?: unknown; socialLinks?: unknown }) {
	return createElement('div', { id: 'host' }, props.footerNote, props.socialLinks);
}

describe('client named-slot assignment', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('maps kebab/snake template keys to camelCase props via createHydrator', () => {
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		document.body.append(island);

		createHydrator(island)(
			Host,
			{},
			{
				'footer-note': '<p id="footer">footer</p>',
				social_links: '<nav id="social">links</nav>',
			},
			{ client: 'only' },
		);

		const footerSlot = island.querySelector('astro-slot[name="footerNote"]');
		const socialSlot = island.querySelector('astro-slot[name="socialLinks"]');
		expect(footerSlot).not.toBeNull();
		expect(socialSlot).not.toBeNull();
		expect(footerSlot?.querySelector('#footer')?.textContent).toBe('footer');
		expect(socialSlot?.querySelector('#social')?.textContent).toBe('links');
		expect(island.querySelector('astro-slot[name="footer-note"]')).toBeNull();
		expect(island.querySelector('astro-slot[name="social_links"]')).toBeNull();
	});

	it('wraps props.children in StaticHtml when the default slot is absent', () => {
		function WithChildren(props: { children?: unknown }) {
			return createElement('div', { id: 'host' }, props.children);
		}

		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		document.body.append(island);

		createHydrator(island)(
			WithChildren,
			{ children: '<strong id="from-props">from-props</strong>' },
			{},
			{ client: 'only' },
		);

		const slot = island.querySelector('astro-slot');
		expect(slot).not.toBeNull();
		expect(slot?.querySelector('#from-props')?.textContent).toBe('from-props');
	});
});
