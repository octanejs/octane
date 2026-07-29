import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE_ROOT = path.join(import.meta.dirname, '_fixtures/site');

export function createSiteFixture() {
	const siteDir = mkdtempSync(path.join(tmpdir(), 'octane-docusaurus-'));
	cpSync(FIXTURE_ROOT, siteDir, { recursive: true });
	symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(siteDir, 'node_modules'), 'dir');
	return {
		siteDir,
		dispose() {
			rmSync(siteDir, { recursive: true, force: true });
		},
	};
}
