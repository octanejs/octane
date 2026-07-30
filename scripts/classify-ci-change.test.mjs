import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyCiChange } from './classify-ci-change.mjs';

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

	test('runs full CI when any executable or workflow-owned file changes', () => {
		assert.equal(classify(['docs/ssr.md', 'packages/octane/src/runtime.ts']), true);
		assert.equal(classify(['.github/workflows/ci.yml']), true);
		assert.equal(classify([]), true);
	});

	test('treats a newly added formatter helper as isolated developer tooling', () => {
		const after = structuredClone(rootPackage);
		after.scripts['format:files'] = 'prettier --write -- ';

		assert.equal(classify(['package.json'], rootPackage, after), false);
	});

	test('runs full CI for existing script and dependency changes', () => {
		const changedScript = structuredClone(rootPackage);
		changedScript.scripts.test = 'vitest run --changed';
		assert.equal(classify(['package.json'], rootPackage, changedScript), true);

		const changedDependency = structuredClone(rootPackage);
		changedDependency.devDependencies.vitest = 'next';
		assert.equal(classify(['package.json'], rootPackage, changedDependency), true);
	});
});
