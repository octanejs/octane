#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
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
} from './livestore-pristine-runtime.mjs';
import { renderTypeInventories } from './livestore-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function writeInventory(destination, inventory) {
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(inventory, null, '\t')}\n`);
	const count = Array.isArray(inventory.tests)
		? `${inventory.tests.length} tests`
		: `${inventory.assertionGroups?.length ?? 0} assertion groups`;
	console.log(`${destination}: ${count}`);
}

const pristine = runPristineUpstreamSuite({ repoRoot: root });
if (pristine.status !== 0) {
	process.stderr.write(pristine.stdout);
	process.stderr.write(pristine.stderr);
	throw new Error('LiveStore pristine upstream suite failed while generating inventory');
}
writeInventory(
	'packages/livestore/audit/pristine-runtime.json',
	inventoryFromIdentities(pristine.identities),
);

const adaptedFiles = [
	'packages/livestore/tests/document-sync.test.ts',
	'packages/livestore/tests/lifecycle.test.ts',
	'packages/livestore/tests/query.test.ts',
];
const idOccurrences = new Map();
const listed = JSON.parse(
	execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', 'livestore', '--json'],
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
		const baseId = `runtime:${createHash('sha256')
			.update(`${test.relativeFile}\0${fullName}`)
			.digest('hex')
			.slice(0, 16)}`;
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
	project: 'livestore',
	roots: ['packages/livestore/tests'],
	files: [
		...new Set(
			adaptedTests.map(function fileOf(test) {
				return test.file;
			}),
		),
	].sort(),
	tests: adaptedTests,
};
writeInventory('packages/livestore/audit/adapted-runtime.json', adaptedInventory);

const wrapperListed = JSON.parse(
	execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', 'livestore-pristine', '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	),
);
const wrapperTests = wrapperListed
	.map(function mapListed(test) {
		const relativeFile = toPortablePath(relative(root, test.file));
		const fullName = test.name.replaceAll(' > ', ' ');
		return {
			id: `runtime:${createHash('sha256')
				.update(`${relativeFile}\0${fullName}`)
				.digest('hex')
				.slice(0, 16)}`,
			file: relativeFile,
			fullName,
		};
	})
	.sort(compareTestIdentities);
writeInventory('packages/livestore/audit/pristine-wrapper-runtime.json', {
	schemaVersion: 1,
	project: 'livestore-pristine',
	roots: ['packages/livestore/tests'],
	files: [
		...new Set(
			wrapperTests.map(function fileOf(test) {
				return test.file;
			}),
		),
	],
	tests: wrapperTests,
});

const { config: typeConfig, inventory: typeInventory } = renderTypeInventories(root);
for (const side of ['upstream', 'adapted']) {
	const destination = typeConfig.inventories[side];
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(typeInventory[side], null, 2)}\n`);
	console.log(`${destination}: ${typeInventory[side].length} files`);
}

console.log(
	'adaptedRuntimeSummary',
	JSON.stringify(summarizeRuntimeInventories([adaptedInventory]), null, 2),
);
