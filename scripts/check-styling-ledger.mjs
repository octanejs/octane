/**
 * Gate for the agent styling-failure intake ledger
 * (`packages/octane/audit/styling-failure-ledger.json`): every observed agent
 * styling failure is reduced to a committed `.tsrx` repro fixture and triaged
 * to machinery — a diagnostic code, an eval task, or a prose line — per the
 * machinery-promotion policy in `docs/agent-context-engineering-plan.md`.
 *
 * The check proves:
 *  - the ledger matches `audit/styling-failure-ledger.schema.json`'s shape;
 *  - each disposition target exists — the diagnostic code is registered in
 *    `packages/octane/src` or the website docs registry, the eval task exists
 *    in the user-apps-v1 dataset, or the prose document exists;
 *  - each repro fixture compiles the way its entry records: a
 *    `diagnostic:<code>` disposition must be produced by the fixture, a
 *    registered `expectedCode` must fire, and anything the compiler emits
 *    that the entry does not record fails — so a fixture that still compiles
 *    silently keeps a `prose:` entry honest only until its machinery lands.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../packages/octane/src/compiler/compile.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const LEDGER_PATH = 'packages/octane/audit/styling-failure-ledger.json';
const SCHEMA_CONST = './styling-failure-ledger.schema.json';
const EVAL_TASKS_ROOT = 'packages/octane-evals/datasets/train/user-apps-v1/tasks';

const ID_PATTERN = /^SFL-[0-9]{3}$/;
const FIXTURE_PATTERN = /^packages\/octane\/tests\/(?!.*\.\.).+\.tsrx$/;
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const DISPOSITION_PATTERN = /^(diagnostic|eval|prose):(\S+)$/;
const EVAL_TASK_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;
const PROSE_PATTERN = /^(?!.*\.\.).+\.(?:md|mdx|txt)$/;
const ENTRY_KEYS = ['id', 'fixture', 'failure', 'expectedCode', 'disposition', 'notes'];

// Sources a diagnostic code can be registered in: compiler/runtime sources and
// the published docs' diagnostic tables (styling.mdx lists both the SCREAMING
// and kebab spellings of upstream `tsrx-*`/`STYLE_*` codes).
const REGISTRY_GLOBS = [
	['packages/octane/src', /\.(?:js|ts|mjs)$/],
	['website/src/content/docs', /\.(?:md|mdx)$/],
];
const CODE_TOKEN_PATTERN =
	/\b(?:octane|tsrx|style|css|html)(?:-[a-z0-9]+)+\b|\b(?:OCTANE|TSRX|STYLE|CSS|HTML)_[A-Z0-9_]+\b/g;

const normalizeCode = (code) => code.toUpperCase().replaceAll('-', '_');

function collectDiagnosticCodes(root) {
	const codes = new Set();
	for (const [dir, extension] of REGISTRY_GLOBS) {
		const absolute = path.join(root, dir);
		const walk = (current) => {
			if (!existsSync(current)) return;
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const file = path.join(current, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== 'node_modules') walk(file);
				} else if (entry.isFile() && extension.test(entry.name)) {
					for (const match of readFileSync(file, 'utf8').matchAll(CODE_TOKEN_PATTERN))
						codes.add(normalizeCode(match[0]));
				}
			}
		};
		walk(absolute);
	}
	return codes;
}

function compileFixtureCodes(root, fixture) {
	const absolute = path.join(root, fixture);
	if (!existsSync(absolute)) return { missing: true, codes: new Set() };
	const source = readFileSync(absolute, 'utf8');
	try {
		const result = compile(source, fixture, { mode: 'client', dev: false, hmr: false });
		const codes = new Set();
		for (const diagnostic of result.diagnostics ?? [])
			if (typeof diagnostic?.code === 'string') codes.add(normalizeCode(diagnostic.code));
		return { codes };
	} catch (error) {
		return {
			codes: typeof error?.code === 'string' ? new Set([normalizeCode(error.code)]) : new Set(),
			thrown: error,
		};
	}
}

function validateEntry(entry, index, errors, registry, root) {
	const label = `entries[${index}]`;
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		errors.push(`${label} must be an object.`);
		return;
	}
	for (const key of Object.keys(entry))
		if (!ENTRY_KEYS.includes(key))
			errors.push(`${label} has unknown field ${JSON.stringify(key)}.`);
	for (const key of ['id', 'fixture', 'failure', 'disposition'])
		if (entry[key] === undefined) errors.push(`${label}.${key} is required.`);
	if (entry.id !== undefined && (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)))
		errors.push(`${label}.id must match ${ID_PATTERN} (permanent IDs are never reused).`);
	if (typeof entry.failure !== 'string' || !entry.failure.trim())
		errors.push(`${label}.failure must describe the observed failure.`);
	if (entry.notes !== undefined && (typeof entry.notes !== 'string' || !entry.notes.trim()))
		errors.push(`${label}.notes must be a non-empty string when present.`);
	if (
		entry.expectedCode !== undefined &&
		(typeof entry.expectedCode !== 'string' || !CODE_PATTERN.test(entry.expectedCode))
	)
		errors.push(`${label}.expectedCode must be a diagnostic code token.`);

	const disposition =
		typeof entry.disposition === 'string' ? DISPOSITION_PATTERN.exec(entry.disposition) : null;
	if (!disposition) {
		errors.push(`${label}.disposition must be diagnostic:<code>, eval:<task-id>, or prose:<path>.`);
		return;
	}
	const [, kind, target] = disposition;
	let diagnosticCode;
	if (kind === 'diagnostic') {
		diagnosticCode = normalizeCode(target);
		if (!registry.has(diagnosticCode))
			errors.push(
				`${label} triages to diagnostic:${target}, which is not a registered diagnostic ` +
					'code in packages/octane/src or website/src/content/docs. Triage to prose: ' +
					'until the diagnostic ships.',
			);
	} else if (kind === 'eval') {
		if (!EVAL_TASK_PATTERN.test(target) || target.includes('..')) {
			errors.push(`${label}.disposition eval target ${JSON.stringify(target)} is not a task id.`);
		} else if (!existsSync(path.join(root, EVAL_TASKS_ROOT, target, 'prompt.md'))) {
			errors.push(
				`${label} triages to eval:${target}, but ${EVAL_TASKS_ROOT}/${target} has no ` +
					'task directory with prompt.md.',
			);
		}
	} else {
		if (!PROSE_PATTERN.test(target) || !existsSync(path.join(root, target)))
			errors.push(`${label} triages to prose:${target}, which is not an existing doc file.`);
	}

	if (
		entry.expectedCode !== undefined &&
		diagnosticCode !== undefined &&
		normalizeCode(entry.expectedCode) !== diagnosticCode
	)
		errors.push(
			`${label}.expectedCode ${entry.expectedCode} disagrees with disposition ` +
				`diagnostic:${target}.`,
		);

	// The recorded compile contract: the fixture must produce every registered
	// code the entry records, and must not produce anything it does not record.
	if (typeof entry.fixture !== 'string' || !FIXTURE_PATTERN.test(entry.fixture)) {
		errors.push(
			`${label}.fixture must be a repo-relative .tsrx path under packages/octane/tests/.`,
		);
		return;
	}
	const compiled = compileFixtureCodes(root, entry.fixture);
	if (compiled.missing) {
		errors.push(`${label}.fixture does not exist: ${entry.fixture}`);
		return;
	}
	if (compiled.thrown && compiled.codes.size === 0) {
		errors.push(
			`${label}.fixture fails to compile without a diagnostic code: ${compiled.thrown.message}`,
		);
		return;
	}
	const recorded = new Set();
	if (diagnosticCode !== undefined) recorded.add(diagnosticCode);
	if (entry.expectedCode !== undefined) recorded.add(normalizeCode(entry.expectedCode));
	for (const code of recorded)
		if (registry.has(code) && !compiled.codes.has(code))
			errors.push(
				`${label} records ${code} but ${entry.fixture} does not produce it ` +
					`(produced: ${[...compiled.codes].join(', ') || 'none'}).`,
			);
	for (const code of compiled.codes)
		if (!recorded.has(code))
			errors.push(
				`${label} fixture produces ${code}, which the entry does not record; ` +
					'update expectedCode/disposition or fix the fixture.',
			);
	// prose: is only an honest disposition while no machinery catches the
	// failure. Once the recorded code is registered and fires on the fixture,
	// the entry must be re-triaged to diagnostic: or eval:.
	if (
		kind === 'prose' &&
		entry.expectedCode !== undefined &&
		registry.has(normalizeCode(entry.expectedCode)) &&
		compiled.codes.has(normalizeCode(entry.expectedCode))
	)
		errors.push(
			`${label}.expectedCode ${entry.expectedCode} is registered and fires on the ` +
				'fixture; re-triage the disposition from prose: to diagnostic: or eval:.',
		);
}

export function validateStylingLedger(ledgerValue, repoRoot = ROOT) {
	const errors = [];
	if (typeof ledgerValue !== 'object' || ledgerValue === null || Array.isArray(ledgerValue))
		return ['ledger must be an object.'];
	for (const key of Object.keys(ledgerValue))
		if (!['$schema', 'schemaVersion', 'entries'].includes(key))
			errors.push(`ledger has unknown field ${JSON.stringify(key)}.`);
	if (ledgerValue.$schema !== SCHEMA_CONST)
		errors.push(`ledger.$schema must be ${JSON.stringify(SCHEMA_CONST)}.`);
	if (ledgerValue.schemaVersion !== 1) errors.push('ledger.schemaVersion must be 1.');
	if (!Array.isArray(ledgerValue.entries) || ledgerValue.entries.length === 0) {
		errors.push('ledger.entries must be a non-empty array.');
		return errors;
	}
	const registry = collectDiagnosticCodes(repoRoot);
	const ids = [];
	for (const [index, entry] of ledgerValue.entries.entries()) {
		validateEntry(entry, index, errors, registry, repoRoot);
		if (typeof entry?.id === 'string') ids.push(entry.id);
	}
	if (new Set(ids).size !== ids.length) errors.push('ledger.entries contains a duplicate id.');
	const sorted = [...ids].sort((a, b) => a.localeCompare(b));
	if (ids.some((id, index) => id !== sorted[index]))
		errors.push('ledger.entries must be sorted by id.');
	return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	let ledger;
	try {
		ledger = JSON.parse(readFileSync(path.join(ROOT, LEDGER_PATH), 'utf8'));
	} catch (error) {
		console.error(`Cannot read ${LEDGER_PATH}: ${error.message}`);
		process.exitCode = 1;
	}
	if (ledger !== undefined) {
		const errors = validateStylingLedger(ledger, ROOT);
		for (const error of errors) console.error(error);
		if (errors.length !== 0) process.exitCode = 1;
		else
			console.log(
				`Styling failure ledger is valid: ${ledger.entries.length} recorded ` +
					`${ledger.entries.length === 1 ? 'failure' : 'failures'} all triaged to existing targets.`,
			);
	}
}
