import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
import {
	assembleWebsiteEcosystemData,
	loadWebsiteEcosystemInputs,
	writeWebsiteEcosystemData,
} from './generate-website-ecosystem-data.mjs';

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
			assert.ok(Array.isArray(binding.tags) && binding.tags.length > 0);
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
	assert.equal(categorized.get('@octanejs/tanstack-router'), 'Routing');
	assert.equal(categorized.get('@octanejs/hook-form'), 'Forms');
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
				catalog[0].packages[0].tags = ['Signals'];
			},
			expected: 'category 1 binding 1 tags entry 1 must be a trimmed lowercase string',
		},
		{
			mutate(catalog) {
				catalog[0].packages[0].tags = [' signals '];
			},
			expected: 'category 1 binding 1 tags entry 1 must be a trimmed lowercase string',
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

test('binding category titles produce unique stable ids', () => {
	const packages = getWorkspacePackages();
	const source = readJson('website/src/content/bindings.json');
	const punctuationOnly = structuredClone(source);
	punctuationOnly[0].title = '!!!';
	expectCatalogError(punctuationOnly, packages, 'does not produce a stable category id');

	const colliding = structuredClone(source);
	colliding[1].title = 'State--Management';
	expectCatalogError(colliding, packages, 'duplicates derived category id "state-management"');

	const compound = structuredClone(source);
	compound[0].title = 'State and signals';
	expectCatalogError(compound, packages, 'title must not contain commas or the word "and"');
});

function expectCatalogError(catalog, packages, expected) {
	assert.ok(
		validateBindingCatalogData(catalog, packages).some((error) => error.includes(expected)),
		expected,
	);
}

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

test('website ecosystem assembly emits every typed entity in authored order', () => {
	const input = loadWebsiteEcosystemInputs();
	const records = assembleWebsiteEcosystemData(input);
	const bindingCount = input.bindingCategories.reduce(
		(total, category) => total + category.packages.length,
		0,
	);

	assert.equal(records.length, bindingCount + input.frameworkIntegrations.length);
	assert.equal(new Set(records.map((record) => record.id)).size, records.length);
	assert.equal(
		records.some((record) => record.packageName === 'octane'),
		false,
	);
	assert.equal(
		records.some((record) => record.packageName === '@octanejs/cli'),
		false,
	);
	assert.deepEqual(
		records.slice(0, input.frameworkIntegrations.length).map((record) => record.kind),
		input.frameworkIntegrations.map(() => 'framework-integration'),
	);
	assert.deepEqual(
		records.map((record) => record.order),
		records.map((_, index) => index),
	);

	const router = records.find((record) => record.packageName === '@octanejs/tanstack-router');
	assert.deepEqual(router, {
		kind: 'library-binding',
		id: 'binding-tanstack-router',
		title: 'TanStack Router',
		packageName: '@octanejs/tanstack-router',
		upstreamPackage: '@tanstack/react-router',
		category: 'Routing',
		categoryId: 'routing',
		description: 'Use @tanstack/react-router with Octane.',
		searchTerms: ['TanStack React Router'],
		tags: ['routing', 'type safe'],
		order: router.order,
	});

	const start = records.find((record) => record.packageName === '@octanejs/tanstack-start');
	assert.deepEqual(start, {
		kind: 'framework-integration',
		id: 'integration-tanstack-start',
		title: 'TanStack Start',
		packageName: '@octanejs/tanstack-start',
		model: 'Full-stack framework',
		description:
			'Build file-routed Octane applications with server functions, streaming SSR, hydration, and Vite development and production builds.',
		searchTerms: ['TanStack Start', 'full stack', 'file routing'],
		guideAnchor: 'tanstack-start',
		order: start.order,
	});
	for (const record of records.filter((record) => record.kind === 'library-binding')) {
		assert.match(record.description, /^Use .+ with Octane\.$/);
		assert.ok(record.description.length < 120, `${record.packageName} description is too long`);
	}
});

test('website ecosystem assembly rejects missing package and status data', () => {
	const input = loadWebsiteEcosystemInputs();
	const missingPackage = {
		...input,
		packages: input.packages.filter((pkg) => pkg.name !== '@octanejs/tanstack-router'),
	};
	assert.throws(
		() => assembleWebsiteEcosystemData(missingPackage),
		/missing workspace package @octanejs\/tanstack-router/,
	);

	const missingStatus = {
		...input,
		packages: input.packages.map((pkg) =>
			pkg.name === '@octanejs/tanstack-router' ? { ...pkg, status: undefined } : pkg,
		),
	};
	assert.throws(
		() => assembleWebsiteEcosystemData(missingStatus),
		/@octanejs\/tanstack-router is missing website status data/,
	);
});

test('website ecosystem write and check modes compare formatted bytes', async (context) => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'octane-ecosystem-data-'));
	context.after(() => rmSync(directory, { recursive: true }));
	const outputPath = path.join(directory, 'ecosystem-index.json');
	const input = loadWebsiteEcosystemInputs();

	const written = await writeWebsiteEcosystemData({ input, outputPath });
	assert.equal(written.changed, true);
	assert.equal(existsSync(outputPath), true);

	const checked = await writeWebsiteEcosystemData({ input, outputPath, check: true });
	assert.equal(checked.changed, false);

	writeFileSync(outputPath, '{}\n');
	await assert.rejects(
		writeWebsiteEcosystemData({ input, outputPath, check: true }),
		/ecosystem-index\.json is stale/,
	);
});
