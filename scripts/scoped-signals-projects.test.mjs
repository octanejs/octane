import assert from 'node:assert/strict';
import { matchesGlob } from 'node:path';
import { test } from 'node:test';
import {
	scopedSignalsProjects,
	signalsBrowserTests,
	signalsRuntimeTests,
} from './scoped-signals-projects.mjs';

const projects = scopedSignalsProjects(
	(options) => ({ name: 'octane-test-probe', options }),
	['**/node_modules/**'],
);
const byName = new Map(projects.map((project) => [project.test.name, project]));
function selected(file) {
	return projects
		.filter(
			({ test: config }) =>
				config.include.some((pattern) => matchesGlob(file, pattern)) &&
				!config.exclude?.some((pattern) => matchesGlob(file, pattern)),
		)
		.map(({ test: config }) => config.name);
}

test('engine fixtures run only under Node, without a DOM/compiler plugin', () => {
	for (const feature of [
		'engine',
		'state',
		'async',
		'streams',
		'model',
		'serialization',
		'inspection',
	]) {
		assert.deepEqual(selected(`packages/octane/tests/signals-${feature}.test.ts`), [
			'octane-signals-node',
		]);
	}
	const project = byName.get('octane-signals-node');
	assert.equal(project.test.environment, 'node');
	assert.equal(project.plugins, undefined);
});

test('mounting and hydration fixtures exercise development, production, and Strong compilation', () => {
	for (const file of [
		'packages/octane/tests/signals-rendering.test.ts',
		'packages/octane/tests/signals-memos.test.ts',
		'packages/octane/tests/signals-native-collection.test.ts',
		'packages/octane/tests/signals-ownership.test.tsrx',
		'packages/octane/tests/hydration/signals-hydrate.test.ts',
	]) {
		assert.deepEqual(selected(file), [
			'octane-signals',
			'octane-signals-prod',
			'octane-signals-strong',
		]);
		assert.ok(
			signalsRuntimeTests.some((pattern) => matchesGlob(file, pattern)),
			'default controls must exclude native fixtures',
		);
	}
	assert.deepEqual(byName.get('octane-signals').plugins[0].options, { nativeReads: true });
	assert.deepEqual(byName.get('octane-signals-prod').plugins[0].options, {
		nativeReads: true,
		hmr: false,
	});
	assert.equal(byName.get('octane-signals-prod').test.env.OCTANE_TEST_COMPILE_MODE, 'prod');
	assert.deepEqual(byName.get('octane-signals-strong').plugins[0].options, {
		nativeReads: true,
		hmr: false,
		strong: true,
	});
	assert.equal(byName.get('octane-signals-strong').test.env.OCTANE_TEST_COMPILE_MODE, 'prod');
});

test('native DevTools fixtures run only with profiling and native reads enabled', () => {
	for (const extension of ['ts', 'tsrx']) {
		assert.deepEqual(selected(`packages/octane/tests/signals-devtools.test.${extension}`), [
			'octane-signals-profile',
		]);
	}
	assert.deepEqual(byName.get('octane-signals-profile').plugins[0].options, {
		nativeReads: true,
		hmr: false,
		profile: true,
	});
});

test('native browser fixtures remain in the real-browser CI group', () => {
	const file = 'packages/octane/tests/browser/signals-hydration/signals-hydration.test.ts';
	assert.deepEqual(selected(file), ['octane-signals-browser']);
	assert.ok(signalsBrowserTests.some((pattern) => matchesGlob(file, pattern)));
	const browser = byName.get('octane-signals-browser');
	assert.equal(browser.test.environment, 'node');
	assert.equal(browser.testExecution.group, 'heavy-browser');
	assert.deepEqual(browser.testExecution.include, ['packages/octane/tests/browser/**/*.test.ts']);
});

test('existing runtime/compiler/browser controls are not claimed by an enabled lane', () => {
	for (const file of [
		'packages/octane/tests/activity.test.ts',
		'packages/octane/tests/devtools-runtime.test.tsrx',
		'packages/octane/tests/compiler/signals-diagnostics.test.ts',
		'packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts',
	]) {
		assert.deepEqual(selected(file), []);
		assert.equal(
			signalsRuntimeTests.some((pattern) => matchesGlob(file, pattern)),
			false,
		);
		assert.equal(
			signalsBrowserTests.some((pattern) => matchesGlob(file, pattern)),
			false,
		);
	}
});
