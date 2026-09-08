import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	CLASSIFICATIONS,
	MODES,
	OBSERVABLES,
	RISKS,
	STATUSES,
	renderReport,
	validateIdRegistryCompatibility,
	validateLedger,
} from './ledger-lib.mjs';

const COMMIT = 'a'.repeat(40);

function createRepository(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'octane-redact-ledger-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const testFile = 'packages/octane/tests/hydration-contract.test.ts';
	mkdirSync(path.join(root, path.dirname(testFile)), { recursive: true });
	writeFileSync(
		path.join(root, testFile),
		`it('recovers a deferred mismatch without escaping', () => {});\n`,
	);
	writeFileSync(
		path.join(root, 'vitest.config.js'),
		`export default { test: { include: ['packages/octane/tests/**/*.test.ts'] } };\n`,
	);
	return { root, testFile };
}

function fixture(testFile) {
	return {
		$schema: './redact-adversarial-ledger.schema.json',
		schemaVersion: 1,
		upstream: {
			repository: 'https://github.com/TanStack/redact',
			commit: COMMIT,
			capturedOn: '2026-07-22',
			scope: {
				issueNumbers: [17],
				pullRequestNumbers: [16],
				paths: ['packages/redact/src', 'tests'],
				artifacts: [
					{
						path: 'tests/document-hydration.test.tsx',
						disposition: 'mapped',
						entryIds: ['RDX-HYDRATION-001'],
					},
				],
			},
		},
		idRegistry: [
			{ id: 'RDX-HYDRATION-001', status: 'active', introducedOn: '2026-07-22' },
			{ id: 'RDX-SUSPENSE-001', status: 'active', introducedOn: '2026-07-22' },
		],
		entries: [
			{
				id: 'RDX-HYDRATION-001',
				area: 'hydration',
				title: 'Deferred mismatch recovery',
				sources: [
					{
						kind: 'issue',
						number: 17,
						url: 'https://github.com/TanStack/redact/issues/17',
						title: 'Hydration recovery failure',
					},
					{
						kind: 'test',
						commit: COMMIT,
						path: 'tests/document-hydration.test.tsx',
						testName: 'recovers after lazy hydration resumes',
						url: `https://github.com/TanStack/redact/blob/${COMMIT}/tests/document-hydration.test.tsx#L1`,
					},
				],
				symptom: 'A resumed mismatch escapes through the scheduler.',
				octaneContract: 'Recovery stays inside the nearest hydration boundary.',
				classification: 'adaptable',
				status: 'covered',
				risk: 'critical',
				owner: 'runtime + hydration',
				applicableModes: ['hydrate-mismatch', 'deferred-hydration', 'production-compile'],
				observables: ['node-identity', 'events', 'errors'],
				octaneReferences: [
					{
						kind: 'test',
						file: testFile,
						testName: 'recovers a deferred mismatch without escaping',
					},
				],
				evidence: [
					{
						file: testFile,
						testName: 'recovers a deferred mismatch without escaping',
						modes: ['hydrate-mismatch', 'deferred-hydration', 'production-compile'],
						observables: ['node-identity', 'events', 'errors'],
					},
				],
			},
			{
				id: 'RDX-SUSPENSE-001',
				area: 'suspense',
				title: 'Preserve committed DOM while resuspended',
				sources: [
					{
						kind: 'pull_request',
						number: 16,
						url: 'https://github.com/TanStack/redact/pull/16',
						title: 'Preserve committed DOM',
					},
				],
				symptom: 'A route suspension loses scroll and focus.',
				octaneContract: 'Committed UI state survives a temporary suspension.',
				classification: 'portable',
				status: 'planned',
				risk: 'high',
				owner: 'runtime',
				applicableModes: ['client', 'real-browser'],
				observables: ['node-identity', 'focus', 'scroll'],
				nextAction: {
					kind: 'test',
					targets: ['website/tests/suspense-preservation.e2e.test.ts'],
					acceptance: 'The same node retains focus and scroll through suspension.',
				},
			},
		],
	};
}

