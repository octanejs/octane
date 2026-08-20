import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { createElement, isValidElement, type OctaneNode } from 'octane';
import { formatElements } from '../src/format.ts';

afterEach(cleanup);

function html(elements: OctaneNode) {
	return render(elements as Parameters<typeof render>[0]).container.innerHTML;
}

function withMockConsole(
	run: (mocked: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }) => void,
) {
	const error = vi.spyOn(console, 'error').mockImplementation(function noopError() {});
	const warn = vi.spyOn(console, 'warn').mockImplementation(function noopWarn() {});
	try {
		run({ error, warn });
	} finally {
		error.mockRestore();
		warn.mockRestore();
	}
}

describe('formatElements', function formatElementsSuite() {
	// Per packages/lingui/upstream/canonical/src/format.test.tsx
	it('should return string when there are no elements', function noElements() {
		expect(formatElements('')).toEqual('');
		expect(formatElements('Text only')).toEqual('Text only');
	});

	it('should format unpaired elements', function unpaired() {
		expect(html(formatElements('<0/>', { 0: createElement('br') }))).toEqual('<br>');
	});

	it('should format paired elements', function paired() {
		expect(html(formatElements('<0>Inner</0>', { 0: createElement('strong') }))).toEqual(
			'<strong>Inner</strong>',
		);

		expect(
			html(formatElements('Before <0>Inner</0> After', { 0: createElement('strong') })),
		).toEqual('Before <strong>Inner</strong> After');
	});

	it('should preserve element props', function preserveProps() {
		expect(
			html(formatElements('<0>About</0>', { 0: createElement('a', { href: '/about' }) })),
		).toEqual('<a href="/about">About</a>');
	});

	it('should preserve newlines', function preserveNewlines() {
		expect(html(formatElements('<0>Inn\ner</0>', { 0: createElement('strong') }))).toEqual(
			'<strong>Inn\ner</strong>',
		);

		expect(
			html(formatElements('Before <0>Inn\r\ner</0> After', { 0: createElement('strong') })),
		).toEqual('Before <strong>Inn\r\ner</strong> After');

		expect(
			html(formatElements('<0>Ab\rout</0>', { 0: createElement('a', { href: '/about' }) })),
		).toEqual('<a href="/about">Ab\rout</a>');
	});

	it('should preserve named element props', function namedProps() {
		expect(
			html(
				formatElements('<named>About</named>', { named: createElement('a', { href: '/about' }) }),
			),
		).toEqual('<a href="/about">About</a>');
	});

	it('should preserve nested named element props', function nestedNamed() {
		expect(
			html(
				formatElements('<named>About <b>us</b></named>', {
					named: createElement('a', { href: '/about' }),
					b: createElement('strong'),
				}),
			),
		).toEqual('<a href="/about">About <strong>us</strong></a>');
	});

	it('should format nested elements', function nested() {
		expect(
			html(
				formatElements('<0><1>Deep</1></0>', {
					0: createElement('a', { href: '/about' }),
					1: createElement('strong'),
				}),
			),
		).toEqual('<a href="/about"><strong>Deep</strong></a>');

		expect(
			html(
				formatElements('Before \n<0>Inside <1>\nNested</1>\n Between <2/> After</0>', {
					0: createElement('a', { href: '/about' }),
					1: createElement('strong'),
					2: createElement('br'),
				}),
			),
		).toEqual(
			'Before \n<a href="/about">Inside <strong>\nNested</strong>\n Between <br> After</a>',
		);
	});

	it('should ignore non existing element', function ignoreMissing() {
		withMockConsole(function assertMissing(consoleMock) {
			expect(html(formatElements('<0>First</0>'))).toEqual('First');
			expect(html(formatElements('<0>First</0>Second'))).toEqual('FirstSecond');
			expect(html(formatElements('First<0>Second</0>Third'))).toEqual('FirstSecondThird');
			expect(html(formatElements('Fir<0/>st'))).toEqual('First');
			expect(html(formatElements('<tag>text</tag>'))).toEqual('text');
			expect(html(formatElements('text <br/>'))).toEqual('text ');

			expect(consoleMock.warn).not.toBeCalled();
			expect(consoleMock.error).toBeCalledTimes(6);
		});
	});

	it('should ignore incorrect tags and print them as a text', function incorrectTags() {
		withMockConsole(function assertIncorrect(consoleMock) {
			expect(html(formatElements('text</0>'))).toEqual('text&lt;/0&gt;');
			expect(html(formatElements('text<0 />'))).toEqual('text&lt;0 /&gt;');

			expect(consoleMock.warn).not.toBeCalled();
			expect(consoleMock.error).not.toBeCalled();
		});
	});

	it('should ignore unpaired element used as paired', function unpairedAsPaired() {
		withMockConsole(function assertUnpaired(consoleMock) {
			expect(html(formatElements('<0>text</0>', { 0: createElement('br') }))).toEqual('text');

			expect(consoleMock.warn).not.toBeCalled();
			expect(consoleMock.error).toBeCalled();
		});
	});

	it('should ignore unpaired named element used as paired', function unpairedNamed() {
		withMockConsole(function assertNamed(consoleMock) {
			expect(html(formatElements('<named>text</named>', { named: createElement('br') }))).toEqual(
				'text',
			);

			expect(consoleMock.warn).not.toBeCalled();
			expect(consoleMock.error).toBeCalledTimes(1);
		});
	});

	it('should ignore paired element used as unpaired', function pairedAsUnpaired() {
		expect(html(formatElements('text<0/>', { 0: createElement('span') }))).toEqual(
			'text<span></span>',
		);
	});

	it('should ignore paired named element used as unpaired', function pairedNamedUnpaired() {
		expect(html(formatElements('text<named/>', { named: createElement('span') }))).toEqual(
			'text<span></span>',
		);
	});

	it('should create two children with different keys', function differentKeys() {
		function cleanPrefix(str: string): number {
			return Number.parseInt(str.replace('$lingui$_', ''), 10);
		}
		const elements = formatElements('<div><0/><0/></div>', {
			div: createElement('div'),
			0: createElement('span', null, 'hi'),
		});

		expect(isValidElement(elements)).toBe(true);

		const childElements = (
			elements as { props: { children: Array<{ key?: string | null } | string | null> } }
		).props.children;
		const childKeys = childElements
			.map(function keyOf(el) {
				return typeof el === 'object' && el != null ? el.key : undefined;
			})
			.filter(Boolean);

		expect(cleanPrefix(childKeys[0] as string)).toBeLessThan(cleanPrefix(childKeys[1] as string));
	});
});
