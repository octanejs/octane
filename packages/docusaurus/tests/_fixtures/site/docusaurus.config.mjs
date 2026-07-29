import path from 'node:path';

function fixtureContentPlugin(context) {
	return {
		name: 'octane-fixture-content',
		async loadContent() {
			return { label: 'plugin payload' };
		},
		async contentLoaded({ content, actions }) {
			const data = await actions.createData(
				'custom-page.json',
				JSON.stringify({ ...content, source: 'custom plugin' }),
			);
			actions.setGlobalData({ enabled: true });
			actions.addRoute({
				path: '/custom',
				component: '@site/src/pages/custom.js',
				exact: true,
				modules: {
					data,
					nested: { duplicate: data },
					queried: {
						__import: true,
						path: `${data}?raw`,
						query: { source: 'fixture' },
					},
				},
			});
		},
		getPathsToWatch() {
			return [path.join(context.siteDir, 'watched.txt')];
		},
		getClientModules() {
			return [path.join(context.siteDir, 'src/client-module.css')];
		},
		injectHtmlTags() {
			return {
				headTags: [
					{
						tagName: 'meta',
						attributes: { name: 'fixture-plugin', content: 'head' },
					},
				],
				preBodyTags: [
					{
						tagName: 'div',
						attributes: { id: 'fixture-before' },
						innerHTML: 'before',
					},
				],
				postBodyTags: [
					{
						tagName: 'div',
						attributes: { id: 'fixture-after' },
						innerHTML: 'after',
					},
				],
			};
		},
	};
}

function fixtureThemePlugin(context) {
	return {
		name: 'octane-fixture-theme',
		getThemePath() {
			return path.join(context.siteDir, 'theme-base');
		},
	};
}

function fixtureInitialThemePlugin(context) {
	return {
		name: 'octane-fixture-initial-theme',
		getThemePath() {
			return path.join(context.siteDir, 'theme-initial');
		},
	};
}

export default {
	title: 'Octane Docusaurus fixture',
	tagline: 'A renderer-neutral fixture',
	url: 'https://example.test',
	baseUrl: '/docs/',
	favicon: 'img/favicon.svg',
	themeConfig: {
		navbar: {
			title: 'Fixture docs',
			items: [{ label: 'Guide', to: '/docs/guide/intro' }],
		},
		footer: {
			copyright: 'Fixture project',
		},
	},
	onBrokenLinks: 'throw',
	plugins: [
		[
			'@docusaurus/plugin-content-docs',
			{
				routeBasePath: 'guide',
				sidebarPath: './sidebars.js',
			},
		],
		fixtureContentPlugin,
	],
	themes: [fixtureInitialThemePlugin, fixtureThemePlugin],
};
