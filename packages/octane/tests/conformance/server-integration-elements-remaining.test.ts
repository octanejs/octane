import { expect, it, vi } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { collectPipeableStream } from '../_server-stream.js';
import * as client from './_fixtures/server-integration-elements-remaining.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE =
	'packages/octane/tests/conformance/_fixtures/server-integration-elements-remaining.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });

function replaceWithMismatchedMarkup(container: HTMLElement): void {
	const wrong = document.createElement('aside');
	wrong.id = 'wrong-server-tree';
	wrong.textContent = 'wrong';
	container.replaceChildren(wrong);
}

const structuralMismatch = { mutateServerDom: replaceWithMismatchedMarkup } as const;

interface SimpleObservation {
	mode: 'client' | 'server-string' | 'server-stream' | 'hydrate-match' | 'hydrate-mismatch';
	root: ParentNode;
	state: any;
}

interface SimpleCase {
	component: keyof typeof client;
	modes?: readonly SimpleObservation['mode'][];
	props?: (context: any) => any;
	createState?: () => any;
	assertCommon(observation: SimpleObservation): void;
	assertByMode?: Record<string, (observation: SimpleObservation) => void>;
}

function renders(title: string, spec: SimpleCase): void {
	matrix.itRenders(title, {
		...spec,
		component: spec.component as any,
		mismatch: structuralMismatch,
	} as any);
}

function byId(root: ParentNode, id: string): Element {
	const element = root.querySelector(`#${id}`);
	expect(element, `Expected #${id} to render`).not.toBeNull();
	return element!;
}

function expectEmptyRoot(root: ParentNode): void {
	expect(root.textContent).toBe('');
	expect(root.querySelector('*')).toBeNull();
	expect(root.querySelector('#wrong-server-tree')).toBeNull();
}

// ReactDOMServerIntegrationBasic-test.js:43.
renders('renders a blank div', {
	component: 'BlankDiv',
	assertCommon({ root }) {
		expect(byId(root, 'blank-div').tagName).toBe('DIV');
	},
});

// ReactDOMServerIntegrationBasic-test.js:48.
renders('renders a self-closing tag', {
	component: 'SelfClosingTag',
	assertCommon({ root }) {
		expect(byId(root, 'self-closing-tag').tagName).toBe('BR');
	},
});

// ReactDOMServerIntegrationBasic-test.js:53.
renders('renders a self-closing tag as a child', {
	component: 'SelfClosingChild',
	assertCommon({ root }) {
		const parent = byId(root, 'self-closing-parent');
		expect(parent.children).toHaveLength(1);
		expect(parent.firstElementChild).toBe(byId(root, 'self-closing-child'));
	},
});

// ReactDOMServerIntegrationBasic-test.js:63.
renders('renders a string root', {
	component: 'StringRoot',
	assertCommon({ root }) {
		expect(root.textContent).toBe('Hello');
		expect(root.querySelector('*')).toBeNull();
	},
});

// ReactDOMServerIntegrationBasic-test.js:69.
renders('renders a number root', {
	component: 'NumberRoot',
	assertCommon({ root }) {
		expect(root.textContent).toBe('42');
		expect(root.querySelector('*')).toBeNull();
	},
});

// ReactDOMServerIntegrationBasic-test.js:81.
renders('renders an array with one child', {
	component: 'ArrayOne',
	assertCommon({ root }) {
		expect(byId(root, 'array-one').textContent).toBe('text1');
		expect(root.querySelectorAll('#array-one')).toHaveLength(1);
	},
});

// ReactDOMServerIntegrationBasic-test.js:108.
renders('renders a nested array', {
	component: 'NestedArray',
	assertCommon({ root }) {
		expect(
			Array.from(root.querySelectorAll('[id^="nested-array-"]'), (element) => element.id),
		).toEqual(['nested-array-first', 'nested-array-second', 'nested-array-third']);
	},
});

// ReactDOMServerIntegrationBasic-test.js:120.
renders('renders a legacy @@iterator iterable', {
	component: 'LegacyIterable',
	assertCommon({ root }) {
		expect(
			Array.from(root.querySelectorAll('[data-iterable-item]'), (element) =>
				element.getAttribute('data-iterable-item'),
			),
		).toEqual(['one', 'two', 'three']);
	},
});