test('accepts a complete ledger and renders a deterministic report', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	assert.deepEqual(validateLedger(ledger, root), []);
	const report = renderReport(ledger);
	assert.match(report, /GENERATED FILE — do not edit/);
	assert.match(report, /## Entry contract/);
	assert.match(report, /RDX-HYDRATION-001 — Deferred mismatch recovery/);
	assert.match(report, /\[`RDX-SUSPENSE-001`\]\(#rdx-suspense-001\)/);
	assert.doesNotMatch(report, /No open entries\./);
});

test('requires exact executable evidence for covered entries', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.entries[0].evidence[0].testName = 'a test title that does not exist';
	const errors = validateLedger(ledger, root);
	assert.ok(
		errors.some((error) => error.includes('not an executable registered test')),
		`expected a missing-title error, received:\n${errors.join('\n')}`,
	);
	writeFileSync(
		path.join(root, testFile),
		`// it('a test title that does not exist', () => {});\nconst label = 'a test title that does not exist';\n`,
	);
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('not an executable registered test'),
		),
	);
	delete ledger.entries[0].evidence;
	assert.ok(validateLedger(ledger, root).some((error) => error.includes('no executable evidence')));
});

test('rejects skipped-suite and out-of-lane test evidence', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	writeFileSync(
		path.join(root, testFile),
		`describe.skip('disabled suite', () => { it('recovers a deferred mismatch without escaping', () => {}); });\n`,
	);
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('not an executable registered test'),
		),
	);
	writeFileSync(
		path.join(root, testFile),
		`it('recovers a deferred mismatch without escaping', () => {});\n`,
	);
	const outsideFile = 'packages/octane/specs/outside.test.ts';
	mkdirSync(path.join(root, path.dirname(outsideFile)), { recursive: true });
	writeFileSync(
		path.join(root, outsideFile),
		`it('recovers a deferred mismatch without escaping', () => {});\n`,
	);
	ledger.entries[0].evidence[0].file = outsideFile;
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('not an executable registered test'),
		),
	);
});

test('covered entries prove every declared mode and observable', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.entries[0].applicableModes.push('real-browser');
	ledger.entries[0].observables.push('focus');
	const errors = validateLedger(ledger, root);
	assert.ok(errors.some((error) => error.includes('evidence for mode real-browser')));
	assert.ok(errors.some((error) => error.includes('evidence for observable focus')));
});

test('evidence cannot claim modes or observables outside its owning contract', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.entries[0].evidence[0].modes.push('real-browser');
	ledger.entries[0].evidence[0].observables.push('focus');
	const errors = validateLedger(ledger, root);
	assert.ok(errors.some((error) => error.includes('mode real-browser outside the entry contract')));
	assert.ok(errors.some((error) => error.includes('observable focus outside the entry contract')));
});

test('accepts registered package scripts as command evidence', (t) => {
	const { root, testFile } = createRepository(t);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({ scripts: { 'pack:check': 'node scripts/pack-check.mjs' } }),
	);
	mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
	writeFileSync(path.join(root, '.github/workflows/ci.yml'), 'run: pnpm pack:check\n');
	const ledger = fixture(testFile);
	ledger.entries[0].applicableModes.push('packaged-consumer');
	ledger.entries[0].evidence.push({
		kind: 'command',
		script: 'pack:check',
		modes: ['packaged-consumer'],
		observables: ['node-identity'],
	});
	assert.ok(
		validateLedger(ledger, root).some((error) => error.includes('missing Node entry point')),
	);
	mkdirSync(path.join(root, 'scripts'), { recursive: true });
	writeFileSync(path.join(root, 'scripts/pack-check.mjs'), 'export {};\n');
	assert.deepEqual(validateLedger(ledger, root), []);
	ledger.entries[0].evidence[1].script = 'missing';
	assert.ok(validateLedger(ledger, root).some((error) => error.includes('not registered')));
});

