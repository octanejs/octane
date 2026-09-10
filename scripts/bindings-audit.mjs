#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	assertExternalReportPath,
	auditBindings,
	auditExitCode,
	revalidateAudit,
	renderAuditReport,
} from './bindings-audit-lib.mjs';
import { stableStringify, sanitizeForReport } from './react-port/report-lib.mjs';

const HELP = `Usage:
  bindings-audit [audit] (--binding NAME ... | --all) [--repository URL] [--output PATH]
  bindings-audit revalidate --input PATH [--finding ID ...] [--output PATH]
  bindings-audit report --input PATH [--finding ID ...] [--output PATH]

Audit and revalidate emit JSON; report refreshes baselines and emits a human report.
Revalidate/report update the input artifact unless --output names another external path.
Artifacts and managed checkouts must stay outside Git source trees. With no --output,
audit writes JSON only to stdout. --repository defaults to the intended Octane upstream.
Exit 0: collected and fresh; 1: invalid invocation/report or unusable Octane root;
2: partial/stale. Findings alone do not cause a failing exit status.

Assessments may be added to the same JSON findings/evidence arrays. A finding has a
unique id, binding, category, origin:"assessment", summary, assessedAt, evidenceIds,
and baselines mapping every binding.baselineIds entry to its assessed receipt SHA.
Evidence has a unique id, binding, origin:"assessment", the same baselines, location,
and observation. Functional-gap/compatibility-defect also require consumerFailure
{scenario, expected, actual}. Reassessment must supply evidence at replacement SHAs;
revalidation never changes an assessment's baselines. See collected facts.files for
repository-relative package paths and fingerprint(base64(file bytes)) values.
`;

function parseArgs(args) {
	const parsed = { operation: 'audit', bindings: [], all: false, findingIds: [] };
	if (args[0] && !args[0].startsWith('-')) parsed.operation = args.shift();
	if (!['audit', 'revalidate', 'report'].includes(parsed.operation))
		throw new Error(`Unknown operation: ${parsed.operation}`);
	const values = {
		'--binding': 'bindings',
		'--repository': 'repositoryUrl',
		'--output': 'output',
		'--input': 'input',
		'--finding': 'findingIds',
		'--timeout-ms': 'timeoutMs',
	};
	while (args.length) {
		const arg = args.shift();
		if (arg === '--all') {
			if (parsed.all) throw new Error('Repeated --all');
			parsed.all = true;
			continue;
		}
		const key = values[arg];
		if (!key || !args.length || args[0].startsWith('--'))
			throw new Error(`Unknown or missing argument: ${arg}`);
		const value = args.shift();
		if (Array.isArray(parsed[key])) parsed[key].push(value);
		else {
			if (parsed[key] !== undefined) throw new Error(`Repeated ${arg}`);
			parsed[key] = value;
		}
	}
	if (parsed.timeoutMs !== undefined) {
		parsed.timeoutMs = Number(parsed.timeoutMs);
		if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1 || parsed.timeoutMs > 60_000)
			throw new Error('--timeout-ms must be between 1 and 60000');
	}
	if (parsed.operation === 'audit') {
		if (
			parsed.input ||
			parsed.findingIds.length ||
			(parsed.all ? parsed.bindings.length : !parsed.bindings.length)
		)
			throw new Error('Audit requires repeated --binding selectors or exclusive --all');
	} else if (!parsed.input || parsed.bindings.length || parsed.all || parsed.repositoryUrl)
		throw new Error('Revalidate/report require --input and optional --finding selectors');
	return parsed;
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
			stdout.write(HELP);
			return 0;
		}
		const args = parseArgs([...argv]);
		if (args.input) assertExternalReportPath(args.input);
		if (args.output) assertExternalReportPath(args.output);
		const settings = { ...options, ...args };
		let report;
		if (args.operation === 'audit') report = await auditBindings(settings);
		else {
			report = JSON.parse(readFileSync(args.input, 'utf8'));
			report = await revalidateAudit(report, settings);
		}
		const json = `${stableStringify(sanitizeForReport(report))}\n`;
		const output = args.output ?? args.input;
		if (output) {
			mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
			writeFileSync(output, json);
		}
		stdout.write(args.operation === 'report' ? renderAuditReport(report, args.findingIds) : json);
		const code = auditExitCode(report, args.findingIds);
		if (code)
			stderr.write(
				'Audit has partial or stale results; inspect named failures and finding freshness.\n',
			);
		return code;
	} catch (error) {
		stderr.write(`bindings-audit: ${sanitizeForReport(error.message)}\n`);
		return 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
	process.exitCode = await runCli();
