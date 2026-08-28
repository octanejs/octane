import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LANE_TYPES = new Set([
	'pristine-upstream',
	'adapted-octane',
	'differential',
	'browser',
	'pristine-types',
	'adapted-types',
]);
const ORACLES = new Set(['required', 'optional']);
const PROVENANCE_FIELDS = [
	'repo',
	'version',
	'commit',
	'sourceRoot',
	'testRoot',
	'license',
	'integrity',
];
const ENVIRONMENT_FIELDS = [
	'node',
	'platform',
	'arch',
	'packageManager',
	'lockfile',
	'lockfileSha256',
];
const ROOT_KEYS = new Set([
	'$schema',
	'schemaVersion',
	'provenance',
	'environments',
	'lanes',
	'ordinaryEvidence',
	'divergences',
	'upstreamSuites',
	'adaptedRoots',
	'adaptedRuntimeSummary',
]);
const PROVENANCE_KEYS = new Set([...PROVENANCE_FIELDS, 'verification']);
const ENVIRONMENT_KEYS = new Set(ENVIRONMENT_FIELDS);
const FILE_KEYS = new Set(['path', 'role', 'sha256', 'cases']);
const ORDINARY_EVIDENCE_FILE_KEYS = new Set(['path', 'sha256', 'cases']);
const CASE_KEYS = new Set(['id', 'testName', 'fullName']);
const LANE_KEYS = new Set([
	'id',
	'type',
	'oracle',
	'available',
	'environment',
	'project',
	'files',
	'notes',
	'execution',
	'evidenceOrigin',
]);
const EXECUTION_KEYS = new Set([
	'kind',
	'compiler',
	'compilerBins',
	'project',
	'inventory',
	'config',
	'root',
	'file',
	'loader',
	'fileParallelism',
]);
const SUITE_STATES = new Set(['present', 'absent', 'insufficient']);
const TYPE_EVIDENCE_ORIGINS = new Set(['upstream-suite', 'repo-authored']);
const FULL_RUNTIME_EXECUTIONS = new Set([
	'vitest-full',
	'jest-full',
	'playwright-full',
	'node-full',
]);
const ADAPTED_ROOT_KEYS = new Set(['source', 'tests']);
const ADAPTED_SCAN_KEYS = new Set(['roots', 'include', 'exclude']);
const ADAPTED_RUNTIME_SUMMARY_KEYS = new Set([
	'inventoryEntries',
	'uniqueIdentities',
	'duplicateEntriesWithinLanes',
	'identitiesSharedAcrossLanes',
]);
const DIVERGENCE_FIELDS = [
	'upstreamResult',
	'octaneResult',
	'rationale',
	'classification',
	'consumerImpact',
	'migrationGuidance',
	'owner',
	'reviewCondition',
];
const ORDINARY_EVIDENCE_KEYS = new Set(['id', 'path', 'sha256', 'testName', 'fullName']);
const DIVERGENCE_KEYS = new Set(['id', 'caseIds', 'ordinaryEvidence', ...DIVERGENCE_FIELDS]);

function fail(message) {
	throw new Error(`Invalid React parity manifest: ${message}`);
}

function requiredString(value, label) {
	if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
}

function exactPath(value, label) {
	requiredString(value, label);
	if (
		isAbsolute(value) ||
		value.includes('..') ||
		/[?*{}[\]]/.test(value) ||
		value.startsWith('^') ||
		value.endsWith('$')
	) {
		fail(`${label} must be an exact relative file path`);
	}
}

function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

