#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport, validateIdRegistryCompatibility, validateLedger } from './ledger-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'packages/octane/audit/redact-adversarial-ledger.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/redact-adversarial-audit.md');
const CHECK = process.argv.includes('--check');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--check');

if (unknownArguments.length > 0) {
	console.error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
	process.exit(1);
}

if (!existsSync(LEDGER_PATH)) {
	console.error(
		'Redact adversarial ledger is missing: packages/octane/audit/redact-adversarial-ledger.json.',
	);
	process.exit(1);
}

let ledger;
try {
	ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
} catch (error) {
	console.error(`Redact adversarial ledger is invalid JSON: ${error.message}`);
	process.exit(1);
}

const errors = validateLedger(ledger, REPO_ROOT);
if (errors.length > 0) {
	console.error(`Redact adversarial ledger is invalid:\n  - ${errors.join('\n  - ')}`);
	process.exit(1);
}

const compatibilityBase = process.env.OCTANE_REDACT_AUDIT_BASE;
if (compatibilityBase !== undefined) {
	try {
		execFileSync('git', ['cat-file', '-e', `${compatibilityBase}^{commit}`], {
			cwd: REPO_ROOT,
			stdio: 'ignore',
		});
	} catch {
		console.error(`Cannot resolve Redact audit compatibility base ${compatibilityBase}.`);
		process.exit(1);
	}
	let previousSource;
	try {
		previousSource = execFileSync(
			'git',
			['show', `${compatibilityBase}:packages/octane/audit/redact-adversarial-ledger.json`],
			{ cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		);
	} catch {
		// The first release of the ledger has no prior file to compare. Every
		// later PR/push is checked against its base commit by CI.
		previousSource = undefined;
	}
	if (previousSource !== undefined) {
		let previousLedger;
		try {
			previousLedger = JSON.parse(previousSource);
		} catch (error) {
			console.error(`Base Redact adversarial ledger is invalid JSON: ${error.message}`);
			process.exit(1);
		}
		const compatibilityErrors = validateIdRegistryCompatibility(previousLedger, ledger);
		if (compatibilityErrors.length > 0) {
			console.error(
				`Redact adversarial ledger breaks permanent-ID compatibility:\n  - ${compatibilityErrors.join('\n  - ')}`,
			);
			process.exit(1);
		}
	}
}

const report = renderReport(ledger);
if (CHECK) {
	if (!existsSync(REPORT_PATH) || readFileSync(REPORT_PATH, 'utf8') !== report) {
		console.error(
			'docs/redact-adversarial-audit.md is stale — run `pnpm redact-audit:generate` and commit the result.',
		);
		process.exit(1);
	}
	console.log(`Redact adversarial audit is current (${ledger.entries.length} entries).`);
} else {
	writeFileSync(REPORT_PATH, report);
	console.log(`wrote docs/redact-adversarial-audit.md (${ledger.entries.length} entries).`);
}
