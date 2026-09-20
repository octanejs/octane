import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEDGER_PATH, validateStylingLedger } from './check-styling-ledger.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const CLEAN_FIXTURE = `export function App() @{
	<div class="ok">{'ok'}</div>
}
`;

// A fixture the real compiler flags: onChange on a text input produces the
// registered OCTANE_NATIVE_TEXT_ONCHANGE warning.
const FLAGGED_FIXTURE = `export function App() @{
	<input type="text" onChange={(event) => console.log(event)} />
}
`;

function makeRepo({ fixture = CLEAN_FIXTURE, registerCodes = [], evalTasks = [], docs = [] } = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'styling-ledger-'));
	const write = (relative, content) => {
		const absolute = path.join(root, relative);
		mkdirSync(path.dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	};
	write('packages/octane/tests/_fixtures/styling-failures/repro.tsrx', fixture);
	if (registerCodes.length !== 0)
		write(
			'packages/octane/src/compiler/fake-analyzer.js',
			`export const CODES = ${JSON.stringify(registerCodes)};`,
		);
	for (const task of evalTasks)
		write(`packages/octane-evals/datasets/train/user-apps-v1/tasks/${task}/prompt.md`, '# task');
	for (const doc of docs) write(doc, 'notes');
	return root;
}

const baseEntry = {
	id: 'SFL-001',
	fixture: 'packages/octane/tests/_fixtures/styling-failures/repro.tsrx',
	failure: 'observed failure',
	disposition: 'prose:docs/notes.md',
};

const ledger = (...entries) => ({
	$schema: './styling-failure-ledger.schema.json',
	schemaVersion: 1,
	entries,
});

test('the committed ledger validates and its seed fixtures compile silently', () => {
	const committed = JSON.parse(readFileSync(path.join(ROOT, LEDGER_PATH), 'utf8'));
	assert.deepEqual(validateStylingLedger(committed, ROOT), []);
});

test('rejects an entry missing a triage disposition', () => {
	const root = makeRepo({ docs: ['docs/notes.md'] });
	const missing = { ...baseEntry };
	delete missing.disposition;
	const errors = validateStylingLedger(ledger(missing), root);
	assert.ok(errors.some((error) => error.includes('disposition')));
});

test('rejects a disposition outside the diagnostic/eval/prose triage set', () => {
	const root = makeRepo();
	const errors = validateStylingLedger(ledger({ ...baseEntry, disposition: 'issue:123' }), root);
	assert.ok(errors.some((error) => error.includes('diagnostic:<code>')));
});

test('rejects a diagnostic disposition for an unregistered code', () => {
	const root = makeRepo();
	const errors = validateStylingLedger(
		ledger({ ...baseEntry, disposition: 'diagnostic:octane-css-made-up' }),
		root,
	);
	assert.ok(errors.some((error) => error.includes('not a registered diagnostic')));
});

test('a diagnostic disposition passes only when the fixture produces the code', () => {
	const root = makeRepo({
		fixture: FLAGGED_FIXTURE,
		registerCodes: ['OCTANE_NATIVE_TEXT_ONCHANGE'],
	});
	assert.deepEqual(
		validateStylingLedger(
			ledger({ ...baseEntry, disposition: 'diagnostic:OCTANE_NATIVE_TEXT_ONCHANGE' }),
			root,
		),
		[],
	);

	const quiet = makeRepo({ registerCodes: ['OCTANE_NATIVE_TEXT_ONCHANGE'] });
	const errors = validateStylingLedger(
		ledger({ ...baseEntry, disposition: 'diagnostic:OCTANE_NATIVE_TEXT_ONCHANGE' }),
		quiet,
	);
	assert.ok(errors.some((error) => error.includes('does not produce')));
});

test('eval dispositions must name a real task directory', () => {
	const missing = makeRepo();
	assert.ok(
		validateStylingLedger(
			ledger({ ...baseEntry, disposition: 'eval:octane.no-such' }),
			missing,
		).some((error) => error.includes('eval:octane.no-such')),
	);

	const present = makeRepo({ evalTasks: ['octane.no-such'] });
	assert.deepEqual(
		validateStylingLedger(ledger({ ...baseEntry, disposition: 'eval:octane.no-such' }), present),
		[],
	);
});

test('prose dispositions must name an existing doc', () => {
	const root = makeRepo();
	assert.ok(
		validateStylingLedger(
			ledger({ ...baseEntry, disposition: 'prose:docs/missing.md' }),
			root,
		).some((error) => error.includes('prose:docs/missing.md')),
	);
});

test('an unregistered expectedCode records a still-silent repro', () => {
	const root = makeRepo({ docs: ['docs/notes.md'] });
	assert.deepEqual(
		validateStylingLedger(
			ledger({ ...baseEntry, expectedCode: 'octane-css-unused-selector' }),
			root,
		),
		[],
	);
});

test('a registered expectedCode must fire on the fixture', () => {
	const silent = makeRepo({
		docs: ['docs/notes.md'],
		registerCodes: ['OCTANE_NATIVE_TEXT_ONCHANGE'],
	});
	const errors = validateStylingLedger(
		ledger({ ...baseEntry, expectedCode: 'OCTANE_NATIVE_TEXT_ONCHANGE' }),
		silent,
	);
	assert.ok(errors.some((error) => error.includes('does not produce')));
});

test('a fixture emitting an unrecorded diagnostic makes the record stale', () => {
	const root = makeRepo({ fixture: FLAGGED_FIXTURE, docs: ['docs/notes.md'] });
	const errors = validateStylingLedger(ledger(baseEntry), root);
	assert.ok(errors.some((error) => error.includes('does not record')));
});

test('a prose entry must re-triage once its recorded code is live', () => {
	const root = makeRepo({
		fixture: FLAGGED_FIXTURE,
		docs: ['docs/notes.md'],
		registerCodes: ['OCTANE_NATIVE_TEXT_ONCHANGE'],
	});
	const errors = validateStylingLedger(
		ledger({ ...baseEntry, expectedCode: 'OCTANE_NATIVE_TEXT_ONCHANGE' }),
		root,
	);
	assert.ok(errors.some((error) => error.includes('re-triage')));
});

test('rejects missing fixture files and fixtures outside packages/octane/tests', () => {
	const root = makeRepo({ docs: ['docs/notes.md'] });
	assert.ok(
		validateStylingLedger(
			ledger({ ...baseEntry, fixture: 'packages/octane/tests/_fixtures/absent.tsrx' }),
			root,
		).some((error) => error.includes('does not exist')),
	);
	assert.ok(
		validateStylingLedger(
			ledger({ ...baseEntry, fixture: 'scripts/fixtures/repro.tsrx' }),
			root,
		).some((error) => error.includes('packages/octane/tests')),
	);
});

test('rejects duplicate and unsorted entry ids', () => {
	const root = makeRepo({ docs: ['docs/notes.md'] });
	assert.ok(
		validateStylingLedger(ledger(baseEntry, baseEntry), root).some((error) =>
			error.includes('duplicate'),
		),
	);
	assert.ok(
		validateStylingLedger(
			ledger({ ...baseEntry, id: 'SFL-002' }, { ...baseEntry, id: 'SFL-001' }),
			root,
		).some((error) => error.includes('sorted')),
	);
});

test('rejects a ledger with no entries and unknown entry fields', () => {
	const root = makeRepo({ docs: ['docs/notes.md'] });
	assert.ok(validateStylingLedger(ledger(), root).some((error) => error.includes('non-empty')));
	assert.ok(
		validateStylingLedger(ledger({ ...baseEntry, extra: true }), root).some((error) =>
			error.includes('unknown field'),
		),
	);
});

test('the authored schema pins the contract the checker enforces', () => {
	const schema = JSON.parse(
		readFileSync(
			path.join(ROOT, 'packages/octane/audit/styling-failure-ledger.schema.json'),
			'utf8',
		),
	);
	assert.deepEqual(schema.required, ['$schema', 'schemaVersion', 'entries']);
	assert.equal(schema.properties.$schema.const, './styling-failure-ledger.schema.json');
	assert.equal(schema.properties.schemaVersion.const, 1);
	assert.deepEqual(schema.$defs.entry.required, ['id', 'fixture', 'failure', 'disposition']);
	assert.equal(schema.$defs.entry.additionalProperties, false);
});
