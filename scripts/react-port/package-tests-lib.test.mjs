import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
	discoverPackageTests,
	discoverReportEligiblePackageTests,
	hasObservablePackageTests,
} from './package-tests-lib.mjs';

test('uses one observable package-test inventory across supported layouts', async () => {
	const packageDirectory = await mkdtemp(path.join(tmpdir(), 'react-port-package-tests-'));
	for (const directory of [
		'src',
		'__tests__',
		'tests',
		'upstream',
		'upstream/__tests__',
		'upstream/fixtures',
		'upstream/test',
		'upstream/tests',
		'dist',
		'node_modules/dependency',
	]) {
		await mkdir(path.join(packageDirectory, directory), { recursive: true });
	}
	for (const relativePath of [
		'src/widget.spec.ts',
		'__tests__/behavior.test.ts',
		'__tests__/render.js',
		'__tests__/shared.js',
		'tests/component.test.tsrx',
		'tests/helper.ts',
		'upstream/vendor.test.ts',
		'upstream/__tests__/light-async.js',
		'upstream/fixtures/setup.js',
		'upstream/test/render.js',
		'upstream/test/conditional-run.js',
		'upstream/test/setup.js',
		'upstream/tests/integration.ts',
		'upstream/tests/conditional-skip.ts',
		'dist/built.test.js',
		'node_modules/dependency/dependency.test.js',
	]) {
		await writeFile(path.join(packageDirectory, relativePath), "test('observable', () => {});\n");
	}
	await writeFile(
		path.join(packageDirectory, 'upstream/test/conditional-run.js'),
		"test.runIf(true)('conditionally runnable', () => {});\n",
	);
	await writeFile(
		path.join(packageDirectory, 'upstream/tests/conditional-skip.ts'),
		"test.skipIf(false)('conditionally runnable', () => {});\n",
	);
	await writeFile(
		path.join(packageDirectory, '__tests__/shared.js'),
		"require('../register-shared-suite.cjs')();\n",
	);
	for (const relativePath of [
		'tests/helper.ts',
		'upstream/fixtures/setup.js',
		'upstream/test/setup.js',
	]) {
		await writeFile(path.join(packageDirectory, relativePath), 'export {};\n');
	}

	assert.deepEqual(
		discoverPackageTests(packageDirectory).map((file) =>
			path.relative(packageDirectory, file).replaceAll('\\', '/'),
		),
		[
			'__tests__/behavior.test.ts',
			'__tests__/render.js',
			'__tests__/shared.js',
			'src/widget.spec.ts',
			'tests/component.test.tsrx',
			'tests/helper.ts',
		],
	);
	assert.deepEqual(
		discoverReportEligiblePackageTests(packageDirectory).map((file) =>
			path.relative(packageDirectory, file).replaceAll('\\', '/'),
		),
		[
			'__tests__/behavior.test.ts',
			'__tests__/render.js',
			'__tests__/shared.js',
			'src/widget.spec.ts',
			'tests/component.test.tsrx',
			'tests/helper.ts',
			'upstream/__tests__/light-async.js',
			'upstream/test/conditional-run.js',
			'upstream/test/render.js',
			'upstream/test/setup.js',
			'upstream/tests/conditional-skip.ts',
			'upstream/tests/integration.ts',
			'upstream/vendor.test.ts',
		],
	);
	assert.equal(hasObservablePackageTests(packageDirectory), true);
});