function sourceStringLiterals(value) {
	return [
		`'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`,
		`"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
		`\`${value.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``,
	];
}

export function nodeMajorSatisfies(requirement, actualMajor) {
	const match = /^(>=)?(\d+)$/.exec(requirement);
	if (!match) throw new Error(`Unsupported Node requirement: ${requirement}`);
	const requiredMajor = Number(match[2]);
	return match[1] === '>=' ? actualMajor >= requiredMajor : actualMajor === requiredMajor;
}

export function toPortablePath(path) {
	return path.replaceAll('\\', '/');
}

export function compareTestIdentities(left, right) {
	const leftKey = `${left.file}\0${left.fullName}`;
	const rightKey = `${right.file}\0${right.fullName}`;
	return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function summarizeRuntimeInventories(inventories) {
	const allIdentities = new Set();
	const identityLaneCounts = new Map();
	let inventoryEntries = 0;
	let duplicateEntriesWithinLanes = 0;
	for (const inventory of inventories) {
		const laneIdentities = new Set();
		for (const test of inventory.tests) {
			const identity = `${test.file}\0${test.fullName}`;
			inventoryEntries++;
			allIdentities.add(identity);
			laneIdentities.add(identity);
		}
		duplicateEntriesWithinLanes += inventory.tests.length - laneIdentities.size;
		for (const identity of laneIdentities)
			identityLaneCounts.set(identity, (identityLaneCounts.get(identity) ?? 0) + 1);
	}
	return {
		inventoryEntries,
		uniqueIdentities: allIdentities.size,
		duplicateEntriesWithinLanes,
		identitiesSharedAcrossLanes: [...identityLaneCounts.values()].filter((count) => count > 1)
			.length,
	};
}

function formatTestIdentity(test) {
	return `${test.file} :: ${test.fullName} [${test.status}]`;
}

function testIdentityKey(test) {
	return `${test.file}\0${test.fullName}\0${test.status}`;
}

export function describeTestIdentityMismatch(expected, actual) {
	const expectedCounts = new Map();
	const actualCounts = new Map();
	for (const test of expected) {
		const key = testIdentityKey(test);
		expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
	}
	for (const test of actual) {
		const key = testIdentityKey(test);
		actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
	}
	const missing = expected.filter((test) => {
		const key = testIdentityKey(test);
		const remaining = actualCounts.get(key) ?? 0;
		if (remaining === 0) return true;
		actualCounts.set(key, remaining - 1);
		return false;
	});
	const unexpected = actual.filter((test) => {
		const key = testIdentityKey(test);
		const remaining = expectedCounts.get(key) ?? 0;
		if (remaining === 0) return true;
		expectedCounts.set(key, remaining - 1);
		return false;
	});
	const summarize = (label, tests) => {
		if (tests.length === 0) return `${label}: none`;
		const shown = tests.slice(0, 10).map(formatTestIdentity).join('\n    ');
		const remainder = tests.length > 10 ? `\n    ... and ${tests.length - 10} more` : '';
		return `${label} (${tests.length}):\n    ${shown}${remainder}`;
	};
	return `${summarize('missing', missing)}\n  ${summarize('unexpected', unexpected)}`;
}

export function validateManifest(manifest) {
	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
		fail('root must be an object');
	if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
	for (const key of Object.keys(manifest))
		if (!ROOT_KEYS.has(key)) fail(`root has unknown key "${key}"`);

	for (const field of PROVENANCE_FIELDS)
		requiredString(manifest.provenance?.[field], `provenance.${field}`);
	if (!/^[a-f0-9]{40}$/.test(manifest.provenance.commit)) {
		fail('provenance.commit must be a full 40-character Git commit');
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(manifest.provenance.integrity)) {
		fail('provenance.integrity must be a complete sha256 digest');
	}
	for (const key of Object.keys(manifest.provenance))
		if (!PROVENANCE_KEYS.has(key)) fail(`provenance has unknown key "${key}"`);
	if (!['recorded-unverified', 'verified'].includes(manifest.provenance.verification))
		fail('provenance.verification must be recorded-unverified or verified');
	for (const kind of ['runtime', 'types']) {
		if (!SUITE_STATES.has(manifest.upstreamSuites?.[kind]))
			fail(`upstreamSuites.${kind} must be present, absent, or insufficient`);
	}
	if (Object.keys(manifest.upstreamSuites).some((key) => !['runtime', 'types'].includes(key)))
		fail('upstreamSuites has an unknown key');
	for (const key of Object.keys(manifest.adaptedRoots ?? {}))
		if (!ADAPTED_ROOT_KEYS.has(key)) fail(`adaptedRoots has unknown key "${key}"`);
	for (const kind of ['source', 'tests']) {
		const scan = manifest.adaptedRoots?.[kind];
		if (!scan || typeof scan !== 'object' || Array.isArray(scan))
			fail(`adaptedRoots.${kind} must be an object`);
		for (const key of Object.keys(scan))
			if (!ADAPTED_SCAN_KEYS.has(key)) fail(`adaptedRoots.${kind} has unknown key "${key}"`);
		if (!Array.isArray(scan.roots) || scan.roots.length === 0)
			fail(`adaptedRoots.${kind}.roots must be a non-empty array`);
		for (const path of scan.roots) exactPath(path, `adaptedRoots.${kind}.roots`);
		for (const key of ['include', 'exclude']) {
			if (!Array.isArray(scan[key]) || (key === 'include' && scan[key].length === 0))
				fail(
					`adaptedRoots.${kind}.${key} must be ${key === 'include' ? 'a non-empty' : 'an'} array`,
				);
			for (const pattern of scan[key]) {
				requiredString(pattern, `adaptedRoots.${kind}.${key} pattern`);
				try {
					new RegExp(pattern);
				} catch {
					fail(`adaptedRoots.${kind}.${key} contains an invalid regex`);
				}
			}
		}
	}
	if (
		!manifest.adaptedRuntimeSummary ||
		typeof manifest.adaptedRuntimeSummary !== 'object' ||
		Array.isArray(manifest.adaptedRuntimeSummary)
	)
		fail('adaptedRuntimeSummary must be an object');
	for (const key of Object.keys(manifest.adaptedRuntimeSummary))
		if (!ADAPTED_RUNTIME_SUMMARY_KEYS.has(key))
			fail(`adaptedRuntimeSummary has unknown key "${key}"`);
	for (const field of ADAPTED_RUNTIME_SUMMARY_KEYS) {
		if (
			!Number.isInteger(manifest.adaptedRuntimeSummary[field]) ||
			manifest.adaptedRuntimeSummary[field] < 0
		)
			fail(`adaptedRuntimeSummary.${field} must be a non-negative integer`);
	}

	if (!manifest.environments || typeof manifest.environments !== 'object') {
		fail('environments must be an object');
	}
	if (Object.keys(manifest.environments).length === 0) fail('environments must be non-empty');
	for (const [id, environment] of Object.entries(manifest.environments)) {
		requiredString(id, 'environment id');
		for (const field of ENVIRONMENT_FIELDS) {
			requiredString(environment?.[field], `environments.${id}.${field}`);
		}
		for (const key of Object.keys(environment))
			if (!ENVIRONMENT_KEYS.has(key)) fail(`environment ${id} has unknown key "${key}"`);
		if (!/^[a-f0-9]{64}$/.test(environment.lockfileSha256))
			fail(`environments.${id}.lockfileSha256 must be sha256`);
	}

	if (!Array.isArray(manifest.lanes) || manifest.lanes.length === 0)
		fail('lanes must be non-empty');
	const laneIds = new Set();
	const caseIds = new Set();
	for (const lane of manifest.lanes) {
		let laneCaseCount = 0;
		for (const key of Object.keys(lane))
			if (!LANE_KEYS.has(key)) fail(`lane has unknown key "${key}"`);
		requiredString(lane.id, 'lane.id');
		if (laneIds.has(lane.id)) fail(`duplicate lane id "${lane.id}"`);
		laneIds.add(lane.id);
		if (!LANE_TYPES.has(lane.type)) fail(`lane ${lane.id} has unknown type "${lane.type}"`);
		if (!ORACLES.has(lane.oracle)) fail(`lane ${lane.id} oracle must be required or optional`);
		if (lane.available !== undefined && typeof lane.available !== 'boolean') {
			fail(`lane ${lane.id} available must be boolean`);
		}
		if (!manifest.environments[lane.environment])
			fail(`lane ${lane.id} references unknown environment`);
		requiredString(lane.project, `lane ${lane.id} project`);
		if (lane.execution !== undefined) {
			for (const key of Object.keys(lane.execution))
				if (!EXECUTION_KEYS.has(key)) fail(`lane ${lane.id} execution has unknown key "${key}"`);
			if (
				!['typescript', 'vitest-full', 'jest-full', 'playwright-full', 'node-full'].includes(
					lane.execution.kind,
				)
			)
				fail(`lane ${lane.id} execution kind is unsupported`);
			if (lane.execution.kind !== 'vitest-full' && lane.execution.fileParallelism !== undefined)
				fail(`lane ${lane.id} fileParallelism is only valid for Vitest full-suite execution`);
			if (lane.execution.kind === 'typescript') {
				if (!['tsc', 'tsgo', 'tsrx-tsc'].includes(lane.execution.compiler))
					fail(`lane ${lane.id} execution compiler is unsupported`);
				exactPath(lane.execution.project, `lane ${lane.id} execution project`);
				if (lane.execution.inventory !== undefined)
					fail(`lane ${lane.id} TypeScript execution must not declare an inventory`);
				if (lane.execution.config !== undefined || lane.execution.root !== undefined)
					fail(`lane ${lane.id} TypeScript execution must not declare config or root`);
				if (lane.execution.compilerBins !== undefined) {
					if (
						!Array.isArray(lane.execution.compilerBins) ||
						lane.execution.compilerBins.length === 0
					) {
						fail(`lane ${lane.id} compilerBins must be a non-empty array`);
					}
					for (const bin of lane.execution.compilerBins) {
						exactPath(bin, `lane ${lane.id} compilerBins entry`);
					}
				}
			} else if (lane.execution.kind === 'vitest-full') {
				if (
					lane.execution.compiler !== undefined ||
					lane.execution.compilerBins !== undefined ||
					lane.execution.project !== undefined ||
					lane.execution.config !== undefined ||
					lane.execution.root !== undefined
				)
					fail(
						`lane ${lane.id} full-suite execution only accepts an inventory and fileParallelism`,
					);
				exactPath(lane.execution.inventory, `lane ${lane.id} execution inventory`);
				if (
					lane.execution.fileParallelism !== undefined &&
					typeof lane.execution.fileParallelism !== 'boolean'
				)
					fail(`lane ${lane.id} execution fileParallelism must be boolean`);
			} else if (lane.execution.kind === 'jest-full' || lane.execution.kind === 'playwright-full') {
				if (
					lane.execution.compiler !== undefined ||
					lane.execution.compilerBins !== undefined ||
					lane.execution.project !== undefined
				)
					fail(
						`lane ${lane.id} ${lane.execution.kind} execution must not declare a compiler or project`,
					);
				exactPath(lane.execution.config, `lane ${lane.id} execution config`);
				exactPath(lane.execution.root, `lane ${lane.id} execution root`);
				exactPath(lane.execution.inventory, `lane ${lane.id} execution inventory`);
			} else {
				if (
					lane.execution.compiler !== undefined ||
					lane.execution.compilerBins !== undefined ||
					lane.execution.project !== undefined ||
					lane.execution.config !== undefined
				)
					fail(`lane ${lane.id} Node execution must not declare a compiler, project, or config`);
				exactPath(lane.execution.root, `lane ${lane.id} execution root`);
				exactPath(lane.execution.file, `lane ${lane.id} execution file`);
				exactPath(lane.execution.loader, `lane ${lane.id} execution loader`);
				exactPath(lane.execution.inventory, `lane ${lane.id} execution inventory`);
			}
		}
		if (lane.type.endsWith('-types') !== (lane.execution?.kind === 'typescript'))
			fail(`lane ${lane.id} type and execution kind must agree`);
		const fullRuntimeLane =
			['pristine-upstream', 'adapted-octane'].includes(lane.type) &&
			FULL_RUNTIME_EXECUTIONS.has(lane.execution?.kind);
		if (lane.type.endsWith('-types')) {
			if (!TYPE_EVIDENCE_ORIGINS.has(lane.evidenceOrigin))
				fail(`lane ${lane.id} type evidenceOrigin must be upstream-suite or repo-authored`);
		} else if (fullRuntimeLane) {
			if (!TYPE_EVIDENCE_ORIGINS.has(lane.evidenceOrigin))
				fail(`lane ${lane.id} full runtime evidenceOrigin must be upstream-suite or repo-authored`);
		} else if (lane.type === 'differential') {
			if (lane.evidenceOrigin !== undefined && lane.evidenceOrigin !== 'repo-authored')
				fail(`lane ${lane.id} differential evidenceOrigin must be repo-authored`);
		} else if (lane.evidenceOrigin !== undefined) {
			fail(`lane ${lane.id} non-type lane must not declare evidenceOrigin`);
		}
		if (
			['jest-full', 'playwright-full', 'node-full'].includes(lane.execution?.kind) &&
			lane.type !== 'pristine-upstream'
		)
			fail(
				`lane ${lane.id} ${lane.execution.kind} execution is only valid for pristine-upstream lanes`,
			);
		if (lane.type === 'pristine-types' && lane.execution.compiler !== 'tsc')
			fail(`lane ${lane.id} pristine-types execution must use tsc`);
		if (lane.type === 'adapted-types' && !['tsc', 'tsrx-tsc'].includes(lane.execution.compiler))
			fail(`lane ${lane.id} adapted-types execution must use tsc or tsrx-tsc`);
		if (!Array.isArray(lane.files) || lane.files.length === 0)
			fail(`lane ${lane.id} files must be non-empty`);
		for (const file of lane.files) {
			for (const key of Object.keys(file))
				if (!FILE_KEYS.has(key)) fail(`lane ${lane.id} file has unknown key "${key}"`);
			exactPath(file.path, `lane ${lane.id} file path`);
			if (file.role !== 'test' && file.role !== 'support') {
				fail(`lane ${lane.id} file role must be test or support`);
			}
			if (
				file.role === 'support' &&
				resolve(toPortablePath(file.path)) === resolve('vitest.config.js')
			)
				fail(
					`lane ${lane.id} cannot hash root vitest.config.js as support evidence; use live project ownership and execution validation`,
				);
			if (!/^[a-f0-9]{64}$/.test(file.sha256)) fail(`lane ${lane.id} file sha256 is invalid`);
			if (file.role === 'test' && (!Array.isArray(file.cases) || file.cases.length === 0)) {
				fail(`lane ${lane.id} test file cases must be non-empty`);
			}
			if (file.role === 'support' && file.cases !== undefined) {
				fail(`lane ${lane.id} support file must not declare cases`);
			}
			for (const parityCase of file.cases ?? []) {
				for (const key of Object.keys(parityCase))
					if (!CASE_KEYS.has(key)) fail(`case has unknown key "${key}"`);
				requiredString(parityCase.id, `lane ${lane.id} case id`);
				requiredString(parityCase.testName, `case ${parityCase.id} testName`);
				requiredString(parityCase.fullName, `case ${parityCase.id} fullName`);
				if (caseIds.has(parityCase.id)) fail(`duplicate case id "${parityCase.id}"`);
				caseIds.add(parityCase.id);
				laneCaseCount++;
			}
		}
		if (laneCaseCount === 0 && !FULL_RUNTIME_EXECUTIONS.has(lane.execution?.kind))
			fail(`lane ${lane.id} must declare at least one executable case`);
	}
	if (manifest.ordinaryEvidence !== undefined) {
		if (!Array.isArray(manifest.ordinaryEvidence)) fail('ordinaryEvidence must be an array');
		for (const file of manifest.ordinaryEvidence) {
			for (const key of Object.keys(file))
				if (!ORDINARY_EVIDENCE_FILE_KEYS.has(key))
					fail(`ordinaryEvidence file has unknown key "${key}"`);
			exactPath(file.path, 'ordinaryEvidence file path');
			if (!/^[a-f0-9]{64}$/.test(file.sha256)) fail('ordinaryEvidence file sha256 is invalid');
			if (!Array.isArray(file.cases) || file.cases.length === 0)
				fail(`ordinaryEvidence ${file.path} cases must be non-empty`);
			for (const parityCase of file.cases) {
				for (const key of Object.keys(parityCase))
					if (!CASE_KEYS.has(key)) fail(`ordinaryEvidence case has unknown key "${key}"`);
				requiredString(parityCase.id, `ordinaryEvidence ${file.path} case id`);
				requiredString(parityCase.testName, `ordinaryEvidence case ${parityCase.id} testName`);
				requiredString(parityCase.fullName, `ordinaryEvidence case ${parityCase.id} fullName`);
				if (caseIds.has(parityCase.id)) fail(`duplicate case id "${parityCase.id}"`);
				caseIds.add(parityCase.id);
			}
		}
	}
	if (manifest.provenance.verification === 'verified') {
		const requiredFullRuntime = (type, evidenceOrigin) =>
			manifest.lanes.some(
				(lane) =>
					lane.type === type &&
					lane.oracle === 'required' &&
					lane.available !== false &&
					FULL_RUNTIME_EXECUTIONS.has(lane.execution?.kind) &&
					lane.evidenceOrigin === evidenceOrigin,
			);
		const requiredDifferential = manifest.lanes.some(
			(lane) =>
				lane.type === 'differential' &&
				lane.oracle === 'required' &&
				lane.available !== false &&
				lane.evidenceOrigin === 'repo-authored',
		);
		if (manifest.upstreamSuites.runtime === 'present') {
			if (
				!requiredFullRuntime('pristine-upstream', 'upstream-suite') ||
				!requiredFullRuntime('adapted-octane', 'upstream-suite')
			)
				fail(
					'verified provenance with present upstream runtime tests requires required full pristine-upstream and adapted-octane lanes with upstream-suite evidence',
				);
		} else if (manifest.upstreamSuites.runtime === 'insufficient') {
			if (
				!requiredFullRuntime('pristine-upstream', 'upstream-suite') ||
				!requiredFullRuntime('adapted-octane', 'upstream-suite') ||
				!requiredDifferential
			)
				fail(
					'verified provenance with insufficient upstream runtime tests requires full upstream-suite lanes plus repo-authored differential evidence',
				);
		} else if (!requiredDifferential) {
			// Absent upstream adapter suites have nothing to port into a full
			// adapted-octane inventory. Repo-authored differential evidence is the
			// runtime contract; optional focused adapted-octane lanes may still
			// document divergences when they carry same-scenario React observations.
			fail(
				'verified provenance with absent upstream runtime tests requires differential lanes with repo-authored evidence',
			);
		}

		const typeSuiteState = manifest.upstreamSuites.types;
		const expectedOrigin = typeSuiteState === 'present' ? 'upstream-suite' : 'repo-authored';
		const requiredTypeEvidence = (type) =>
			manifest.lanes.some(
				(lane) =>
					lane.type === type &&
					lane.oracle === 'required' &&
					lane.available !== false &&
					lane.evidenceOrigin === expectedOrigin,
			);
		const hasDeclaredTypeLane = manifest.lanes.some((lane) => lane.type.endsWith('-types'));
		const requiresTypeEvidence = typeSuiteState !== 'absent' || hasDeclaredTypeLane;
		if (
			requiresTypeEvidence &&
			(!requiredTypeEvidence('pristine-types') || !requiredTypeEvidence('adapted-types'))
		)
			fail(
				`verified provenance with ${typeSuiteState} upstream type tests requires available required pristine-types and adapted-types lanes with ${expectedOrigin} evidence${typeSuiteState === 'absent' ? ' when type lanes are declared' : ''}`,
			);
	}

	if (!Array.isArray(manifest.divergences)) fail('divergences must be an array');
	const divergenceIds = new Set();
	const divergentCases = new Set();
	for (const divergence of manifest.divergences) {
		for (const key of Object.keys(divergence))
			if (!DIVERGENCE_KEYS.has(key)) fail(`divergence has unknown key "${key}"`);
		requiredString(divergence.id, 'divergence.id');
		if (divergenceIds.has(divergence.id)) fail(`duplicate divergence id "${divergence.id}"`);
		divergenceIds.add(divergence.id);
		if (!Array.isArray(divergence.caseIds) || divergence.caseIds.length === 0) {
			fail(`divergence ${divergence.id} must match at least one case id`);
		}
		const ordinaryIds = new Set();
		if (divergence.ordinaryEvidence !== undefined) {
			if (!Array.isArray(divergence.ordinaryEvidence) || divergence.ordinaryEvidence.length === 0) {
				fail(`divergence ${divergence.id} ordinaryEvidence must be a non-empty array`);
			}
			for (const evidence of divergence.ordinaryEvidence) {
				for (const key of Object.keys(evidence))
					if (!ORDINARY_EVIDENCE_KEYS.has(key))
						fail(`divergence ${divergence.id} ordinaryEvidence has unknown key "${key}"`);
				requiredString(evidence.id, `divergence ${divergence.id} ordinaryEvidence.id`);
				if (!evidence.id.startsWith('ordinary:'))
					fail(`divergence ${divergence.id} ordinaryEvidence.id must start with "ordinary:"`);
				if (ordinaryIds.has(evidence.id))
					fail(`divergence ${divergence.id} duplicate ordinaryEvidence id "${evidence.id}"`);
				ordinaryIds.add(evidence.id);
				exactPath(evidence.path, `divergence ${divergence.id} ordinaryEvidence.path`);
				if (!/^[a-f0-9]{64}$/.test(evidence.sha256))
					fail(`divergence ${divergence.id} ordinaryEvidence.sha256 is invalid`);
				requiredString(evidence.testName, `divergence ${divergence.id} ordinaryEvidence.testName`);
				requiredString(evidence.fullName, `divergence ${divergence.id} ordinaryEvidence.fullName`);
			}
		}
		for (const caseId of divergence.caseIds) {
			if (!caseIds.has(caseId) && !caseId.startsWith('runtime:') && !ordinaryIds.has(caseId))
				fail(`divergence ${divergence.id} references unknown case id "${caseId}"`);
			if (caseId.startsWith('ordinary:') && !ordinaryIds.has(caseId))
				fail(
					`divergence ${divergence.id} ordinary case id "${caseId}" must be declared in ordinaryEvidence`,
				);
			if (divergentCases.has(caseId)) fail(`case id "${caseId}" has multiple divergences`);
			divergentCases.add(caseId);
		}
		for (const ordinaryId of ordinaryIds) {
			if (!divergence.caseIds.includes(ordinaryId))
				fail(
					`divergence ${divergence.id} ordinaryEvidence id "${ordinaryId}" must also appear in caseIds`,
				);
		}
		for (const field of DIVERGENCE_FIELDS) {
			requiredString(divergence[field], `divergence ${divergence.id} ${field}`);
		}
	}

	return deepFreeze(manifest);
}

export async function loadManifest(path) {
	return validateManifest(JSON.parse(await readFile(path, 'utf8')));
}

export async function verifyManifestFiles(manifest, root) {
	const absoluteRoot = resolve(root);
	const runtimeCaseIds = new Set();
	const adaptedRuntimeInventories = [];
	const fullVitestInventories = [];
	for (const lane of manifest.lanes) {
		let fullVitestInventory;
		if (
			lane.oracle === 'required' &&
			lane.available !== false &&
			lane.execution?.kind === 'vitest-full'
		) {
			fullVitestInventory = JSON.parse(
				await readFile(resolve(absoluteRoot, lane.execution.inventory), 'utf8'),
			);
			fullVitestInventories.push({ lane, inventory: fullVitestInventory });
		}
		if (
			lane.oracle === 'required' &&
			lane.available !== false &&
			lane.type === 'adapted-octane' &&
			lane.execution?.kind === 'vitest-full'
		) {
			const inventory = fullVitestInventory;
			validateRuntimeInventory(inventory, lane, manifest.adaptedRoots.tests.roots);
			adaptedRuntimeInventories.push(inventory);
			for (const test of inventory.tests) runtimeCaseIds.add(test.id);
		} else if (
			lane.oracle === 'required' &&
			lane.available !== false &&
			['jest-full', 'playwright-full', 'node-full'].includes(lane.execution?.kind)
		) {
			const inventory = JSON.parse(
				await readFile(resolve(absoluteRoot, lane.execution.inventory), 'utf8'),
			);
			validateJestRuntimeInventory(inventory, lane);
		}
		for (const file of lane.files) {
			const contents = await readEvidenceFile(absoluteRoot, file);
			if (file.role === 'test' && lane.execution?.kind !== 'typescript') {
				assertParityCaseBindings(file.path, contents.toString('utf8'), file.cases);
			}
		}
	}
	for (const file of manifest.ordinaryEvidence ?? []) {
		const contents = await readEvidenceFile(absoluteRoot, file);
		assertParityCaseBindings(file.path, contents.toString('utf8'), file.cases);
	}
	for (const { lane: fullLane, inventory } of fullVitestInventories) {
		const fullIdentities = new Set(inventory.tests.map((test) => `${test.file}\0${test.fullName}`));
		for (const selectedLane of manifest.lanes) {
			if (
				selectedLane.id === fullLane.id ||
				selectedLane.oracle !== 'required' ||
				selectedLane.available === false ||
				selectedLane.project !== fullLane.project ||
				selectedLane.execution?.kind === 'vitest-full'
			) {
				continue;
			}
			const repeated = selectedLane.files
				.filter((file) => file.role === 'test')
				.flatMap((file) =>
					(file.cases ?? [])
						.filter((test) => fullIdentities.has(`${file.path}\0${test.fullName}`))
						.map((test) => test.fullName),
				);
			if (repeated.length > 0) {
				throw new Error(
					`lane ${selectedLane.id} repeats ${repeated.length} test identities already executed by full-suite lane ${fullLane.id}; attach its semantic case metadata to the full-suite lane instead`,
				);
			}
		}
	}
	const discoveredTests = await discoverAdaptedFiles(absoluteRoot, manifest.adaptedRoots.tests);
	const inventoried = new Set();
	for (const inventory of adaptedRuntimeInventories) {
		for (const path of inventory.files) inventoried.add(path);
	}
	if (
		adaptedRuntimeInventories.length > 0 &&
		JSON.stringify([...discoveredTests].sort()) !== JSON.stringify([...inventoried].sort())
	)
		throw new Error('adapted test roots drifted from the union of full-suite inventories');
	const actualRuntimeSummary = summarizeRuntimeInventories(adaptedRuntimeInventories);
	if (
		[...ADAPTED_RUNTIME_SUMMARY_KEYS].some(
			(field) => actualRuntimeSummary[field] !== manifest.adaptedRuntimeSummary[field],
		)
	)
		throw new Error(
			`adapted runtime inventory summary drifted: expected ${JSON.stringify(manifest.adaptedRuntimeSummary)}, received ${JSON.stringify(actualRuntimeSummary)}`,
		);
	for (const divergence of manifest.divergences) {
		for (const caseId of divergence.caseIds.filter((id) => id.startsWith('runtime:'))) {
			if (!runtimeCaseIds.has(caseId))
				throw new Error(
					`divergence ${divergence.id} references unknown runtime case id "${caseId}"`,
				);
		}
	}
	const requiredLaneTestPaths = new Set(
		manifest.lanes
			.filter((lane) => lane.oracle === 'required' && lane.available !== false)
			.flatMap((lane) =>
				lane.files.filter((file) => file.role === 'test').map((file) => file.path),
			),
	);
	const ordinaryCaseIds = new Set();
	for (const divergence of manifest.divergences) {
		for (const evidence of divergence.ordinaryEvidence ?? []) {
			if (requiredLaneTestPaths.has(evidence.path))
				throw new Error(
					`divergence ${divergence.id} ordinaryEvidence path "${evidence.path}" must not be required parity-lane test evidence`,
				);
			const absolute = resolve(absoluteRoot, evidence.path);
			if (relative(absoluteRoot, absolute).startsWith('..'))
				throw new Error(`file escapes repository: ${evidence.path}`);
			let contents;
			try {
				contents = await readFile(absolute);
			} catch (error) {
				if (error.code === 'ENOENT') throw new Error(`missing evidence file: ${evidence.path}`);
				throw error;
			}
			const actual = createHash('sha256').update(contents).digest('hex');
			if (actual !== evidence.sha256) {
				throw new Error(`integrity mismatch for evidence file: ${evidence.path}`);
			}
			const source = contents.toString('utf8');
			const marker = `@parity-case ${evidence.id}`;
			const escapedId = evidence.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const matches = [
				...source.matchAll(new RegExp(`^\\s*//\\s*@parity-case\\s+${escapedId}\\s*$`, 'gm')),
			];
			if (matches.length !== 1)
				throw new Error(`${evidence.path}: ${marker} must appear exactly once`);
			const markerEnd = matches[0].index + matches[0][0].length;
			const tail = source.slice(markerEnd).trimStart();
			const declaration = /^(?:it|test)(?:\.(skip|todo))?\s*\(\s*/.exec(tail);
			const exactTitle = declaration
				? sourceStringLiterals(evidence.testName).some((literal) =>
						tail.slice(declaration[0].length).startsWith(literal),
					)
				: false;
			if (!declaration || declaration[1] || !exactTitle) {
				throw new Error(
					`${evidence.path}: ${marker} must immediately precede one active test named ${JSON.stringify(evidence.testName)}`,
				);
			}
			ordinaryCaseIds.add(evidence.id);
		}
	}
	const markerCounts = new Map();
	const markerFiles = new Set([
		...(await discoverAdaptedFiles(absoluteRoot, manifest.adaptedRoots.source)),
		...(await discoverAdaptedFiles(absoluteRoot, manifest.adaptedRoots.tests)),
	]);
	for (const path of markerFiles) {
		const source = await readFile(resolve(absoluteRoot, path), 'utf8');
		if (/OCTANE DIVERGENCE\s*:/.test(source))
			throw new Error(`${path}: divergence markers must use OCTANE DIVERGENCE[id]`);
		for (const match of source.matchAll(/OCTANE DIVERGENCE\[([^\]]+)\]\[([^\]]+)\]/g)) {
			if (!manifest.divergences.some((entry) => entry.id === match[1]))
				throw new Error(`${path}: undeclared divergence marker "${match[1]}"`);
			const entry = manifest.divergences.find((candidate) => candidate.id === match[1]);
			if (
				!entry.caseIds.includes(match[2]) ||
				(!runtimeCaseIds.has(match[2]) &&
					!caseIdsForManifest(manifest).has(match[2]) &&
					!ordinaryCaseIds.has(match[2]))
			)
				throw new Error(
					`${path}: divergence marker "${match[1]}" is not bound to a declared case "${match[2]}"`,
				);
			markerCounts.set(match[1], (markerCounts.get(match[1]) ?? 0) + 1);
		}
		if (/OCTANE DIVERGENCE\[[^\]]+\](?!\[)/.test(source))
			throw new Error(`${path}: divergence markers must bind a declared case id`);
	}
	for (const divergence of manifest.divergences) {
		if (!markerCounts.has(divergence.id))
			throw new Error(`divergence ${divergence.id} has no structured source or test marker`);
	}
	return true;
}

