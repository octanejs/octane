import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCUSAURUS_MANIFEST_ID, docusaurus, docusaurusBridge } from '../src/vite.js';
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
