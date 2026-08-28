import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	getBindingPackages,
	getFrameworkIntegrationPackages,
	getWorkspacePackages,
	readEcosystemCatalogs,
	validateBindingCatalogData,
	validateFrameworkIntegrationCatalogData,
} from './workspace-packages.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
	return JSON.parse(readFileSync(path.join(REPO, relativePath), 'utf8'));
}

test('the authored ecosystem catalogs carry display and search metadata', () => {
	const categories = readJson('website/src/content/bindings.json');
	const integrations = readJson('website/src/content/framework-integrations.json');

	for (const category of categories) {
		for (const binding of category.packages) {
			assert.equal(typeof binding, 'object', `${category.title} must use binding records`);
			assert.match(binding.packageName, /^@octanejs\//);
			assert.ok(binding.title.trim(), `${binding.packageName} needs a display title`);
			assert.ok(
				binding.searchTerms === undefined || Array.isArray(binding.searchTerms),
				`${binding.packageName} searchTerms must be an array`,
			);
		}
	}

	for (const integration of integrations) {
		assert.match(integration.guideAnchor, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		assert.ok(
			integration.searchTerms === undefined || Array.isArray(integration.searchTerms),
			`${integration.packageName} searchTerms must be an array`,
		);
	}
});

test('the normalized catalogs preserve workspace counts and binding categories', () => {
	const packages = getWorkspacePackages();
	const { bindingCategories, frameworkIntegrations } = readEcosystemCatalogs(packages);
	const categorized = new Map(
		bindingCategories.flatMap((category) =>
			category.packages.map((binding) => [binding.packageName, category.title]),
		),
	);

	assert.equal(categorized.size, getBindingPackages().length);
	assert.equal(frameworkIntegrations.length, getFrameworkIntegrationPackages().length);
	assert.equal(categorized.get('@octanejs/tanstack-router'), 'AI, data, and routing');
	assert.equal(categorized.get('@octanejs/hook-form'), 'Forms and content');
});

test('binding catalog validation identifies invalid editorial records', () => {
	const packages = getWorkspacePackages();
	const source = readJson('website/src/content/bindings.json');
	const invalidCases = [
		{
			mutate(catalog) {
				catalog[0].packages[0].title = ' ';
			},
			expected: 'category 1 binding 1 needs a non-empty "title"',
		},
		{
			mutate(catalog) {
				catalog[0].packages[0].searchTerms = 'signals';
			},
			expected: 'category 1 binding 1 "searchTerms" must be an array',
		},
		{
			mutate(catalog) {
				catalog[0].packages[1].packageName = catalog[0].packages[0].packageName;
			},
			expected: 'category 1 binding 2 lists @octanejs/alien-signals more than once',
		},
		{
			mutate(catalog) {
				catalog[0].packages[0].packageName = '@octanejs/not-a-package';
			},
			expected: 'category 1 binding 1 lists unknown binding @octanejs/not-a-package',
		},
	];

	for (const { mutate, expected } of invalidCases) {
		const catalog = structuredClone(source);
		mutate(catalog);
		assert.ok(
			validateBindingCatalogData(catalog, packages).some((error) => error.includes(expected)),
			expected,
		);
	}
});

test('integration catalog validation requires unique guide metadata', () => {
	const packages = getWorkspacePackages();
	const source = readJson('website/src/content/framework-integrations.json');
	const missingAnchor = structuredClone(source);
	delete missingAnchor[0].guideAnchor;
	assert.ok(
		validateFrameworkIntegrationCatalogData(missingAnchor, packages).some((error) =>
			error.includes('entry 1 needs a non-empty "guideAnchor"'),
		),
	);

	const duplicateAnchor = structuredClone(source);
	duplicateAnchor[1].guideAnchor = duplicateAnchor[0].guideAnchor;
	assert.ok(
		validateFrameworkIntegrationCatalogData(duplicateAnchor, packages).some((error) =>
			error.includes('entry 2 duplicates guide anchor "astro"'),
		),
	);
});
