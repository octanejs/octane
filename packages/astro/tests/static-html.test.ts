import { describe, it, expect } from 'vitest';
import { createElement, renderToString } from 'octane/server';
import { staticHtmlElement } from '../src/static-html.js';

describe('staticHtmlElement', () => {
	it('returns null for empty slot strings', () => {
		expect(staticHtmlElement(createElement, { value: null })).toBeNull();
		expect(staticHtmlElement(createElement, { value: '   ' })).toBeNull();
	});

	it('emits astro-slot with raw HTML for hydrating islands', () => {
		function SlotHost() {
			return staticHtmlElement(createElement, {
				value: '<em>from-astro</em>',
				hydrate: true,
			});
		}
		const { html } = renderToString(SlotHost);
		expect(html).toContain('<astro-slot>');
		expect(html).toContain('<em>from-astro</em>');
		expect(html).toContain('</astro-slot>');
	});

	it('emits astro-static-slot when hydrate is false', () => {
		function SlotHost() {
			return staticHtmlElement(createElement, {
				value: '<span>static</span>',
				name: 'footer',
				hydrate: false,
			});
		}
		const { html } = renderToString(SlotHost);
		expect(html).toContain('<astro-static-slot name="footer">');
		expect(html).toContain('<span>static</span>');
	});
});
