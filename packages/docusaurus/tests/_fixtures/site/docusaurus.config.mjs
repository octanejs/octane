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
				modules: { data },
			});
		},
		getPathsToWatch() {
			return [path.join(context.siteDir, 'watched.txt')];
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
	url: 'https://example.test',
	baseUrl: '/docs/',
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
