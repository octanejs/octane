import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
	BUNDLE_CASES,
	entrySource,
	gitBlobHash,
	verifyBundleInputs,
} from './bundle-boundaries.mjs';

const scenario = (id) => BUNDLE_CASES.find((entry) => entry.id === id);
const source = (name) => ({ path: `packages/octane/src/${name}` });
const alien = (version = '3.2.0') => ({
	path: 'node_modules/alien-signals/esm/system.mjs',
	package: { name: 'alien-signals', version },
});

test('entry fixtures retain precisely the named public functions', () => {
	assert.equal(entrySource(scenario('ordinary-client')), 'export { createRoot } from "octane";\n');
	assert.equal(
		entrySource(scenario('ordinary-server')),
		'export { renderToString } from "octane/server";\n',
	);
	assert.equal(
		entrySource(scenario('engine')),
		'export { createScope, query } from "octane/signals";\n',
	);
	assert.equal(BUNDLE_CASES.filter((entry) => entry.baseline).length, 2);
});

test('baseline blob evidence agrees with Git for exact UTF-8 source bytes', () => {
	const contents = Buffer.from('const sign = "α";\n');
	const git = execFileSync('git', ['hash-object', '--stdin'], {
		input: contents,
		encoding: 'utf8',
	}).trim();
	assert.equal(gitBlobHash(contents), git);
	assert.notEqual(gitBlobHash(contents), gitBlobHash(Buffer.from('const sign = "α";\r\n')));
});

test('ordinary entries allow protocol seams but reject both scoped and raw engines', () => {
	const ordinary = [source('runtime.ts'), source('signals/read-protocol.ts')];
	verifyBundleInputs(scenario('ordinary-client'), ordinary);
	assert.throws(
		() => verifyBundleInputs(scenario('ordinary-client'), [...ordinary, alien()]),
		/ordinary imports reached Alien Signals/,
	);
	assert.throws(
		() =>
			verifyBundleInputs(scenario('ordinary-client'), [...ordinary, source('signals/engine.ts')]),
		/ordinary imports reached the scoped engine/,
	);
});

test('independent engine rejects rendering, compiler, DevTools, and the old Alien version', () => {
	const independent = [source('signals/index.ts'), source('signals/graph.ts'), alien()];
	verifyBundleInputs(scenario('engine'), independent);
	for (const filename of [
		'runtime.ts',
		'runtime.server.ts',
		'server/index.ts',
		'devtools-hook.ts',
	]) {
		assert.throws(
			() => verifyBundleInputs(scenario('engine'), [...independent, source(filename)]),
			/renderer or DevTools/,
		);
	}
	assert.throws(
		() => verifyBundleInputs(scenario('engine'), [...independent, source('compiler/compile.js')]),
		/compiler reached/,
	);
	assert.throws(() => verifyBundleInputs(scenario('engine'), [alien('1.0.4')]), /wrong Alien/);
	assert.throws(() => verifyBundleInputs(scenario('engine'), []), /dependency is missing/);
});

test('native entries require their actual runtime and pinned engine', () => {
	verifyBundleInputs(scenario('native-client'), [source('runtime.ts'), alien()]);
	verifyBundleInputs(scenario('native-server'), [source('runtime.server.ts'), alien()]);
	assert.throws(
		() => verifyBundleInputs(scenario('native-client'), [alien()]),
		/native runtime missing/,
	);
	assert.throws(
		() => verifyBundleInputs(scenario('native-server'), [source('runtime.server.ts')]),
		/dependency is missing/,
	);
});
