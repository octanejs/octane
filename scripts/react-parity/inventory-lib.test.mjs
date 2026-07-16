import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	extractTestCases,
	inventoryFingerprint,
	syncLedger,
	validateInventory,
	validateLedger,
} from './inventory-lib.mjs';

describe('extractTestCases', () => {
	test('extracts direct registrations without matching comments, strings, or regexes', () => {
		const cases = extractTestCases(
			String.raw`
				// it('commented out', () => {});
				const text = "test('inside a string')";
				const pattern = /it\('inside a regex'/;
				describe('suite', () => {
					it('works', () => {});
					test.skip("is skipped", () => {});
				});
			`,
			{ file: 'packages/example/src/__tests__/Example-test.js' },
		);

		assert.deepEqual(
			cases.map(({ title, modifiers, estimatedRegistrations }) => ({
				title,
				modifiers,
				estimatedRegistrations,
			})),
			[
				{ title: 'works', modifiers: [], estimatedRegistrations: 1 },
				{ title: 'is skipped', modifiers: ['skip'], estimatedRegistrations: 1 },
			],
		);
	});

	test('records pragma and transformed runtime gates', () => {
		const cases = extractTestCases(
			`// @gate __DEV__ && enableFeature\n` +
				`it('pragma gated', () => {});\n` +
				`_test_gate(flags => flags.enableOther, 'runtime gated', () => {});\n`,
		);

		assert.deepEqual(cases[0].gate, {
			kind: 'pragma',
			expressions: ['__DEV__ && enableFeature'],
		});
		assert.deepEqual(cases[1].gate, {
			kind: 'runtime',
			expression: 'flags => flags.enableOther',
		});
	});

	test('expands static each rows into stable concrete cases', () => {
		const matrix = extractTestCases(
			`test.each([['alpha'], ['beta']])('value %s', value => value);`,
		);

		assert.deepEqual(
			matrix.map((testCase) => testCase.title),
			['value alpha', 'value beta'],
		);
		assert.deepEqual(matrix[0].parameterization, {
			kind: 'test.each',
			rowCount: 2,
			rowIndex: 0,
			row: ['alpha'],
			outerRowCounts: [],
			confidence: 'exact',
		});
		assert.equal(matrix[0].estimatedRegistrations, 1);
		assert.equal(matrix[0].declarationId, matrix[1].declarationId);
		assert.notEqual(matrix[0].caseId, matrix[1].caseId);
	});

	test('multiplies registrations inside a static describe.each matrix', () => {
		const cases = extractTestCases(`
			describe.each(['button', 'input'])('%s', tag => {
				it('handles a click', () => {
					const options = {tag};
					expect(options).toBeDefined();
				});
			});
		`);

		assert.equal(cases.length, 1);
		assert.equal(cases[0].estimatedRegistrations, 2);
		assert.deepEqual(cases[0].parameterization?.outerRowCounts, [2]);
	});

	test('annotates React DOM server integration helper expansion modes', () => {
		const [testCase] = extractTestCases(`itRenders('a link', async render => render(<a />));`);

		assert.equal(testCase.estimatedRegistrations, 5);
		assert.deepEqual(testCase.helperExpansion, {
			helper: 'itRenders',
			registrations: 5,
			modes: [
				'server-string',
				'server-stream',
				'client-clean',
				'hydrate-match',
				'hydrate-mismatch',
			],
		});
	});

	test('retains dynamic titles as explicit manual-review entries', () => {
		const [testCase] = extractTestCases(`it(prefix + suffix, () => {});`);

		assert.equal(testCase.title, null);
		assert.equal(testCase.titleExpression, 'prefix + suffix');
		assert.equal(testCase.manualReviewReason, 'The upstream title is a dynamic expression.');
	});

	test('does not claim an exact expansion for a spread each table', () => {
		const [testCase] = extractTestCases(`test.each([...rows])('value %s', value => value);`);

		assert.equal(testCase.estimatedRegistrations, null);
		assert.equal(testCase.parameterization?.confidence, 'unknown');
		assert.match(testCase.manualReviewReason, /dynamic row count/);
	});

	test('marks registrar calls inside loops as unknown expansions', () => {
		const cases = extractTestCases(`
			orderedHooks.forEach(hook => {
				it('uses a hook', () => hook());
			});
		`);

		assert.equal(cases[0].estimatedRegistrations, null);
		assert.equal(cases[0].dynamicExpansion?.kind, 'loop');
		assert.match(cases[0].manualReviewReason, /inside a loop/);
	});

	test('continues scanning after JSX closing tags', () => {
		const cases = extractTestCases(`
			it('first', () => <div>text</div>);
			it('second', () => <></>);
			it('third', () => <span />);
		`);

		assert.deepEqual(
			cases.map((testCase) => testCase.title),
			['first', 'second', 'third'],
		);
	});

	test('does not inherit registrar names from Object.prototype', () => {
		assert.deepEqual(extractTestCases(`constructor('not a test'); toString('also not');`), []);
	});

	test('gives repeated static matrix rows distinct IDs', () => {
		const cases = extractTestCases(`test.each([1, 1])('value %s', value => value);`);

		assert.equal(cases.length, 2);
		assert.notEqual(cases[0].caseId, cases[1].caseId);
	});

	test('uses line-independent IDs and disambiguates repeated titles', () => {
		const first = extractTestCases(`it('same', fn);\nit('same', fn);`, { file: 'Example-test.js' });
		const shifted = extractTestCases(`\n\n it('same', fn);\nit('same', fn);`, {
			file: 'Example-test.js',
		});

		assert.equal(first[0].caseId, shifted[0].caseId);
		assert.equal(first[1].caseId, shifted[1].caseId);
		assert.notEqual(first[0].caseId, first[1].caseId);
	});

	test('extracts CoffeeScript registrations, including multiline titles', () => {
		const cases = extractTestCases(
			`describe 'classes', ->\n` +
				`  test = (value) -> value\n` +
				`  it 'single line', ->\n` +
				`    expect(true).toBe true\n` +
				`  it 'a title that continues\n` +
				`      on another line', ->\n` +
				`    expect(true).toBe true\n`,
			{ file: 'packages/react/src/__tests__/Example-test.coffee' },
		);

		assert.deepEqual(
			cases.map((testCase) => testCase.title),
			['single line', 'a title that continues\n      on another line'],
		);
	});

	test('retains RuleTester matrices as explicit unknown-expansion cases', () => {
		const [testCase] = extractTestCases(
			`ruleTester.run('eslint-rules/example', rule, {valid: ['ok'], invalid: ['bad']});`,
			{ file: 'scripts/eslint-rules/__tests__/example-test.internal.js' },
		);

		assert.equal(testCase.title, 'eslint-rules/example');
		assert.equal(testCase.estimatedRegistrations, null);
		assert.equal(testCase.dynamicExpansion?.kind, 'rule-tester-matrix');
		assert.match(testCase.manualReviewReason, /RuleTester expands/);
	});
});

