import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import {
	isVitestLane,
	requiredExecutableLanes,
	validateManifest,
	verifyLaneRunResult,
} from './harness-lib.mjs';

function portablePath(path) {
	return path.replaceAll('\\', '/');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function discoverReactParityManifestPaths(root) {
	return readdirSync(resolve(root, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `packages/${entry.name}/audit/react-parity.json`)
		.filter((manifestPath) => existsSync(resolve(root, manifestPath)))
		.sort();
}

export function loadRequiredVitestLanes(root) {
	return discoverReactParityManifestPaths(root).flatMap((manifestPath) => {
		const manifest = validateManifest(
			JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')),
		);
		return requiredExecutableLanes(manifest).filter(isVitestLane);
	});
}

export function laneVitestFiles(lane, root) {
	if (lane.execution?.kind === 'vitest-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		return inventory.files;
	}
	return lane.files
		.filter((file) => file.role === 'test')
		.map((file) => file.path)
		.sort();
}

function laneTestNamePattern(lane) {
	if (lane.execution?.kind === 'vitest-full') return undefined;
	const fullNames = lane.files.flatMap((file) => (file.cases ?? []).map((entry) => entry.fullName));
	if (fullNames.length === 0) throw new Error(`lane ${lane.id} has no executable cases`);
	return new RegExp(`^(?:${fullNames.map(escapeRegExp).join('|')})$`);
}

export function buildParityVitestProjects({ baseProjects, lanes, root }) {
	const projectsByName = new Map(baseProjects.map((project) => [project.test?.name, project]));
	const selectedProjects = new Set();
	const selectedFiles = new Map();

	return lanes.map((lane) => {
		const project = projectsByName.get(lane.project);
		if (!project)
			throw new Error(`lane ${lane.id} references unknown Vitest project ${lane.project}`);
		if (selectedProjects.has(lane.project)) {
			throw new Error(
				`Vitest project ${lane.project} is selected by more than one required parity lane`,
			);
		}
		selectedProjects.add(lane.project);

		const include = laneVitestFiles(lane, root);
		for (const file of include) {
			const key = `${lane.project}\0${file}`;
			const previousLane = selectedFiles.get(key);
			if (previousLane) {
				throw new Error(
					`Vitest file ${file} is selected by both ${previousLane.id} and ${lane.id}`,
				);
			}
			selectedFiles.set(key, lane);
		}

		const testNamePattern = laneTestNamePattern(lane);
		return {
			...project,
			testExecution: undefined,
			test: {
				...project.test,
				include: project.root ? include.map((file) => resolve(root, file)) : include,
				...(testNamePattern === undefined ? {} : { testNamePattern }),
				...(lane.execution?.fileParallelism === undefined
					? {}
					: { fileParallelism: lane.execution.fileParallelism }),
			},
		};
	});
}

function describeVitestFailureDetails(testResults) {
	const failures = testResults.flatMap((suite) =>
		(suite.assertionResults ?? [])
			.filter((assertion) => assertion.status !== 'passed')
			.map((assertion) => {
				const detail = Array.isArray(assertion.failureMessages)
					? assertion.failureMessages.join('\n')
					: assertion.failureMessages;
				return `${suite.name} :: ${assertion.fullName} [${assertion.status}]${detail ? `\n${detail}` : ''}`;
			}),
	);
	if (failures.length === 0) return '';
	return `\n  Vitest failure details:\n${failures
		.slice(0, 5)
		.map((failure) => `    ${failure.replaceAll('\n', '\n    ')}`)
		.join('\n')}`;
}

function parseBatchedVitestResult(stdout) {
	const result = JSON.parse(stdout);
	if (!result || !Array.isArray(result.testResults)) {
		throw new Error('parity-wide Vitest run returned an invalid JSON result');
	}
	return result;
}

function laneExpectedTestsByFile(lane, root) {
	if (lane.execution?.kind === 'vitest-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		const tests = new Map();
		for (const test of inventory.tests) {
			if (!tests.has(test.file)) tests.set(test.file, new Set());
			tests.get(test.file).add(test.fullName);
		}
		return tests;
	}
	return new Map(
		lane.files
			.filter((file) => file.role === 'test')
			.map((file) => [file.path, new Set(file.cases.map((entry) => entry.fullName))]),
	);
}

function vitestOwnerByFile(lanes, root) {
	const ownerByFile = new Map();
	for (const lane of lanes) {
		for (const file of laneVitestFiles(lane, root)) {
			let projects = ownerByFile.get(file);
			if (!projects) ownerByFile.set(file, (projects = new Map()));
			const previousLane = projects.get(lane.project);
			if (previousLane) {
				throw new Error(`Vitest file ${file} is owned by both ${previousLane.id} and ${lane.id}`);
			}
			projects.set(lane.project, lane);
		}
	}
	return ownerByFile;
}

function resolveVitestOwner(ownerByFile, suite, root) {
	if (typeof suite.name !== 'string')
		throw new Error('parity-wide Vitest run returned a test result without a file name');
	const absoluteFile = isAbsolute(suite.name) ? suite.name : resolve(root, suite.name);
	const file = portablePath(relative(root, absoluteFile));
	const projects = ownerByFile.get(file);
	if (!projects) throw new Error(`parity-wide Vitest run executed undeclared file ${file}`);
	if (suite.projectName === undefined && projects.size > 1)
		throw new Error(`parity-wide Vitest result for ${file} requires a project name`);
	const owner =
		suite.projectName === undefined
			? projects.values().next().value
			: projects.get(suite.projectName);
	if (!owner)
		throw new Error(
			`parity-wide Vitest run executed undeclared project ${suite.projectName} for ${file}`,
		);
	return { file, owner, key: `${owner.project}\0${file}` };
}

export function verifyBatchedVitestShardResult(lanes, stdout, root) {
	const result = parseBatchedVitestResult(stdout);
	const ownerByFile = vitestOwnerByFile(lanes, root);
	const expectedTests = new Map(lanes.map((lane) => [lane, laneExpectedTestsByFile(lane, root)]));
	const seenFiles = new Set();
	const selectedResults = [];
	for (const suite of result.testResults) {
		const { file, owner, key } = resolveVitestOwner(ownerByFile, suite, root);
		if (seenFiles.has(key)) {
			throw new Error(`parity-wide Vitest shard reported ${file} more than once`);
		}
		seenFiles.add(key);
		const selectedAssertions = [];
		for (const assertion of suite.assertionResults ?? []) {
			const fullName = assertion.fullName?.replaceAll(' > ', ' ');
			if (!expectedTests.get(owner).get(file)?.has(fullName)) {
				if (['pending', 'skipped', 'todo', 'disabled'].includes(assertion.status)) continue;
				throw new Error(
					`parity-wide Vitest run executed undeclared test ${file} :: ${fullName} [${assertion.status}]`,
				);
			}
			selectedAssertions.push(assertion);
		}
		selectedResults.push({ ...suite, assertionResults: selectedAssertions });
	}
	const failureDetails = describeVitestFailureDetails(selectedResults);
	if (failureDetails) {
		throw new Error(`parity-wide Vitest shard contains non-passing tests:${failureDetails}`);
	}
	return result;
}

export function verifyBatchedVitestResult(lanes, reports, root) {
	const reportSources = Array.isArray(reports) ? reports : [reports];
	const parsed = reportSources.map((stdout) => verifyBatchedVitestShardResult(lanes, stdout, root));
	const result = {
		...(parsed[0] ?? {}),
		testResults: parsed.flatMap((report) => report.testResults),
	};
	const ownerByFile = vitestOwnerByFile(lanes, root);

	const resultsByLane = new Map(lanes.map((lane) => [lane, []]));
	for (const suite of result.testResults) {
		const { owner } = resolveVitestOwner(ownerByFile, suite, root);
		resultsByLane.get(owner).push(suite);
	}

	for (const lane of lanes) {
		const laneResults = resultsByLane.get(lane);
		try {
			verifyLaneRunResult(lane, JSON.stringify({ ...result, testResults: laneResults }), root);
		} catch (error) {
			throw new Error(`${error.message}${describeVitestFailureDetails(laneResults)}`);
		}
	}
	return true;
}