test('documented status cannot hide an unsupported portable runtime contract', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	const entry = ledger.entries[1];
	entry.status = 'documented';
	entry.rationale = 'Already described.';
	delete entry.nextAction;
	entry.octaneReferences = [
		{ kind: 'test', file: testFile, testName: 'recovers a deferred mismatch without escaping' },
	];
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('only when every reference is documentation or a benchmark'),
		),
	);
});

test('permanent IDs remain registered and retired IDs remain tombstones', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.entries[0].id = 'RDX-HYDRATION-002';
	const errors = validateLedger(ledger, root);
	assert.ok(errors.some((error) => error.includes('absent from the active ID registry')));
	assert.ok(errors.some((error) => error.includes('has no ledger entry')));
});

test('permanent IDs are append-only across the compatibility base', (t) => {
	const { testFile } = createRepository(t);
	const previous = fixture(testFile);
	const renamed = structuredClone(previous);
	renamed.entries[0].id = 'RDX-HYDRATION-002';
	renamed.idRegistry[0].id = 'RDX-HYDRATION-002';
	renamed.upstream.scope.artifacts[0].entryIds = ['RDX-HYDRATION-002'];
	assert.ok(
		validateIdRegistryCompatibility(previous, renamed).some((error) =>
			error.includes('RDX-HYDRATION-001 was removed'),
		),
	);
	const removed = structuredClone(previous);
	removed.idRegistry.pop();
	assert.ok(
		validateIdRegistryCompatibility(previous, removed).some((error) =>
			error.includes('RDX-SUSPENSE-001 was removed'),
		),
	);
	const retired = structuredClone(previous);
	retired.idRegistry[1].status = 'retired';
	retired.idRegistry[1].rationale = 'The owning contract was superseded.';
	assert.deepEqual(validateIdRegistryCompatibility(previous, retired), []);
	assert.ok(
		validateIdRegistryCompatibility(retired, previous).some((error) =>
			error.includes('RDX-SUSPENSE-001 was reactivated'),
		),
	);
});

test('accounts for each sourced upstream test in the artifact sample', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.upstream.scope.artifacts[0].path = 'tests/another.test.tsx';
	const errors = validateLedger(ledger, root);
	assert.ok(errors.some((error) => error.includes('has no audited artifact disposition')));
	assert.ok(errors.some((error) => error.includes('has no exact test source')));
	ledger.upstream.scope.artifacts[0].entryIds = ['RDX-MISSING-001'];
	assert.ok(validateLedger(ledger, root).some((error) => error.includes('unknown ledger ID')));
	ledger.upstream.scope.artifacts[0].path = 'tests/document-hydration.test.tsx';
	ledger.upstream.scope.artifacts[0].entryIds = ['RDX-SUSPENSE-001'];
	const mismatchedErrors = validateLedger(ledger, root);
	assert.ok(
		mismatchedErrors.some((error) =>
			error.includes('RDX-SUSPENSE-001, but that entry has no exact test source'),
		),
	);
	assert.ok(
		mismatchedErrors.some((error) => error.includes('omits source entry RDX-HYDRATION-001')),
	);
	ledger.upstream.scope.artifacts[0] = null;
	assert.doesNotThrow(() => validateLedger(ledger, root));
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('upstream.scope.artifacts[0] must be an object'),
		),
	);
	ledger.upstream.scope.paths[0] = null;
	assert.doesNotThrow(() => validateLedger(ledger, root));
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('upstream.scope.paths[0] must be a normalized repository-relative path'),
		),
	);
	const malformedEntryIds = fixture(testFile);
	malformedEntryIds.upstream.scope.artifacts[0].entryIds = [null];
	assert.doesNotThrow(() => validateLedger(malformedEntryIds, root));
	assert.ok(
		validateLedger(malformedEntryIds, root).some((error) =>
			error.includes('upstream.scope.artifacts[0].entryIds[0] must be a non-empty string'),
		),
	);
	const malformedNote = fixture(testFile);
	malformedNote.upstream.scope.artifacts[0].disposition = 'folded';
	malformedNote.upstream.scope.artifacts[0].note = 1;
	assert.doesNotThrow(() => validateLedger(malformedNote, root));
	assert.ok(
		validateLedger(malformedNote, root).some((error) =>
			error.includes('upstream.scope.artifacts[0].note must be a non-empty string'),
		),
	);
	const malformedRationale = fixture(testFile);
	malformedRationale.idRegistry[1].status = 'retired';
	malformedRationale.idRegistry[1].rationale = {};
	assert.doesNotThrow(() => validateLedger(malformedRationale, root));
	assert.ok(
		validateLedger(malformedRationale, root).some((error) =>
			error.includes('ledger.idRegistry[1].rationale must be a non-empty string'),
		),
	);
});

