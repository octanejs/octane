import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const { ModuleMocker } = await import(vitestRequire.resolve('@vitest/mocker/browser'));

function resolveMockPath(root, path) {
	return ModuleMocker.prototype.resolveMockPath.call({ config: { root } }, path);
}

for (const root of ['/workspace/packages/base-ui', 'C:/workspace/packages/base-ui']) {
	test(`browser mocks retain a sibling package path outside ${root}`, () => {
		const sibling = `${root}-utils/src/platform/index.ts`;
		assert.equal(resolveMockPath(root, sibling), sibling);
		const fsPath = posix.join('/@fs/', sibling);
		assert.equal(resolveMockPath(root, fsPath), fsPath);
	});

	test(`browser mocks make descendant paths relative to ${root}`, () => {
		assert.equal(resolveMockPath(root, `${root}/src/platform.ts`), '/src/platform.ts');
		assert.equal(
			resolveMockPath(root, posix.join('/@fs/', root, 'src/platform.ts')),
			'/src/platform.ts',
		);
		assert.equal(resolveMockPath(root, '/src/platform.ts'), '/src/platform.ts');
	});
}
