import type { Element, Root } from 'hast';
import { urlAttributes } from 'html-url-attributes';
import { defaultUrlTransform as reactDefaultUrlTransform } from 'react-markdown';
import { describe, expect, it, vi } from 'vitest';
import { transformTree } from '../../src/processor';
import { defaultUrlTransform } from '../../src/url-transform';

function root(element: Element): Root {
	return { type: 'root', children: [element] };
}

describe('the pinned URL oracle', () => {
	it.each([
		['relative/path', 'relative/path'],
		['/absolute/path', '/absolute/path'],
		['?q=x:y', '?q=x:y'],
		['#x:y', '#x:y'],
		['https://example.com', 'https://example.com'],
		['HTTP://example.com', 'HTTP://example.com'],
		['mailto:a@example.com', 'mailto:a@example.com'],
		['irc://example.com', 'irc://example.com'],
		['ircs://example.com', 'ircs://example.com'],
		['xmpp:a@example.com', 'xmpp:a@example.com'],
		['javascript:alert(1)', ''],
		['data:text/html,x', ''],
		[' javascript:alert(1)', ''],
		['java\nscript:alert(1)', ''],
	])('transforms %j to %j', (input, expected) => {
		expect(defaultUrlTransform(input)).toBe(expected);
		expect(defaultUrlTransform(input)).toBe(reactDefaultUrlTransform(input));
	});

	it('visits every applicable html-url-attributes property and no inapplicable pair', () => {
		for (const [property, tags] of Object.entries(urlAttributes)) {
			const applicableTag = tags?.[0] || 'div';
			const applicable: Element = {
				type: 'element',
				tagName: applicableTag,
				properties: { [property]: 'custom:value' },
				children: [],
			};
			const transform = vi.fn(() => 'seen');
			transformTree(root(applicable), { urlTransform: transform });
			expect(transform, `${property} on ${applicableTag}`).toHaveBeenCalledWith(
				'custom:value',
				property,
				applicable,
			);
			expect(applicable.properties[property]).toBe('seen');

			if (tags) {
				const inapplicable: Element = {
					type: 'element',
					tagName: '__not_an_html_tag__',
					properties: { [property]: 'untouched' },
					children: [],
				};
				transform.mockClear();
				transformTree(root(inapplicable), { urlTransform: transform });
				expect(transform, `${property} applicability`).not.toHaveBeenCalled();
				expect(inapplicable.properties[property]).toBe('untouched');
			}
		}
	});

	it('preserves null and undefined custom-transform returns', () => {
		for (const result of [null, undefined]) {
			const link: Element = {
				type: 'element',
				tagName: 'a',
				properties: { href: '/before' },
				children: [],
			};
			transformTree(root(link), { urlTransform: () => result });
			expect(link.properties.href).toBe(result);
		}
	});
});
