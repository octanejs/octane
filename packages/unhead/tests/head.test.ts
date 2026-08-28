import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { Head } from '@octanejs/unhead';
import { createHead } from '@octanejs/unhead/client';
import { Helmet } from '@octanejs/unhead/helmet';
import { renderSSRHead } from '@octanejs/unhead/server';
import { SimpleHead } from './_fixtures/simple-head';
import { withHead } from './_helpers';

describe('simpleHead component', function simpleHeadComponent() {
	afterEach(function after() {
		cleanup();
	});

	// Per packages/unhead/upstream/canonical/test/SimpleHead.test.tsx:11
	it('renders default head tags correctly', async function rendersDefaultTags() {
		const head = createHead();
		render(withHead(head, createElement(SimpleHead)));

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Default Title 2</title>');
		expect(rendered.headTags).toContain(
			'<meta name="viewport" content="width=device-width, initial-scale=1">',
		);
		expect(rendered.headTags).toContain('<meta name="description" content="Default Description">');
		expect(rendered.headTags).toContain('<link rel="stylesheet" href="default-styles.css">');
		expect(rendered.headTags).toContain('<style>body { background-color: #f0f0f0; }</style>');
		expect(rendered.headTags).toContain('<link rel="icon" href="favicon.ico">');
		expect(rendered.headTags).toContain('https://schema.org');
	});

	// Per packages/unhead/upstream/canonical/test/SimpleHead.test.tsx:40
	it('renders nothing if component is unmounted', async function unmountClearsTags() {
		const head = createHead();
		const view = render(withHead(head, createElement(SimpleHead)));
		view.unmount();

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toBe('');
	});

	// Per packages/unhead/upstream/canonical/test/SimpleHead.test.tsx:55
	it('normalizes React head prop names', async function normalizesPropNames() {
		const head = createHead();
		render(
			withHead(
				head,
				createElement(Head, {
					children: [
						createElement('meta', {
							httpEquiv: 'refresh',
							content: '0;url=/next',
							className: 'refresh metadata',
						}),
						createElement('link', {
							rel: 'preload',
							href: '/hero.png',
							as: 'image',
							crossOrigin: 'anonymous',
						}),
						createElement('script', {
							src: '/legacy.js',
							charSet: 'utf-8',
							noModule: true,
						}),
					],
				}),
			),
		);

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('http-equiv="refresh"');
		expect(rendered.headTags).toContain('class="refresh metadata"');
		expect(rendered.headTags).toContain('crossorigin="anonymous"');
		expect(rendered.headTags).toContain('charset="utf-8"');
		expect(rendered.headTags).toContain('nomodule');
	});

	// Per packages/unhead/upstream/canonical/test/SimpleHead.test.tsx:126
	it('renders nested fragment children', async function nestedFragments() {
		const { Fragment } = await import('octane');
		const head = createHead();
		render(
			withHead(
				head,
				createElement(Head, {
					children: createElement(Fragment, {
						children: [
							createElement('meta', { name: 'fragment-meta', content: 'nested' }),
							createElement(Fragment, {
								children: [
									null,
									createElement('meta', { name: 'fragment-meta-2', content: 'nested-2' }),
									createElement('script', null, 'window.__FRAGMENT_TEST__ = true'),
								],
							}),
						],
					}),
				}),
			),
		);

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<meta name="fragment-meta" content="nested">');
		expect(rendered.headTags).toContain('<meta name="fragment-meta-2" content="nested-2">');
		expect(rendered.headTags).toContain('window.__FRAGMENT_TEST__ = true');
	});

	it('interpolates a title template without applying it to the default title', async function helmetTitleTemplate() {
		const titledHead = createHead();
		render(
			withHead(
				titledHead,
				createElement(Helmet, {
					defaultTitle: 'Home',
					titleTemplate: '%s | My Site',
					title: 'Page',
				}),
			),
		);

		const titled = await renderSSRHead(titledHead);
		expect(titled.headTags).toContain('<title>Page | My Site</title>');

		cleanup();
		const fallbackHead = createHead();
		render(
			withHead(
				fallbackHead,
				createElement(Helmet, {
					defaultTitle: 'Home',
					titleTemplate: '%s | My Site',
				}),
			),
		);

		const fallback = await renderSSRHead(fallbackHead);
		expect(fallback.headTags).toContain('<title>Home</title>');
		expect(fallback.headTags).not.toContain('<title>Home | My Site</title>');
	});
});
