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

// Per ReactDOMServerIntegrationReconnecting-test.js, stable/canary (identical),
// asserting React 19's outcomes. A text or structural mismatch renders the root
// on the client: the server's element is replaced and onRecoverableError fires
// once. An attribute or style mismatch is never patched: the adopted element
// keeps the server's value, with a development diagnostic and no recoverable
// error. suppressHydrationWarning keeps the server's text and attributes one
// level deep and never hides a structural mismatch.
type Reports = { recoverable: unknown[] };
const reporting = {
	createState: (): Reports => ({ recoverable: [] }),
	rootOptions: ({ state }: { state: Reports }) => ({
		onRecoverableError: (error: unknown) => state.recoverable.push(error),
	}),
};

/** The root rendered on the client: `before` was replaced, and one error was reported. */
async function expectRootFallback(before: Element | null | undefined, state: Reports) {
	// Recoverable errors are delivered after the hydrating render.
	await Promise.resolve();
	expect(before).toBeInstanceOf(Element);
	expect(before!.isConnected).toBe(false);
	expect(state.recoverable).toHaveLength(1);
}

/**
 * The development runtime's one "won't be patched up" diagnostic for static
 * markup that differs, which it publishes for either compile.
 */
function unpatchedStaticMarkup(diagnostics: readonly string[]) {
	expect(diagnostics).toEqual([
		expect.stringMatching(/won't be patched up[^]*static attributes or markup of the server's/),
	]);
}

/** The server's element was adopted without a recoverable error. */
async function expectAdopted(
	before: Element | null | undefined,
	actual: Element | null,
	state: Reports,
) {
	await Promise.resolve();
	expect(actual).toBe(before);
	expect(state.recoverable).toEqual([]);
}

