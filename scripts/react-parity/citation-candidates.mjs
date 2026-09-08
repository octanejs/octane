#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const auditRoot = path.join(repoRoot, 'packages/octane/audit');

function readJson(file) {
	return JSON.parse(readFileSync(file, 'utf8'));
}

function option(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : process.argv[index + 1];
}

function workspaceTests(directory, out = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) workspaceTests(absolute, out);
		else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) out.push(absolute);
	}
	return out;
}

function staticTests(lines) {
	const tests = [];
	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(/\b(?:it|test)\(\s*(['"])(.*?)\1/);
		if (match) tests.push({ line: index + 1, title: match[2] });
	}
	return tests;
}

function commentsOrWhitespaceBetween(lines, start, end) {
	return lines.slice(start, end).every((line) => /^\s*(?:(?:\/\/|\/\*|\*|\*\/).*)?$/.test(line));
}

function owningTest(tests, citationLine, lines) {
	let previous = null;
	for (const test of tests) {
		if (test.line === citationLine) return test;
		if (test.line > citationLine) {
			// Source citations normally sit in comments immediately before the test
			// they justify. Prefer that following test even when a detailed rationale
			// spans more than a few lines; if executable code intervenes, the citation
			// belongs to the preceding test body (or cannot be assigned safely).
			return commentsOrWhitespaceBetween(lines, citationLine, test.line - 1) ? test : previous;
		}
		previous = test;
	}
	return previous;
}

function inventoryCasesByBasename(inventories) {
	const byBasename = new Map();
	for (const inventory of inventories) {
		for (const suite of inventory.suites) {
			const basename = path.basename(suite.file);
			const files = byBasename.get(basename) ?? new Map();
			for (const testCase of suite.cases) {
				const key = `${testCase.caseId}:${testCase.line}`;
				if (!files.has(key)) files.set(key, { ...testCase, sourceFile: suite.file });
			}
			byBasename.set(basename, files);
		}
	}
	return new Map([...byBasename].map(([basename, cases]) => [basename, [...cases.values()]]));
}

function closestCase(cases, citedLine) {
	let closest = null;
	for (const testCase of cases ?? []) {
		const distance = Math.abs(testCase.line - citedLine);
		if (closest === null || distance < closest.distance) closest = { testCase, distance };
	}
	return closest !== null && closest.distance <= 3 ? closest : null;
}

const baseline = option('--baseline') ?? 'stable';
if (!['stable', 'canary'].includes(baseline)) {
	throw new Error('`--baseline` must be `stable` or `canary`.');
}
const inventories = [readJson(path.join(auditRoot, `react-test-inventory.${baseline}.json`))];
const ledger = readJson(path.join(auditRoot, 'react-conformance-ledger.json'));
const ledgerById = new Map(ledger.entries.map((entry) => [entry.caseId, entry]));
const inventoryByBasename = inventoryCasesByBasename(inventories);
// Most React suites end in `-test`, but a few discovered source suites (for
// example React-hooks-arity.js) do not. Match a conservative source basename
// and let the pinned inventory map reject unrelated local filenames.
const citationPattern = /([A-Za-z0-9_-]+(?:\.internal)?\.(?:js|ts|coffee))(?::([0-9,:\s-]+))/g;
const candidates = new Map();

for (const absolute of workspaceTests(path.join(repoRoot, 'packages'))) {
	const relative = path.relative(repoRoot, absolute);
	const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
	const tests = staticTests(lines);
	for (let index = 0; index < lines.length; index++) {
		for (const match of lines[index].matchAll(citationPattern)) {
			const localTest = owningTest(tests, index + 1, lines);
			if (localTest === null) continue;
			const citedLines = [...match[2].matchAll(/\d+/g)].map((item) => Number(item[0]));
			for (const citedLine of citedLines) {
				const closest = closestCase(inventoryByBasename.get(match[1]), citedLine);
				if (closest === null) continue;
				const entry = ledgerById.get(closest.testCase.caseId);
				if (entry === undefined || entry.status === 'covered') continue;
				const key = `${entry.caseId}\0${relative}\0${localTest.title}`;
				candidates.set(key, {
					caseId: entry.caseId,
					status: entry.status,
					sourceFile: entry.sourceFile,
					upstreamTitle: entry.title ?? entry.titleExpression,
					upstreamLine: closest.testCase.line,
					citedLine,
					lineDelta: closest.distance,
					localFile: relative,
					localTest: localTest.title,
				});
			}
		}
	}
}

const rows = [...candidates.values()]
	.filter((row) => !process.argv.includes('--exact-line') || row.lineDelta === 0)
	.filter((row) => !process.argv.includes('--exact-title') || row.upstreamTitle === row.localTest)
	.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.upstreamLine - b.upstreamLine);

if (process.argv.includes('--json')) {
	process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
	for (const row of rows) {
		process.stdout.write(
			[
				row.caseId,
				row.status,
				row.sourceFile,
				row.upstreamLine,
				row.upstreamTitle,
				row.localFile,
				row.localTest,
			].join('\t') + '\n',
		);
	}
	process.stderr.write(`Found ${rows.length} non-covered ${baseline} citation candidates.\n`);
}

// Keep a direct invocation failure actionable if a checkout is incomplete.
if (!existsSync(path.join(repoRoot, 'package.json'))) process.exitCode = 1;
