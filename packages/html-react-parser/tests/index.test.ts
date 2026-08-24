import * as domhandler from 'domhandler';
import type { Element } from 'html-dom-parser';
import { createElement, isValidElement, type ElementDescriptor, type OctaneNode } from 'octane';
import { describe, expect, it } from 'vitest';

import * as HTMLReactParser from '../src/index';
import parse from '../src/index';
import { html, svg } from './data';
import { render } from './helpers';

function normalizeVoidTags(markup: string): string {
	return markup.replace(/<br\/?>/g, '<br>');
}

describe('module', function moduleSuite() {
	it('exports default', function defaultExport() {
		expect(parse).toBeInstanceOf(Function);
	});

	it.each(['default', 'attributesToProps', 'domToReact', 'htmlToDOM'] as const)(
		'exports %p',
		function namedExport(key) {
			expect(HTMLReactParser[key]).toBeInstanceOf(Function);
		},
	);

	it.each(['Comment', 'Element', 'ProcessingInstruction', 'Text'] as const)(
		'exports %s',
		function domhandlerExport(key) {
			expect(HTMLReactParser[key]).toBeInstanceOf(Function);
			expect(HTMLReactParser[key]).toBe(domhandler[key as keyof typeof domhandler]);
		},
	);
});

describe('HTMLReactParser', function parserSuite() {
	// Per packages/html-react-parser/upstream/__tests__/index.test.tsx
	it.each([undefined, null, {}, [], true, false, 0, 1, function noop() {}, new Date()])(
		'throws error for value: %p',
		function throws(value) {
			expect(function parseInvalid() {
				parse(value as string);
			}).toThrow(TypeError);
		},
	);

	it('parses empty string to empty array', function empty() {
		expect(parse('')).toEqual([]);
	});

	it.each(['a', 'text'])('parses string', function parsesText(text) {
		expect(parse(text)).toBe(text);
	});

	it.each(['\n', '\r', '\n\r', 'foo\nbar', 'foo\rbar', 'foo\n\rbar\r'])(
		'parses string with newlines %p',
		function parsesNewlines(text) {
			expect(parse(text)).toBe(text);
		},
	);

	it.each([
		'\n<br>',
		'<br>\r',
		'\n<br>\r',
		'<p>foo\nbar\r</p>',
		'<p>foo</p>\rbar',
		'foo<p>\n\rbar</p>\r',
	])('parses HTML with newlines', function parsesHtmlWithNewlines(source) {
		// OCTANE DIVERGENCE: Octane serializes void tags as <br/> rather than <br>.
		expect(normalizeVoidTags(render(parse(source) as OctaneNode))).toBe(normalizeVoidTags(source));
	});

	it('parses single HTML element', function single() {
		expect(render(parse(html.single))).toBe('<p>foo</p>');
	});

	it('parses single HTML element with comment', function withComment() {
		expect(render(parse(html.single + html.comment))).toBe('<p>foo</p>');
	});

	it('parses multiple HTML elements', function multiple() {
		expect(render(parse(html.multiple))).toBe('<p>foo</p><p>bar</p>');
	});

	it('parses complex HTML with doctype', function complex() {
		const output = render(parse(html.doctype + html.complex));
		expect(output).toContain('<html>');
		expect(output).toContain('<header id="header">Header</header>');
		expect(output).toContain('<script>alert();</script>');
	});

	it('parses empty <script>', function emptyScript() {
		expect(render(parse('<script></script>'))).toBe('<script></script>');
	});

	it('parses empty <style>', function emptyStyle() {
		expect(render(parse('<style></style>'))).toBe('<style></style>');
	});

	it('parses form', function form() {
		const output = render(parse(html.form));
		expect(output).toContain('<input');
		expect(output).toContain('type="text"');
		expect(output).toContain('value="foo"');
		expect(output).toContain('checked');
	});

	it('parses list', function list() {
		expect(render(parse(html.list))).toBe('<ol><li>One</li><li value="2">Two</li></ol>');
	});

	it('parses template', function template() {
		expect(render(parse(html.template))).toBe(
			'<template><article><p>Test</p></article></template>',
		);
	});

	it('parses SVG', function parsesSvg() {
		const output = render(parse(svg.complex));
		expect(output).toContain('<svg height="400" width="450">');
		expect(output).toContain('stroke-width="3"');
		expect(output).toContain('Your browser does not support inline SVG.');
	});

	it('decodes HTML entities', function entities() {
		const encodedEntities = 'asdf &amp; &yuml; &uuml; &apos;';
		const decodedEntities = "asdf & ÿ ü '";
		const element = parse('<i>' + encodedEntities + '</i>') as ElementDescriptor<{
			children: string;
		}>;
		expect(element.props.children).toBe(decodedEntities);
	});

	it('escapes tags inside of <title>', function title() {
		expect(render(parse(html.title))).toBe('<title>&lt;em&gt;text&lt;/em&gt;</title>');
	});
});

