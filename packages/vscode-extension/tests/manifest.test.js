import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));

describe('Octane VS Code extension manifest', () => {
	it('owns TSRX language support without an extension dependency', () => {
		expect(manifest.extensionDependencies).toBeUndefined();
		expect(manifest.activationEvents).toContain('onMcpCollection:octane.remoteMcp');
		expect(manifest.activationEvents).toContain('onLanguage:octane-tsrx');
		expect(manifest.contributes.languages).toContainEqual(
			expect.objectContaining({ id: 'octane-tsrx', extensions: ['.tsrx'] }),
		);
		expect(manifest.contributes.configuration.properties['octane.tsrx.autoClosingTags']).toEqual(
			expect.objectContaining({ default: true, type: 'boolean' }),
		);
		expect(manifest.contributes.grammars).toContainEqual(
			expect.objectContaining({ language: 'octane-tsrx', scopeName: 'source.octane-tsrx' }),
		);
		expect(manifest.contributes.typescriptServerPlugins).toEqual([
			{
				name: '@octanejs/typescript-plugin',
				enableForWorkspaceTypeScriptVersions: true,
				languages: ['octane-tsrx'],
			},
		]);
	});

	it('exposes a branded Octane control surface', async () => {
		expect(manifest.icon).toBe('assets/icon.png');
		expect(manifest.contributes.viewsContainers.activitybar).toEqual([
			{
				icon: 'assets/octane-sidebar.svg',
				id: 'octane',
				title: 'Octane',
			},
		]);
		expect(manifest.contributes.views.octane).toContainEqual({
			id: 'octane.overview',
			name: 'Octane',
			type: 'webview',
		});
		expect(manifest.contributes.commands.map(({ command }) => command)).toEqual(
			expect.arrayContaining(['octane.mcp.toggle', 'octane.openSettings', 'octane.refresh']),
		);
		const marketplaceIcon = await readFile(path.join(PACKAGE_ROOT, manifest.icon));
		const transparentLogo = await readFile(
			path.join(PACKAGE_ROOT, 'assets/octane-icon.svg'),
			'utf8',
		);
		expect((await stat(path.join(PACKAGE_ROOT, manifest.icon))).size).toBeGreaterThan(0);
		expect(marketplaceIcon.subarray(1, 4).toString()).toBe('PNG');
		expect(transparentLogo).toContain('fill="#F4EEE8"');
		expect(transparentLogo).toContain('fill="#FF415A"');
		expect(transparentLogo).not.toContain('#16181d');
		const sidebarIcon = await readFile(
			path.join(PACKAGE_ROOT, 'assets/octane-sidebar.svg'),
			'utf8',
		);
		expect(sidebarIcon).toContain('viewBox="0 0 24 24"');
		expect(sidebarIcon).toContain('x="4" y="3" width="16" height="18"');
	});

	it('registers one Octane MCP provider and the generated Octane skills', () => {
		expect(manifest.contributes.mcpServerDefinitionProviders).toEqual([
			{ id: 'octane.remoteMcp', label: 'Octane' },
		]);
		expect(manifest.contributes.chatSkills).toHaveLength(5);
		for (const contribution of manifest.contributes.chatSkills) {
			expect(contribution.path).toMatch(/^\.\/assets\/skills\/.+\/SKILL\.md$/);
		}
	});
});
