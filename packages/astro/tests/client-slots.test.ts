import { describe, it, expect } from 'vitest';
import { createElement, renderToString } from 'octane/server';
import { slotName } from '../src/slot-name.js';
import { staticHtmlElement } from '../src/static-html.js';

/**
 * Mirrors the named-slot assignment loop in `client.js` so `client:only`
 * template keys (kebab/snake) become the same camelCase props SSR emits.
 */
function assignClientSlottedProps(slotted: Record<string, string>) {
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(slotted)) {
		const name = slotName(key);
		props[name] = staticHtmlElement(createElement, { value, name });
	}
	return props;
}

describe('client named-slot assignment', () => {
	it('maps kebab/snake template keys to camelCase props', () => {
		const props = assignClientSlottedProps({
			'footer-note': '<p>footer</p>',
			social_links: '<nav>links</nav>',
		});

		expect(props).toHaveProperty('footerNote');
		expect(props).toHaveProperty('socialLinks');
		expect(props).not.toHaveProperty('footer-note');
		expect(props).not.toHaveProperty('social_links');

		function Host(hostProps: { footerNote?: unknown; socialLinks?: unknown }) {
			return createElement('div', null, hostProps.footerNote, hostProps.socialLinks);
		}

		const { html } = renderToString(Host, props);
		expect(html).toContain('<astro-slot name="footerNote">');
		expect(html).toContain('<astro-slot name="socialLinks">');
	});
});
