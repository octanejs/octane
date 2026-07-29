import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	assertSupportedDocusaurusRuntime,
	createDocusaurusManifest,
	loadDocusaurusSite,
	readDocusaurusManifest,
	resolveDocusaurusId,
	SUPPORTED_DOCUSARUS_VERSION,
	writeDocusaurusManifest,
} from '../src/index.js';
import { createSiteFixture } from './helpers.js';

const disposals: Array<() => void> = [];

afterEach(() => {
	for (const dispose of disposals.splice(0)) dispose();
});

function flattenRoutes(routes: Array<{ children: any[] }>): any[] {
	return routes.flatMap((route) => [route, ...flattenRoutes(route.children)]);
}

describe('headless Docusaurus site loading', () => {
	it('adopts plugin routes, data, and theme aliases without a renderer', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);

		const loaded = await loadDocusaurusSite({ siteDir: fixture.siteDir });
		const manifest = await createDocusaurusManifest(loaded);
		const routes = flattenRoutes(manifest.routes);

		expect(manifest.docusaurusVersion).toBe(SUPPORTED_DOCUSARUS_VERSION);
		expect(manifest.baseUrl).toBe('/docs/');
		expect(manifest.routesPaths).toEqual(expect.arrayContaining(['/custom', '/docs/guide/intro']));
		expect(routes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: '/custom',
					component: '@site/src/pages/custom.js',
					modules: expect.objectContaining({
						data: expect.stringContaining('custom-page.json'),
						nested: {
							duplicate: expect.stringContaining('custom-page.json'),
						},
						queried: expect.objectContaining({
							__import: true,
							path: expect.stringContaining('custom-page.json?raw'),
							query: { source: 'fixture' },
						}),
					}),
				}),
				expect.objectContaining({
					path: '/docs/guide/intro',
					component: '@theme/DocItem',
				}),
			]),
		);
		expect(manifest.globalData['octane-fixture-content']).toEqual({
			default: { enabled: true },
		});
		expect(Object.values(manifest.content)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: 'Introduction',
					description: 'Fixture document metadata',
				}),
			]),
		);

		const siteRoot = resolveDocusaurusId('@theme/Root', manifest);
		const originalRoot = resolveDocusaurusId('@theme-original/Root', manifest);
		expect(siteRoot).toBe(path.join(fixture.siteDir, 'src/theme/Root.js'));
		expect(originalRoot).toBe(path.join(fixture.siteDir, 'theme-base/Root.js'));
		expect(resolveDocusaurusId('@theme/DocItem', manifest)).toBe(
			path.join(fixture.siteDir, 'theme-base/DocItem.js'),
		);
		expect(resolveDocusaurusId('@theme-original/DocItem', manifest)).toBe(
			path.join(fixture.siteDir, 'theme-base/DocItem.js'),
		);
		expect(resolveDocusaurusId('@theme-init/Root', manifest)).toBe(
			path.join(fixture.siteDir, 'theme-initial/Root.js'),
		);
		expect(resolveDocusaurusId('@site/../outside.js', manifest)).toBeNull();
	});

	it('round-trips the serializable manifest', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const manifest = await createDocusaurusManifest(
			await loadDocusaurusSite({ siteDir: fixture.siteDir }),
		);
		const filename = path.join(fixture.siteDir, '.octane-docusaurus/manifest.json');

		expect(await writeDocusaurusManifest(manifest, filename)).toBe(filename);
		expect(existsSync(filename)).toBe(true);
		expect(await readDocusaurusManifest(filename)).toEqual(manifest);
	});

	it('rejects an unverified Docusaurus version by default', () => {
		expect(() =>
			assertSupportedDocusaurusRuntime({
				manifestPath: '/fixture/package.json',
				packageRoot: '/fixture',
				version: '3.10.2',
			}),
		).toThrow('pinned to @docusaurus/core@3.10.1');
	});
});
