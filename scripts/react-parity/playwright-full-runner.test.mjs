import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	collectVaulTests,
	playwrightConfigSource,
	prepareSonnerAppSource,
	validateDependencyWorkspace,
} from './playwright-full-runner.mjs';
import { buildDependencyWorkspaceManifest } from './sync-playwright-fixtures.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function readJson(path) {
	return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

test('keeps one Playwright revision across catalogs, overrides, and the lockfile', function () {
	const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
	const declaredVersions = [
		...workspace.matchAll(/^\s+(?:'@playwright\/test'|playwright): ([~^]?\d+\.\d+\.\d+)$/gmu),
	].map((match) => match[1]);
	assert.equal(declaredVersions.length, 4);
	assert.equal(new Set(declaredVersions).size, 1);

	const lockfile = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
	const resolvedTestVersions = new Set(
		[...lockfile.matchAll(/^  '@playwright\/test@([^']+)':$/gmu)].map((match) => match[1]),
	);
	const resolvedPlaywrightVersions = new Set(
		[...lockfile.matchAll(/^  playwright@([^:]+):$/gmu)].map((match) => match[1]),
	);
	assert.equal(resolvedTestVersions.size, 1);
	assert.deepEqual([...resolvedPlaywrightVersions], [...resolvedTestVersions]);
});

test('uses installed lockfile-backed dependencies for every pristine browser lane', function () {
	const versions = ['drei', 'sonner', 'vaul'].map((packageName) => {
		const config = readJson(`packages/${packageName}/scripts/pristine-playwright.json`);
		const fixture = readJson(`${config.dependencyWorkspace}/package.json`);
		assert.equal(fixture.dependencies['@playwright/test'], 'catalog:default');
		assert.equal(fixture.dependencies.playwright, 'catalog:default');
		return validateDependencyWorkspace(repoRoot, config).playwrightVersion;
	});
	assert.equal(new Set(versions).size, 1);
});

test('derives Vaul fixture versions from the vendored manifest and lockfile', function () {
	const config = readJson('packages/vaul/scripts/pristine-playwright.json');
	assert.deepEqual(
		readJson('scripts/react-parity/fixtures/vaul/package.json'),
		buildDependencyWorkspaceManifest(repoRoot, config),
	);
});

test('preserves Vaul upstream Chromium device profiles and Next application boundary', function () {
	const config = readJson('packages/vaul/scripts/pristine-playwright.json');
	const source = playwrightConfigSource(config, '/tmp/vaul-report.json', 43123);
	assert.match(source, /testDir: "\.\/test"/);
	assert.match(source, /browserName: 'chromium'/);
	assert.match(source, /devices\['iPhone 13 Pro'\]/);
	assert.match(source, /devices\['Pixel 5'\]/);
	assert.match(source, /npm run dev -- --port 43123 --hostname 127\.0\.0\.1/);
});

test('converts Vaul Playwright results to the committed inventory boundary', function () {
	assert.deepEqual(
		collectVaulTests([
			{
				title: 'tests/base.spec.ts',
				file: '/tmp/vaul/test/tests/base.spec.ts',
				specs: [
					{
						title: 'Base tests should open drawer',
						file: '/tmp/vaul/test/tests/base.spec.ts',
						tests: [
							{ projectName: 'Pixel', results: [{ status: 'passed' }] },
							{ projectName: 'iPhone', results: [{ status: 'skipped' }] },
						],
					},
				],
			},
		]),
		[
			{
				file: 'test/tests/base.spec.ts',
				fullName: 'tests/base.spec.ts Base tests should open drawer [Pixel]',
				status: 'passed',
			},
		],
	);
});

test('adapts only Sonner demo wiring that is outside the upstream browser cases', function () {
	const source = readFileSync(
		join(repoRoot, 'packages/sonner/upstream/test/src/app/page.tsx'),
		'utf8',
	);
	const prepared = prepareSonnerAppSource(source);
	const replacement =
		"const action = async () => 'load complete'; // Unused by the vendored browser suite.";
	assert.equal(prepared.replace(replacement, "import { action } from '@/app/action';"), source);
	assert.doesNotMatch(
		readFileSync(join(repoRoot, 'packages/sonner/upstream/test/tests/basic.spec.ts'), 'utf8'),
		/rsf-promise/,
	);
});

test('rejects unrecognized Sonner demo wiring instead of silently changing the oracle', function () {
	assert.throws(
		() => prepareSonnerAppSource('export default function App() {}\n'),
		/expected server-action import/,
	);
});
