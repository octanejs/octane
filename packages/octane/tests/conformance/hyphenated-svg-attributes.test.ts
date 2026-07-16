import { expect } from 'vitest';
import { flushSync } from 'octane';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/hyphenated-svg-attributes.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/hyphenated-svg-attributes.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const NATIVE_IDS = [
	'static-font',
	'dynamic-font',
	'spread-font',
	'component-font',
	'static-glyph',
	'dynamic-glyph',
	'spread-glyph',
	'descriptor-glyph',
	'descriptor-nested-font',
] as const;
const DYNAMIC_NATIVE_IDS = [
	'dynamic-font',
	'spread-font',
	'component-font',
	'dynamic-glyph',
	'spread-glyph',
	'descriptor-glyph',
	'descriptor-nested-font',
] as const;

function props(stroke = '2', size = 0, hidden = 0, title: unknown = true) {
	return {
		stroke,
		size,
		hidden,
		title,
		nativeAttrs: { strokeWidth: stroke, size, hidden },
		customFor: 'direct-label',
		customAttrs: { htmlFor: 'spread-label', size, hidden, title },
	};
}

function element(root: ParentNode, id: string): Element {
	const value = root.querySelector(`#${id}`);
	expect(value, `missing #${id}`).not.toBeNull();
	return value!;
}

function expectNativeInitial(root: ParentNode): void {
	for (const id of NATIVE_IDS) {
		const value = element(root, id);
		expect(value.namespaceURI).toBe(SVG_NS);
		expect(value.getAttribute('stroke-width')).toBe('2');
		expect(value.hasAttribute('strokeWidth')).toBe(false);
		expect(value.hasAttribute('size')).toBe(false);
		expect(value.hasAttribute('hidden')).toBe(false);
		expect(value.hasAttribute('title')).toBe(false);
	}
}

function expectCustomInitial(root: ParentNode): void {
	const direct = element(root, 'dynamic-custom');
	const spread = element(root, 'spread-custom');
	expect(direct.namespaceURI).toBe(HTML_NS);
	expect(spread.namespaceURI).toBe(HTML_NS);
	expect(direct.getAttribute('htmlfor')).toBe('direct-label');
	expect(spread.getAttribute('htmlfor')).toBe('spread-label');
	for (const value of [direct, spread]) {
		expect(value.hasAttribute('for')).toBe(false);
		expect(value.getAttribute('size')).toBe('0');
		expect(value.getAttribute('hidden')).toBe('0');
		expect(value.getAttribute('title')).toBe('');
	}
}

function expectUpdated(root: ParentNode): void {
	for (const id of DYNAMIC_NATIVE_IDS) {
		const value = element(root, id);
		expect(value.getAttribute('stroke-width')).toBe('5');
		expect(value.getAttribute('size')).toBe('3');
		expect(value.getAttribute('hidden')).toBe('');
	}
	for (const id of ['dynamic-custom', 'spread-custom']) {
		const value = element(root, id);
		expect(value.getAttribute('size')).toBe('3');
		expect(value.getAttribute('hidden')).toBe('1');
		expect(value.getAttribute('title')).toBe('updated');
	}
}

// Per ReactDOMComponent-test.js:3649 and :3671: SVG's native hyphenated
// `font-face` tag is not a custom element and uses native aliases/value rules.
// `missing-glyph` has the same namespace-sensitive contract. The matrix runs
// static, dynamic, spread, component-root, and descriptor props through client,
// SSR, streaming, matching hydration, and both Vitest compile projects.
matrix.itRenders('treats hyphenated SVG tags as native without changing HTML custom elements', {
	component: 'HyphenatedSvgAttributes',
	props: () => props(),
	captureBeforeHydrate: (container) => container.querySelector('#hyphenated-svg-attributes'),
	assertCommon({ root }) {
		expectNativeInitial(root);
		expectCustomInitial(root);
	},
	assertByMode: {
		client({ root, octaneRoot }) {
			octaneRoot!.render(client.HyphenatedSvgAttributes, props('5', 3, 1, 'updated'));
			flushSync(() => {});
			expectUpdated(root);
		},
		'hydrate-match'({ root, before, octaneRoot }) {
			expect(root.querySelector('#hyphenated-svg-attributes')).toBe(before);
			octaneRoot!.render(client.HyphenatedSvgAttributes, props('5', 3, 1, 'updated'));
			flushSync(() => {});
			expectUpdated(root);
		},
	},
});
