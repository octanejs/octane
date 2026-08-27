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
	runPristineBrowserSuite,
	runPristineUpstreamSuite,
} from './intersection-observer-pristine-runtime.mjs';
import { renderTypeInventories } from './intersection-observer-types-lib.mjs';
import { verifyIntersectionObserverRuntimeCrosswalk } from './intersection-observer-upstream-lib.mjs';

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

function listProjectTests(project) {
	return JSON.parse(
		execFileSync(
			process.execPath,
			['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
			{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
		),
	);
}

function inventoryFromListed(project, listed, keepFile) {
	const idOccurrences = new Map();
	const tests = listed
		.map(function mapListed(test) {
			return {
				...test,
				relativeFile: toPortablePath(relative(root, test.file)),
			};
		})
		.filter(function keepAdapted(test) {
			return keepFile(test.relativeFile);
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

	return {
		schemaVersion: 1,
		project,
		roots: ['packages/intersection-observer/tests/upstream'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		].sort(),
		tests,
		snapshots: 0,
	};
}

function wrapperInventory(project, file, fullName) {
	const id = `runtime:${createHash('sha256')
		.update(`${file}\0${fullName}`)
		.digest('hex')
		.slice(0, 16)}`;
	return {
		schemaVersion: 1,
		project,
		roots: ['packages/intersection-observer/tests'],
		files: [file],
		tests: [
			{
				id,
				file,
				fullName,
			},
		],
		snapshots: 0,
	};
}

const pristine = runPristineUpstreamSuite({ repoRoot: root });
if (pristine.status !== 0) {
	process.stderr.write(pristine.stdout);
	process.stderr.write(pristine.stderr);
	throw new Error(
		'Intersection-observer pristine upstream suite failed while generating inventory',
	);
}
writeInventory(
	'packages/intersection-observer/audit/pristine-runtime.json',
	inventoryFromIdentities(pristine.identities, 'intersection-observer-pristine'),
);
writeInventory(
	'packages/intersection-observer/audit/pristine-wrapper-runtime.json',
	wrapperInventory(
		'intersection-observer-pristine',
		'packages/intersection-observer/tests/upstream-original.test.ts',
		'runs the pinned react-intersection-observer 10.1.0 suite unchanged',
	),
);

const pristineBrowser = runPristineBrowserSuite({ repoRoot: root });
if (pristineBrowser.status !== 0) {
	process.stderr.write(pristineBrowser.stdout);
	process.stderr.write(pristineBrowser.stderr);
	throw new Error('Intersection-observer pristine browser suite failed while generating inventory');
}
writeInventory(
	'packages/intersection-observer/audit/pristine-browser-runtime.json',
	inventoryFromIdentities(pristineBrowser.identities, 'intersection-observer-pristine-browser'),
);
writeInventory(
	'packages/intersection-observer/audit/pristine-browser-wrapper-runtime.json',
	wrapperInventory(
		'intersection-observer-pristine-browser',
		'packages/intersection-observer/tests/upstream-browser-original.test.ts',
		'runs the pinned react-intersection-observer 10.1.0 browser suite unchanged',
	),
);

const adapted = inventoryFromListed(
	'intersection-observer-adapted',
	listProjectTests('intersection-observer-adapted'),
	function keepJsdom(file) {
		return (
			file.startsWith('packages/intersection-observer/tests/upstream/') &&
			file !== 'packages/intersection-observer/tests/upstream/browser.test.tsx'
		);
	},
);
writeInventory('packages/intersection-observer/audit/adapted-runtime.json', adapted);

const adaptedBrowser = inventoryFromListed(
	'intersection-observer-adapted-browser',
	listProjectTests('intersection-observer-adapted-browser'),
	function keepBrowser(file) {
		return file === 'packages/intersection-observer/tests/upstream/browser.test.tsx';
	},
);
writeInventory('packages/intersection-observer/audit/adapted-browser-runtime.json', adaptedBrowser);

const { inventory: typeInventory } = renderTypeInventories(root);
writeInventory('packages/intersection-observer/audit/pristine-types.json', typeInventory.upstream);
writeInventory('packages/intersection-observer/audit/adapted-types.json', typeInventory.adapted);

const crosswalk = verifyIntersectionObserverRuntimeCrosswalk(root);
console.log('adapted runtime summary', summarizeRuntimeInventories([adapted, adaptedBrowser]));
console.log(
	`pristine/adapted crosswalk ok (unit=${crosswalk.unitCases}, browser=${crosswalk.browserCases})`,
);
