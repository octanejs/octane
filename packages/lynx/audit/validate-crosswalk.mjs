import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const crosswalkUrl = new URL('./upstream-crosswalk.json', import.meta.url);
const crosswalk = JSON.parse(await readFile(crosswalkUrl, 'utf8'));

const expectedClassifications = [
	'port',
	'differential',
	'intentional-divergence',
	'deferred',
	'out-of-scope',
];

assert.deepEqual(
	[...crosswalk.classifications].sort(),
	[...expectedClassifications].sort(),
	'classification vocabulary drifted',
);

function flattenUnique(groups, field, expectedCount, label) {
	const values = groups.flatMap((group) => group[field]);
	assert.equal(values.length, expectedCount, `${label} count drifted`);
	assert.equal(new Set(values).size, values.length, `${label} contains duplicates`);
	return values;
}

flattenUnique(
	crosswalk.publicSurface.subpathGroups,
	'subpaths',
	crosswalk.publicSurface.manifestSubpathCount,
	'public subpaths',
);

flattenUnique(
	crosswalk.publicSurface.rootExportGroups,
	'exports',
	crosswalk.publicSurface.rootDocumentedExportCount,
	'root exports',
);

assert.equal(
	crosswalk.publicSurface.reactTypePassthroughs.length,
	crosswalk.publicSurface.reactTypePassthroughCount,
	'React type passthrough count drifted',
);
assert.equal(
	new Set(crosswalk.publicSurface.reactTypePassthroughs).size,
	crosswalk.publicSurface.reactTypePassthroughs.length,
	'React type passthroughs contain duplicates',
);

for (const group of [
	...crosswalk.publicSurface.subpathGroups,
	...crosswalk.publicSurface.rootExportGroups,
	...crosswalk.publicSurface.ambientGroups,
]) {
	assert(
		expectedClassifications.includes(group.classification),
		`unknown public-surface classification: ${group.classification}`,
	);
	if (group.classification === 'deferred') {
		assert(Number.isInteger(group.milestone), 'deferred public surface requires a milestone');
	}
}

const taskFileCount = crosswalk.testInventory.taskCounts.reduce(
	(total, task) => total + task.sourceFileCount,
	0,
);
assert.equal(
	taskFileCount,
	crosswalk.testInventory.declaredTaskSourceFileCount,
	'declared test task source-file count drifted',
);

const classifiedSourceFileCount = crosswalk.testInventory.classificationGroups.reduce(
	(total, group) => total + group.sourceFileCount,
	0,
);
assert.equal(
	classifiedSourceFileCount,
	crosswalk.testInventory.totalSourceFileCount,
	'test source-file classification count drifted',
);
assert.equal(
	crosswalk.testInventory.declaredTaskSourceFileCount +
		crosswalk.testInventory.orphanedSourceFileCount,
	crosswalk.testInventory.totalSourceFileCount,
	'declared plus orphaned source-file counts do not cover the inventory',
);
assert.equal(
	crosswalk.testInventory.unclassifiedSourceFileCount,
	0,
	'test source-file inventory has unclassified files',
);

for (const group of crosswalk.testInventory.classificationGroups) {
	assert(
		expectedClassifications.includes(group.classification),
		`unknown test classification: ${group.classification}`,
	);
	assert(group.selectors.length > 0, `${group.classification} has no selectors`);
}

function globToRegExp(glob) {
	let expression = '^';
	for (let index = 0; index < glob.length; index++) {
		const character = glob[index];
		if (character === '*' && glob[index + 1] === '*') {
			if (glob[index + 2] === '/') {
				expression += '(?:.*/)?';
				index += 2;
			} else {
				expression += '.*';
				index++;
			}
		} else if (character === '*') {
			expression += '[^/]*';
		} else {
			expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
		}
	}
	return new RegExp(`${expression}$`);
}

function normalizeCrosswalkPath(file) {
	return file.replaceAll(path.win32.sep, path.posix.sep);
}

