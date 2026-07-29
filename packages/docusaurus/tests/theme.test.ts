import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDocusaurusManifest, loadDocusaurusSite } from '../src/index.js';
import octaneClassicTheme, { octaneClassicTheme as namedTheme } from '../src/theme.js';
import { createSiteFixture } from './helpers.js';

describe('Octane Docusaurus classic theme', () => {
	it('exposes concrete Octane theme modules and its client stylesheet', () => {
		const plugin = octaneClassicTheme();
		const themePath = plugin.getThemePath();

		expect(namedTheme).toBe(octaneClassicTheme);
		expect(plugin.name).toBe('@octanejs/docusaurus-theme-classic');
		expect(path.isAbsolute(themePath)).toBe(true);
		for (const moduleName of [
			'Root',
			'DocsRoot',
			'DocVersionRoot',
			'DocRoot',
			'DocItem',
			'DocCategoryGeneratedIndexPage',
			'DocTagsListPage',
			'DocTagDocListPage',
		]) {
			expect(existsSync(path.join(themePath, `${moduleName}.js`))).toBe(true);
		}
		expect(plugin.getClientModules()).toEqual([path.join(themePath, 'styles.css')]);
	});

	it('loads through the real Docusaurus theme lifecycle', async () => {
		const fixture = createSiteFixture();
		try {
			const configFile = path.join(fixture.siteDir, 'docusaurus.config.mjs');
			const themeModule = pathToFileURL(path.resolve(import.meta.dirname, '../src/theme.js')).href;
			const config = readFileSync(configFile, 'utf8')
				.replace(
					"import path from 'node:path';",
					`import path from 'node:path';\nimport octaneClassicTheme from ${JSON.stringify(themeModule)};`,
				)
				.replace(
					'themes: [fixtureInitialThemePlugin, fixtureThemePlugin],',
					'themes: [fixtureInitialThemePlugin, fixtureThemePlugin, octaneClassicTheme],',
				);
			writeFileSync(configFile, config);

			const manifest = await createDocusaurusManifest(
				await loadDocusaurusSite({ siteDir: fixture.siteDir }),
			);
			const themePath = octaneClassicTheme().getThemePath();

			expect(manifest.aliases.theme.DocItem).toBe(path.join(themePath, 'DocItem.js'));
			expect(manifest.aliases.theme.DocRoot).toBe(path.join(themePath, 'DocRoot.js'));
			expect(manifest.assets.clientModules).toEqual(
				expect.arrayContaining([path.join(themePath, 'styles.css')]),
			);
		} finally {
			fixture.dispose();
		}
	});
});
