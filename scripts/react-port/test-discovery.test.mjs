import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredTestSelectors, selectedByTestConfiguration } from './test-discovery.mjs';
import { conventionalTestPath } from './preflight-lib.mjs';

function selected(source, files, options = { runner: 'jest' }) {
	const selectors = configuredTestSelectors(source, `${options.runner}.config.ts`, options);
	assert.ok(selectors.length);
	return files.filter((file) =>
		selectors.some((selector) => selectedByTestConfiguration(file, selector, conventionalTestPath)),
	);
}

test('reads JSON Jest selectors and preserves both client and server projects', () => {
	const selectors = [
		configuredTestSelectors(
			JSON.stringify({
				rootDir: 'src',
				testMatch: ['**/*.test.(js|ts)?(x)'],
				testPathIgnorePatterns: ['ssr.test.tsx'],
			}),
			'jest.config.json',
			{ runner: 'jest' },
		),
		configuredTestSelectors(
			JSON.stringify({ rootDir: 'src', testMatch: ['**/*ssr.test.(js|ts)?(x)'] }),
			'jest.config.ssr.json',
			{ runner: 'jest' },
		),
	].flat();
	assert.deepEqual(
		[
			'src/__tests__/animation.test.tsx',
			'src/__tests__/ssr.test.tsx',
			'src/__tests__/helpers.ts',
			'other/outside.test.ts',
		].filter((file) =>
			selectors.some((selector) =>
				selectedByTestConfiguration(file, selector, conventionalTestPath),
			),
		),
		['src/__tests__/animation.test.tsx', 'src/__tests__/ssr.test.tsx'],
	);
});

test('Playwright projects inherit root selectors and preserve project overrides', () => {
	assert.deepEqual(
		selected(
			`export default defineConfig({ testDir: './test', projects: [{ name: 'chromium' }, { name: 'webkit', testDir: './other', testMatch: '*.e2e.ts' }] });`,
			[
				'test/notifications.spec.ts',
				'test/next.config.js',
				'test/helpers.ts',
				'outside/unrelated.spec.ts',
				'other/smoke.e2e.ts',
				'other/not-selected.spec.ts',
			],
			{ runner: 'playwright' },
		),
		['test/notifications.spec.ts', 'other/smoke.e2e.ts'],
	);
});

test('Playwright defaults select named test files rather than support modules', () => {
	assert.equal(conventionalTestPath('tests/helpers.ts', { runner: 'playwright' }), false);
	assert.equal(conventionalTestPath('tests/next.config.js', { runner: 'playwright' }), false);
	assert.equal(conventionalTestPath('tests/widget.spec.ts', { runner: 'playwright' }), true);
	assert.equal(conventionalTestPath('tests/widget.test.mjs', { runner: 'playwright' }), true);
	assert.deepEqual(
		selected('export default {};', ['tests/widget.test-d.ts'], { runner: 'playwright' }),
		[],
	);
});

test('keeps the union of Jest projects while honoring inherited roots and helper exclusions', () => {
	const source = `
const defaults = { rootDir: 'src' };
const core = { ...defaults, testPathIgnorePatterns: ['.tsx$', '__tests__/testUtils.ts'] };
const react = { ...defaults, testPathIgnorePatterns: ['.ts$', '__tests__/testUtils.tsx'] };
export default { projects: [core, react] };`;
	assert.deepEqual(
		selected(source, [
			'src/__tests__/core.test.ts',
			'src/__tests__/render.test.tsx',
			'src/__tests__/testUtils.ts',
			'src/__tests__/testUtils.tsx',
			'config/prettier/test.ts',
		]),
		['src/__tests__/core.test.ts', 'src/__tests__/render.test.tsx'],
	);
});

test('honors roots and Jest extglob patterns across statically returned project alternatives', () => {
	const source = `
const defaults = { rootDir: '.', roots: ['<rootDir>/src'] };
const web = { ...defaults, testMatch: ['**/__tests__/**/*.(spec|test).ts?(x)'] };
const server = { ...defaults, testMatch: ['**/+([a-zA-Z]).server.(spec|test).ts?(x)'] };
const projects = () => { if (process.env.WEB) return [web]; return [web, server]; };
module.exports = { projects: projects() };`;
	assert.deepEqual(
		selected(source, [
			'src/__tests__/useForm.test.tsx',
			'src/form.server.test.ts',
			'app/src/test.tsx',
			'src/__tests__/helpers.ts',
		]),
		['src/__tests__/useForm.test.tsx', 'src/form.server.test.ts'],
	);
});

