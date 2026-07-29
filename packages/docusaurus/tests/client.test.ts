// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDocusaurusMemoryRouter, type DocusaurusRouteModuleRegistry } from '../src/client.js';
import type { DocusaurusManifest } from '../src/index.js';
import { mount, nextPaint } from '../../octane/tests/_helpers';
import {
	AdvancedContent,
	ClientRouterApp,
	DocItem,
	DocsLayout,
	IntroContent,
} from './_fixtures/client-router.tsrx';

async function flushRouting() {
	for (let index = 0; index < 4; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

function createManifest(): DocusaurusManifest {
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

describe('Docusaurus client routing', () => {
	it('loads matched route modules, renders nested outlets, and navigates without reloading', async () => {
		const loads: string[] = [];
		const importer = (id: string, module: Record<string, unknown>) => async () => {
			loads.push(id);
			return module;
		};
		const modules: DocusaurusRouteModuleRegistry = {
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
		const manifest = createManifest();
		const router = createDocusaurusMemoryRouter(manifest, modules, {
			initialEntries: ['/docs/guide/intro'],
		});
		const result = mount(ClientRouterApp, { manifest, router });

		await flushRouting();

		expect(result.find('section').getAttribute('data-plugin')).toBe('docs');
		expect(result.find('article').getAttribute('data-context')).toBe('guides:doc');
		expect(result.find('article').getAttribute('data-related')).toBe('next');
		expect(result.find('article').getAttribute('data-version')).toBe('current');
		expect(result.find('h1').textContent).toBe('Introduction');
		expect(result.find('p').textContent).toBe('Introduction body');
		expect(loads).not.toContain('advanced');

		await router.navigate('/docs/guide/advanced');
		await flushRouting();

		expect(router.state.location.pathname).toBe('/docs/guide/advanced');
		expect(result.find('h1').textContent).toBe('Advanced');
		expect(result.find('p').textContent).toBe('Advanced body');
		expect(loads.filter((id) => id === 'layout')).toHaveLength(1);
		expect(loads.filter((id) => id === 'item')).toHaveLength(1);
		expect(loads.filter((id) => id === 'related')).toHaveLength(1);
		result.unmount();
	});
});