// ReactDOMServerIntegrationBasic-test.js:143.
renders('renders emptyish values', {
	component: 'EmptyishValues',
	assertCommon({ root }) {
		expect(byId(root, 'emptyish-zero').textContent).toBe('0');
		expect(byId(root, 'emptyish-string').textContent).toBe('');
		expect(root.querySelectorAll('*')).toHaveLength(2);
	},
});

// ReactDOMServerIntegrationElements-test.js:73.
renders('renders a div with text', {
	component: 'DivText',
	assertCommon({ root }) {
		expect(byId(root, 'div-text').textContent).toBe('Text');
	},
});

// ReactDOMServerIntegrationElements-test.js:80.
renders('renders a div with text with flanking whitespace', {
	component: 'FlankingWhitespace',
	assertCommon({ root }) {
		expect(byId(root, 'flanking-whitespace').textContent).toBe('  Text ');
	},
});

// ReactDOMServerIntegrationElements-test.js:87.
renders('renders a div with an empty text child', {
	component: 'EmptyText',
	assertCommon({ root }) {
		const element = byId(root, 'empty-text');
		expect(element.textContent).toBe('');
		expect(element.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationElements-test.js:92.
renders('renders a div with multiple empty text children', {
	component: 'MultipleEmptyText',
	assertCommon({ root }) {
		const element = byId(root, 'multiple-empty-text');
		expect(element.textContent).toBe('');
		expect(element.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationElements-test.js:104.
renders('renders a div with multiple whitespace children', {
	component: 'MultipleWhitespace',
	assertCommon({ root }) {
		expect(byId(root, 'multiple-whitespace').textContent).toBe('   ');
	},
});

// ReactDOMServerIntegrationElements-test.js:126.
renders('renders a div with text sibling to a node', {
	component: 'TextSibling',
	assertCommon({ root }) {
		const element = byId(root, 'text-sibling');
		expect(element.textContent).toBe('TextMore Text');
		expect(element.querySelector('span')?.textContent).toBe('More Text');
	},
});

// ReactDOMServerIntegrationElements-test.js:140.
renders('renders a non-standard element with text', {
	component: 'NonStandardText',
	assertCommon({ root }) {
		const element = byId(root, 'non-standard-text');
		expect(element.tagName).toBe('NONSTANDARD');
		expect(element.textContent).toBe('Text');
	},
});

// ReactDOMServerIntegrationElements-test.js:163.
renders('renders a custom element with text', {
	component: 'CustomElementText',
	assertCommon({ root }) {
		const element = byId(root, 'custom-element-text');
		expect(element.tagName).toBe('CUSTOM-ELEMENT');
		expect(element.textContent).toBe('Text');
	},
});

// ReactDOMServerIntegrationElements-test.js:170.
renders('renders a leading blank child with a text sibling', {
	component: 'LeadingBlank',
	assertCommon({ root }) {
		expect(byId(root, 'leading-blank').textContent).toBe('foo');
	},
});

// ReactDOMServerIntegrationElements-test.js:176.
renders('renders a trailing blank child with a text sibling', {
	component: 'TrailingBlank',
	assertCommon({ root }) {
		expect(byId(root, 'trailing-blank').textContent).toBe('foo');
	},
});

// ReactDOMServerIntegrationElements-test.js:205.
renders('renders a component returning text between two text nodes', {
	component: 'ComponentBetweenText',
	assertCommon({ root }) {
		expect(byId(root, 'component-between-text').textContent).toBe('abc');
	},
});

// ReactDOMServerIntegrationElements-test.js:235. The upstream helper uses a class
// only as a nesting vehicle; this adaptation preserves the renderer-level outcome
// with function components, because Octane intentionally has no class components.
renders('renders a tree with sibling host and text nodes', {
	component: 'SiblingHostAndTextTree',
	assertCommon({ root }) {
		const element = byId(root, 'sibling-host-text-tree');
		expect(element.textContent).toBe('abcde');
		expect(element.querySelector('div')?.textContent).toBe('cd');
	},
});

// ReactDOMServerIntegrationElements-test.js:285.
renders('renders a number as single child', {
	component: 'NumberChild',
	assertCommon({ root }) {
		expect(byId(root, 'number-child').textContent).toBe('3');
	},
});

// ReactDOMServerIntegrationElements-test.js:291.
renders('renders zero as single child', {
	component: 'ZeroChild',
	assertCommon({ root }) {
		expect(byId(root, 'zero-child').textContent).toBe('0');
	},
});

// ReactDOMServerIntegrationElements-test.js:296.
renders('renders an element with number and text children', {
	component: 'NumberAndText',
	assertCommon({ root }) {
		expect(byId(root, 'number-and-text').textContent).toBe('foo40');
	},
});

for (const [title, value] of [
	['renders null single child as blank', null],
	['renders false single child as blank', false],
	['renders undefined single child as blank', undefined],
] as const) {
	// ReactDOMServerIntegrationElements-test.js:322, :327, and :332.
	renders(title, {
		component: 'NullishSingle',
		props: () => ({ value }),
		assertCommon({ root }) {
			const element = byId(root, 'nullish-single');
			expect(element.textContent).toBe('');
			expect(element.children).toHaveLength(0);
		},
	});
}

// ReactDOMServerIntegrationElements-test.js:337.
renders('renders a null component child as empty', {
	component: 'NullComponentChild',
	assertCommon({ root }) {
		const element = byId(root, 'null-component-child');
		expect(element.textContent).toBe('');
		expect(element.children).toHaveLength(0);
	},
});

for (const [title, value] of [
	['renders null children as blank', null],
	['renders false children as blank', false],
] as const) {
	// ReactDOMServerIntegrationElements-test.js:347 and :353.
	renders(title, {
		component: 'NullishBeforeText',
		props: () => ({ value }),
		assertCommon({ root }) {
			expect(byId(root, 'nullish-before-text').textContent).toBe('foo');
		},
	});
}

// ReactDOMServerIntegrationElements-test.js:359.
renders('renders null and false children together as blank', {
	component: 'MixedNullish',
	assertCommon({ root }) {
		expect(byId(root, 'mixed-nullish').textContent).toBe('foo');
	},
});

// ReactDOMServerIntegrationElements-test.js:371.
renders('renders only null and false children as blank', {
	component: 'OnlyNullish',
	assertCommon({ root }) {
		const element = byId(root, 'only-nullish');
		expect(element.textContent).toBe('');
		expect(element.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationElements-test.js:385.
renders('renders an svg element', {
	component: 'SvgRoot',
	assertCommon({ root }) {
		const svg = byId(root, 'svg-root');
		expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svg.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationElements-test.js:392.
renders('renders an svg child element with an attribute', {
	component: 'SvgViewBox',
	assertCommon({ root }) {
		const svg = byId(root, 'svg-view-box');
		expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 0 0');
	},
});

// ReactDOMServerIntegrationElements-test.js:400.
renders('renders an svg child element with a namespace attribute', {
	component: 'SvgNamespacedAttribute',
	assertCommon({ root }) {
		const image = byId(root, 'svg-namespaced-image');
		expect(image.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(image.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(
			'https://example.test/image.png',
		);
	},
});

// ReactDOMServerIntegrationElements-test.js:418.
renders('renders an svg child element with a badly cased alias', {
	component: 'SvgBadAlias',
	assertCommon({ root }) {
		const image = byId(root, 'svg-bad-alias-image');
		expect(image.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(false);
		expect(image.getAttribute('xlinkhref')).toBe('https://example.test/image.png');
	},
});

// ReactDOMServerIntegrationElements-test.js:434.
renders('renders an svg element with a tabIndex attribute', {
	component: 'SvgTabIndex',
	assertCommon({ root }) {
		expect((byId(root, 'svg-tab-index') as SVGElement).tabIndex).toBe(1);
	},
});

// ReactDOMServerIntegrationElements-test.js:439.
renders('renders an svg element with a badly cased tabIndex attribute', {
	component: 'SvgBadTabIndex',
	assertCommon({ root }) {
		expect((byId(root, 'svg-bad-tab-index') as SVGElement).tabIndex).toBe(1);
	},
});

// ReactDOMServerIntegrationElements-test.js:447.
renders('renders an svg element with a mixed case name', {
	component: 'SvgMixedCaseName',
	assertCommon({ root }) {
		const node = byId(root, 'svg-mixed-case-node');
		expect(node.localName).toBe('feMorphology');
		expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg');
	},
});

// ReactDOMServerIntegrationElements-test.js:461.
renders('renders a math element', {
	component: 'MathRoot',
	assertCommon({ root }) {
		const math = byId(root, 'math-root');
		expect(math.localName).toBe('math');
		expect(math.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
	},
});

// ReactDOMServerIntegrationElements-test.js:470.
renders('renders an img', {
	component: 'ImageElement',
	assertCommon({ root }) {
		const image = byId(root, 'image-element');
		expect(image.tagName).toBe('IMG');
		expect(image.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationElements-test.js:477.
renders('renders a button', {
	component: 'ButtonElement',
	assertCommon({ root }) {
		const button = byId(root, 'button-element');
		expect(button.tagName).toBe('BUTTON');
		expect(button.children).toHaveLength(0);
	},
});

for (const [title, html, expected] of [
	['renders dangerouslySetInnerHTML number', 0, '0'],
	['renders dangerouslySetInnerHTML boolean', false, 'false'],
	['renders dangerouslySetInnerHTML text string', 'hello', 'hello'],
] as const) {
	// ReactDOMServerIntegrationElements-test.js:484, :500, and :516.
	renders(title, {
		component: 'DangerousSpan',
		props: () => ({ html }),
		assertCommon({ root }) {
			expect(byId(root, 'dangerous-span').textContent).toBe(expected);
		},
	});
}

// ReactDOMServerIntegrationElements-test.js:535.
renders('renders dangerouslySetInnerHTML element string', {
	component: 'DangerousDiv',
	props: () => ({ html: "<span id='dangerous-child'/>" }),
	assertCommon({ root }) {
		expect(byId(root, 'dangerous-child').tagName).toBe('SPAN');
		expect(byId(root, 'dangerous-div').children).toHaveLength(1);
	},
});

// ReactDOMServerIntegrationElements-test.js:548.
renders('renders dangerouslySetInnerHTML object', {
	component: 'DangerousDiv',
	props: () => ({ html: { toString: () => "<span id='dangerous-object-child'/>" } }),
	assertCommon({ root }) {
		expect(byId(root, 'dangerous-object-child').tagName).toBe('SPAN');
	},
});

for (const [title, html] of [
	['renders dangerouslySetInnerHTML set to null', null],
	['renders dangerouslySetInnerHTML set to undefined', undefined],
] as const) {
	// ReactDOMServerIntegrationElements-test.js:561 and :571.
	renders(title, {
		component: 'DangerousDiv',
		props: () => ({ html }),
		assertCommon({ root }) {
			const element = byId(root, 'dangerous-div');
			expect(element.textContent).toBe('');
			expect(element.children).toHaveLength(0);
		},
	});
}

// ReactDOMServerIntegrationElements-test.js:581. React's own client-clean and
// parsed-server branches differ for noscript; the durable outcome is that no
// executable descendant escapes the inert noscript container.
renders('renders a noscript with inert children', {
	component: 'NoscriptChildren',
	assertCommon({ root }) {
		const noscript = byId(root, 'noscript-children');
		expect(noscript.textContent).toContain('Enable JavaScript to run this app.');
		expect(root.querySelector('body > div')).toBeNull();
	},
});

// ReactDOMServerIntegrationElements-test.js:600.
renders('renders a newline-eating tag with content not starting with newline', {
	component: 'PreformattedText',
	props: () => ({ text: 'Hello' }),
	assertCommon({ root }) {
		expect(byId(root, 'preformatted-text').textContent).toBe('Hello');
	},
});

// ReactDOMServerIntegrationElements-test.js:607.
renders('renders a newline-eating tag with content starting with newline', {
	component: 'PreformattedText',
	props: () => ({ text: '\nHello' }),
	assertCommon({ root }) {
		expect(byId(root, 'preformatted-text').textContent).toBe('\nHello');
	},
});

// ReactDOMServerIntegrationElements-test.js:614.
renders('renders a normal tag with content starting with newline', {
	component: 'NormalNewlineText',
	props: () => ({ text: '\nHello' }),
	assertCommon({ root }) {
		expect(byId(root, 'normal-newline-text').textContent).toBe('\nHello');
	},
});

// ReactDOMServerIntegrationElements-test.js:626.
renders('renders stateless components', {
	component: 'StatelessComponent',
	assertCommon({ root }) {
		expect(byId(root, 'stateless-component').textContent).toBe('foo');
	},
});

// ReactDOMServerIntegrationElements-test.js:657.
renders('renders single child hierarchies of components', {
	component: 'SingleChildHierarchy',
	assertCommon({ root }) {
		const boxes = root.querySelectorAll('.box');
		expect(boxes).toHaveLength(4);
		expect(Array.from(boxes, (box) => box.children.length)).toEqual([1, 1, 1, 0]);
	},
});

// ReactDOMServerIntegrationElements-test.js:677.
renders('renders multi-child hierarchies of components', {
	component: 'MultiChildHierarchy',
	assertCommon({ root }) {
		const boxes = root.querySelectorAll('.box');
		expect(boxes).toHaveLength(7);
		expect(Array.from(boxes, (box) => box.children.length)).toEqual([2, 2, 0, 0, 2, 0, 0]);
	},
});

// ReactDOMServerIntegrationElements-test.js:705.
renders('renders a div with a child', {
	component: 'ParentWithChild',
	assertCommon({ root }) {
		const parent = byId(root, 'parent-with-child');
		expect(parent.children).toHaveLength(1);
		expect(parent.firstElementChild).toBe(byId(root, 'only-child'));
	},
});

// ReactDOMServerIntegrationElements-test.js:717.
renders('renders a div with multiple children', {
	component: 'ParentWithChildren',
	assertCommon({ root }) {
		expect(
			Array.from(byId(root, 'parent-with-children').children, (element) => element.id),
		).toEqual(['first-child', 'second-child']);
	},
});

// ReactDOMServerIntegrationElements-test.js:732.
renders('renders a div with multiple children separated by whitespace', {
	component: 'WhitespaceSeparatedChildren',
	props: () => ({ between: ' ' }),
	assertCommon({ root }) {
		const parent = byId(root, 'whitespace-separated-children');
		expect(parent.textContent).toBe(' ');
		expect(Array.from(parent.children, (element) => element.id)).toEqual([
			'whitespace-first-child',
			'whitespace-second-child',
		]);
	},
});

// ReactDOMServerIntegrationElements-test.js:753.
renders('renders a div with a single child surrounded by whitespace', {
	component: 'WhitespaceSurroundedChild',
	props: () => ({ before: '  ', after: '   ' }),
	assertCommon({ root }) {
		const parent = byId(root, 'whitespace-surrounded-child');
		expect(parent.textContent).toBe('     ');
		expect(parent.firstElementChild).toBe(byId(root, 'surrounded-child'));
	},
});

// ReactDOMServerIntegrationElements-test.js:770.
renders('renders a composite with multiple children', {
	component: 'CompositeMultipleChildren',
	assertCommon({ root }) {
		expect(root.querySelector('.box')?.textContent).toBe('abc');
	},
});

// ReactDOMServerIntegrationElements-test.js:798.
renders('escapes greater-than, less-than, and ampersand as a single child', {
	component: 'EscapedSingleText',
	assertCommon({ root }) {
		const element = byId(root, 'escaped-single-text');
		expect(element.textContent).toBe('<span>Text&quot;</span>');
		expect(element.querySelector('span')).toBeNull();
	},
});

// ReactDOMServerIntegrationElements-test.js:804.
renders('escapes greater-than, less-than, and ampersand as multiple children', {
	component: 'EscapedMultipleText',
	assertCommon({ root }) {
		const element = byId(root, 'escaped-multiple-text');
		expect(element.textContent).toBe('<span>Text1&quot;</span><span>Text2&quot;</span>');
		expect(element.querySelector('span')).toBeNull();
	},
});

function usesClientMaterialization(mode: SimpleObservation['mode']): boolean {
	return mode === 'client' || mode === 'hydrate-mismatch';
}

// ReactDOMServerIntegrationElements-test.js:834.
renders('renders an element with one text child with special characters', {
	component: 'SpecialText',
	props: () => ({ text: 'foo\rbar\r\nbaz\nqux\0' }),
	assertCommon({ root, mode }) {
		expect(byId(root, 'special-text').textContent).toBe(
			usesClientMaterialization(mode) ? 'foo\rbar\r\nbaz\nqux\0' : 'foo\nbar\nbaz\nqux',
		);
	},
});

// ReactDOMServerIntegrationElements-test.js:861.
renders('renders an element with two text children with special characters', {
	component: 'SpecialTextPair',
	props: () => ({ first: 'foo\rbar', second: '\r\nbaz\nqux\0' }),
	assertCommon({ root, mode }) {
		expect(byId(root, 'special-text-pair').textContent).toBe(
			usesClientMaterialization(mode) ? 'foo\rbar\r\nbaz\nqux\0' : 'foo\nbar\nbaz\nqux',
		);
	},
});

// ReactDOMServerIntegrationElements-test.js:897.
renders('renders an element with an attribute value with special characters', {
	component: 'SpecialAttribute',
	props: () => ({ title: 'foo\rbar\r\nbaz\nqux\0' }),
	assertCommon({ root, mode }) {
		expect((byId(root, 'special-attribute') as HTMLAnchorElement).title).toBe(
			usesClientMaterialization(mode) ? 'foo\rbar\r\nbaz\nqux\0' : 'foo\nbar\nbaz\nqux\uFFFD',
		);
	},
});

// Per ReactDOMComponent.js:296-310 and :3271-3295. Hydration compares text and
// attributes after removing both U+0000 and U+FFFD, so parser-normalizable
// differences preserve the server DOM without reporting a mismatch.
it('normalizes replacement characters when checking hydration parser differences', () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const roots: ReturnType<typeof hydrateRoot>[] = [];
	try {
		const textContainer = document.createElement('div');
		textContainer.innerHTML = ServerRuntime.renderToString(server.SpecialText, {
			text: 'foo',
		}).html;
		roots.push(hydrateRoot(textContainer, client.SpecialText, { text: 'foo\uFFFD' }));
		flushSync(() => {});
		expect(byId(textContainer, 'special-text').textContent).toBe('foo');

		const attributeContainer = document.createElement('div');
		attributeContainer.innerHTML = ServerRuntime.renderToString(server.SpecialAttribute, {
			title: 'foo',
		}).html;
		roots.push(hydrateRoot(attributeContainer, client.SpecialAttribute, { title: 'foo\uFFFD' }));
		flushSync(() => {});
		expect((byId(attributeContainer, 'special-attribute') as HTMLAnchorElement).title).toBe('foo');

		const reverseAttributeContainer = document.createElement('div');
		reverseAttributeContainer.innerHTML = ServerRuntime.renderToString(server.SpecialAttribute, {
			title: 'foo\uFFFD',
		}).html;
		roots.push(
			hydrateRoot(reverseAttributeContainer, client.SpecialAttribute, {
				title: 'foo',
			}),
		);
		flushSync(() => {});
		expect((byId(reverseAttributeContainer, 'special-attribute') as HTMLAnchorElement).title).toBe(
			'foo\uFFFD',
		);
		expect(error).not.toHaveBeenCalled();
	} finally {
		for (const root of roots) root.unmount();
		error.mockRestore();
	}
});

// ReactDOMServerIntegrationElements-test.js:919.
renders('renders a function returning null', {
	component: 'NullRoot',
	assertCommon({ root }) {
		expectEmptyRoot(root);
	},
});

// ReactDOMServerIntegrationElements-test.js:933.
renders('renders a function returning undefined', {
	component: 'UndefinedRoot',
	assertCommon({ root }) {
		expectEmptyRoot(root);
	},
});

// ReactDOMServerIntegrationFragment-test.js:41.
renders('renders a fragment with one child', {
	component: 'FragmentOne',
	assertCommon({ root }) {
		expect(byId(root, 'fragment-one').textContent).toBe('text1');
		expect(root.querySelectorAll('#fragment-one')).toHaveLength(1);
	},
});

// ReactDOMServerIntegrationFragment-test.js:103.
renders('renders an empty fragment', {
	component: 'EmptyFragment',
	assertCommon({ root }) {
		const parent = byId(root, 'empty-fragment-parent');
		expect(parent.textContent).toBe('');
		expect(parent.children).toHaveLength(0);
	},
});

// ReactDOMServerIntegrationObject-test.js:39.
renders('renders an object element with children', {
	component: 'ObjectWithChildren',
	assertCommon({ root }) {
		const object = byId(root, 'object-with-children');
		expect(object.getAttribute('type')).toBe('video/mp4');
		expect(object.getAttribute('data')).toBe('/example.webm');
		expect(object.getAttribute('width')).toBe('600');
		expect(object.getAttribute('height')).toBe('400');
		expect(object.textContent).toBe('preview');
	},
});

// ReactDOMServerIntegrationObject-test.js:51.
renders('renders an object element with empty data omitted', {
	component: 'ObjectWithEmptyData',
	assertCommon({ root }) {
		expect(byId(root, 'object-with-empty-data').hasAttribute('data')).toBe(false);
	},
});

function memoCase(title: string): void {
	// ReactDOMServerIntegrationSpecialTypes-test.js:118 and :124.
	renders(title, {
		component: 'MemoWithComparator',
		createState: () => ({ events: [] as string[] }),
		props: ({ state }) => ({
			count: 0,
			log(value: string) {
				state.events.push(value);
			},
		}),
		assertCommon({ root, state }) {
			expect(byId(root, 'memo-with-comparator').textContent).toBe('Count: 0');
			expect(state.events).not.toContain('compare');
		},
	});
}

memoCase('renders a memo component with a comparator');
memoCase('does not invoke memo comparator functions during initial server rendering');

type InvalidFixture = 'FunctionReturningObject' | 'TopLevelObject' | 'InvalidComponentType';

function rejectsAcrossRenderers(
	title: string,
	component: InvalidFixture,
	props: () => any = () => undefined,
): void {
	it(`${title} — clean client render`, () => {
		const container = document.createElement('div');
		const root = createRoot(container);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(() => root.render(client[component], props())).toThrow();
		} finally {
			root.unmount();
			error.mockRestore();
		}
	});

	it(`${title} — server string render`, () => {
		expect(() => ServerRuntime.renderToString(server[component], props())).toThrow();
	});

	it(`${title} — server stream render`, async () => {
		const result = await collectPipeableStream(server[component], props());
		expect(result.html).toBe('');
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toBeInstanceOf(Error);
	});

	it(`${title} — client recovery on mismatched server markup`, () => {
		const container = document.createElement('div');
		container.innerHTML = '<aside id="wrong-server-tree">wrong</aside>';
		let root: ReturnType<typeof hydrateRoot> | undefined;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(() => {
				root = hydrateRoot(container, client[component], props());
				flushSync(() => {});
			}).toThrow();
		} finally {
			root?.unmount();
			error.mockRestore();
		}
	});
}

// ReactDOMServerIntegrationElements-test.js:949.
rejectsAcrossRenderers('rejects a function returning an object', 'FunctionReturningObject');

// ReactDOMServerIntegrationElements-test.js:979.
rejectsAcrossRenderers('rejects a top-level object', 'TopLevelObject');

// ReactDOMServerIntegrationElements-test.js:993.
rejectsAcrossRenderers('rejects an object component type', 'InvalidComponentType', () => ({
	value: {},
}));

// ReactDOMServerIntegrationElements-test.js:1008.
rejectsAcrossRenderers('rejects a null component type', 'InvalidComponentType', () => ({
	value: null,
}));

// ReactDOMServerIntegrationElements-test.js:1019.
rejectsAcrossRenderers('rejects an undefined component type', 'InvalidComponentType', () => ({
	value: undefined,
}));
