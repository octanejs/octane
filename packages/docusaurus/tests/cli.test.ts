import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDocusaurusManifest } from '../src/index.js';
import { createSiteFixture } from './helpers.js';

const BIN = path.resolve(import.meta.dirname, '../src/bin.js');
const disposals: Array<() => void> = [];

afterEach(() => {
	for (const dispose of disposals.splice(0)) dispose();
});

describe('octane-docusaurus CLI', () => {
	it('inspects the headless graph and clears generated state', async () => {
		const fixture = createSiteFixture();
		disposals.push(fixture.dispose);
		const output = path.join(fixture.siteDir, '.octane-docusaurus/manifest.json');

		const inspected = spawnSync(
			process.execPath,
			[BIN, 'inspect', '--site-dir', fixture.siteDir, '--out', output],
			{ encoding: 'utf8' },
		);

		expect(inspected.status, inspected.stderr).toBe(0);
		expect(inspected.stdout.trim()).toBe(output);
		expect((await readDocusaurusManifest(output)).routesPaths).toContain('/custom');

		mkdirSync(path.join(fixture.siteDir, '.docusaurus'), { recursive: true });
		const cleared = spawnSync(process.execPath, [BIN, 'clear', '--site-dir', fixture.siteDir], {
			encoding: 'utf8',
		});

		expect(cleared.status, cleared.stderr).toBe(0);
		expect(existsSync(path.join(fixture.siteDir, '.docusaurus'))).toBe(false);
		expect(existsSync(path.join(fixture.siteDir, '.octane-docusaurus'))).toBe(false);
	});
});
