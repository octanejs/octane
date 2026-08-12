import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { tsconfig as SCAFFOLDED_TSCONFIG } from '../packages/cli/src/commands/init/templates.js';
import {
	consumerTsconfigFiles,
	consumerTsconfigPackages,
	createConsumerBaseConfig,
	createPackageConsumerConfig,
	scaffoldedCompilerOptions,
} from './generate-consumer-tsconfigs.mjs';

const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'consumer-tsconfigs-'));

function fixture(name, sourceFile) {
	const directory = path.join(fixtureRoot, name);
	const source = path.join(directory, 'src/nested');
	mkdirSync(source, { recursive: true });
	writeFileSync(path.join(source, sourceFile), 'export const a = 1;\n');
	return directory;
}

test('the consumer project compiles with exactly the options octane init scaffolds', () => {
	const base = createConsumerBaseConfig();

	assert.deepEqual(base.compilerOptions, JSON.parse(SCAFFOLDED_TSCONFIG).compilerOptions);
	// A scaffolded application installs no @types/node, so the validation project
	// must not quietly grant Node globals to published source either.
	assert.equal(base.compilerOptions.types, undefined);
	assert.equal(base.compilerOptions.jsxImportSource, 'octane');
});

test('the consumer project checks .tsrx with the Octane compiler a real consumer resolves', () => {
	assert.deepEqual(createConsumerBaseConfig().tsrx, { compiler: 'octane/compiler/volar' });
});

test('a scaffolded option change reaches the consumer projects', () => {
	const template = JSON.stringify({
		compilerOptions: { strict: true, exactOptionalPropertyTypes: true },
		include: ['src/**/*'],
	});

	assert.deepEqual(scaffoldedCompilerOptions(template), {
		strict: true,
		exactOptionalPropertyTypes: true,
	});
	assert.equal(createConsumerBaseConfig(template).compilerOptions.exactOptionalPropertyTypes, true);
	// The scaffolded `include` belongs to the user's application, not to ours.
	assert.equal(createConsumerBaseConfig(template).include, undefined);
});

test('each package project compiles that package shipped tree through the shared base', () => {
	assert.deepEqual(createPackageConsumerConfig('jotai'), {
		extends: './base.json',
		include: ['../../packages/jotai/src/**/*'],
	});

	const files = consumerTsconfigFiles(['jotai', 'remix-router']);
	assert.deepEqual([...files.keys()], ['base.json', 'jotai.json', 'remix-router.json']);
});

test('only source-published packages that ship .tsrx get a consumer project', () => {
	const tsrxDirectory = fixture('ships-tsrx', 'Component.tsrx');
	const packages = [
		{ dir: 'ships-tsrx', directory: tsrxDirectory, manifest: { files: ['src'] } },
		{ dir: 'ships-dist', directory: tsrxDirectory, manifest: { files: ['dist'] } },
		{
			dir: 'ships-ts-only',
			directory: fixture('ships-ts-only', 'index.ts'),
			manifest: { files: ['src'] },
		},
	];

	assert.deepEqual(consumerTsconfigPackages(packages), ['ships-tsrx']);
});
