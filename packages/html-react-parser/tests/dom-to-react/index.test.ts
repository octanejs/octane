import htmlToDOM from 'html-dom-parser';
import { cloneElement, createElement, isValidElement, type ElementDescriptor } from 'octane';
import { describe, expect, it } from 'vitest';

import { type DOMNode, Element, type HTMLReactParserOptions } from '../../src/index';
import domToReact from '../../src/dom-to-react';
import { html, svg } from '../data';
import { render } from '../helpers';

describe('domToReact', function domToReactSuite() {
	it.each([
		['comment', html.comment],
		['doctype', html.doctype],
	])('skips %s', function skips(_type, value) {
		expect(domToReact(htmlToDOM(value))).toEqual([]);
	});

	it('converts "text" to "text"', function text() {
		expect(domToReact(htmlToDOM('text'))).toBe('text');
	});

	it('converts single DOM node to React', function single() {
		expect(domToReact(htmlToDOM(html.single))).toEqual(createElement('p', {}, 'foo'));
	});

	it('converts multiple DOM nodes to React', function multiple() {
		const elements = domToReact(htmlToDOM(html.multiple)) as ElementDescriptor[];
		elements.forEach(function assertKey(element, index) {
			expect(element.key).toBe(String(index));
		});
		expect(render(elements)).toBe('<p>foo</p><p>bar</p>');
	});

	it('converts <textarea> correctly', function textarea() {
		const element = domToReact(htmlToDOM(html.textarea)) as ElementDescriptor;
		expect(element.props).toMatchObject({ defaultValue: 'foo' });
		expect(element.props.children).toBeUndefined();
		expect(render(element)).toBe('<textarea>foo</textarea>');
	});

	it('does not escape <script> content', function script() {
		const element = domToReact(htmlToDOM(html.script)) as ElementDescriptor;
		expect(element.props.dangerouslySetInnerHTML).toEqual({
			__html: 'alert(1 < 2);',
		});
		expect(render(element)).toBe('<script>alert(1 < 2);</script>');
	});

	it('does not escape <style> content', function style() {
		const element = domToReact(htmlToDOM(html.style)) as ElementDescriptor;
		expect(element.props.dangerouslySetInnerHTML).toEqual({
			__html: 'body > .foo { color: #f00; }',
		});
		expect(render(element)).toBe('<style>body > .foo { color: #f00; }</style>');
	});

	it('does not have `children` for void elements', function voidChildren() {
		const element = domToReact(htmlToDOM(html.img)) as ElementDescriptor;
		expect(element.props.children).toBeUndefined();
	});

	it('does not throw an error for void elements', function voidElements() {
		expect(function renderVoidElements() {
			render(createElement('div', null, domToReact(htmlToDOM(html.void))));
		}).not.toThrow();
	});

	it('skips doctype and comments', function skipsNonElements() {
		const elements = domToReact(
			htmlToDOM(html.doctype + html.single + html.comment + html.single),
		) as ElementDescriptor[];
		expect(elements).toHaveLength(2);
		expect(elements[0].key).toBe('1');
		expect(elements[1].key).toBe('3');
		expect(render(elements)).toBe('<p>foo</p><p>foo</p>');
	});

	it('converts SVG element with viewBox attribute', function svgViewBox() {
		const element = domToReact(
			htmlToDOM(svg.simple, { lowerCaseAttributeNames: false }),
		) as ElementDescriptor;
		expect(element.props).toMatchObject({ id: 'foo', viewBox: '0 0 512 512' });
		expect(render(element)).toBe('<svg viewBox="0 0 512 512" id="foo">Inner</svg>');
	});

	it('converts custom element with attributes', function customElement() {
		const element = domToReact(htmlToDOM(html.customElement)) as ElementDescriptor;
		expect(element.props).toMatchObject({
			class: 'myClass',
			'custom-attribute': 'value',
			style: { OTransition: 'all .5s', lineHeight: '1' },
		});
		const markup = render(element);
		expect(markup).toContain('custom-element');
		expect(markup).toContain('class="myClass"');
		expect(markup).toContain('custom-attribute="value"');
		// OCTANE DIVERGENCE: Octane serializes the style object through CSSOM, so
		// vendor prefixes and spacing may differ from React's snapshot
		// (`OTransition:all .5s;line-height:1`). The parsed style object above is
		// the parser contract.
		expect(markup).toMatch(/style="/);
		expect(markup).toMatch(/line-height:\s*1/);
		expect(markup.toLowerCase()).toMatch(/transition/);
	});

	it('converts LaTeX', function latex() {
		expect(render(domToReact(htmlToDOM(html.latex)))).toBe(html.latex);
	});
});

describe('library option', function libraryOption() {
	it('converts with React by default', function octaneDefault() {
		const element = domToReact(htmlToDOM(html.single));
		expect(isValidElement(element)).toBe(true);
		expect(element).toEqual(createElement('p', {}, 'foo'));
	});

	it('converts with Preact', function alternateLibrary() {
		const marker = Symbol('alternate');
		const library = {
			createElement(type: unknown, props?: object, ...children: unknown[]) {
				return {
					[marker]: true,
					type,
					props: {
						...props,
						children: children.length === 1 ? children[0] : children,
					},
				} as unknown as ElementDescriptor;
			},
			cloneElement(element: ElementDescriptor, props?: object, ...children: unknown[]) {
				return library.createElement(
					element.type,
					{ ...element.props, ...props },
					...(children.length ? children : [element.props.children]),
				);
			},
			isValidElement(value: unknown) {
				return Boolean(value && typeof value === 'object' && marker in value);
			},
		};

		const parsedElement = domToReact(htmlToDOM(html.single), { library });
		expect(isValidElement(parsedElement)).toBe(false);
		expect(library.isValidElement(parsedElement)).toBe(true);
		expect(parsedElement).toEqual(library.createElement('p', {}, 'foo'));
	});
});

describe('replace option', function replaceOption() {
	it.each([undefined, null, 0, 1, true, false, {}])(
		'does not replace for invalid return value %p',
		function invalidReturn(value) {
			const element = domToReact(htmlToDOM('<br>'), {
				replace: function replaceInvalid() {
					return value;
				},
			});
			expect(element).toEqual(createElement('br'));
		},
	);

	it('does not set key for a single node', function noSingleKey() {
		const element = domToReact(htmlToDOM(html.single), {
			replace: function replaceSingle() {
				return createElement('div');
			},
		}) as ElementDescriptor;
		expect(element.key).toBeNull();
	});

	it('does not modify keys if they are already set', function existingKeys() {
		const elements = domToReact(htmlToDOM(html.single + html.customElement), {
			replace(domNode) {
				const element = domNode as Element;
				if (element.name === 'p') {
					return createElement('p', null, 'replaced foo');
				}
				if (element.name === 'custom-element') {
					return createElement('custom-button', {
						key: 'myKey',
						class: 'myClass',
						'custom-attribute': 'replaced value',
					});
				}
			},
		}) as ElementDescriptor[];
		expect(elements[0].key).toBe('0');
		expect(elements[1].key).toBe('myKey');
	});

	it('replaces with children', function replaceChildren() {
		const options: HTMLReactParserOptions = {
			replace(domNode) {
				if (domNode instanceof Element) {
					return domToReact(domNode.children as DOMNode[], options);
				}
			},
		};
		const element = domToReact(htmlToDOM('<div>test</div>'), options);
		expect(element).toEqual(createElement('div', null, 'test'));
	});

	it('passes index as the 2nd argument', function indexArgument() {
		const elements = domToReact(htmlToDOM('<li>one</li><li>two</li>'), {
			replace(_domNode, index) {
				expect(typeof index).toBe('number');
			},
		});
		expect(elements).toHaveLength(2);
	});
});

describe('transform option', function transformOption() {
	it('can wrap all elements', function wrapsAll() {
		const element = domToReact(htmlToDOM(html.list), {
			transform(reactNode, _domNode, index) {
				return createElement('div', { key: index }, reactNode);
			},
		}) as ElementDescriptor;
		expect(element.key).toBe('0');
		const list = element.props.children as ElementDescriptor;
		const items = list.props.children as ElementDescriptor[];
		expect((items[0].props.children as ElementDescriptor).key).toBe('0');
		expect((items[1].props.children as ElementDescriptor).key).toBe('1');
		expect(render(element)).toBe(
			'<div><ol><div><li><div>One</div></li></div><div><li value="2"><div>Two</div></li></div></ol></div>',
		);
	});
});

describe('domToReact', function customAttributes() {
	describe('when React >=16', function modernAttributes() {
		it('preserves unknown attributes', function preserves() {
			const element = domToReact(htmlToDOM(html.customElement)) as ElementDescriptor;
			expect(element.props['custom-attribute']).toBe('value');
			expect(render(element)).toContain('custom-attribute="value"');
		});
	});
});
