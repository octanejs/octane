import { describe, expect, it } from 'vitest';
import { prerenderDocusaurusDocument, prerenderDocusaurusRoute } from '@octanejs/docusaurus/server';
import {
	DocCategoryGeneratedIndexPage,
	DocItem,
	DocRoot,
	DocsRoot,
	DocVersionRoot,
} from '../../src/theme-components.tsrx';
import type { DocusaurusRouteModuleRegistry } from '../../types/client.js';
import type { DocusaurusManifest } from '../../types/index.js';
import {
	createDocusaurusTestManifest,
	createDocusaurusTestRegistry,
} from '../_fixtures/docusaurus-app.js';
import { ClassicIntroContent } from './_fixtures/classic-theme.tsrx';

function classicThemeFixture(): {
	manifest: DocusaurusManifest;
	registry: DocusaurusRouteModuleRegistry;
} {
	const manifest = createDocusaurusTestManifest();
	manifest.site.themeConfig = {
		navbar: {
			title: 'Octane',
			logo: {
				alt: 'Octane docs',
				href: '/home',
				src: '/img/logo.svg',
			},
			items: [{ label: 'Guide', to: '/guide/intro' }],
		},
		footer: {
			links: [
				{
					title: 'Learn',
					items: [{ label: 'Introduction', href: '/guide/intro' }],
				},
			],
			copyright: '<a href="/license">Octane project</a> &copy; 2026',
		},
	};
	manifest.routes = [
		{
			id: 'root/docs',
			path: '/docs/guide',
			component: 'classic:DocsRoot',
			exact: false,
			plugin: { name: 'docusaurus-plugin-content-docs', id: 'default' },
			children: [
				{
					id: 'root/docs/version',
					path: '/docs/guide',
					component: 'classic:DocVersionRoot',
					exact: false,
					props: {
						version: {
							label: 'Next',
							noIndex: false,
							docsSidebars: {
								guide: [
									{
										type: 'category',
										label: 'Start',
										href: '/docs/guide/start',
										items: [
											{
												type: 'link',
												label: 'Introduction',
												href: '/docs/guide/intro',
											},
										],
									},
								],
							},
						},
					},
					children: [
						{
							id: 'root/docs/version/root',
							path: '/docs/guide',
							component: 'classic:DocRoot',
							exact: false,
							children: [
								{
									id: 'root/docs/version/root/intro',
									path: '/docs/guide/intro',
									component: 'classic:DocItem',
									exact: true,
									modules: { content: 'classic:IntroContent' },
									attributes: { sidebar: 'guide' },
									children: [],
								},
								{
									id: 'root/docs/version/root/start',
									path: '/docs/guide/start',
									component: 'classic:Category',
									exact: true,
									props: {
										categoryGeneratedIndex: {
											title: 'Start',
											description: 'Begin with the Octane guide.',
											permalink: '/docs/guide/start',
											navigation: {
												next: {
													title: 'Introduction',
													permalink: '/docs/guide/intro',
												},
											},
										},
									},
									attributes: { sidebar: 'guide' },
									children: [],
								},
							],
						},
					],
				},
			],
		},
	];
	const module = (value: unknown) => async () => ({ default: value });
	return {
		manifest,
		registry: {
			'classic:DocsRoot': module(DocsRoot),
			'classic:DocVersionRoot': module(DocVersionRoot),
			'classic:DocRoot': module(DocRoot),
			'classic:DocItem': module(DocItem),
			'classic:Category': module(DocCategoryGeneratedIndexPage),
			'classic:IntroContent': async () => ({
				default: ClassicIntroContent,
				contentTitle: 'Introduction',
				frontMatter: {},
				metadata: {
					title: 'Introduction',
					description: 'Start building with Octane.',
					permalink: '/docs/guide/intro',
					next: {
						title: 'Advanced',
						permalink: '/docs/guide/advanced',
					},
				},
			}),
		},
	};
}