test('uses pinned regex selectors and exclusions supplied to a configuration builder', () => {
	const source = `const buildConfig = require('../../jest.base.config'); module.exports = buildConfig(__dirname, { testRegex: '__tests__/.*\\\\.tsx?$', testPathIgnorePatterns: ['<rootDir>/__tests__/utils'] });`;
	assert.deepEqual(
		selected(
			source,
			[
				'__tests__/observer.test.tsx',
				'__tests__/utils/killFinalizationRegistry.ts',
				'src/other.test.ts',
			],
			{ runner: 'jest', scope: 'packages/mobx-react-lite' },
		),
		['__tests__/observer.test.tsx'],
	);
});

test('Vitest include overrides conventional discovery without unioning exclusions between projects', () => {
	const source = `export default defineConfig({ test: { projects: [ { test: { include: ['src/**/*.ssr.test.ts'] } }, { test: { include: ['src/**/*.test.{ts,tsx}'], exclude: ['src/**/*.ssr.test.ts'] } } ] } });`;
	assert.deepEqual(
		selected(source, ['src/use.ssr.test.ts', 'src/use.test.tsx', 'other/extra.test.ts'], {
			runner: 'vitest',
			vitestVersion: '4.1.0',
		}),
		['src/use.ssr.test.ts', 'src/use.test.tsx'],
	);
});

test('does not execute dynamic upstream selectors or silently discard their suites', () => {
	assert.throws(
		() =>
			configuredTestSelectors(`export default { testMatch: getPatterns() };`, 'jest.config.ts', {
				runner: 'jest',
			}),
		/Cannot resolve/,
	);
	assert.equal(conventionalTestPath('__tests__/jest-dom.d.ts', { runner: 'jest' }), false);
});

test('unresolved project lists and configuration bases fail closed', () => {
	for (const source of [
		'export default { projects: getProjects() };',
		'import base from "./shared.js"; export default { ...base };',
		'export default { root: getRoot(), test: { include: ["custom/*.ts"] } };',
	])
		assert.throws(
			() =>
				configuredTestSelectors(source, 'vitest.config.ts', {
					runner: 'vitest',
					vitestVersion: '4.1.0',
				}),
			/Cannot resolve/,
		);
});

test('explicit empty selectors do not fall back to conventional names', () => {
	assert.deepEqual(
		selected('export default { test: { include: [] } };', ['src/example.test.ts'], {
			runner: 'vitest',
		}),
		[],
	);
});

test('project paths cannot silently fall back to conventional discovery', () => {
	for (const source of [
		'export default { projects: ["<rootDir>/packages/*"] };',
		'export default { test: { projects: [{ extends: "./unknown.ts", test: { include: ["known/*.ts"] } }] } };',
		'export default { projects: [{ testMatch: ["known/*.ts"] }, "./extra.config.js"] };',
	]) {
		assert.throws(
			() =>
				configuredTestSelectors(source, 'vitest.config.ts', {
					runner: 'vitest',
					vitestVersion: '4.1.0',
				}),
			/Cannot resolve/,
		);
	}
});

test('an empty project list selects no tests', () => {
	assert.deepEqual(selected('export default { projects: [] };', ['src/example.test.ts']), []);
});

test('Playwright expands filename globs within the configured test directory', () => {
	const source = 'export default { testDir: "./specs", testMatch: "*.spec.ts" };';
	assert.deepEqual(
		selected(
			source,
			['specs/browser.spec.ts', 'specs/nested/browser.spec.ts', 'outside/browser.spec.ts'],
			{
				runner: 'playwright',
			},
		),
		['specs/browser.spec.ts', 'specs/nested/browser.spec.ts'],
	);
});