// Per ReactDOMServerIntegrationReconnecting-test.js:174.
matrix.itRenders('should error reconnecting added style values', {
	component: 'AddedStyleValues',
	modes: ['hydrate-mismatch'],
	...reporting,
	mismatch: clientFlagMismatch,
	captureBeforeHydrate: (container) => container.querySelector('#added-style-values'),
	async assertCommon({ root, before, state }) {
		const element = root.querySelector('#added-style-values') as HTMLElement;
		await expectAdopted(before, element, state);
		expect(element.style.width).toBe('');
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
// OCTANE DIVERGENCE: hydration validates a template root's node type and tag
// and its dynamic sites, not every static descendant, so two static templates
// that share a root tag are not told apart. The server's static markup is
// kept, and only the development runtime diagnoses the difference.
matrix.itRenders('can not deeply ignore reconnecting reordered children', {
	component: 'DeepReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	...reporting,
	mismatch: {
		serverComponent: 'DeepReorderedChildrenServer',
		clientComponent: 'DeepReorderedChildrenClient',
		diagnostics: unpatchedStaticMarkup,
	},
	captureBeforeHydrate: (container) => container.querySelector('#deep-reordered'),
	async assertCommon({ root, before, state }) {
		await expectAdopted(before, root.querySelector('#deep-reordered'), state);
		expect(ids(root, '#deep-reordered section')).toEqual(['deep-first', 'deep-second']);
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#different-numbers'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(root.querySelector('#different-numbers')!.textContent).toBe('3');
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#added-style-attribute'),
	async assertCommon({ root, before, state }) {
		const element = root.querySelector('#added-style-attribute') as HTMLElement;
		await expectAdopted(before, element, state);
		expect(element.style.width).toBe('');
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
		...reporting,
		mismatch: {
			serverProps: () => ({ gap: '      ' }),
			clientProps: () => ({ gap: '' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		async assertCommon({ root, before, state }) {
			await expectRootFallback(before, state);
			expect(root.querySelector('#whitespace-children')!.textContent).toBe('AB');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:150.
matrix.itRenders('can not deeply ignore errors reconnecting different attribute values', {
	component: 'DeepAttributeMismatch',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#deep-attribute'),
	async assertCommon({ root, before, state }) {
		// Suppression is one level deep: the child's differing id is diagnosed
		// and, like any attribute, kept from the server.
		await expectAdopted(before, root.querySelector('#deep-attribute'), state);
		expect(root.querySelector('#server-child')).not.toBeNull();
		expect(root.querySelector('#client-child')).toBeNull();
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#different-child-type'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#number-vs-text'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(root.querySelector('#number-vs-text')!.textContent).toBe('3');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:294.
// OCTANE DIVERGENCE: two static templates that share a root tag are not told
// apart (see :387 above), so the server's static children are kept.
matrix.itRenders('should error reconnecting reordered children', {
	component: 'ReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	...reporting,
	mismatch: {
		serverComponent: 'ReorderedChildrenServer',
		clientComponent: 'ReorderedChildrenClient',
		diagnostics: unpatchedStaticMarkup,
	},
	captureBeforeHydrate: (container) => container.querySelector('#reordered-children'),
	async assertCommon({ root, before, state }) {
		await expectAdopted(before, root.querySelector('#reordered-children'), state);
		expect(ids(root, '#reordered-children')).toEqual(['reordered-first', 'reordered-second']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:168.
matrix.itRenders('should error reconnecting empty style attribute', {
	component: 'EmptyStyleAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#empty-style-attribute'),
	async assertCommon({ root, before, state }) {
		const element = root.querySelector('#empty-style-attribute') as HTMLElement;
		await expectAdopted(before, element, state);
		expect(element.style.width).toBe('1px');
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:162.
matrix.itRenders('should error reconnecting missing style attribute', {
	component: 'MissingStyleAttribute',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#missing-style-attribute'),
	async assertCommon({ root, before, state }) {
		const element = root.querySelector('#missing-style-attribute') as HTMLElement;
		await expectAdopted(before, element, state);
		expect(element.style.width).toBe('1px');
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#missing-children'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(root.querySelector('#missing-children')).not.toBeNull();
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#adjacent-text-mismatch'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(root.querySelector('#adjacent-text-mismatch')!.textContent).toBe('Text1Text3');
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
		...reporting,
		mismatch: {
			serverProps: () => ({ gap: ' ' }),
			clientProps: () => ({ gap: '      ' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		async assertCommon({ root, before, state }) {
			await expectRootFallback(before, state);
			expect(root.querySelector('#whitespace-children')!.textContent).toBe('A      B');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:353.
matrix.itRenders('can not ignore reconnecting more children', {
	component: 'SuppressedMoreChildren',
	modes: ['hydrate-mismatch'],
	mismatch: clientFlagMismatch,
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-more-children'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(ids(root, '#suppressed-more-children')).toEqual(['more-first', 'more-second']);
	},
});

// Per ReactDOMServerIntegrationReconnecting-test.js:306.
matrix.itRenders(
	'should error reconnecting a div with children separated by whitespace on the client',
	{
		component: 'WhitespaceBetweenChildren',
		modes: ['hydrate-mismatch'],
		...reporting,
		mismatch: {
			serverProps: () => ({ gap: '' }),
			clientProps: () => ({ gap: '      ' }),
		},
		captureBeforeHydrate: (container) => container.querySelector('#whitespace-children'),
		async assertCommon({ root, before, state }) {
			await expectRootFallback(before, state);
			expect(root.querySelector('#whitespace-children')!.textContent).toBe('A      B');
		},
	},
);

// Per ReactDOMServerIntegrationReconnecting-test.js:375.
// OCTANE DIVERGENCE: two static templates that share a root tag are not told
// apart (see :387 above), so the server's static children are kept.
matrix.itRenders('can not ignore reconnecting reordered children', {
	component: 'SuppressedReorderedChildrenServer',
	modes: ['hydrate-mismatch'],
	...reporting,
	mismatch: {
		serverComponent: 'SuppressedReorderedChildrenServer',
		clientComponent: 'SuppressedReorderedChildrenClient',
		diagnostics: unpatchedStaticMarkup,
	},
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-reordered'),
	async assertCommon({ root, before, state }) {
		await expectAdopted(before, root.querySelector('#suppressed-reordered'), state);
		expect(ids(root, '#suppressed-reordered')).toEqual(['suppressed-first', 'suppressed-second']);
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#empty-vs-node'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(root.querySelector('#empty-vs-node')).not.toBeNull();
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
	...reporting,
	captureBeforeHydrate: (container) => container.querySelector('#suppressed-fewer-children'),
	async assertCommon({ root, before, state }) {
		await expectRootFallback(before, state);
		expect(ids(root, '#suppressed-fewer-children')).toEqual(['fewer-first']);
	},
});
