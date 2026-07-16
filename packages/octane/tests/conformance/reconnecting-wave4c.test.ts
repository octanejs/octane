import { expect } from 'vitest';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/reconnecting-wave4c.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/reconnecting-wave4c.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });

const clientFlagMismatch = {
	serverProps: () => ({ client: false }),
	clientProps: () => ({ client: true }),
} as const;

function ids(root: ParentNode, selector: string): string[] {
	return Array.from(root.querySelector(selector)!.children, (child) => child.id);
}

// Per ReactDOMServerIntegrationReconnecting-test.js, stable/canary (identical):
// the public contract is a diagnostic plus recovery to the client style.
// Per ReactDOMServerIntegrationReconnecting-test.js:174.
matrix.itRenders('should error reconnecting added style values', {
	component: 'AddedStyleValues',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#added-style-values'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#added-style-values') as HTMLElement;
		expect(element).toBe(before);
		expect(element.style.width).toBe('1px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:215.
matrix.itRenders('should reconnect a div with a number and string version of number', {
	component: 'NumberStringText',
	modes: ['hydrate-match'],
	hydrateMatch: {
		serverProps: () => ({ value: 2 }),
		clientProps: () => ({ value: '2' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#number-string-text'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#number-string-text')).toBe(before);
		expect(before?.textContent).toBe('2');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:387.
matrix.itRenders('can not deeply ignore reconnecting reordered children', {
	component: 'DeepReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverComponent: 'DeepReorderedChildrenServer',
		clientComponent: 'DeepReorderedChildrenClient',
	},
	assertCommon({ root }) {
		expect(ids(root, '#deep-reordered section')).toEqual(['deep-second', 'deep-first']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:345.
matrix.itRenders('can distinguish an empty component from an empty text component', {
	component: 'EmptyFunctionRoot',
	modes: ['hydrate-match'],
	hydrateMatch: {
		serverComponent: 'EmptyFunctionRoot',
		clientComponent: 'EmptyTextRoot',
		serverProps: () => ({}),
		clientProps: () => ({ text: '' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#empty-root'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#empty-root')).toBe(before);
		expect(before?.textContent).toBe('');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:192.
matrix.itRenders('should error reconnecting reordered style values', {
	component: 'ReorderedStyleValues',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#reordered-style-values'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#reordered-style-values') as HTMLElement;
		expect(element).toBe(before);
		expect(element.style.width).toBe('1px');
		expect(element.style.fontSize).toBe('2px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:218.
matrix.itRenders('should error reconnecting different numbers', {
	component: 'DifferentNumbers',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ value: 2 }),
		clientProps: () => ({ value: 3 }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#different-numbers'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#different-numbers')).toBe(before);
		expect(before?.textContent).toBe('3');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:445.
matrix.itRenders(
	'can explicitly ignore reconnecting a div with different dangerouslySetInnerHTML',
	{
		component: 'SuppressedRawHtml',
		modes: ['hydrate-mismatch'],
		mismatch: {
			serverProps: () => ({ html: '<span id="server-raw">server</span>' }),
			clientProps: () => ({ html: '<span id="client-raw">client</span>' }),
			diagnostics: 'none',
		},
		captureBeforeHydrate: (container) => container.querySelector('#suppressed-raw-html'),
		assertCommon({ root, before }) {
			const element = root.querySelector('#suppressed-raw-html') as HTMLElement;
			expect(element).toBe(before);
			expect(element.innerHTML).toBe('<span id="server-raw">server</span>');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:165.
matrix.itRenders('should error reconnecting added style attribute', {
	component: 'AddedStyleAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#added-style-attribute'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#added-style-attribute') as HTMLElement;
		expect(element).toBe(before);
		expect(element.style.width).toBe('1px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:411.
matrix.itRenders('should error reconnecting a div with different text dangerouslySetInnerHTML', {
	component: 'RawHtml',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ html: 'foo' }),
		clientProps: () => ({ html: 'bar' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#raw-html'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#raw-html') as HTMLElement;
		expect(element).toBe(before);
		expect(element.innerHTML).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:316.
matrix.itRenders(
	'should error reconnecting a div with children separated by different whitespace on the server',
	{
		component: 'WhitespaceBetweenChildren',
		modes: ['hydrate-mismatch'],
		mismatch: {
			serverProps: () => ({ gap: '      ' }),
			clientProps: () => ({ gap: '' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		assertCommon({ root, before }) {
			expect(root.querySelector('#whitespace-children')).toBe(before);
			expect(before?.textContent).toBe('AB');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:150.
matrix.itRenders('can not deeply ignore errors reconnecting different attribute values', {
	component: 'DeepAttributeMismatch',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#deep-attribute'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#deep-attribute')).toBe(before);
		expect(root.querySelector('#client-child')).not.toBeNull();
		expect(root.querySelector('#server-child')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:242.
matrix.itRenders('can explicitly ignore reconnecting different text in two code blocks', {
	component: 'SuppressedAdjacentText',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ first: 'Text1', second: 'Text2' }),
		clientProps: () => ({ first: 'Text1', second: 'Text3' }),
		diagnostics: 'none',
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-adjacent-text'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#suppressed-adjacent-text')).toBe(before);
		expect(before?.textContent).toBe('Text1Text2');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:186.
matrix.itRenders('should reconnect number and string versions of a number', {
	component: 'NumberStringStyle',
	modes: ['hydrate-match'],
	hydrateMatch: {
		serverProps: () => ({ style: { width: '1px', height: 2 } }),
		clientProps: () => ({ style: { width: 1, height: '2px' } }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#number-string-style'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#number-string-style') as HTMLElement;
		expect(element).toBe(before);
		expect(element.style.width).toBe('1px');
		expect(element.style.height).toBe('2px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:122.
matrix.itRenders('should error reconnecting different element types of children', {
	component: 'DifferentChildType',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#different-child-type'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#different-child-type')).toBe(before);
		expect(root.querySelector('#client-child-type')).not.toBeNull();
		expect(root.querySelector('#server-child-type')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:221.
matrix.itRenders('should error reconnecting different number from text', {
	component: 'NumberVsText',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ value: 2 }),
		clientProps: () => ({ value: '3' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#number-vs-text'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#number-vs-text')).toBe(before);
		expect(before?.textContent).toBe('3');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:294.
matrix.itRenders('should error reconnecting reordered children', {
	component: 'ReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverComponent: 'ReorderedChildrenServer',
		clientComponent: 'ReorderedChildrenClient',
	},
	assertCommon({ root }) {
		expect(ids(root, '#reordered-children')).toEqual(['reordered-second', 'reordered-first']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:168.
matrix.itRenders('should error reconnecting empty style attribute', {
	component: 'EmptyStyleAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#empty-style-attribute'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#empty-style-attribute') as HTMLElement;
		expect(element).toBe(before);
		expect(element.getAttribute('style')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:162.
matrix.itRenders('should error reconnecting missing style attribute', {
	component: 'MissingStyleAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#missing-style-attribute'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#missing-style-attribute') as HTMLElement;
		expect(element).toBe(before);
		expect(element.getAttribute('style')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:138.
matrix.itRenders('can explicitly ignore errors reconnecting added attributes', {
	component: 'SuppressedAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ value: null }),
		clientProps: () => ({ value: 'client' }),
		diagnostics: 'none',
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-attribute'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#suppressed-attribute') as HTMLElement;
		expect(element).toBe(before);
		expect(element.hasAttribute('title')).toBe(false);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:405.
matrix.itRenders('should error reconnecting a div with different dangerouslySetInnerHTML', {
	component: 'RawHtml',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ html: '<span id="server-html">server</span>' }),
		clientProps: () => ({ html: '<span id="client-html">client</span>' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#raw-html'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#raw-html') as HTMLElement;
		expect(element).toBe(before);
		expect(element.querySelector('#server-html')?.textContent).toBe('server');
		expect(element.querySelector('#client-html')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:256.
matrix.itRenders('should error reconnecting missing children', {
	component: 'MissingChildren',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#missing-children'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#missing-children')).toBe(before);
		expect(root.querySelector('#missing-child')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:224.
matrix.itRenders('should error reconnecting different text in two code blocks', {
	component: 'AdjacentTextMismatch',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ first: 'Text1', second: 'Text2' }),
		clientProps: () => ({ first: 'Text1', second: 'Text3' }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#adjacent-text-mismatch'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#adjacent-text-mismatch')).toBe(before);
		expect(before?.textContent).toBe('Text1Text3');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:91. Pure Component is adapted to a function.
matrix.itRenders('should reconnect Bare Element to Pure Component', {
	component: 'BareRoot',
	modes: ['hydrate-match'],
	hydrateMatch: {
		serverComponent: 'BareRoot',
		clientComponent: 'FunctionRoot',
	},
	captureBeforeHydrate: (container) => container.querySelector('#bare-function-root'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#bare-function-root')).toBe(before);
		expect(before?.textContent).toBe('same');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:326.
matrix.itRenders(
	'should error reconnecting a div with children separated by different whitespace',
	{
		component: 'WhitespaceBetweenChildren',
		modes: ['hydrate-mismatch'],
		mismatch: {
			serverProps: () => ({ gap: ' ' }),
			clientProps: () => ({ gap: '      ' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		assertCommon({ root, before }) {
			expect(root.querySelector('#whitespace-children')).toBe(before);
			expect(before?.textContent).toBe('A      B');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:353.
matrix.itRenders('can not ignore reconnecting more children', {
	component: 'SuppressedMoreChildren',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-more-children'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#suppressed-more-children')).toBe(before);
		expect(ids(root, '#suppressed-more-children')).toEqual(['more-first', 'more-second']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:306.
matrix.itRenders(
	'should error reconnecting a div with children separated by whitespace on the client',
	{
		component: 'WhitespaceBetweenChildren',
		modes: ['hydrate-mismatch'],
		mismatch: {
			serverProps: () => ({ gap: '' }),
			clientProps: () => ({ gap: '      ' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		assertCommon({ root, before }) {
			expect(root.querySelector('#whitespace-children')).toBe(before);
			expect(before?.textContent).toBe('A      B');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:375.
matrix.itRenders('can not ignore reconnecting reordered children', {
	component: 'SuppressedReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverComponent: 'SuppressedReorderedChildrenServer',
		clientComponent: 'SuppressedReorderedChildrenClient',
	},
	assertCommon({ root }) {
		expect(ids(root, '#suppressed-reordered')).toEqual(['suppressed-second', 'suppressed-first']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:423.
matrix.itRenders('should error reconnecting a div with different object dangerouslySetInnerHTML', {
	component: 'RawHtml',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ html: { toString: () => 'server object' } }),
		clientProps: () => ({ html: { toString: () => 'client object' } }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#raw-html'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#raw-html') as HTMLElement;
		expect(element).toBe(before);
		expect(element.innerHTML).toBe('server object');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:204.
matrix.itRenders('can explicitly ignore reconnecting different style values', {
	component: 'SuppressedStyle',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ style: { width: '1px' } }),
		clientProps: () => ({ style: { width: '2px' } }),
		diagnostics: 'none',
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-style'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#suppressed-style') as HTMLElement;
		expect(element).toBe(before);
		expect(element.style.width).toBe('1px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:132.
matrix.itRenders('can explicitly ignore errors reconnecting missing attributes', {
	component: 'SuppressedAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ value: 'server' }),
		clientProps: () => ({ value: null }),
		diagnostics: 'none',
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-attribute'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#suppressed-attribute') as HTMLElement;
		expect(element).toBe(before);
		expect(element.getAttribute('title')).toBe('server');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:335. The empty class adapts to a function.
matrix.itRenders('can distinguish an empty component from a dom node', {
	component: 'DomNodeRoot',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverComponent: 'DomNodeRoot',
		clientComponent: 'EmptyChildRoot',
	},
	captureBeforeHydrate: (container) => container.querySelector('#empty-vs-node'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#empty-vs-node')).toBe(before);
		expect(root.querySelector('#server-dom-node')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:198.
matrix.itRenders('can explicitly ignore errors reconnecting added style values', {
	component: 'SuppressedStyle',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ style: {} }),
		clientProps: () => ({ style: { width: '1px' } }),
		diagnostics: 'none',
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-style'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#suppressed-style') as HTMLElement;
		expect(element).toBe(before);
		expect(element.getAttribute('style')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:417.
matrix.itRenders('should error reconnecting a div with different number dangerouslySetInnerHTML', {
	component: 'RawHtml',
	modes: ['hydrate-mismatch'],
	mismatch: {
		serverProps: () => ({ html: 10 }),
		clientProps: () => ({ html: 20 }),
	},
	captureBeforeHydrate: (container) => container.querySelector('#raw-html'),
	assertCommon({ root, before }) {
		const element = root.querySelector('#raw-html') as HTMLElement;
		expect(element).toBe(before);
		expect(element.innerHTML).toBe('10');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:364.
matrix.itRenders('can not ignore reconnecting fewer children', {
	component: 'SuppressedFewerChildren',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-fewer-children'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#suppressed-fewer-children')).toBe(before);
		expect(ids(root, '#suppressed-fewer-children')).toEqual(['fewer-first']);
	},
});