describe('Docusaurus static rendering', () => {
	it('prerenders a manifest route pathname without loading sibling content', async () => {
		const loads: string[] = [];
		const result = await prerenderDocusaurusRoute(
			'/docs/guide/intro',
			createDocusaurusTestManifest(),
			createDocusaurusTestRegistry(loads),
		);

		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect response.');

		expect(result.context.statusCode).toBe(200);
		expect(result.context.location.pathname).toBe('/docs/guide/intro');
		expect(result.html).toContain('<section data-plugin="docs">');
		expect(result.html).toContain('<article data-context="guides:doc"');
		expect(result.html).toContain('<h1>Introduction</h1>');
		expect(result.html).toContain('<p>Introduction body</p>');
		expect(result.html).not.toContain('Advanced body');
		expect(result.head).toContain('<title>Octane Docs</title>');
		expect(result.head).toContain('name="viewport"');
		expect(result.css).toBe('');
		expect(loads).toEqual(['layout', 'plugin', 'section', 'item', 'intro', 'related', 'kind']);
	});

	it('renders the Octane classic docs shell and page metadata', async () => {
		const { manifest, registry } = classicThemeFixture();
		const result = await prerenderDocusaurusRoute('/docs/guide/intro', manifest, registry);

		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect response.');

		expect(result.html).toContain('class="octane-docs-navbar"');
		expect(result.html).toContain('href="/docs/home"');
		expect(result.html).toContain('src="/docs/img/logo.svg"');
		expect(result.html.match(/href="\/docs\/guide\/intro"/g)).toHaveLength(3);
		expect(result.html).not.toContain('href="/guide/intro"');
		expect(result.html).toContain('aria-label="Documentation sidebar"');
		expect(result.html).toContain('aria-current="page"');
		expect(result.html).toContain('<p>Classic theme body</p>');
		expect(result.html).toContain('href="/docs/guide/advanced"');
		expect(result.html).toContain('<a href="/license">Octane project</a> &copy; 2026');
		expect(result.html).not.toContain('&lt;a href="/license"');
		expect(result.head).toContain('<title>Introduction | Octane Docs</title>');
		expect(result.head).toContain('content="Start building with Octane."');
		expect(result.head).toContain('href="https://octane.example/docs/guide/intro"');
	});

	it('derives generated category cards from Docusaurus sidebar metadata', async () => {
		const { manifest, registry } = classicThemeFixture();
		const result = await prerenderDocusaurusRoute('/docs/guide/start', manifest, registry);

		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect response.');

		expect(result.html).toContain('<h1>Start</h1>');
		expect(result.html).toContain('Begin with the Octane guide.');
		expect(result.html).toContain('class="octane-docs-card"');
		expect(result.html).toContain('href="/docs/guide/intro"');
		expect(result.head).toContain('<title>Start | Octane Docs</title>');
		expect(result.head).toContain('href="https://octane.example/docs/guide/start"');
	});

	it('composes route output, plugin tags, build assets, and hydration into a document', async () => {
		const manifest = createDocusaurusTestManifest();
		manifest.document = {
			htmlAttributes: { lang: 'en', dir: 'ltr' },
			headTags: '<meta name="plugin-head" content="ready">',
			preBodyTags: '<div id="before-root">before</div>',
			postBodyTags: '<div id="after-root">after</div>',
		};
		const result = await prerenderDocusaurusDocument(
			'/docs/guide/intro',
			manifest,
			createDocusaurusTestRegistry(),
			{
				nonce: 'phase-6',
				document: {
					htmlAttributes: { 'data-build': '<phase&6>' },
					bodyAttributes: { class: 'docs-body', 'data-ready': true },
					assets: {
						stylesheets: [
							'assets/site.css',
							{
								href: '/shared.css',
								integrity: 'sha384-fixture',
								crossOrigin: 'anonymous',
							},
						],
						modulePreloads: ['assets/route.js', 'assets/route.js'],
						scripts: [{ src: 'assets/vendor.js', async: true }],
					},
					hydrate: 'assets/hydrate.js',
				},
			},
		);

		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect response.');

		expect(result.bodyHtml).toContain('<h1>Introduction</h1>');
		expect(result.html).toMatch(/^<!DOCTYPE html>\n<html lang="en" dir="ltr"/);
		expect(result.html).toContain('data-build="&lt;phase&amp;6&gt;"');
		expect(result.html).toContain('<meta charset="UTF-8">');
		expect(result.html).toContain('content="Docusaurus v3.10.1"');
		expect(result.html).toContain('<meta name="plugin-head" content="ready">');
		expect(result.html).toContain('<link rel="stylesheet" href="/docs/assets/site.css">');
		expect(result.html).toContain(
			'<link rel="stylesheet" href="/shared.css" integrity="sha384-fixture" crossorigin="anonymous">',
		);
		expect(result.html.match(/rel="modulepreload"/g)).toHaveLength(1);
		expect(result.html).toContain(
			'<script type="module" nonce="phase-6" src="/docs/assets/vendor.js" async></script>',
		);
		expect(result.html).toContain('<body class="docs-body" data-ready>');
		expect(result.html).toContain('<div id="before-root">before</div>');
		expect(result.html).toContain('<div id="__docusaurus">');
		expect(result.html).toContain('<div id="after-root">after</div>');
		expect(result.html).toContain(
			'<script type="module" data-octane-hydrate nonce="phase-6" src="/docs/assets/hydrate.js"></script>',
		);
	});
});
