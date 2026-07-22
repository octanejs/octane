import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

function compareCodeUnits(first, second) {
	return first < second ? -1 : first > second ? 1 : 0;
}

function expectedRustSources() {
	const sources = crosswalk.testInventory.rustSources;
	assert(Array.isArray(sources), 'Rust test source metadata must be an array');
	assert.equal(
		new Set(sources.map((entry) => entry.source)).size,
		sources.length,
		'Rust test source metadata contains duplicates',
	);
	for (const entry of sources) {
		assert.equal(typeof entry.source, 'string', 'Rust test source path must be a string');
		assert(Number.isInteger(entry.caseCount) && entry.caseCount > 0, `${entry.source} case count`);
	}
	assert.deepEqual(
		sources,
		[...sources].sort((a, b) => compareCodeUnits(a.source, b.source)),
		'Rust test source metadata must be canonically sorted',
	);
	assert.equal(sources.length, crosswalk.testInventory.rustSourceFileCount);
	assert.equal(
		sources.reduce((total, entry) => total + entry.caseCount, 0),
		crosswalk.testInventory.rustCaseCount,
	);
	assert.equal(crosswalk.testInventory.rustClassification, 'out-of-scope');
	return sources;
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

function summarizeRustSources(cases) {
	const counts = new Map();
	for (const entry of cases) {
		counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
	}
	return [...counts]
		.map(([source, caseCount]) => ({ source, caseCount }))
		.sort((a, b) => compareCodeUnits(a.source, b.source));
}

async function discoverRustTestCases(upstreamRoot) {
	const files = await walkFiles(path.join(upstreamRoot, 'packages/react/transform'));
	const cases = [];
	for (const file of files) {
		if (!file.endsWith('.rs')) continue;
		const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
		const source = normalizeCrosswalkPath(path.relative(upstreamRoot, file));
		for (let index = 0; index < lines.length; index++) {
			if (/^\s*#\[\s*test\s*\]\s*$/u.test(lines[index])) {
				let declarationIndex = index + 1;
				while (
					declarationIndex < lines.length &&
					(/^\s*$/u.test(lines[declarationIndex]) ||
						/^\s*#\[[^\]]+\]\s*$/u.test(lines[declarationIndex]))
				) {
					declarationIndex++;
				}
				const declaration = lines[declarationIndex] ?? '';
				const functionMatch = declaration.match(
					/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u,
				);
				if (functionMatch !== null) {
					cases.push({
						source,
						line: declarationIndex + 1,
						name: functionMatch[1],
						locationKind: 'definition',
						classification: crosswalk.testInventory.rustClassification,
					});
					continue;
				}
				assert.match(
					declaration,
					/^\s*fn\s+\$name\s*\(/u,
					`${source}:${index + 1} has an unsupported Rust test declaration`,
				);
			}

			if (/^\s*et_snapshot_test!\s*\(\s*$/u.test(lines[index])) {
				let nameIndex = index + 1;
				while (nameIndex < lines.length && /^\s*$/u.test(lines[nameIndex])) nameIndex++;
				const nameMatch = (lines[nameIndex] ?? '').match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*$/u);
				assert(nameMatch, `${source}:${index + 1} has an unsupported Rust test macro invocation`);
				cases.push({
					source,
					line: nameIndex + 1,
					name: nameMatch[1],
					locationKind: 'macro-invocation',
					classification: crosswalk.testInventory.rustClassification,
				});
			}
		}
	}
	return cases.sort(
		(a, b) =>
			compareCodeUnits(a.source, b.source) || a.line - b.line || compareCodeUnits(a.name, b.name),
	);
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
	return discovered;
}

const runnerGate = crosswalk.testInventory.runnerExpandedCases;
const rustSources = expectedRustSources();
assert.equal(
	path.basename(runnerGate.artifact),
	runnerGate.artifact,
	'runner artifact must stay local',
);
const runnerArtifact = JSON.parse(
	await readFile(new URL(`./${runnerGate.artifact}`, crosswalkUrl), 'utf8'),
);

function matchingClassificationGroups(sourceFile) {
	return crosswalk.testInventory.classificationGroups.filter((group) => {
		const positive = group.selectors
			.filter((selector) => !selector.startsWith('!'))
			.some((selector) => globToRegExp(selector).test(sourceFile));
		const negative = group.selectors
			.filter((selector) => selector.startsWith('!'))
			.some((selector) => globToRegExp(selector.slice(1)).test(sourceFile));
		return positive && !negative;
	});
}

for (const rule of crosswalk.testInventory.runnerCaseOverrides) {
	assert(expectedClassifications.includes(rule.classification));
	const sourceGroups = matchingClassificationGroups(rule.source);
	assert.equal(sourceGroups.length, 1, `${rule.source} is not classified`);
	const pattern = new RegExp(rule.titlePattern, 'u');
	const matchingCases = runnerArtifact.cases.filter(
		(entry) => entry.source === rule.source && pattern.test(entry.title),
	);
	assert(
		matchingCases.length > 0,
		`${rule.source}: ${rule.titlePattern} matched no committed runnable cases`,
	);
	assert.notEqual(
		rule.classification,
		sourceGroups[0].classification,
		`${rule.source}: ${rule.titlePattern} redundantly repeats its source classification`,
	);
}

function expectedCaseClassification(source, title) {
	const sourceGroups = matchingClassificationGroups(source);
	assert.equal(
		sourceGroups.length,
		1,
		`${source} matched ${sourceGroups.length} source classifications`,
	);
	const overrides = crosswalk.testInventory.runnerCaseOverrides.filter(
		(rule) => rule.source === source && new RegExp(rule.titlePattern, 'u').test(title),
	);
	assert(overrides.length <= 1, `${source}: ${title} matched multiple runner overrides`);
	return overrides[0]?.classification ?? sourceGroups[0].classification;
}

if (runnerGate.status === 'complete') {
	assert(Number.isInteger(runnerGate.runnableCaseCount));
	assert.equal(runnerGate.classifiedCaseCount, runnerGate.runnableCaseCount);
	assert.equal(
		runnerGate.unclassifiedRunnableCaseCount,
		0,
		'runner-expanded inventory has unclassified runnable cases',
	);
	assert.equal(crosswalk.gates.runnerExpandedTestCasesClassified, true);
	assert.equal(crosswalk.gates.phase0CrosswalkComplete, true);
	assert.deepEqual(crosswalk.gates.blockedBy, []);
	assert.equal(runnerArtifact.schemaVersion, 1);
	assert.equal(runnerArtifact.auditDate, crosswalk.auditDate);
	assert.deepEqual(runnerArtifact.upstream, {
		repository: crosswalk.upstream.reactLynxOracle.repository,
		tag: crosswalk.upstream.reactLynxOracle.tag,
		commit: crosswalk.upstream.reactLynxOracle.commit,
	});
	assert.equal(runnerArtifact.runnableCaseCount, runnerGate.runnableCaseCount);
	assert.equal(runnerArtifact.classifiedCaseCount, runnerGate.classifiedCaseCount);
	assert.equal(runnerArtifact.sourceFileCount, runnerGate.sourceFileCount);
	assert.equal(
		runnerArtifact.unclassifiedRunnableCaseCount,
		runnerGate.unclassifiedRunnableCaseCount,
	);
	assert.equal(runnerArtifact.caseDigest, runnerGate.caseDigest);
	assert.equal(runnerArtifact.rustInventory.classification, 'out-of-scope');
	assert.equal(runnerArtifact.rustInventory.caseCount, crosswalk.testInventory.rustCaseCount);
	assert.equal(
		runnerArtifact.rustInventory.sourceFileCount,
		crosswalk.testInventory.rustSourceFileCount,
	);
	assert.deepEqual(runnerArtifact.rustInventory.sources, rustSources);
	assert(Array.isArray(runnerArtifact.rustInventory.cases));
	assert.equal(runnerArtifact.rustInventory.cases.length, crosswalk.testInventory.rustCaseCount);
	const rustIdentities = new Set();
	for (const entry of runnerArtifact.rustInventory.cases) {
		assert.equal(typeof entry.source, 'string');
		assert(Number.isInteger(entry.line) && entry.line > 0);
		assert.match(entry.name, /^[A-Za-z_][A-Za-z0-9_]*$/u);
		assert(['definition', 'macro-invocation'].includes(entry.locationKind));
		assert.equal(entry.classification, crosswalk.testInventory.rustClassification);
		const identity = `${entry.source}\0${entry.line}\0${entry.name}`;
		assert(!rustIdentities.has(identity), `duplicate Rust test identity ${identity}`);
		rustIdentities.add(identity);
	}
	assert.deepEqual(
		runnerArtifact.rustInventory.cases,
		[...runnerArtifact.rustInventory.cases].sort(
			(a, b) =>
				compareCodeUnits(a.source, b.source) || a.line - b.line || compareCodeUnits(a.name, b.name),
		),
		'Rust cases are not canonically sorted',
	);
	assert.deepEqual(summarizeRustSources(runnerArtifact.rustInventory.cases), rustSources);
	const rustCaseDigest = createHash('sha256')
		.update(JSON.stringify(runnerArtifact.rustInventory.cases))
		.digest('hex');
	assert.equal(runnerArtifact.rustInventory.caseDigest, rustCaseDigest);
	assert.equal(runnerGate.rustCaseDigest, rustCaseDigest);
	assert.deepEqual(runnerArtifact.classificationCounts, runnerGate.classificationCounts);
	assert(Array.isArray(runnerArtifact.cases));
	assert.equal(runnerArtifact.cases.length, runnerGate.runnableCaseCount);

	const caseIds = new Set();
	const caseIdentities = new Set();
	const runnableSources = new Set();
	const classificationCounts = Object.fromEntries(
		expectedClassifications.map((classification) => [classification, 0]),
	);
	const taskCounts = new Map();
	for (const entry of runnerArtifact.cases) {
		assert.match(entry.id, /^[a-f0-9]{20}$/u);
		assert.equal(typeof entry.task, 'string');
		assert.equal(typeof entry.source, 'string');
		assert(Number.isInteger(entry.line) && entry.line > 0);
		assert(Number.isInteger(entry.column) && entry.column > 0);
		assert(['definition', 'import-wrapper'].includes(entry.locationKind));
		assert(Number.isInteger(entry.occurrence) && entry.occurrence > 0);
		assert.equal(typeof entry.title, 'string');
		assert(entry.title.length > 0);
		const expectedClassification = expectedCaseClassification(entry.source, entry.title);
		assert.equal(entry.classification, expectedClassification, `${entry.source}: ${entry.title}`);

		const identity =
			`${entry.task}\0${entry.source}\0${entry.line}\0${entry.column}\0` +
			`${entry.title}\0${entry.occurrence}`;
		assert.equal(entry.id, createHash('sha256').update(identity).digest('hex').slice(0, 20));
		assert(!caseIds.has(entry.id), `duplicate runner case id ${entry.id}`);
		assert(!caseIdentities.has(identity), `duplicate runner case identity ${identity}`);
		caseIds.add(entry.id);
		caseIdentities.add(identity);
		runnableSources.add(entry.source);
		classificationCounts[entry.classification]++;
		taskCounts.set(entry.task, (taskCounts.get(entry.task) ?? 0) + 1);
	}
	assert.deepEqual(
		runnerArtifact.cases.map((entry) => entry.id),
		[...runnerArtifact.cases]
			.sort(
				(a, b) =>
					compareCodeUnits(a.task, b.task) ||
					compareCodeUnits(a.source, b.source) ||
					a.line - b.line ||
					a.column - b.column ||
					compareCodeUnits(a.title, b.title) ||
					a.occurrence - b.occurrence,
			)
			.map((entry) => entry.id),
		'runner cases are not canonically sorted',
	);

	assert.equal(runnableSources.size, runnerGate.sourceFileCount);
	assert.deepEqual(classificationCounts, runnerGate.classificationCounts);
	assert.equal(
		createHash('sha256').update(JSON.stringify(runnerArtifact.cases)).digest('hex'),
		runnerGate.caseDigest,
	);
	assert.deepEqual(
		runnerArtifact.taskCounts,
		[...taskCounts]
			.map(([task, runnableCaseCount]) => ({ task, runnableCaseCount }))
			.sort((a, b) => compareCodeUnits(a.task, b.task)),
	);
	assert.equal(
		runnerArtifact.sourceFileCount + runnerArtifact.sourceFilesWithoutRunnableCases.length,
		crosswalk.testInventory.totalSourceFileCount,
	);
	for (const source of runnerArtifact.sourceFilesWithoutRunnableCases) {
		assert.equal(matchingClassificationGroups(source).length, 1, `${source} is not classified`);
		assert(!runnableSources.has(source), `${source} also has runnable cases`);
	}
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
	const upstreamArgument = process.argv[upstreamFlagIndex + 1];
	assert(upstreamArgument, '--upstream requires a pinned lynx-stack checkout path');
	const upstreamRoot = path.resolve(upstreamArgument);
	assert.equal(
		execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstreamRoot, encoding: 'utf8' }).trim(),
		crosswalk.upstream.reactLynxOracle.commit,
		'crosswalk validation requires the pinned ReactLynx commit',
	);
	assert.equal(
		execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
			cwd: upstreamRoot,
			encoding: 'utf8',
		}).trim(),
		'',
		'crosswalk validation requires a clean pinned checkout (ignored build outputs are allowed)',
	);
	const discovered = await validatePinnedSourceInventory(upstreamRoot);
	const discoveredRustCases = await discoverRustTestCases(upstreamRoot);
	assert.deepEqual(
		discoveredRustCases,
		runnerArtifact.rustInventory.cases,
		'pinned checkout Rust test identities or locations drifted',
	);
	assert.deepEqual(
		summarizeRustSources(discoveredRustCases),
		rustSources,
		'pinned checkout Rust test source/case inventory drifted',
	);
	assert.deepEqual(
		[
			...new Set([
				...runnerArtifact.cases.map((entry) => entry.source),
				...runnerArtifact.sourceFilesWithoutRunnableCases,
			]),
		].sort(),
		discovered,
		'runner artifact does not cover the pinned source inventory',
	);
}

console.log(
	`Validated Lynx crosswalk: ${crosswalk.publicSurface.manifestSubpathCount} subpaths, ` +
		`${crosswalk.publicSurface.rootDocumentedExportCount} root exports, ` +
		`${crosswalk.testInventory.totalSourceFileCount} classified test source files, ` +
		`${runnerGate.runnableCaseCount} classified runnable cases.`,
);
