import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DOCUSAURUS_MANIFEST_ID,
	DOCUSAURUS_ROUTES_ID,
	docusaurus,
	docusaurusBridge,
} from '../src/vite.js';
import { createSiteFixture } from './helpers.js';

const disposals: Array<() => void> = [];

afterEach(() => {
	for (const dispose of disposals.splice(0)) dispose();
});

describe('Docusaurus Vite bridge', () => {
	it('loads a site, exposes the virtual manifest, and resolves aliases', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });

		const virtualId = await plugin.resolveId(DOCUSAURUS_MANIFEST_ID);
		const virtualModule = await plugin.load(virtualId!);

		expect(virtualId).toBe(`\0${DOCUSAURUS_MANIFEST_ID}`);
		expect(virtualModule).toContain('"docusaurusVersion":"3.10.1"');
		expect(await plugin.resolveId('@theme/Root')).toBe(
			path.join(fixture.siteDir, 'src/theme/Root.js'),
		);
	});

	it('emits statically analyzable importers for the client route graph', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });

		const virtualId = await plugin.resolveId(DOCUSAURUS_ROUTES_ID);
		const virtualModule = await plugin.load(virtualId!);

		expect(virtualId).toBe(`\0${DOCUSAURUS_ROUTES_ID}`);
		expect(virtualModule).toContain(
			'import { createDocusaurusRoutes } from "@octanejs/docusaurus/client";',
		);
		expect(virtualModule).toContain('import("@site/src/pages/custom.js")');
		expect(virtualModule).toContain('import("@theme/DocItem")');
		expect(virtualModule).toContain('import("@site/docs/intro.md")');
		expect(virtualModule).toContain('custom-page.json?raw&source=fixture');
		expect(virtualModule).toContain('export const routes = createDocusaurusRoutes');
	});

	it('resolves a relative site directory from the Vite root', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: path.basename(fixture.siteDir) });

		await plugin.configResolved({ root: path.dirname(fixture.siteDir), command: 'serve' });

		expect(await plugin.resolveId('@theme/Root')).toBe(
			path.join(fixture.siteDir, 'src/theme/Root.js'),
		);
	});

	it('forwards localization options when loading the site', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({
			siteDir: fixture.siteDir,
			locale: 'fr',
			automaticBaseUrlLocalizationDisabled: true,
		});

		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });

		expect((await plugin.api.getManifest()).baseUrl).toBe('/docs/');
	});

	it('registers concrete config, plugin, and content watch inputs', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });
		const addWatchFile = vi.fn();

		await plugin.buildStart.call({ addWatchFile });

		expect(addWatchFile).toHaveBeenCalledWith(path.join(fixture.siteDir, 'docusaurus.config.mjs'));
		expect(addWatchFile).toHaveBeenCalledWith(path.join(fixture.siteDir, 'watched.txt'));
		expect(
			addWatchFile.mock.calls.some(
				([value]) => value === path.join(fixture.siteDir, 'docs/intro.md'),
			),
		).toBe(true);
	});

	it('reloads the manifest when a watched input changes', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });
		await plugin.buildStart.call({ addWatchFile: vi.fn() });
		const sourceFile = path.join(fixture.siteDir, 'docs/intro.md');
		const updatedDescription = 'Watched fixture document metadata';
		writeFileSync(
			sourceFile,
			readFileSync(sourceFile, 'utf8').replace('Fixture document metadata', updatedDescription),
		);

		await plugin.watchChange(sourceFile);
		const manifest = await plugin.api.getManifest();
		const document = Object.values(manifest.content).find((metadata) => metadata.id === 'intro');

		expect(document?.description).toBe(updatedDescription);
	});

	it('invalidates both virtual modules after reloading a watched input', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });
		const manifestModule = {};
		const routesModule = {};
		const invalidateModule = vi.fn();
		const wsSend = vi.fn();
		plugin.configureServer({
			moduleGraph: {
				getModuleById(id: string) {
					if (id === `\0${DOCUSAURUS_MANIFEST_ID}`) return manifestModule;
					if (id === `\0${DOCUSAURUS_ROUTES_ID}`) return routesModule;
				},
				invalidateModule,
			},
			ws: { send: wsSend },
		});

		await plugin.watchChange(path.join(fixture.siteDir, 'watched.txt'));

		expect(invalidateModule).toHaveBeenCalledWith(manifestModule);
		expect(invalidateModule).toHaveBeenCalledWith(routesModule);
		expect(wsSend).toHaveBeenCalledWith({ type: 'full-reload' });
	});

	it('waits for an in-flight reload before serving manifest data', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });
		const sourceFile = path.join(fixture.siteDir, 'docs/intro.md');
		const updatedDescription = 'Reloaded fixture document metadata';
		writeFileSync(
			sourceFile,
			readFileSync(sourceFile, 'utf8').replace('Fixture document metadata', updatedDescription),
		);

		const reload = plugin.api.reload();
		const [manifest, reloadedManifest] = await Promise.all([plugin.api.getManifest(), reload]);
		const document = Object.values(manifest.content).find((metadata) => metadata.id === 'intro');

		expect(document?.description).toBe(updatedDescription);
		expect(reloadedManifest).toBe(manifest);
	});

	it('keeps the previous site snapshot when a reload cannot produce a manifest', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const plugin = docusaurusBridge({ siteDir: fixture.siteDir });
		await plugin.configResolved({ root: fixture.siteDir, command: 'serve' });
		const previousManifest = await plugin.api.getManifest();
		const configFile = path.join(fixture.siteDir, 'docusaurus.config.mjs');
		writeFileSync(
			configFile,
			readFileSync(configFile, 'utf8')
				.replace('exact: true,', 'exact: true,\n\t\t\t\tbroken: () => {},')
				.replace("'watched.txt'", "'failed-watched.txt'"),
		);

		await expect(plugin.api.reload()).rejects.toThrow('not serializable');
		const addWatchFile = vi.fn();
		await plugin.buildStart.call({ addWatchFile });

		expect(await plugin.api.getManifest()).toBe(previousManifest);
		expect(addWatchFile).toHaveBeenCalledWith(path.join(fixture.siteDir, 'watched.txt'));
		expect(addWatchFile).not.toHaveBeenCalledWith(path.join(fixture.siteDir, 'failed-watched.txt'));
	});

	it('feeds content-plugin metadata into the MDX transform', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const [bridge, mdx] = docusaurus({ siteDir: fixture.siteDir });
		await bridge.configResolved({ root: fixture.siteDir, command: 'build' });
		mdx.configResolved({ root: fixture.siteDir, command: 'build' });
		const sourceFile = path.join(fixture.siteDir, 'docs/intro.md');

		const result = await mdx.transform.call(
			{ addWatchFile: vi.fn(), warn: vi.fn() },
			readFileSync(sourceFile, 'utf8'),
			sourceFile,
			{ ssr: true },
		);

		expect(result?.code).toContain('export const metadata =');
		expect(result?.code).toContain('"Fixture document metadata"');
	});
});
