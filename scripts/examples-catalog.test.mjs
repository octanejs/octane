import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { EXAMPLES_ROOT, validateExampleManifest } from './examples-catalog.mjs';

const EXAMPLE_LABEL = 'examples/hacker-news/example.json';

function createValidExample() {
	return {
		directory: path.join(EXAMPLES_ROOT, 'hacker-news'),
		directoryName: 'hacker-news',
		manifest: {
			$schema: '../example.schema.json',
			schemaVersion: 1,
			id: 'hacker-news',
			title: 'Catalog validator fixture',
			summary: 'A deterministic manifest used to exercise the public catalog validator.',
			status: 'active',
			renderModes: ['client'],
			dialects: ['tsrx'],
			bindings: [],
			octaneFeatures: ['suspense'],
			commands: {
				build: ['build'],
				typecheck: 'typecheck',
				e2e: 'test:e2e',
			},
			journeys: [
				{
					id: 'home',
					title: 'Render the home page',
					kind: 'golden',
					spec: 'e2e/nav.spec.ts',
					critical: true,
				},
			],
			faultScenarios: [],
		},
		packageManifest: {
			private: true,
			scripts: {
				build: 'vite build',
				'build:alternate': 'vite build',
				typecheck: 'tsc --noEmit',
				'test:e2e': 'playwright test',
			},
			dependencies: {
				octane: 'workspace:*',
			},
		},
	};
}

function validate(example) {
	return validateExampleManifest(example, []);
}

describe('validateExampleManifest', () => {
	test('accepts the valid control manifest', () => {
		assert.deepEqual(validate(createValidExample()), []);
	});

	test('requires commands.build to be exactly ["build"]', async (t) => {
		for (const buildCommands of [['build', 'build:alternate'], ['build:alternate']]) {
			await t.test(JSON.stringify(buildCommands), () => {
				const example = createValidExample();
				example.manifest.commands.build = buildCommands;

				assert.deepEqual(validate(example), [
					`${EXAMPLE_LABEL} "commands.build" must be exactly ["build"]`,
				]);
			});
		}
	});

	test('rejects an omitted runtime Octane binding', async (t) => {
		for (const dependencySection of ['dependencies', 'optionalDependencies']) {
			await t.test(dependencySection, () => {
				const example = createValidExample();
				example.packageManifest[dependencySection] ??= {};
				example.packageManifest[dependencySection]['@octanejs/lexical'] = 'workspace:*';

				assert.deepEqual(validate(example), [
					`${EXAMPLE_LABEL} omits runtime binding @octanejs/lexical from "bindings"`,
				]);
			});
		}
	});

	test('rejects a manifest binding without a status-backed workspace package', () => {
		const example = createValidExample();
		example.manifest.bindings.push('@octanejs/not-a-binding');
		example.packageManifest.dependencies['@octanejs/not-a-binding'] = 'workspace:*';

		assert.deepEqual(validate(example), [
			`${EXAMPLE_LABEL} binding @octanejs/not-a-binding is not a status-backed workspace binding`,
		]);
	});

	test('rejects React runtimes from every dependency section', async (t) => {
		for (const runtime of ['react', 'react-dom']) {
			for (const dependencySection of [
				'dependencies',
				'optionalDependencies',
				'devDependencies',
				'peerDependencies',
			]) {
				await t.test(`${runtime} in ${dependencySection}`, () => {
					const example = createValidExample();
					example.packageManifest[dependencySection] ??= {};
					example.packageManifest[dependencySection][runtime] = '^19.0.0';

					assert.deepEqual(validate(example), [
						`examples/hacker-news/package.json must use Octane, not declare the ${runtime} runtime`,
					]);
				});
			}
		}
	});
});
