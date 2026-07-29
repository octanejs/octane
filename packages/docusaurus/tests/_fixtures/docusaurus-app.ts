import type { DocusaurusRouteModuleRegistry } from '../../types/client.js';
import type { DocusaurusManifest } from '../../types/index.js';
import { AdvancedContent, DocItem, DocsLayout, IntroContent } from './client-router.tsrx';

export function createDocusaurusTestManifest(): DocusaurusManifest {
	return {
		schemaVersion: 1,
		docusaurusVersion: '3.10.1',
		siteDir: '/site',
		generatedFilesDir: '/site/.docusaurus',
		outDir: '/site/build',
		baseUrl: '/docs/',
		routesPaths: ['/docs/guide/intro', '/docs/guide/advanced'],
		routes: [
			{
				id: 'root/docs',
				path: '/docs/guide',
				component: 'virtual:docs-layout',
				exact: false,
				plugin: { name: 'docs', id: 'default' },
				context: {
					plugin: 'virtual:plugin',
					data: { section: 'virtual:section' },
				},
				children: [
					{
						id: 'root/docs/intro',
						path: '/docs/guide/intro',
						component: 'virtual:doc-item',
						exact: true,
						props: { version: 'current' },
						modules: {
							content: 'virtual:intro',
							related: {
								label: {
									__import: true,
									path: 'virtual:related?raw',
									query: { locale: 'en' },
								},
							},
						},
						context: { data: { kind: 'virtual:kind' } },
						children: [],
					},
					{
						id: 'root/docs/advanced',
						path: '/docs/guide/advanced',
						component: 'virtual:doc-item',
						exact: true,
						props: { version: 'current' },
						modules: {
							content: 'virtual:advanced',
							related: {
								label: {
									__import: true,
									path: 'virtual:related?raw',
									query: { locale: 'en' },
								},
							},
						},
						context: { data: { kind: 'virtual:kind' } },
						children: [],
					},
				],
			},
		],
		globalData: {},
		content: {},
		aliases: {
			site: '/site',
			generated: '/site/.docusaurus',
			docs: '/site/.docusaurus/docusaurus-plugin-content-docs',
			theme: {},
			themeOriginal: {},
			themeInit: {},
		},
	};
}

export function createDocusaurusTestRegistry(loads: string[] = []): DocusaurusRouteModuleRegistry {
	const importer = (id: string, module: Record<string, unknown>) => async () => {
		loads.push(id);
		return module;
	};
	return {
		'virtual:docs-layout': importer('layout', { default: DocsLayout }),
		'virtual:doc-item': importer('item', { default: DocItem }),
		'virtual:plugin': importer('plugin', {
			default: { name: 'docs', id: 'default' },
		}),
		'virtual:section': importer('section', { default: 'guides' }),
		'virtual:kind': importer('kind', { default: 'doc' }),
		'virtual:related?raw&locale=en': importer('related', { default: 'next' }),
		'virtual:intro': importer('intro', {
			default: IntroContent,
			title: 'Introduction',
		}),
		'virtual:advanced': importer('advanced', {
			default: AdvancedContent,
			title: 'Advanced',
		}),
	};
}