function validatorFixture() {
	const testCase = {
		caseId: 'react-case-v1:0123456789abcdefabcd',
		declarationId: 'react-case-v1:0123456789abcdefabcd',
		title: 'observable outcome',
		titleExpression: null,
		helperExpansion: null,
		estimatedRegistrations: 1,
		gate: null,
	};
	const inventory = {
		schemaVersion: 1,
		baseline: 'stable',
		react: { commit: 'a'.repeat(40), version: 'fixture' },
		summary: {
			suites: 1,
			logicalDeclarations: 1,
			directDeclarations: 1,
			helperDeclarations: 0,
			concreteCases: 1,
			knownRegistrations: 1,
			minimumRegistrations: 1,
			unknownExpansionDeclarations: 0,
			gatedDeclarations: 0,
			possibleUnexpandedRegistrarNames: 0,
		},
		suites: [
			{
				file: 'packages/react/src/__tests__/Example-test.js',
				cases: [testCase],
				possibleUnexpandedRegistrars: [],
			},
		],
	};
	inventory.fingerprint = inventoryFingerprint(inventory);
	const upstreams = {
		baselines: { stable: { commit: 'a'.repeat(40) } },
		expectedInventories: {
			stable: {
				fingerprint: inventory.fingerprint,
				suites: 1,
				directDeclarations: 1,
				helperDeclarations: 0,
				minimumRegistrations: 1,
			},
		},
		triagePolicies: [],
	};
	const entry = {
		caseId: testCase.caseId,
		sourceFile: 'packages/react/src/__tests__/Example-test.js',
		title: testCase.title,
		baselines: ['stable'],
		status: 'untriaged',
		risk: 'unassessed',
	};
	return { inventory, upstreams, entry };
}

function priorityValidatorFixture() {
	const fixture = validatorFixture();
	fixture.upstreams.triagePolicies = [
		{
			id: 'example-policy',
			filePattern: '/Example-test\\.js$',
			status: 'planned',
			classification: 'adaptable',
			risk: 'high',
			owner: 'runtime',
			workstream: 'Example behavior',
			rationale: 'Exercise the observable example behavior.',
		},
	];
	fixture.entry = {
		...fixture.entry,
		status: 'planned',
		classification: 'adaptable',
		risk: 'high',
		owner: 'runtime',
		workstream: 'Example behavior',
		rationale: 'Exercise the observable example behavior.',
	};
	return fixture;
}

