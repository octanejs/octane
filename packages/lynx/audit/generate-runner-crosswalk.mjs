import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const auditDirectory = path.dirname(fileURLToPath(import.meta.url));
const crosswalkPath = path.join(auditDirectory, 'upstream-crosswalk.json');
const defaultOutputPath = path.join(auditDirectory, 'upstream-runner-cases.json');

function argument(name, fallback = undefined) {
	const index = process.argv.indexOf(name);
	if (index === -1) return fallback;
	const value = process.argv[index + 1];
	assert(value, `${name} requires a value`);
	return value;
}

const upstreamArgument = argument('--upstream');
const inputArgument = argument('--input-directory');
assert(upstreamArgument, '--upstream requires the pinned lynx-stack checkout path');
assert(inputArgument, '--input-directory requires the Vitest list JSON directory');

const upstreamRoot = await realpath(path.resolve(upstreamArgument));
const inputDirectory = await realpath(path.resolve(inputArgument));
const outputPath = path.resolve(argument('--output', defaultOutputPath));
const crosswalk = JSON.parse(await readFile(crosswalkPath, 'utf8'));

const actualCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: upstreamRoot,
	encoding: 'utf8',
}).trim();
assert.equal(
	actualCommit,
	crosswalk.upstream.reactLynxOracle.commit,
	'runner inventory must come from the pinned ReactLynx commit',
);
assert.equal(
	execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
		cwd: upstreamRoot,
		encoding: 'utf8',
	}).trim(),
	'',
	'runner inventory requires a clean pinned checkout (ignored build outputs are allowed)',
);

const taskInputs = [
	{
		file: 'core-loc.json',
		task: '@lynx-js/react-runtime#test:core',
	},
	{
		file: 'snapshot-loc.json',
		task(source) {
			return source === 'packages/react/runtime/__test__/shared/profile.test.ts'
				? '@lynx-js/react-runtime#orphan:shared/profile'
				: '@lynx-js/react-runtime#test:snapshot';
		},
	},
	{
		file: 'et-loc.json',
		task: '@lynx-js/react-runtime#test:et',
	},
	{
		file: 'testing-loc.json',
		task: '@lynx-js/reactlynx-testing-library#test',
	},
	{
		file: 'testing-3.1-loc.json',
		task: '@lynx-js/reactlynx-testing-library#test:3.1',
	},
	{
		file: 'transform-loc.json',
		task: '@lynx-js/react-transform#test',
	},
];

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

function sourceClassification(source) {
	const matches = crosswalk.testInventory.classificationGroups.filter((group) => {
		const positive = group.selectors
			.filter((selector) => !selector.startsWith('!'))
			.some((selector) => globToRegExp(selector).test(source));
		const negative = group.selectors
			.filter((selector) => selector.startsWith('!'))
			.some((selector) => globToRegExp(selector.slice(1)).test(source));
		return positive && !negative;
	});
	assert.equal(matches.length, 1, `${source} matched ${matches.length} source classifications`);
	return matches[0].classification;
}

function caseClassification(source, title) {
	const matches = crosswalk.testInventory.runnerCaseOverrides.filter(
		(rule) => rule.source === source && new RegExp(rule.titlePattern, 'u').test(title),
	);
	assert(matches.length <= 1, `${source}: ${title} matched multiple case overrides`);
	return matches[0]?.classification ?? sourceClassification(source);
}

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
	return sources;
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

