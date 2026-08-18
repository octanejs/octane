import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
	collectUpstreamCaseInventory,
	renderAdaptedCaseContracts,
	renderReactTransitionGroupAdaptedEvidenceInventory,
	verifyReactTransitionGroupUpstream,
} from './react-transition-group-upstream-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'rtg-upstream-'));
	await cp(
		new URL('../../packages/transition-group/upstream', import.meta.url),
		join(root, 'packages/transition-group/upstream'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/transition-group/tests/upstream', import.meta.url),
		join(root, 'packages/transition-group/tests/upstream'),
		{ recursive: true },
	);
	await mkdir(join(root, 'packages/transition-group/tests/_fixtures'), {
		recursive: true,
	});
	await cp(
		new URL(
			'../../packages/transition-group/tests/_fixtures/upstream-probes.tsrx',
			import.meta.url,
		),
		join(root, 'packages/transition-group/tests/_fixtures/upstream-probes.tsrx'),
	);
	await mkdir(join(root, 'packages/transition-group/tests/ssr'), { recursive: true });
	await cp(
		new URL('../../packages/transition-group/tests/ssr/upstream-import.test.ts', import.meta.url),
		join(root, 'packages/transition-group/tests/ssr/upstream-import.test.ts'),
	);
	for (const file of [
		'SHA256SUMS',
		'adapted-evidence.SHA256SUMS',
		'adapted-case-contracts.json',
		'upstream-test-dispositions.json',
		'case-crosswalk.json',
		'adapted-runtime.json',
		'adapted-runtime-server.json',
	]) {
		await cp(
			new URL(`../../packages/transition-group/audit/${file}`, import.meta.url),
			join(root, `packages/transition-group/audit/${file}`),
		);
	}
	return root;
}

test('accepts the committed upstream dispositions and case inventory', async function acceptsCommitted(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const summary = verifyReactTransitionGroupUpstream(root);
	assert.equal(summary.artifacts, 11);
	assert.equal(summary.cases, collectUpstreamCaseInventory(root).length);
	assert.equal(summary.adaptedCases, 54);
	assert.equal(summary.notApplicableCases, 2);
	assert.ok(summary.cases > 0);
});

test('rejects a missing upstream test artifact disposition', async function rejectsMissingDisposition(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/upstream-test-dispositions.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.artifacts = config.artifacts.filter(function keep(entry) {
		return entry.path !== 'SSR-test.js';
	});
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /must account for every upstream\/test artifact/);
});

test('rejects a stale caseCount for an upstream suite', async function rejectsStaleCaseCount(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/upstream-test-dispositions.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.artifacts.find(function findSsr(entry) {
		return entry.path === 'SSR-test.js';
	}).caseCount = 0;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /caseCount|case inventory drifted/);
});