describe('replace option', function replaceOption() {
	it('provides DOM elements that are instances of the exported Element', function instances() {
		const checks: boolean[] = [];

		parse('<p>Hello <strong>world</strong></p><br />', {
			replace(domNode) {
				if (domNode instanceof HTMLReactParser.Element && domNode.name === 'p') {
					const [text, strong] = domNode.children;
					checks.push(domhandler.isText(text));
					checks.push(strong instanceof HTMLReactParser.Element);
					checks.push(domNode.next instanceof HTMLReactParser.Element);
				}
			},
		});

		expect(checks).toEqual([true, true, true]);
	});

	it('replaces the element if a valid React element is returned', function valid() {
		const output = render(
			parse(html.complex, {
				replace(domNode) {
					if ((domNode as Element).name === 'title') {
						return createElement('title', null, 'Replaced Title');
					}
				},
			}),
		);
		expect(output).toContain('<title>Replaced Title</title>');
		expect(output).not.toContain('<title>Title</title>');
	});

	it('does not replace the element if an invalid React element is returned', function invalid() {
		const output = render(
			parse(html.complex, {
				replace(domNode) {
					if ((domNode as Element).attribs?.id === 'header') {
						return { type: 'h1', props: { children: 'Heading' } };
					}
				},
			}),
		);
		expect(output).toContain('<header id="header">Header</header>');
		expect(output).not.toContain('<h1>Heading</h1>');
	});
});

describe('library option', function libraryOption() {
	it('converts with Preact instead of React', function alternateLibrary() {
		type AlternateElement = ElementDescriptor & { alternate: true };
		const library = {
			createElement(type: unknown, props?: object, ...children: unknown[]): AlternateElement {
				return {
					alternate: true,
					type,
					props: {
						...props,
						children: children.length === 1 ? children[0] : children,
					},
				} as unknown as AlternateElement;
			},
			cloneElement(
				element: ElementDescriptor,
				props?: object,
				...children: unknown[]
			): AlternateElement {
				return library.createElement(
					element.type,
					{ ...element.props, ...props },
					...(children.length ? children : [element.props.children]),
				);
			},
			isValidElement(value: unknown): value is AlternateElement {
				return Boolean(
					value && typeof value === 'object' && 'alternate' in value && value.alternate === true,
				);
			},
		};

		const parsedElement = parse(html.single, { library });
		expect(isValidElement(parsedElement)).toBe(false);
		expect(library.isValidElement(parsedElement)).toBe(true);
		expect(parsedElement).toEqual(library.createElement('p', {}, 'foo'));
	});
});

describe('htmlparser2 option', function htmlparser2Option() {
	it('parses XHTML with xmlMode enabled', function xhtml() {
		const options = { htmlparser2: { xmlMode: true } };
		expect(render(parse('<ul><li/><li/></ul>', options))).toBe('<ul><li></li><li></li></ul>');
	});
});

describe('invalid styles', function invalidStyles() {
	it('copes with invalid styles', function invalidStyle() {
		expect(render(parse('<p style="font - size: 1em">X</p>'))).toBe('<p>X</p>');
	});
});