test('escapes test titles and symbols in generated Markdown', (t) => {
	const { testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.entries[0].octaneReferences[0].testName = 'adopts one <title>/<meta> pair';
	ledger.entries[0].octaneReferences[0].symbol = 'render`Document<title>';
	const report = renderReport(ledger);
	assert.match(report, /adopts one &lt;title&gt;\/&lt;meta&gt; pair/);
	assert.ok(report.includes('— `` render`Document<title> ``'));
	assert.doesNotMatch(report, /adopts one <title>\/<meta> pair/);
});

test('enforces decision actions, permanent ordering, canonical sources, and scope coverage', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	const decision = ledger.entries[1];
	decision.status = 'decision_required';
	decision.rationale = 'Octane must define whether the supplied element owns foreign children.';
	assert.ok(
		validateLedger(ledger, root).some((error) =>
			error.includes('requires a nextAction with kind "decision"'),
		),
	);
	decision.nextAction.kind = 'decision';
	decision.sources[0].url = 'https://github.com/TanStack/redact/pull/15';
	ledger.entries.reverse();
	ledger.upstream.scope.issueNumbers.push(18);
	const errors = validateLedger(ledger, root);
	assert.ok(errors.some((error) => error.includes('pinned canonical URL')));
	assert.ok(errors.some((error) => error.includes('sorted by permanent ID')));
	assert.ok(errors.some((error) => error.includes('issue #18 has no source reference')));
});

test('rejects an impossible capture date without throwing', (t) => {
	const { root, testFile } = createRepository(t);
	const ledger = fixture(testFile);
	ledger.upstream.capturedOn = '2026-02-31';
	assert.ok(validateLedger(ledger, root).some((error) => error.includes('valid YYYY-MM-DD')));
});

test('reports malformed evidence matrices without throwing', (t) => {
	const { root, testFile } = createRepository(t);
	const malformedEntry = fixture(testFile);
	malformedEntry.entries[0].applicableModes = {};
	malformedEntry.entries[0].observables = 1;
	assert.doesNotThrow(() => validateLedger(malformedEntry, root));
	const entryErrors = validateLedger(malformedEntry, root);
	assert.ok(
		entryErrors.some((error) => error.includes('entries[0].applicableModes must be an array')),
	);
	assert.ok(entryErrors.some((error) => error.includes('entries[0].observables must be an array')));

	const malformedEvidence = fixture(testFile);
	malformedEvidence.entries[0].evidence[0].modes = {};
	malformedEvidence.entries[0].evidence[0].observables = 1;
	assert.doesNotThrow(() => validateLedger(malformedEvidence, root));
	const evidenceErrors = validateLedger(malformedEvidence, root);
	assert.ok(evidenceErrors.some((error) => error.includes('evidence[0].modes must be an array')));
	assert.ok(
		evidenceErrors.some((error) => error.includes('evidence[0].observables must be an array')),
	);
});

test('keeps validator enums synchronized with the JSON schema', () => {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const schemaPath = path.resolve(
		scriptDirectory,
		'../../packages/octane/audit/redact-adversarial-ledger.schema.json',
	);
	const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
	assert.deepEqual(schema.$defs.classification.enum, CLASSIFICATIONS);
	assert.deepEqual(schema.$defs.status.enum, STATUSES);
	assert.deepEqual(schema.$defs.risk.enum, RISKS);
	assert.deepEqual(schema.$defs.mode.enum, MODES);
	assert.deepEqual(schema.$defs.observable.enum, OBSERVABLES);
});