function caseIdsForManifest(manifest) {
	const laneCaseIds = manifest.lanes
		.filter((lane) => lane.oracle === 'required' && lane.available !== false)
		.flatMap((lane) => lane.files.flatMap((file) => (file.cases ?? []).map((entry) => entry.id)));
	const ordinaryCaseIds = (manifest.ordinaryEvidence ?? []).flatMap((file) =>
		file.cases.map((entry) => entry.id),
	);
	return new Set([...laneCaseIds, ...ordinaryCaseIds]);
}

async function readEvidenceFile(absoluteRoot, file) {
	const absolute = resolve(absoluteRoot, file.path);
	if (relative(absoluteRoot, absolute).startsWith('..'))
		fail(`file escapes repository: ${file.path}`);
	let contents;
	try {
		contents = await readFile(absolute);
	} catch (error) {
		if (error.code === 'ENOENT') throw new Error(`missing evidence file: ${file.path}`);
		throw error;
	}
	const actual = createHash('sha256').update(contents).digest('hex');
	if (actual !== file.sha256) {
		throw new Error(`integrity mismatch for evidence file: ${file.path}`);
	}
	return contents;
}

function assertParityCaseBindings(path, source, cases) {
	for (const parityCase of cases) {
		const marker = `@parity-case ${parityCase.id}`;
		const escapedId = parityCase.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const matches = [
			...source.matchAll(new RegExp(`^\\s*//\\s*@parity-case\\s+${escapedId}\\s*$`, 'gm')),
		];
		if (matches.length !== 1) throw new Error(`${path}: ${marker} must appear exactly once`);
		const markerEnd = matches[0].index + matches[0][0].length;
		const tail = source.slice(markerEnd).trimStart();
		const declaration = /^(?:it|test)(?:\.(skip|todo))?\s*\(\s*/.exec(tail);
		const exactTitle = declaration
			? sourceStringLiterals(parityCase.testName).some((literal) =>
					tail.slice(declaration[0].length).startsWith(literal),
				)
			: false;
		if (!declaration || declaration[1] || !exactTitle) {
			throw new Error(
				`${path}: ${marker} must immediately precede one active test named ${JSON.stringify(parityCase.testName)}`,
			);
		}
	}
}

function validateRuntimeInventory(inventory, lane, expectedRoots) {
	if (
		inventory?.schemaVersion !== 1 ||
		inventory.project !== lane.project ||
		JSON.stringify(inventory.roots) !== JSON.stringify(expectedRoots) ||
		!Array.isArray(inventory.files) ||
		!Array.isArray(inventory.tests)
	)
		throw new Error(`lane ${lane.id} has an invalid runtime inventory schema or project`);
	if (new Set(inventory.files).size !== inventory.files.length)
		throw new Error(`lane ${lane.id} runtime inventory has duplicate files`);
	const ids = inventory.tests.map((test) => test.id);
	if (
		new Set(ids).size !== ids.length ||
		inventory.tests.some(
			(test) => !inventory.files.includes(test.file) || typeof test.fullName !== 'string',
		)
	)
		throw new Error(`lane ${lane.id} runtime inventory has invalid or duplicate test identities`);
}

function validateJestRuntimeInventory(inventory, lane) {
	if (
		inventory?.schemaVersion !== 1 ||
		inventory.root !== lane.execution.root ||
		!Number.isInteger(inventory.snapshots) ||
		inventory.snapshots < 0 ||
		!Array.isArray(inventory.tests) ||
		inventory.tests.some(
			(test) =>
				typeof test?.file !== 'string' ||
				test.file.length === 0 ||
				typeof test.fullName !== 'string' ||
				test.fullName.length === 0 ||
				test.status !== 'passed',
		)
	)
		throw new Error(`lane ${lane.id} has an invalid Jest runtime inventory`);
	for (const test of inventory.tests) exactPath(test.file, `lane ${lane.id} Jest test file`);
}

async function discoverAdaptedFiles(root, scan) {
	const include = scan.include.map((pattern) => new RegExp(pattern));
	const exclude = scan.exclude.map((pattern) => new RegExp(pattern));
	const found = [];
	for (const declaredRoot of scan.roots) {
		const absolute = resolve(root, declaredRoot);
		for (const entry of await readdir(absolute, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const path = toPortablePath(relative(root, resolve(entry.parentPath, entry.name)));
			if (
				include.some((pattern) => pattern.test(path)) &&
				!exclude.some((pattern) => pattern.test(path))
			)
				found.push(path);
		}
	}
	return new Set(found);
}

export async function verifyLaneEnvironment(manifest, lane, root, pnpmVersion) {
	const environment = manifest.environments[lane.environment];
	const actualMajor = Number(process.versions.node.split('.')[0]);
	if (!nodeMajorSatisfies(environment.node, actualMajor))
		throw new Error(`Node ${actualMajor} does not satisfy ${environment.node}`);
	if (environment.platform !== 'any' && environment.platform !== process.platform)
		throw new Error(`platform must be ${environment.platform}`);
	if (environment.arch !== 'any' && environment.arch !== process.arch)
		throw new Error(`architecture must be ${environment.arch}`);
	if (environment.packageManager !== `pnpm@${pnpmVersion.trim()}`)
		throw new Error(`package manager must be ${environment.packageManager}`);
	const lockfile = await readFile(resolve(root, environment.lockfile));
	const digest = createHash('sha256').update(lockfile).digest('hex');
	if (digest !== environment.lockfileSha256) throw new Error('lockfile integrity mismatch');
}

export function verifyLaneCollectedTests(lane, collectedTests, root) {
	const testFiles = new Set(
		lane.files.filter((file) => file.role === 'test').map((file) => resolve(root, file.path)),
	);
	const declarations = lane.files.flatMap((file) =>
		(file.cases ?? []).map((parityCase) => ({
			file: resolve(root, file.path),
			name: parityCase.fullName,
			id: parityCase.id,
		})),
	);
	const declaredNames = new Set(declarations.map(({ name }) => name));
	const normalizedTests = collectedTests.map((test) => ({
		...test,
		// Vitest's list command renders suite boundaries as ` > ` while
		// testNamePattern matches the runtime full name joined with spaces.
		name: test.name.replaceAll(' > ', ' '),
	}));
	const selected = normalizedTests.filter(
		(test) => testFiles.has(resolve(test.file)) && declaredNames.has(test.name),
	);

	for (const declaration of declarations) {
		const matches = selected.filter(
			(test) => resolve(test.file) === declaration.file && test.name === declaration.name,
		);
		if (matches.length !== 1) {
			throw new Error(
				`lane ${lane.id} case ${declaration.id} fullName must match exactly one collected Vitest test in its evidence file`,
			);
		}
	}
	if (selected.length !== declarations.length) {
		throw new Error(`lane ${lane.id} fullName selection matches undeclared Vitest tests`);
	}
	return true;
}

export async function verifyManifestTestSelections(manifest, root) {
	const testsByProject = new Map();
	for (const lane of manifest.lanes.filter(
		(candidate) =>
			candidate.available !== false &&
			!['typescript', 'jest-full', 'playwright-full', 'node-full'].includes(
				candidate.execution?.kind,
			),
	)) {
		let collectedTests = testsByProject.get(lane.project);
		if (!collectedTests) {
			const { stdout } = await execFileAsync(
				process.execPath,
				['node_modules/vitest/vitest.mjs', 'list', '--project', lane.project, '--json'],
				{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
			);
			collectedTests = JSON.parse(stdout);
			testsByProject.set(lane.project, collectedTests);
		}
		if (lane.execution?.kind === 'vitest-full') {
			const inventory = JSON.parse(await readFile(resolve(root, lane.execution.inventory), 'utf8'));
			const collected = collectedTests
				.filter((test) => inventory.files.includes(toPortablePath(relative(root, test.file))))
				.map((test) => ({
					file: toPortablePath(relative(root, test.file)),
					fullName: test.name.replaceAll(' > ', ' '),
				}))
				.sort(compareTestIdentities);
			const expected = inventory.tests.map(({ file, fullName }) => ({ file, fullName }));
			if (JSON.stringify(collected) !== JSON.stringify(expected))
				throw new Error(`lane ${lane.id} collected test identities drifted from its inventory`);
		} else {
			verifyLaneCollectedTests(lane, collectedTests, root);
		}
	}
	return true;
}

export function buildTypeScriptCompilerArgv(compiler, project) {
	const compilerEntrypoints = {
		tsc: 'node_modules/typescript/bin/tsc',
		tsgo: 'node_modules/@typescript/native-preview/bin/tsgo',
		'tsrx-tsc': 'node_modules/@tsrx/typescript-plugin/dist/tsc.js',
	};
	return [process.execPath, compilerEntrypoints[compiler], '--noEmit', '-p', project];
}

export function buildTypeScriptCompilerRuns(lane) {
	const project = lane.execution.project;
	if (Array.isArray(lane.execution.compilerBins) && lane.execution.compilerBins.length > 0) {
		return lane.execution.compilerBins.map(function toArgv(bin) {
			return [process.execPath, bin, '--noEmit', '-p', project];
		});
	}
	return [buildTypeScriptCompilerArgv(lane.execution.compiler, project)];
}

export function buildLaneArgv(lane, root = process.cwd()) {
	if (lane.available === false) {
		throw new Error(`${lane.oracle} oracle is unavailable; parity not established`);
	}
	if (lane.execution?.kind === 'typescript') {
		const runs = buildTypeScriptCompilerRuns(lane);
		if (runs.length !== 1) {
			throw new Error(
				`lane ${lane.id} declares ${runs.length} TypeScript compiler runs; use buildTypeScriptCompilerRuns`,
			);
		}
		return runs[0];
	}
	if (lane.execution?.kind === 'vitest-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		return [
			process.execPath,
			'node_modules/vitest/vitest.mjs',
			'run',
			'--project',
			lane.project,
			...(lane.execution.fileParallelism === undefined
				? []
				: [lane.execution.fileParallelism ? '--fileParallelism' : '--no-file-parallelism']),
			...inventory.files,
			'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
		];
	}
	if (lane.execution?.kind === 'jest-full') {
		return [
			process.execPath,
			'scripts/react-parity/jest-full-runner.mjs',
			'--config',
			lane.execution.config,
			'--root',
			lane.execution.root,
		];
	}
	if (lane.execution?.kind === 'node-full') {
		return [
			process.execPath,
			'scripts/react-parity/node-full-runner.mjs',
			'--root',
			lane.execution.root,
			'--file',
			lane.execution.file,
			'--loader',
			lane.execution.loader,
			'--inventory',
			lane.execution.inventory,
		];
	}
	if (lane.execution?.kind === 'playwright-full') {
		return [
			process.execPath,
			'scripts/react-parity/playwright-full-runner.mjs',
			'--config',
			lane.execution.config,
			'--root',
			lane.execution.root,
		];
	}
	const fullNames = lane.files.flatMap((file) => (file.cases ?? []).map((entry) => entry.fullName));
	if (fullNames.length === 0) throw new Error(`lane ${lane.id} has no executable cases`);
	const escaped = fullNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return [
		process.execPath,
		'node_modules/vitest/vitest.mjs',
		'run',
		'--project',
		lane.project,
		'-t',
		`^(?:${escaped.join('|')})$`,
		...lane.files
			.filter((file) => file.role === 'test')
			.map((file) => file.path)
			.sort(),
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
	];
}

function vitestRunIdentities(lane, result, root) {
	if (!result || !Array.isArray(result.testResults)) {
		throw new Error(`lane ${lane.id} returned an invalid Vitest JSON result`);
	}
	return result.testResults.flatMap((suite) => {
		if (typeof suite.name !== 'string' || !Array.isArray(suite.assertionResults)) {
			throw new Error(`lane ${lane.id} returned an invalid Vitest test result`);
		}
		return suite.assertionResults.map((test) => ({
			file: toPortablePath(relative(root, suite.name)),
			// Vitest list uses spaces between suite segments while JSON execution
			// results use ` > `. Normalize both immutable titles and separators.
			fullName: test.fullName.replaceAll(' > ', ' '),
			status: test.status,
		}));
	});
}

export function verifyLaneRunResult(lane, stdout, root = process.cwd()) {
	if (lane.execution?.kind === 'typescript') return true;
	const result = JSON.parse(stdout);
	if (lane.execution?.kind === 'vitest-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		const executed = vitestRunIdentities(lane, result, root).sort(compareTestIdentities);
		const expected = inventory.tests.map(({ file, fullName }) => ({
			file,
			fullName,
			status: 'passed',
		}));
		if (JSON.stringify(executed) !== JSON.stringify(expected))
			throw new Error(
				`lane ${lane.id} did not execute every inventoried test identity exactly once:\n  ${describeTestIdentityMismatch(expected, executed)}`,
			);
		return true;
	}
	if (lane.execution?.kind === 'jest-full' || lane.execution?.kind === 'playwright-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		const label = lane.execution.kind === 'playwright-full' ? 'Playwright' : 'Jest';
		if (result?.schemaVersion !== 1 || !Array.isArray(result.tests))
			throw new Error(`lane ${lane.id} returned an invalid ${label} full-suite result`);
		const executed = result.tests.sort(compareTestIdentities);
		const expected = inventory.tests.sort(compareTestIdentities);
		if (JSON.stringify(executed) !== JSON.stringify(expected))
			throw new Error(
				`lane ${lane.id} did not execute every inventoried ${label} identity exactly once:\n  ${describeTestIdentityMismatch(expected, executed)}`,
			);
		if (result.snapshots !== inventory.snapshots)
			throw new Error(
				`lane ${lane.id} executed ${result.snapshots ?? 0} of ${inventory.snapshots} inventoried snapshots`,
			);
		return true;
	}
	if (lane.execution?.kind === 'node-full') {
		const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
		if (result?.schemaVersion !== 1 || !Array.isArray(result.tests))
			throw new Error(`lane ${lane.id} returned an invalid Node full-suite result`);
		const executed = result.tests.sort(compareTestIdentities);
		const expected = inventory.tests.sort(compareTestIdentities);
		if (JSON.stringify(executed) !== JSON.stringify(expected))
			throw new Error(
				`lane ${lane.id} did not execute every inventoried Node identity exactly once:\n  ${describeTestIdentityMismatch(expected, executed)}`,
			);
		return true;
	}
	const expected = lane.files
		.flatMap((file) =>
			(file.cases ?? []).map((test) => ({
				file: file.path,
				fullName: test.fullName,
				status: 'passed',
			})),
		)
		.sort(compareTestIdentities);
	const declaredNames = new Set(expected.map((test) => test.fullName));
	const executed = vitestRunIdentities(lane, result, root)
		.filter((test) => test.status === 'passed' || declaredNames.has(test.fullName))
		.sort(compareTestIdentities);
	if (JSON.stringify(executed) !== JSON.stringify(expected)) {
		throw new Error(
			`lane ${lane.id} did not execute every declared test identity exactly once:\n  ${describeTestIdentityMismatch(expected, executed)}`,
		);
	}
	return true;
}

export function requiredExecutableLanes(manifest) {
	return manifest.lanes.filter((lane) => lane.oracle === 'required' && lane.available !== false);
}

export function isVitestLane(lane) {
	return lane.execution === undefined || lane.execution?.kind === 'vitest-full';
}

/**
 * Generic parity-job routing: execute every available required lane. Provenance
 * completeness gates public claims elsewhere; it must not skip harness execution.
 */
export function selectHarnessAction(manifest) {
	return requiredExecutableLanes(manifest).length > 0 ? 'run-required' : 'validate';
}