test('Playwright testDir confines an explicit testMatch relative to its config', () => {
	const selectors = configuredTestSelectors(
		'export default { testDir: "./specs", testMatch: "**/*.spec.ts" };',
		'packages/widget/playwright.config.ts',
		{ runner: 'playwright', scope: 'packages/widget' },
	);
	assert.equal(
		selectedByTestConfiguration('specs/browser.spec.ts', selectors[0], conventionalTestPath),
		true,
	);
	assert.equal(
		selectedByTestConfiguration('outside/browser.spec.ts', selectors[0], conventionalTestPath),
		false,
	);
});

test('resolves immutable shared configuration objects without executing their modules', () => {
	const modules = new Map([
		[
			'shared/jest.js',
			`throw new Error('must never execute'); export const shared = { testMatch: ['**/*-test.[jt]s?(x)'], testPathIgnorePatterns: ['helpers'] };`,
		],
		[
			'packages/widget/jest.config.js',
			`import { shared as base } from '../../shared/jest.js'; export default { ...base, rootDir: 'src' };`,
		],
	]);
	const selectors = configuredTestSelectors(
		modules.get('packages/widget/jest.config.js'),
		'packages/widget/jest.config.js',
		{ runner: 'jest', scope: 'packages/widget', modules },
	);
	assert.deepEqual(
		[
			'src/button-test.tsx',
			'src/helpers-test.ts',
			'src/button.test.tsx',
			'outside/button-test.ts',
		].filter((file) =>
			selectors.some((selector) =>
				selectedByTestConfiguration(file, selector, conventionalTestPath),
			),
		),
		['src/button-test.tsx'],
	);
});

test('resolves CommonJS bases and refuses cyclic or missing shared selectors', () => {
	const source = `const base = require('./base'); module.exports = { ...base };`;
	const selectors = configuredTestSelectors(source, 'jest.config.js', {
		runner: 'jest',
		modules: new Map([['base.js', `module.exports = { testMatch: ['selected/*.ts'] };`]]),
	});
	assert.equal(
		selectedByTestConfiguration('outside/file.test.ts', selectors[0], conventionalTestPath),
		false,
	);
	assert.equal(
		selectedByTestConfiguration('selected/file.ts', selectors[0], conventionalTestPath),
		true,
	);
	for (const modules of [
		new Map(),
		new Map([
			['base.js', `module.exports = require('./jest.config.js');`],
			['jest.config.js', source],
		]),
	]) {
		assert.throws(
			() => configuredTestSelectors(source, 'jest.config.js', { runner: 'jest', modules }),
			/Cannot resolve/,
		);
	}
});

test('Vitest projects inherit selectors only when extends is true and match within project roots', () => {
	const source = `export default defineConfig({ test: { exclude: ['**/ignored/**'], projects: [
 { extends: true, test: { root: 'www', include: ['test/**/*.spec.ts'], exclude: ['**/extra/**'] } },
 { test: { include: ['ignored/standalone.spec.ts'] } }
 ] } });`;
	assert.deepEqual(
		selected(
			source,
			[
				'www/test/component.spec.ts',
				'www/test/ignored/component.spec.ts',
				'www/test/extra/component.spec.ts',
				'test/outside.spec.ts',
				'ignored/standalone.spec.ts',
			],
			{ runner: 'vitest', vitestVersion: '4.1.0' },
		),
		['www/test/component.spec.ts', 'ignored/standalone.spec.ts'],
	);
});

test('reads versioned Vitest config defaults and retains explicit exclusions', () => {
	const source = `import { configDefaults as defaults, defineConfig } from 'vitest/config'; export default defineConfig({ test: { exclude: [...defaults.exclude, 'src/index.test.ts'] } });`;
	const files = [
		'src/index.test.ts',
		'src/widget.test.ts',
		'dist/widget.test.js',
		'.git/widget.test.js',
		'node_modules/widget.test.js',
	];
	for (const [vitestVersion, expected] of [
		['^3.2.4', ['src/widget.test.ts']],
		['^4.1.0', ['src/widget.test.ts', 'dist/widget.test.js']],
		['^5.0.0', ['src/widget.test.ts', 'dist/widget.test.js']],
	]) {
		const selectors = configuredTestSelectors(source, 'vitest.config.ts', {
			runner: 'vitest',
			vitestVersion,
		});
		assert.deepEqual(
			files.filter((file) =>
				selectors.some((selector) =>
					selectedByTestConfiguration(file, selector, conventionalTestPath),
				),
			),
			expected,
		);
	}
	for (const vitestVersion of [undefined, 'latest', '^6.0.0', 'workspace:*'])
		assert.throws(
			() =>
				configuredTestSelectors(source, 'vitest.config.ts', { runner: 'vitest', vitestVersion }),
			/Cannot resolve/,
		);
});