describe('React parity validators', () => {
	test('applies title-scoped triage policies only to matching cases', () => {
		const { inventory, upstreams, entry } = validatorFixture();
		upstreams.triagePolicies = [
			{
				id: 'legacy-case-policy',
				filePattern: '/Example-test\\.js$',
				titlePattern: 'class component',
				status: 'documented',
				classification: 'non_goal',
				risk: 'low',
				owner: 'out of scope',
				workstream: 'Legacy cases',
				rationale: 'Class components are intentionally unsupported.',
			},
		];
		inventory.suites[0].cases[0].title = 'supports a class component';
		inventory.fingerprint = inventoryFingerprint(inventory);

		const [matched] = syncLedger({ entries: [] }, [inventory], upstreams).entries;
		assert.equal(matched.status, 'documented');
		assert.equal(matched.classification, 'non_goal');

		inventory.suites[0].cases[0].title = 'supports a function component';
		inventory.fingerprint = inventoryFingerprint(inventory);
		const [unmatched] = syncLedger({ entries: [] }, [inventory], upstreams).entries;
		assert.equal(unmatched.status, 'untriaged');
		assert.equal(unmatched.classification, undefined);
	});

	test('can replace planned title matches without overwriting completed dispositions', () => {
		const { inventory, upstreams, entry } = validatorFixture();
		inventory.suites[0].cases[0].title = 'supports a class component';
		inventory.fingerprint = inventoryFingerprint(inventory);
		upstreams.triagePolicies = [
			{
				id: 'legacy-case-policy',
				filePattern: '/Example-test\\.js$',
				titlePattern: 'class component',
				status: 'documented',
				classification: 'non_goal',
				risk: 'low',
				owner: 'out of scope',
				workstream: 'Legacy cases',
				rationale: 'Class components are intentionally unsupported.',
				replacePlanned: true,
			},
		];
		const planned = {
			...entry,
			title: 'supports a class component',
			status: 'planned',
			classification: 'adaptable',
			risk: 'medium',
		};

		const [replaced] = syncLedger({ entries: [planned] }, [inventory], upstreams).entries;
		assert.equal(replaced.status, 'documented');
		assert.equal(replaced.classification, 'non_goal');

		const [preserved] = syncLedger(
			{
				entries: [
					{
						...planned,
						status: 'covered',
						classification: 'portable',
						evidence: [{ file: 'packages/octane/tests/example.test.ts' }],
					},
				],
			},
			[inventory],
			upstreams,
		).entries;
		assert.equal(preserved.status, 'covered');
		assert.equal(preserved.classification, 'portable');
	});

	test('rejects duplicate, missing, and unknown ledger IDs', () => {
		const { inventory, upstreams, entry } = validatorFixture();
		const duplicate = validateLedger(
			{ schemaVersion: 1, entries: [entry, { ...entry }] },
			[inventory],
			process.cwd(),
			upstreams,
		);
		assert(duplicate.some((error) => error.includes('duplicates')));

		const missing = validateLedger(
			{ schemaVersion: 1, entries: [] },
			[inventory],
			process.cwd(),
			upstreams,
		);
		assert(missing.some((error) => error.includes('missing upstream case')));

		const unknown = validateLedger(
			{
				schemaVersion: 1,
				entries: [entry, { ...entry, caseId: 'react-case-v1:ffffffffffffffffffff' }],
			},
			[inventory],
			process.cwd(),
			upstreams,
		);
		assert(unknown.some((error) => error.includes('stale or unknown')));
	});

	test('rejects an untriaged critical case', () => {
		const { inventory, upstreams, entry } = validatorFixture();
		const errors = validateLedger(
			{ schemaVersion: 1, entries: [{ ...entry, risk: 'critical' }] },
			[inventory],
			process.cwd(),
			upstreams,
		);

		assert(errors.some((error) => error.includes('must be triaged')));
	});

	test('allows documented priority cases to override classification and risk', () => {
		for (const classification of ['divergence', 'non_goal']) {
			const { inventory, upstreams, entry } = priorityValidatorFixture();
			const errors = validateLedger(
				{
					schemaVersion: 1,
					entries: [
						{
							...entry,
							status: 'documented',
							classification,
							risk: 'low',
							rationale: 'This supported surface intentionally differs from React.',
						},
					],
				},
				[inventory],
				process.cwd(),
				upstreams,
			);

			assert.deepEqual(errors, []);
		}
	});

	test('allows covered priority cases to refine portable versus adaptable classification', () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'octane-react-ledger-portability-'));
		try {
			const { inventory, upstreams, entry } = priorityValidatorFixture();
			const relativeFile = 'packages/octane/tests/example.test.ts';
			mkdirSync(path.dirname(path.join(root, relativeFile)), { recursive: true });
			writeFileSync(path.join(root, relativeFile), `it('portable behavior', () => {});\n`);
			const errors = validateLedger(
				{
					schemaVersion: 1,
					entries: [
						{
							...entry,
							status: 'covered',
							classification: 'portable',
							evidence: [{ file: relativeFile, testName: 'portable behavior' }],
						},
					],
				},
				[inventory],
				root,
				upstreams,
			);

			assert.deepEqual(errors, []);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects priority classification and risk overrides outside a documented disposition', () => {
		for (const status of ['planned', 'covered']) {
			const { inventory, upstreams, entry } = priorityValidatorFixture();
			const errors = validateLedger(
				{
					schemaVersion: 1,
					entries: [
						{
							...entry,
							status,
							classification: 'divergence',
							risk: 'low',
							rationale: 'This is not a documented disposition.',
						},
					],
				},
				[inventory],
				process.cwd(),
				upstreams,
			);

			assert(
				errors.includes(
					`Priority case ${entry.caseId} does not satisfy example-policy classification.`,
				),
			);
			assert(
				errors.includes(`Priority case ${entry.caseId} does not satisfy example-policy risk.`),
			);
		}
	});

	test('rejects malformed documented priority overrides and preserves policy ownership', () => {
		const malformedCases = [
			{
				classification: 'divergence',
				risk: 'low',
				rationale: '',
			},
			{
				classification: 'portable',
				risk: 'low',
				rationale: 'A portable classification is not an intentional override.',
			},
			{
				classification: 'non_goal',
				risk: 'unassessed',
				rationale: 'A documented disposition must carry an assessed risk.',
			},
		];

		for (const malformed of malformedCases) {
			const { inventory, upstreams, entry } = priorityValidatorFixture();
			const errors = validateLedger(
				{
					schemaVersion: 1,
					entries: [{ ...entry, ...malformed, status: 'documented' }],
				},
				[inventory],
				process.cwd(),
				upstreams,
			);

			assert(
				errors.some((error) =>
					error.startsWith(`Priority case ${entry.caseId} does not satisfy example-policy`),
				),
			);
		}

		const { inventory, upstreams, entry } = priorityValidatorFixture();
		const ownershipErrors = validateLedger(
			{
				schemaVersion: 1,
				entries: [
					{
						...entry,
						status: 'documented',
						classification: 'divergence',
						risk: 'low',
						owner: 'someone else',
						rationale: 'The classification is intentional, but ownership cannot drift.',
					},
				],
			},
			[inventory],
			process.cwd(),
			upstreams,
		);
		assert(
			ownershipErrors.includes(
				`Priority case ${entry.caseId} does not satisfy example-policy owner.`,
			),
		);
	});

	test('rejects missing and renamed local evidence without throwing on malformed evidence', () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'octane-react-ledger-'));
		try {
			const { inventory, upstreams, entry } = validatorFixture();
			const relativeFile = 'packages/octane/tests/example.test.ts';
			mkdirSync(path.join(root, 'packages/octane/tests'), { recursive: true });
			writeFileSync(path.join(root, relativeFile), `it('current name', () => {});\n`);
			const covered = {
				...entry,
				status: 'covered',
				classification: 'portable',
				risk: 'low',
				evidence: [{ file: relativeFile, testName: 'renamed test' }, { testName: 'missing file' }],
			};
			const errors = validateLedger(
				{ schemaVersion: 1, entries: [covered] },
				[inventory],
				root,
				upstreams,
			);
			assert(errors.some((error) => error.includes('evidence test is stale')));
			assert(errors.some((error) => error.includes('evidence has invalid file')));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('accepts evidence from first-party workspace package tests', () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'octane-react-ledger-binding-'));
		try {
			const { inventory, upstreams, entry } = validatorFixture();
			const relativeFile = 'packages/redux/tests/conformance/selector.test.ts';
			mkdirSync(path.dirname(path.join(root, relativeFile)), { recursive: true });
			writeFileSync(path.join(root, relativeFile), `it('selector stays current', () => {});\n`);
			const covered = {
				...entry,
				status: 'covered',
				classification: 'adaptable',
				risk: 'low',
				evidence: [{ file: relativeFile, testName: 'selector stays current' }],
			};

			assert.deepEqual(
				validateLedger({ schemaVersion: 1, entries: [covered] }, [inventory], root, upstreams),
				[],
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('rejects stale inventory summaries and fingerprints', () => {
		const { inventory, upstreams } = validatorFixture();
		assert.deepEqual(validateInventory(inventory, upstreams, 'stable'), []);

		const staleSummary = structuredClone(inventory);
		staleSummary.summary.minimumRegistrations = 99;
		assert(
			validateInventory(staleSummary, upstreams, 'stable').some((error) =>
				error.includes('minimumRegistrations summary is stale'),
			),
		);

		const staleFingerprint = structuredClone(inventory);
		staleFingerprint.suites[0].cases[0].title = 'changed';
		assert(
			validateInventory(staleFingerprint, upstreams, 'stable').some((error) =>
				error.includes('fingerprint is stale'),
			),
		);
	});
});
