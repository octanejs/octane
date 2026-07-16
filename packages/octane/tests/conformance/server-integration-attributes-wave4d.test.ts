import { expect } from 'vitest';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/server-integration-attributes-wave4d.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE =
	'packages/octane/tests/conformance/_fixtures/server-integration-attributes-wave4d.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });

function element(root: ParentNode, id: string): HTMLElement {
	const value = root.querySelector<HTMLElement>(`#${id}`);
	expect(value, `missing #${id}`).not.toBeNull();
	return value!;
}

function attr(root: ParentNode, id: string, name: string): string | null {
	return element(root, id).getAttribute(name);
}

function replaceWithMismatchedMarkup(container: HTMLElement): void {
	const wrong = document.createElement('aside');
	wrong.id = 'wrong-server-tree';
	container.replaceChildren(wrong);
}

const mismatch = { mutateServerDom: replaceWithMismatchedMarkup } as const;

// ReactDOMServerIntegrationAttributes-test.js:54-114.
matrix.itRenders('serializes string attributes and strips unsafe empty URL values', {
	component: 'StringAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#string-attributes'),
	assertCommon({ root }) {
		expect(attr(root, 'width-number', 'width')).toBe('30');
		expect(attr(root, 'width-string', 'width')).toBe('30');
		expect(attr(root, 'empty-src', 'src')).toBeNull();
		expect(attr(root, 'empty-anchor-href', 'href')).toBe('');
		expect(attr(root, 'empty-base-href', 'href')).toBeNull();
		// OCTANE DIVERGENCE: Octane treats an empty area href as a legitimate
		// current-document hyperlink, like an anchor; React strips it.
		expect(attr(root, 'empty-area-href', 'href')).toBe('');
		for (const id of ['href-true', 'href-false']) expect(attr(root, id, 'href')).toBeNull();
		for (const id of ['width-null', 'width-function', 'width-symbol']) {
			expect(attr(root, id, 'width')).toBeNull();
		}
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#string-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:121-184 and canary :190-199.
matrix.itRenders('normalizes boolean attributes by truthiness', {
	component: 'BooleanAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#boolean-attributes'),
	assertCommon({ root }) {
		for (const id of [
			'hidden-true',
			'hidden-self',
			'hidden-string',
			'hidden-array',
			'hidden-object',
			'hidden-ten',
			'credentialless-true',
		]) {
			expect(attr(root, id, id.startsWith('credentialless') ? 'credentialless' : 'hidden')).toBe(
				'',
			);
		}
		for (const id of [
			'hidden-false',
			'hidden-empty',
			'hidden-zero',
			'hidden-null',
			'hidden-function',
			'hidden-symbol',
			'credentialless-false',
		]) {
			expect(
				attr(root, id, id.startsWith('credentialless') ? 'credentialless' : 'hidden'),
			).toBeNull();
		}
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#boolean-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:207-242 (canary lines).
matrix.itRenders('serializes overloaded boolean download attributes', {
	component: 'DownloadAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#download-attributes'),
	assertCommon({ root }) {
		expect(attr(root, 'download-true', 'download')).toBe('');
		expect(attr(root, 'download-false', 'download')).toBeNull();
		expect(attr(root, 'download-string', 'download')).toBe('myfile');
		expect(attr(root, 'download-string-false', 'download')).toBe('false');
		expect(attr(root, 'download-string-true', 'download')).toBe('true');
		expect(attr(root, 'download-zero', 'download')).toBe('0');
		for (const id of [
			'download-null',
			'download-undefined',
			'download-function',
			'download-symbol',
		]) {
			expect(attr(root, id, 'download')).toBeNull();
		}
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#download-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:259-326 (canary lines).
matrix.itRenders('maps class and htmlFor attributes with native casing outcomes', {
	component: 'ClassAndForAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#class-for-attributes'),
	assertCommon({ root }) {
		expect(attr(root, 'class-string', 'class')).toBe('myClassName');
		expect(attr(root, 'class-empty', 'class')).toBe('');
		// OCTANE DIVERGENCE: class/className is clsx-composed, so truthy booleans
		// normalize to an empty class value while React drops the attribute.
		expect(attr(root, 'class-true', 'class')).toBe('');
		expect(attr(root, 'class-zero', 'class')).toBe('');
		expect(attr(root, 'class-false', 'class')).toBeNull();
		expect(attr(root, 'class-null', 'class')).toBeNull();
		expect(attr(root, 'class-lowercase', 'classname')).toBe('test');
		expect(attr(root, 'class-lowercase', 'class')).toBeNull();
		expect(attr(root, 'class-alias', 'class')).toBe('test');
		expect(attr(root, 'class-odd-alias', 'class')).toBe('test');
		expect(attr(root, 'for-string', 'for')).toBe('myFor');
		expect(attr(root, 'for-lowercase', 'for')).toBeNull();
		expect(attr(root, 'for-lowercase', 'htmlfor')).toBe('myFor');
		expect(attr(root, 'for-empty', 'for')).toBe('');
		for (const id of ['for-true', 'for-false', 'for-null']) {
			expect(attr(root, id, 'for')).toBeNull();
		}
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#class-for-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:337-415 (canary lines). The
// upstream ref case uses a class only as setup; the observable reserved-prop
// contract is covered here with Octane's supported callback-ref API.
matrix.itRenders('serializes numeric attributes and omits reserved props', {
	component: 'NumericAndReservedAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#numeric-reserved-attributes'),
	assertCommon({ root }) {
		expect(attr(root, 'size-positive', 'size')).toBe('2');
		expect(attr(root, 'start-zero', 'start')).toBe('0');
		for (const [id, name] of [
			['size-zero', 'size'],
			['size-string-zero', 'size'],
			['start-function', 'start'],
			['start-symbol', 'start'],
			['size-function', 'size'],
			['size-symbol', 'size'],
			['reserved-ref', 'ref'],
			['reserved-children', 'children'],
			['reserved-key', 'key'],
			['reserved-html', 'dangerouslySetInnerHTML'],
			['reserved-content-editable', 'suppressContentEditableWarning'],
			['reserved-hydration', 'suppressHydrationWarning'],
		] as const) {
			expect(attr(root, id, name)).toBeNull();
		}
		expect(element(root, 'reserved-children').textContent).toBe('foo');
		expect(element(root, 'reserved-html').innerHTML).toBe('<b>safe</b>');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#numeric-reserved-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:422-493 (canary lines).
matrix.itRenders('serializes inline style values with CSS unit rules', {
	component: 'StyleAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#style-attributes'),
	assertCommon({ root }) {
		const simple = element(root, 'style-simple');
		expect(simple.style.color).toBe('red');
		expect(simple.style.width).toBe('30px');
		const px = element(root, 'style-px');
		expect(px.style.left).toBe('0px');
		expect(px.style.margin).toBe('16px');
		expect(px.style.opacity).toBe('0.5');
		expect(px.style.padding).toBe('4px');
		expect(element(root, 'style-custom').style.getPropertyValue('--foo')).toBe('5');
		expect(element(root, 'style-custom-cased').style.getPropertyValue('--someColor')).toBe(
			'#000000',
		);
		for (const id of ['style-undefined', 'style-null']) {
			expect(element(root, id).style.color).toBe('');
			expect(element(root, id).style.width).toBe('30px');
		}
		expect(element(root, 'style-empty').hasAttribute('style')).toBe(false);
		expect(element(root, 'style-unitless').style.lineClamp).toBe('10');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#style-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:506-704 (canary lines). Warning
// wording is React-specific; these assertions cover the public DOM outcomes.
matrix.itRenders('serializes aria, unknown, event-like, and SVG attributes', {
	component: 'AriaUnknownAndSvgAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#aria-unknown-svg-attributes'),
	assertCommon({ root }) {
		expect(attr(root, 'aria-string', 'aria-label')).toBe('hello');
		expect(attr(root, 'aria-false', 'aria-label')).toBe('false');
		expect(attr(root, 'aria-null', 'aria-label')).toBeNull();
		expect(attr(root, 'aria-bare', 'aria')).toBe('hello');
		expect(attr(root, 'accept-charset-lowercase', 'accept-charset')).toBeNull();
		expect(attr(root, 'accept-charset-lowercase', 'acceptcharset')).toBe('utf-8');
		expect(attr(root, 'unknown-string', 'foo')).toBe('bar');
		expect(attr(root, 'unknown-data', 'data-foo')).toBe('bar');
		expect(attr(root, 'reserved-uppercase', 'children')).toBe('5');
		expect(attr(root, 'object-data', 'data')).toBe('hello');
		expect(attr(root, 'data-null', 'data-foo')).toBeNull();
		expect(attr(root, 'data-cased', 'data-foobar')).toBe('true');
		expect(attr(root, 'data-true', 'data-foobar')).toBe('true');
		expect(attr(root, 'data-false', 'data-foobar')).toBe('false');
		expect(attr(root, 'data-cased-null', 'data-foobar')).toBeNull();
		expect(attr(root, 'nonstandard-foo', 'foo')).toBe('bar');
		expect(attr(root, 'custom-cased', 'foobar')).toBe('test');
		expect(attr(root, 'known-event', 'onclick')).toBeNull();
		expect(attr(root, 'unknown-event', 'onunknownevent')).toBeNull();
		expect(attr(root, 'on-attribute', 'on')).toBe('tap:do-something');

		const textLength = element(root, 'svg-textlength');
		// OCTANE DIVERGENCE: a statically-authored, badly-cased SVG attribute is
		// parsed through Octane's compiled template in every mode, so the HTML/SVG
		// parser corrects `textlength` to `textLength`. React's imperative clean
		// client mount preserves the bad spelling and warns instead.
		expect(textLength.getAttribute('textLength')).toBe('10');
		expect(textLength.hasAttribute('textlength')).toBe(false);
		expect(attr(root, 'svg-bad-alias', 'stroke-dasharray')).toBeNull();
		expect(attr(root, 'svg-bad-alias', 'strokedasharray')).toBe('10 10');
		expect(attr(root, 'svg-authored-alias', 'stroke-dasharray')).toBe('10 10');
		expect(attr(root, 'svg-dashed-tag', 'accentHeight')).toBeNull();
		expect(attr(root, 'svg-dashed-tag', 'accent-height')).toBe('10');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#aria-unknown-svg-attributes')).toBe(before);
		},
	},
});

// ReactDOMServerIntegrationAttributes-test.js:719-808 (canary lines).
matrix.itRenders('serializes native and custom-element attribute contracts', {
	component: 'CustomElementAttributes',
	mismatch,
	captureBeforeHydrate: (container) => container.querySelector('#custom-element-attributes'),
	assertCommon({ root }) {
		for (const id of ['is-class', 'is-class-name', 'custom-class-name']) {
			expect(attr(root, id, 'class')).toBe('test');
			expect(attr(root, id, 'className')).toBeNull();
		}
		expect(attr(root, 'is-html-for', 'for')).toBe('test');
		expect(attr(root, 'is-html-for', 'htmlFor')).toBeNull();
		expect(attr(root, 'custom-html-for', 'htmlFor')).toBe('test');
		expect(attr(root, 'custom-html-for', 'for')).toBeNull();
		expect(attr(root, 'is-for', 'for')).toBe('test');
		expect(attr(root, 'custom-foo', 'foo')).toBe('bar');
		expect(attr(root, 'custom-on', 'onunknown')).toBe('bar');
		expect(attr(root, 'custom-true', 'foo')).toBe('');
		expect(attr(root, 'custom-false', 'foo')).toBeNull();
		expect(attr(root, 'inert-true', 'inert')).toBe('');
		expect(attr(root, 'inert-empty', 'inert')).toBeNull();
		expect(attr(root, 'inert-false', 'inert')).toBeNull();
		expect(attr(root, 'custom-null', 'foo')).toBeNull();
		expect(attr(root, 'is-foo', 'foo')).toBe('bar');
		expect(attr(root, 'is-foo-null', 'foo')).toBeNull();
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#custom-element-attributes')).toBe(before);
		},
	},
});