test('merges imported Vite test selectors without adding the base as a separate project', () => {
	const source = `import { mergeConfig, defineConfig } from 'vitest/config'; import base from './base'; export default mergeConfig(base, defineConfig({ test: { exclude: ['src/ignored.test.ts'] } }));`;
	const selectors = configuredTestSelectors(source, 'vitest.config.ts', {
		runner: 'vitest',
		modules: new Map([['base.ts', `export default { test: { include: ['src/*.test.ts'] } };`]]),
	});
	assert.deepEqual(
		['src/widget.test.ts', 'src/ignored.test.ts', 'outside/widget.test.ts'].filter((file) =>
			selectors.some((selector) =>
				selectedByTestConfiguration(file, selector, conventionalTestPath),
			),
		),
		['src/widget.test.ts'],
	);
});

test('missing shared exclusions and files without configuration exports fail closed', () => {
	for (const source of [
		`import base from './missing'; export default { ...base, include: ['**/*.test.ts'] };`,
		`const config = { include: ['**/*.test.ts'] };`,
	])
		assert.throws(
			() =>
				configuredTestSelectors(source, 'vitest.config.ts', {
					runner: 'vitest',
					vitestVersion: '4.1.0',
				}),
			/Cannot resolve/,
		);
});

test('Vitest 5 inline projects inherit root selectors by default while version 4 and explicit opt-outs do not', () => {
	const source = `export default { root: 'packages/widget', test: { include: ['tests/**/*.test.ts'], exclude: ['tests/ignored.test.ts'], projects: [{ test: { name: 'unit' } }] } };`;
	for (const [vitestVersion, inherited] of [
		['4.1.0', false],
		['5.0.0', true],
	]) {
		const [selector] = configuredTestSelectors(source, 'vitest.config.ts', {
			runner: 'vitest',
			vitestVersion,
		});
		assert.equal(
			selectedByTestConfiguration(
				'packages/widget/tests/ignored.test.ts',
				selector,
				conventionalTestPath,
			),
			!inherited,
		);
		assert.equal(
			selectedByTestConfiguration(
				'packages/widget/tests/selected.test.ts',
				selector,
				conventionalTestPath,
			),
			true,
		);
		assert.equal(
			selectedByTestConfiguration(
				'packages/widget/other/outside.test.ts',
				selector,
				conventionalTestPath,
			),
			!inherited,
		);
	}
	const [optedOut] = configuredTestSelectors(
		source.replace('{ test: { name:', '{ extends: false, test: { name:'),
		'vitest.config.ts',
		{ runner: 'vitest', vitestVersion: '5.0.0' },
	);
	assert.equal(
		selectedByTestConfiguration(
			'packages/widget/tests/ignored.test.ts',
			optedOut,
			conventionalTestPath,
		),
		true,
	);
});

test('unknown Vitest versions require explicit inline project inheritance', () => {
	const source =
		"export default { test: { exclude: ['ignored/**'], projects: [{ test: { include: ['**/*.test.ts'] } }] } };";
	for (const vitestVersion of [undefined, 'latest', '^6.0.0', 'workspace:*']) {
		assert.throws(
			() =>
				configuredTestSelectors(source, 'vitest.config.ts', { runner: 'vitest', vitestVersion }),
			/Cannot resolve default.*inheritance/,
		);
		assert.doesNotThrow(() =>
			configuredTestSelectors(
				source.replace('{ test: { include:', '{ extends: false, test: { include:'),
				'vitest.config.ts',
				{ runner: 'vitest', vitestVersion },
			),
		);
	}
});
