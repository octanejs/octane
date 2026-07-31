import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyCiChange, parseChangedPaths } from './classify-ci-change.mjs';

const rootPackage = {
	name: 'octane-monorepo',
	private: true,
	scripts: {
		test: 'vitest run',
		'format:check': 'prettier --check .',
	},
	devDependencies: {
		vitest: 'catalog:default',
	},
};

function classify(files, beforeRootPackage, afterRootPackage) {
	return classifyCiChange({ files, beforeRootPackage, afterRootPackage }).fullCi;
}

describe('classifyCiChange', () => {
	test('keeps documentation and release metadata on the lightweight path', () => {
		assert.equal(classify(['docs/ssr.md', '.changeset/friendly-dogs.md']), false);
		assert.equal(classify(['AGENTS.md', '.rulesync/rules/root.md']), false);
		assert.equal(classify(['benchmarks/baselines/local/dbmon.json']), false);
	});

	test('runs full CI when any executable file changes', () => {
		assert.equal(classify(['docs/ssr.md', 'packages/octane/src/runtime.ts']), true);
		assert.equal(classify([]), true);
	});

	test('classifies both sides of renames and copies', () => {
		const files = parseChangedPaths(
			[
				'R100',
				'packages/octane/src/runtime.ts',
				'docs/runtime.ts',
				'C075',
				'packages/octane/src/constants.ts',
				'docs/constants.ts',
				'M',
				'README.md',
				'',
			].join('\0'),
		);

		assert.deepEqual(files, [
			'packages/octane/src/runtime.ts',
			'docs/runtime.ts',
			'packages/octane/src/constants.ts',
			'docs/constants.ts',
			'README.md',
		]);
		assert.equal(classify(files), true);
	});

	test('keeps the CI control-plane bundle on the lightweight path', () => {
		const after = structuredClone(rootPackage);
		after.scripts['ci:workflow:test'] =
			'node --test scripts/classify-ci-change.test.mjs scripts/ci-workflow.test.mjs';

		assert.equal(
			classify(
				[
					'.github/workflows/ci.yml',
					'.github/workflows/publish.yml',
					'scripts/classify-ci-change.mjs',
					'scripts/classify-ci-change.test.mjs',
					'scripts/ci-workflow.test.mjs',
					'README.md',
					'.rulesync/rules/project.md',
					'AGENTS.md',
					'package.json',
				],
				rootPackage,
				after,
			),
			false,
		);
	});

	test('keeps formatter helper paths and script rewrites on the lightweight path', () => {
		const after = structuredClone(rootPackage);
		after.scripts['format:check'] = 'node scripts/format-files.mjs --check --';
		after.scripts['format:files'] = 'node scripts/format-files.mjs --write --';

		assert.equal(
			classify(
				['package.json', 'scripts/format-files.mjs', 'scripts/format-files.test.mjs'],
				rootPackage,
				after,
			),
			false,
		);
	});

	test('runs full CI for existing script and dependency changes', () => {
		const changedScript = structuredClone(rootPackage);
		changedScript.scripts.test = 'vitest run --changed';
		assert.equal(classify(['package.json'], rootPackage, changedScript), true);

		const changedDependency = structuredClone(rootPackage);
		changedDependency.devDependencies.vitest = 'next';
		assert.equal(classify(['package.json'], rootPackage, changedDependency), true);

		const unknownScript = structuredClone(rootPackage);
		unknownScript.scripts['ci:other'] = 'node scripts/other.mjs';
		assert.equal(classify(['package.json'], rootPackage, unknownScript), true);
	});
});