async function discoverRustTestCases() {
	const files = await walkFiles(path.join(upstreamRoot, 'packages/react/transform'));
	const cases = [];
	for (const file of files) {
		if (!file.endsWith('.rs')) continue;
		const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
		const source = path.relative(upstreamRoot, file).split(path.sep).join('/');
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
				// A #[test] inside a macro definition is a template, not itself a
				// runnable case. The concrete invocation names are recorded below.
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
	cases.sort(
		(a, b) =>
			compareCodeUnits(a.source, b.source) || a.line - b.line || compareCodeUnits(a.name, b.name),
	);
	assert.equal(
		new Set(cases.map((entry) => `${entry.source}\0${entry.line}\0${entry.name}`)).size,
		cases.length,
		'Rust test source identities contain duplicates',
	);
	return cases;
}

async function discoverSourceFiles() {
	const sourceDirectories = [
		'packages/react/runtime/__test__/core',
		'packages/react/runtime/__test__/snapshot',
		'packages/react/runtime/__test__/worklet-runtime',
		'packages/react/runtime/__test__/guardrails',
		'packages/react/runtime/__test__/element-template',
		'packages/react/testing-library/src',
		'packages/react/transform/__test__',
	];
	const files = (
		await Promise.all(
			sourceDirectories.map(async (relativeDirectory) => {
				const discovered = await walkFiles(path.join(upstreamRoot, relativeDirectory));
				return discovered
					.filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
					.map((file) => path.relative(upstreamRoot, file).split(path.sep).join('/'));
			}),
		)
	)
		.flat()
		.concat('packages/react/runtime/__test__/shared/profile.test.ts')
		.sort();
	assert.equal(files.length, crosswalk.testInventory.totalSourceFileCount);
	return files;
}

const cases = [];
const occurrences = new Map();
for (const input of taskInputs) {
	const rawCases = JSON.parse(await readFile(path.join(inputDirectory, input.file), 'utf8'));
	assert(Array.isArray(rawCases), `${input.file} must contain a JSON array`);
	for (const rawCase of rawCases) {
		assert.equal(typeof rawCase.name, 'string', `${input.file} case title must be a string`);
		assert.equal(typeof rawCase.file, 'string', `${input.file} case file must be a string`);

		const sourcePath = await realpath(rawCase.file);
		const source = path.relative(upstreamRoot, sourcePath).split(path.sep).join('/');
		assert(!source.startsWith('../'), `${rawCase.file} is outside the pinned checkout`);
		let line = rawCase.location?.line;
		let column = rawCase.location?.column;
		let locationKind = 'definition';
		if (!Number.isInteger(line) || !Number.isInteger(column)) {
			const sourceLines = (await readFile(sourcePath, 'utf8')).split(/\r?\n/u);
			const importLines = sourceLines
				.map((text, index) => ({ text, line: index + 1 }))
				.filter(({ text }) =>
					/^\s*import\s+['"].*\.(?:test|spec)\.[cm]?[jt]sx?['"];?\s*$/u.test(text),
				);
			assert.equal(
				importLines.length,
				1,
				`${rawCase.name} has no runner location and is not a single test-import wrapper`,
			);
			line = importLines[0].line;
			column = importLines[0].text.indexOf('import') + 1;
			locationKind = 'import-wrapper';
		}
		const task = typeof input.task === 'function' ? input.task(source) : input.task;
		const baseIdentity = `${task}\0${source}\0${line}\0${column}\0${rawCase.name}`;
		const occurrence = (occurrences.get(baseIdentity) ?? 0) + 1;
		occurrences.set(baseIdentity, occurrence);
		const identity = `${baseIdentity}\0${occurrence}`;
		cases.push({
			id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
			task,
			source,
			line,
			column,
			locationKind,
			occurrence,
			title: rawCase.name,
			classification: caseClassification(source, rawCase.name),
		});
	}
}

cases.sort(
	(a, b) =>
		compareCodeUnits(a.task, b.task) ||
		compareCodeUnits(a.source, b.source) ||
		a.line - b.line ||
		a.column - b.column ||
		compareCodeUnits(a.title, b.title) ||
		a.occurrence - b.occurrence,
);

assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length, 'case ids collided');
assert.equal(
	new Set(
		cases.map(
			(entry) =>
				`${entry.task}\0${entry.source}\0${entry.line}\0${entry.column}\0${entry.title}\0${entry.occurrence}`,
		),
	).size,
	cases.length,
	'runner emitted duplicate case identities',
);

for (const rule of crosswalk.testInventory.runnerCaseOverrides) {
	const pattern = new RegExp(rule.titlePattern, 'u');
	const matchingCases = cases.filter(
		(entry) => entry.source === rule.source && pattern.test(entry.title),
	);
	assert(
		matchingCases.length > 0,
		`${rule.source}: ${rule.titlePattern} matched no runnable cases`,
	);
	assert.notEqual(
		rule.classification,
		sourceClassification(rule.source),
		`${rule.source}: ${rule.titlePattern} redundantly repeats its source classification`,
	);
}

const discoveredSources = await discoverSourceFiles();
const rustSources = expectedRustSources();
const rustCases = await discoverRustTestCases();
assert.deepEqual(
	summarizeRustSources(rustCases),
	rustSources,
	'pinned checkout Rust test source/case inventory drifted',
);
assert.equal(rustCases.length, crosswalk.testInventory.rustCaseCount);
const rustCaseDigest = createHash('sha256').update(JSON.stringify(rustCases)).digest('hex');
assert.equal(rustCaseDigest, crosswalk.testInventory.runnerExpandedCases.rustCaseDigest);
const runnableSources = new Set(cases.map((entry) => entry.source));
const sourceFilesWithoutRunnableCases = discoveredSources.filter(
	(source) => !runnableSources.has(source),
);
const taskCounts = Object.entries(
	cases.reduce((counts, entry) => {
		counts[entry.task] = (counts[entry.task] ?? 0) + 1;
		return counts;
	}, {}),
)
	.map(([task, runnableCaseCount]) => ({ task, runnableCaseCount }))
	.sort((a, b) => compareCodeUnits(a.task, b.task));
const classificationCounts = Object.fromEntries(
	crosswalk.classifications.map((classification) => [
		classification,
		cases.filter((entry) => entry.classification === classification).length,
	]),
);
const caseDigest = createHash('sha256').update(JSON.stringify(cases)).digest('hex');

const artifact = {
	schemaVersion: 1,
	auditDate: crosswalk.auditDate,
	upstream: {
		repository: crosswalk.upstream.reactLynxOracle.repository,
		tag: crosswalk.upstream.reactLynxOracle.tag,
		commit: actualCommit,
	},
	collector: 'vitest list --includeTaskLocation --json',
	rustInventory: {
		classification: crosswalk.testInventory.rustClassification,
		caseCount: crosswalk.testInventory.rustCaseCount,
		sourceFileCount: crosswalk.testInventory.rustSourceFileCount,
		caseDigest: rustCaseDigest,
		sources: rustSources,
		cases: rustCases,
	},
	runnableCaseCount: cases.length,
	classifiedCaseCount: cases.length,
	unclassifiedRunnableCaseCount: 0,
	sourceFileCount: runnableSources.size,
	sourceFilesWithoutRunnableCases,
	taskCounts,
	classificationCounts,
	caseDigest,
	cases,
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
	`Generated ${path.relative(process.cwd(), outputPath)}: ${cases.length} runnable cases, ` +
		`${runnableSources.size} runnable source files, ${sourceFilesWithoutRunnableCases.length} source files without runnable cases.`,
);
