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
			() => configuredTestSelectors(source, 'vitest.config.ts', { runner: 'vitest' }),
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
