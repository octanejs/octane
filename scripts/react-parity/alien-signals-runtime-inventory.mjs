#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	compareTestIdentities,
	summarizeRuntimeInventories,
	toPortablePath,
} from './harness-lib.mjs';
import {
	inventoryFromIdentities,
	runPristineUpstreamSuite,
} from './alien-signals-pristine-runtime.mjs';
import {
	assertAdaptedSourceExecutable,
	assertRuntimeCrosswalk,
	fixtureFileFingerprint,
} from './alien-signals-runtime-lib.mjs';
import { renderTypeInventories } from './alien-signals-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function sha256Text(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
	return sha256Text(readFileSync(resolve(root, path)));
}

function writeInventory(destination, inventory) {
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(inventory, null, 2)}\n`);
	const count = Array.isArray(inventory)
		? `${inventory.length} files`
		: Array.isArray(inventory.tests)
			? `${inventory.tests.length} tests`
			: 'object';
	console.log(`${destination}: ${count}`);
}

const pristine = runPristineUpstreamSuite({ repoRoot: root });
if (pristine.status !== 0) {
	process.stderr.write(pristine.stdout);
	process.stderr.write(pristine.stderr);
	throw new Error('Alien Signals pristine upstream suite failed while generating inventory');
}
const pristineInventory = inventoryFromIdentities(
	pristine.identities,
	'alien-signals-pristine-inner',
);
writeInventory('packages/alien-signals/audit/pristine-runtime.json', pristineInventory);

const wrapperFullName = 'runs the pinned react-alien-signals 0.3.0 suite unchanged';
const wrapperFile = 'packages/alien-signals/tests/upstream-original.test.ts';
const wrapperInventory = {
	schemaVersion: 1,
	project: 'alien-signals-pristine',
	roots: ['packages/alien-signals/tests'],
	files: [wrapperFile],
	tests: [
		{
			id: `runtime:${sha256Text(`${wrapperFile}\0${wrapperFullName}`).slice(0, 16)}`,
			file: wrapperFile,
			fullName: wrapperFullName,
		},
	],
};
writeInventory('packages/alien-signals/audit/pristine-wrapper-runtime.json', wrapperInventory);

const adaptedFiles = ['packages/alien-signals/tests/upstream-adapted.test.ts'];
for (const adaptedFile of adaptedFiles) {
	assertAdaptedSourceExecutable(readFileSync(resolve(root, adaptedFile), 'utf8'), adaptedFile);
}
const idOccurrences = new Map();
const listed = JSON.parse(
	execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', 'alien-signals', '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	),
);
const adaptedTests = listed
	.map(function mapListed(test) {
		return {
			...test,
			relativeFile: toPortablePath(relative(root, test.file)),
		};
	})
	.filter(function keepAdapted(test) {
		return adaptedFiles.includes(test.relativeFile);
	})
	.map(function toInventoryEntry(test) {
		const fullName = test.name.replaceAll(' > ', ' ');
		const baseId = `runtime:${sha256Text(`${test.relativeFile}\0${fullName}`).slice(0, 16)}`;
		const occurrence = idOccurrences.get(baseId) ?? 0;
		idOccurrences.set(baseId, occurrence + 1);
		return {
			id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
			file: test.relativeFile,
			fullName,
		};
	})
	.sort(compareTestIdentities);

const adaptedInventory = {
	schemaVersion: 1,
	project: 'alien-signals',
	roots: ['packages/alien-signals/tests'],
	files: adaptedFiles,
	tests: adaptedTests,
};
const pristineSource = readFileSync(
	resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
	'utf8',
);
const adaptedSource = readFileSync(
	resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
	'utf8',
);
const fixtureSource = readFileSync(
	resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
	'utf8',
);
const ledgerPath = resolve(root, 'packages/alien-signals/audit/runtime-transformation-ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
ledger.fixtureFileSha256 = fixtureFileFingerprint(fixtureSource);
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, '\t')}\n`);
assertRuntimeCrosswalk(pristineInventory, adaptedInventory, {
	pristineSource,
	adaptedSource,
	fixtureSource,
	repoRoot: root,
	expectedFixtureSha256: ledger.fixtureFileSha256,
});
writeInventory('packages/alien-signals/audit/adapted-runtime.json', adaptedInventory);

const { config: typeConfig, inventory: typeInventory } = renderTypeInventories(root);
for (const side of ['upstream', 'adapted']) {
	const destination = typeConfig.inventories[side];
	writeInventory(destination, typeInventory[side]);
}

const summary = summarizeRuntimeInventories([adaptedInventory]);
console.log('adaptedRuntimeSummary', JSON.stringify(summary));

const supportPaths = [
	'packages/alien-signals/audit/pristine-wrapper-runtime.json',
	'packages/alien-signals/audit/pristine-runtime.json',
	'packages/alien-signals/audit/adapted-runtime.json',
	'packages/alien-signals/audit/pristine-types.json',
	'packages/alien-signals/audit/pristine-type-probes.json',
	'packages/alien-signals/audit/adapted-types.json',
	'packages/alien-signals/audit/type-parity.json',
	'packages/alien-signals/audit/pristine-oracle-environment.json',
	'packages/alien-signals/audit/runtime-transformation-ledger.json',
	'packages/alien-signals/audit/test-classifications.json',
	'packages/alien-signals/tests/upstream-original.test.ts',
	'packages/alien-signals/tests/_fixtures/hooks.tsrx',
	'scripts/react-parity/alien-signals-pristine-runtime.mjs',
	'scripts/react-parity/alien-signals-runtime-lib.mjs',
	'scripts/react-parity/alien-signals-types-lib.mjs',
	'scripts/react-parity/alien-signals-classifications-lib.mjs',
	'scripts/react-parity/alien-signals-runtime-inventory.mjs',
	'scripts/react-parity/run-pristine.mjs',
	'packages/alien-signals/audit/upstream.lock.json',
	'packages/alien-signals/upstream/package.json',
	'packages/alien-signals/upstream/tsconfig.json',
	'packages/alien-signals/audit/type-probes/public-api.test-d.ts',
	'packages/alien-signals/audit/type-probes/tsconfig.pristine.json',
	'packages/alien-signals/typetests/upstream-typecheck.test-d.ts',
	'packages/alien-signals/typetests/public-api.test-d.ts',
	'packages/alien-signals/typetests/tsconfig.adapted.json',
	'packages/alien-signals/typetests/tsconfig.json',
];
for (const path of supportPaths) {
	console.log(`${path}: ${sha256File(path)}`);
}