test('rejects removal of an upstream suite case', async function rejectsRemovedCase(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const suitePath = join(root, 'packages/transition-group/upstream/test/SSR-test.js');
	await writeFile(
		suitePath,
		`/**
 * @jest-environment node
 */

import * as ReactTransitionGroup from '../src'; // eslint-disable-line no-unused-vars

describe('SSR', () => {});
`,
	);
	const { renderReactTransitionGroupUpstreamInventory } =
		await import('./react-transition-group-upstream-lib.mjs');
	await writeFile(
		join(root, 'packages/transition-group/audit/SHA256SUMS'),
		renderReactTransitionGroupUpstreamInventory(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /caseCount|case inventory drifted/);
});

test('rejects a deleted upstream suite file', async function rejectsDeletedSuite(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await rm(join(root, 'packages/transition-group/upstream/test/SSR-test.js'));
	const { renderReactTransitionGroupUpstreamInventory } =
		await import('./react-transition-group-upstream-lib.mjs');
	await writeFile(
		join(root, 'packages/transition-group/audit/SHA256SUMS'),
		renderReactTransitionGroupUpstreamInventory(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /must account for every upstream\/test artifact/);
});

test('rejects adapted case drift against the crosswalk', async function rejectsAdaptedCaseDrift(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(root, 'packages/transition-group/tests/ssr/upstream-import.test.ts');
	await writeFile(
		adaptedPath,
		`import { describe, expect, it } from 'vitest';
import * as binding from '../../src/index.ts';

describe('react-transition-group v4.4.5 server rendering', () => {
	// Per path: packages/transition-group/upstream/test/SSR-test.js:8-10
	it('should import react-transition-group in node env', function importInNode() {
		expect(binding.Transition).toBeTypeOf('function');
	});
	it('drifted adapted case without upstream mapping', function drifted() {
		expect(true).toBe(true);
	});
});
`,
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /adapted case\/fixture drift|adapted inventory is missing identity|missing \/\/ Per path/);
});

test('rejects a crosswalk entry with a missing citation', async function rejectsMissingCitation(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(root, 'packages/transition-group/tests/ssr/upstream-import.test.ts');
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(adaptedPath, source.replace(/\/\/\s*Per path:[^\n]*\n/, ''));
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /missing \/\/ Per path:/);
});

test('rejects omitting the findDOMNode not-applicable crosswalk entry', async function rejectsMissingNotApplicable(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/case-crosswalk.json');
	const crosswalk = JSON.parse(await readFile(path, 'utf8'));
	crosswalk.cases = crosswalk.cases.filter(function keep(entry) {
		return entry.disposition !== 'not-applicable';
	});
	await writeFile(path, `${JSON.stringify(crosswalk)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /cover every upstream case|must match the upstream case inventory/);
});

test('rejects a citation range that targets a neighboring case', async function rejectsNeighborCitation(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/case-crosswalk.json');
	const crosswalk = JSON.parse(await readFile(path, 'utf8'));
	const entry = crosswalk.cases.find(function findMount(item) {
		return item.upstreamTitle === 'should not transition on mount';
	});
	entry.citation = 'packages/transition-group/upstream/test/Transition-test.js:48-75';
	await writeFile(path, `${JSON.stringify(crosswalk)}\n`);
	const adaptedPath = join(root, 'packages/transition-group/tests/upstream/Transition.test.ts');
	const adapted = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		adapted.replace(
			'// Per path: packages/transition-group/upstream/test/Transition-test.js:30-47',
			'// Per path: packages/transition-group/upstream/test/Transition-test.js:48-75',
		),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /does not cover upstreamLine|does not target upstreamLine/);
});

test('rejects duplicate adapted titles sharing one inventory identity', async function rejectsSharedInventory(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/adapted-runtime.json');
	const inventory = JSON.parse(await readFile(path, 'utf8'));
	inventory.tests = inventory.tests.filter(function dropOne(entry) {
		return entry.fullName !== 'Transition exiting should fire callbacks';
	});
	await writeFile(path, `${JSON.stringify(inventory)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /adapted inventory is missing identity for "should fire callbacks"|missing identity for should fire callbacks/);
});

test('rejects deleting assertions from an adapted case', async function rejectsDeletedAssertions(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(
		root,
		'packages/transition-group/tests/upstream/TransitionGroup.test.ts',
	);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(
			/expect\(view\.container\.querySelectorAll\('\[id\]'\)\)\.toHaveLength\(2\);/,
			'void 0;',
		),
	);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	await writeFile(
		join(root, 'packages/transition-group/audit/adapted-case-contracts.json'),
		renderAdaptedCaseContracts(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /do not cover normalized upstream assertions|adapted observations/);
});

test('rejects deleting a required callback spy expectation', async function rejectsDeletedCallbackSpy(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(root, 'packages/transition-group/tests/upstream/Transition.test.ts');
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(/expect\(listener\)\.toHaveBeenCalledTimes\(1\);\n\s*/, ''),
	);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	await writeFile(
		join(root, 'packages/transition-group/audit/adapted-case-contracts.json'),
		renderAdaptedCaseContracts(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /do not cover normalized upstream assertions.*callbackSpy/);
});

test('rejects deleting an adapted absence observation', async function rejectsDeletedAbsence(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(
		root,
		'packages/transition-group/tests/upstream/SwitchTransition.test.ts',
	);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(/expect\(view\.container\.textContent\)\.not\.toContain\('second'\);\n\s*/, ''),
	);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	await writeFile(
		join(root, 'packages/transition-group/audit/adapted-case-contracts.json'),
		renderAdaptedCaseContracts(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /do not cover normalized upstream assertions.*emptyText/);
});

test('rejects deleting a repeated post-timeout cleanup observation', async function rejectsDeletedCleanupPhase(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(
		root,
		'packages/transition-group/tests/upstream/TransitionGroup.test.ts',
	);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(
			/expect\(warn\)\.not\.toHaveBeenCalled\(\);\n\s*expect\(view\.container\.querySelectorAll\('\[id\]'\)\)\.toHaveLength\(1\);\n\s*expect\(view\.container\.querySelector\('#two'\)\)\.not\.toBeNull\(\);\n\s*warn\.mockRestore\(\);/,
			'expect(warn).not.toHaveBeenCalled();\n\t\twarn.mockRestore();',
		),
	);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	await writeFile(
		join(root, 'packages/transition-group/audit/adapted-case-contracts.json'),
		renderAdaptedCaseContracts(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /do not cover normalized upstream assertions/);
});

test('rejects deleting a non-divergent exit sequence under a divergence marker', async function rejectsDeletedExitUnderDivergence(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(
		root,
		'packages/transition-group/tests/upstream/TransitionGroup.test.ts',
	);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(/expect\(log\)\.toEqual\(\['exit', 'exiting', 'exited'\]\);/, 'void 0;'),
	);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	await writeFile(
		join(root, 'packages/transition-group/audit/adapted-case-contracts.json'),
		renderAdaptedCaseContracts(root),
	);
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /do not cover normalized upstream assertions.*exit/);
});

test('rejects fixture drift in adapted upstream probes', async function rejectsFixtureDrift(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const fixturePath = join(root, 'packages/transition-group/tests/_fixtures/upstream-probes.tsrx');
	const source = await readFile(fixturePath, 'utf8');
	await writeFile(fixturePath, `${source}\nexport function DriftedFixture() { return null; }\n`);
	const evidencePath = join(root, 'packages/transition-group/audit/adapted-evidence.SHA256SUMS');
	await writeFile(evidencePath, renderReactTransitionGroupAdaptedEvidenceInventory(root));
	assert.throws(function run() {
		verifyReactTransitionGroupUpstream(root);
	}, /adapted assertion\/fixture contracts drifted|fixture/);
});