assert.equal(
	normalizeCrosswalkPath(path.win32.join('packages', 'react', 'example.test.ts')),
	'packages/react/example.test.ts',
	'crosswalk paths must normalize Windows separators',
);

async function walkFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name);
			return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
		}),
	);
	return nested.flat();
}

async function validatePinnedSourceInventory(upstreamRoot) {
	const sourceDirectories = [
		'packages/react/runtime/__test__/core',
		'packages/react/runtime/__test__/snapshot',
		'packages/react/runtime/__test__/worklet-runtime',
		'packages/react/runtime/__test__/guardrails',
		'packages/react/runtime/__test__/element-template',
		'packages/react/testing-library/src',
		'packages/react/transform/__test__',
	];
	const discovered = (
		await Promise.all(
			sourceDirectories.map(async (relativeDirectory) => {
				const files = await walkFiles(path.join(upstreamRoot, relativeDirectory));
				return files
					.filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
					.map((file) => normalizeCrosswalkPath(path.relative(upstreamRoot, file)));
			}),
		)
	)
		.flat()
		.concat('packages/react/runtime/__test__/shared/profile.test.ts')
		.sort();

	assert.equal(
		discovered.length,
		crosswalk.testInventory.totalSourceFileCount,
		'pinned checkout test source-file count drifted',
	);

	const matchesByClassification = new Map(
		expectedClassifications.map((classification) => [classification, 0]),
	);
	for (const sourceFile of discovered) {
		const matches = crosswalk.testInventory.classificationGroups.filter((group) => {
			const positive = group.selectors
				.filter((selector) => !selector.startsWith('!'))
				.some((selector) => globToRegExp(selector).test(sourceFile));
			const negative = group.selectors
				.filter((selector) => selector.startsWith('!'))
				.some((selector) => globToRegExp(selector.slice(1)).test(sourceFile));
			return positive && !negative;
		});
		assert.equal(
			matches.length,
			1,
			`${sourceFile} matched ${matches.length} classification groups`,
		);
		matchesByClassification.set(
			matches[0].classification,
			matchesByClassification.get(matches[0].classification) + 1,
		);
	}

	for (const group of crosswalk.testInventory.classificationGroups) {
		assert.equal(
			matchesByClassification.get(group.classification),
			group.sourceFileCount,
			`${group.classification} source-file count drifted`,
		);
	}
}

const runnerGate = crosswalk.testInventory.runnerExpandedCases;
if (runnerGate.status === 'complete') {
	assert(Number.isInteger(runnerGate.runnableCaseCount));
	assert.equal(
		runnerGate.unclassifiedRunnableCaseCount,
		0,
		'runner-expanded inventory has unclassified runnable cases',
	);
	assert.equal(crosswalk.gates.runnerExpandedTestCasesClassified, true);
	assert.equal(crosswalk.gates.phase0CrosswalkComplete, true);
} else {
	assert.equal(runnerGate.status, 'unmet-gate');
	assert.equal(runnerGate.runnableCaseCount, null);
	assert.equal(runnerGate.unclassifiedRunnableCaseCount, null);
	assert.equal(crosswalk.gates.runnerExpandedTestCasesClassified, false);
	assert.equal(crosswalk.gates.phase0CrosswalkComplete, false);
	assert(
		crosswalk.gates.blockedBy.includes('runner-expanded-test-case-inventory'),
		'pending runner inventory must remain an explicit Phase 0 blocker',
	);
}

const upstreamFlagIndex = process.argv.indexOf('--upstream');
if (upstreamFlagIndex !== -1) {
	const upstreamRoot = process.argv[upstreamFlagIndex + 1];
	assert(upstreamRoot, '--upstream requires a pinned lynx-stack checkout path');
	await validatePinnedSourceInventory(path.resolve(upstreamRoot));
}

console.log(
	`Validated Lynx crosswalk: ${crosswalk.publicSurface.manifestSubpathCount} subpaths, ` +
		`${crosswalk.publicSurface.rootDocumentedExportCount} root exports, ` +
		`${crosswalk.testInventory.totalSourceFileCount} classified test source files.`,
);
