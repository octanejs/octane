#!/usr/bin/env node
/**
 * Build a review checklist from a facebook/react test file.
 *
 * The shared inventory extractor owns test-registration discovery. This script
 * deliberately does not decide whether a case is portable: title matching can
 * add a review suggestion, but every discovered or dynamic registration stays
 * visible in the generated checklist until a person records its disposition in
 * the parity ledger.
 *
 * Usage:
 *   node scripts/scaffold-react-port.mjs <path-to-react-test-file> [--out <file>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	extractTestCases,
	findPossibleUnexpandedRegistrars,
} from './react-parity/inventory-lib.mjs';

// These are review prompts, not scope decisions. In particular, renderer-level
// outcomes often remain portable even when the React fixture uses an API that
// Octane does not expose.
const TRIAGE_SUGGESTION_RULES = [
	[
		/strictmode|double[- ]?invoke|double invoking/,
		'Review as an intentional divergence: Octane does not double-invoke for StrictMode.',
	],
	[
		/legacy|legacyhidden|sync mode/,
		'Review whether the observable outcome applies to concurrent roots.',
	],
	[
		/suspenselist|revealorder|\btail\b/,
		'Review API availability: Octane does not expose SuspenseList.',
	],
	[
		/profiler|actualduration|treebaseduration|onrender/,
		'Review API availability: Profiler is unsupported.',
	],
	[
		/devtools|component stack|displayname|owner stack|\.stack\b/,
		"Review against Octane's public diagnostic and DevTools contracts.",
	],
	[
		/getderivedstatefromerror|componentdidcatch/,
		'Adapt the renderer-level error-boundary outcome through @try/@catch when applicable.',
	],
	[
		/getderivedstatefromprops|componentwill|componentdid|shouldcomponentupdate|\bsetstate\b.*callback|replacestate|forceupdate|this\.refs|string ref/,
		'Adapt the observable outcome through function components and hooks when applicable.',
	],
	[
		/\bclass(es)?\b|purecomponent|createclass|\bes6 class\b/,
		'Adapt the observable outcome through function components when applicable.',
	],
	[
		/\bwarn(s|ing)?\b|invariant|errors? (if|when|on)|throws? (in dev|when|if)/,
		"Review against Octane's public diagnostic policy instead of copying message text.",
	],
	[
		/server component|\brsc\b|flight/,
		'Review as a likely non-goal: Server Components are unsupported.',
	],
	[
		/cpu[- ]?bound|expectedloadtime|suspensey|avoidthisfallback|suspensecallback/,
		'Review whether this unstable Suspense API has an Octane-facing observable outcome.',
	],
	[
		/multiple renderers|multi-renderer|two renderers/,
		'Review whether this depends on multi-renderer internals rather than a DOM-visible outcome.',
	],
	[
		/shouldyield|mock scheduler|scheduler module/,
		'Port only a public scheduling outcome, not scheduler internals.',
	],
	[
		/rules of hooks|hook order|ordered hooks|fewer hooks|more hooks/,
		'Review as an intentional divergence: Octane identifies hooks by compiler call site.',
	],
];

export function suggestTriage(title) {
	const normalizedTitle = typeof title === 'string' ? title.toLowerCase() : '';
	for (const [pattern, suggestion] of TRIAGE_SUGGESTION_RULES) {
		if (pattern.test(normalizedTitle)) return suggestion;
	}
	return null;
}

function asList(value) {
	if (value == null || value === false) return [];
	return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function describeValue(value) {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value && typeof value === 'object') {
		return Object.entries(value)
			.filter(([, item]) => item != null && item !== false && item !== '')
			.map(([key, item]) => `${key}=${Array.isArray(item) ? item.join(', ') : String(item)}`)
			.join('; ');
	}
	return '';
}

function commentText(value) {
	return describeValue(value).replace(/\r?\n/g, ' ').replace(/\*\//g, '* /');
}

function caseIsManual(testCase) {
	return (
		testCase.manual === true ||
		testCase.dynamic === true ||
		Boolean(testCase.manualReviewReason) ||
		testCase.status === 'manual' ||
		testCase.extraction === 'manual' ||
		typeof testCase.title !== 'string' ||
		testCase.title.length === 0
	);
}

function manualReason(testCase) {
	return (
		testCase.manualReviewReason ??
		testCase.manualReason ??
		testCase.reason ??
		testCase.dynamicExpression ??
		testCase.titleExpression ??
		'dynamic test registration'
	);
}

function todoTitle(testCase, reactFile) {
	if (!caseIsManual(testCase)) return testCase.title;
	const kind = testCase.kind || 'test';
	const location = `${basename(reactFile)}:${testCase.line ?? '?'}`;
	return `[manual review] ${kind} at ${location} — ${commentText(manualReason(testCase))}`;
}

function metadataLines(testCase) {
	const lines = [];
	const modifiers = asList(testCase.modifiers).map(commentText).filter(Boolean);
	if (modifiers.length > 0) lines.push(`Upstream modifiers: ${modifiers.join(', ')}`);

	const rawGate = testCase.gate ?? testCase.gates;
	const gateValues =
		rawGate && typeof rawGate === 'object' && !Array.isArray(rawGate)
			? (rawGate.expressions ?? rawGate.expression ?? rawGate)
			: rawGate;
	const gates = asList(gateValues).map(commentText).filter(Boolean);
	if (gates.length > 0) lines.push(`Feature gate: ${gates.join(' | ')}`);

	if (testCase.parameterization) {
		lines.push(`Parameterization: ${commentText(testCase.parameterization)}`);
	}
	if (testCase.helperExpansion) {
		lines.push(`Helper expansion: ${commentText(testCase.helperExpansion)}`);
	}
	if (testCase.estimatedRegistrations > 1) {
		lines.push(`Expands to ${commentText(testCase.estimatedRegistrations)} upstream registrations`);
	}
	const evidenceKey = testCase.caseId ?? testCase.evidenceKey;
	if (evidenceKey) lines.push(`Evidence key: ${commentText(evidenceKey)}`);
	if (caseIsManual(testCase)) lines.push(`MANUAL REVIEW: ${commentText(manualReason(testCase))}`);
	return lines;
}

export function renderScaffold(cases, reactFile) {
	const slug = basename(reactFile).replace(/-test(\.internal)?\.(?:coffee|[cm]?js)$/, '');
	const manualCount = cases.filter(caseIsManual).length;
	const suggestionCount = cases.filter((testCase) => suggestTriage(testCase.title)).length;
	const lines = [];

	lines.push('/**');
	lines.push(` * Port checklist for ${basename(reactFile)}.`);
	lines.push(
		` * ${cases.length} test declarations discovered; ${manualCount} require manual extraction review; ${suggestionCount} have automated triage suggestions.`,
	);
	lines.push(' * Suggestions are not scope decisions. Resolve every entry in the parity ledger.');
	lines.push(
		' * Replace each todo with an executable behavioral test or a ledger-backed disposition.',
	);
	lines.push(' */');
	lines.push("import { describe, it } from 'vitest';");
	lines.push('');
	lines.push(`describe(${JSON.stringify(`${slug} (ported)`)}, () => {`);
	for (const testCase of cases) {
		lines.push(`\t// Source: ${basename(reactFile)}:${testCase.line ?? '?'}`);
		for (const metadata of metadataLines(testCase)) lines.push(`\t// ${metadata}`);
		const suggestion = suggestTriage(testCase.title);
		if (suggestion) lines.push(`\t// Automated triage suggestion: ${commentText(suggestion)}`);
		lines.push(`\tit.todo(${JSON.stringify(todoTitle(testCase, reactFile))});`);
	}
	lines.push('});');
	return `${lines.join('\n')}\n`;
}

export function scaffoldReactPort(reactFile) {
	const source = readFileSync(reactFile, 'utf8');
	const normalizedFile = reactFile.replaceAll('\\', '/');
	const inventoryPath =
		normalizedFile.match(/(?:^|\/)((?:packages|scripts)\/.*)$/)?.[1] ?? reactFile;
	const extracted = extractTestCases(source, { file: inventoryPath });
	const extractedCases = Array.isArray(extracted) ? extracted : extracted.cases;
	const registrarCandidates = findPossibleUnexpandedRegistrars(source).map((candidate) => ({
		kind: candidate.name,
		title: null,
		line: null,
		manualReviewReason: `Possible custom registrar appears ${candidate.occurrences} time(s); inspect its definition and expand every registered case.`,
	}));
	const cases = Array.isArray(extractedCases)
		? [...extractedCases, ...registrarCandidates]
		: extractedCases;
	if (!Array.isArray(cases)) {
		throw new TypeError(
			'extractTestCases() must return a case array or an object with a cases array',
		);
	}
	return { cases, skeleton: renderScaffold(cases, reactFile) };
}

function parseArgs(args) {
	if (args.length === 0 || args.includes('-h') || args.includes('--help')) return null;
	const positional = [];
	let outFile = null;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--out') {
			outFile = args[++index];
			if (!outFile) throw new Error('--out requires a file path');
		} else if (arg.startsWith('--')) {
			throw new Error(`unknown option: ${arg}`);
		} else {
			positional.push(arg);
		}
	}
	if (positional.length !== 1) throw new Error('expected exactly one React test file');
	return { reactFile: positional[0], outFile };
}

export function main(args = process.argv.slice(2)) {
	const options = parseArgs(args);
	if (options === null) {
		console.error('usage: node scripts/scaffold-react-port.mjs <react-test-file> [--out <file>]');
		return args.length === 0 ? 1 : 0;
	}
	const { cases, skeleton } = scaffoldReactPort(options.reactFile);
	const manualCount = cases.filter(caseIsManual).length;
	if (options.outFile) {
		writeFileSync(options.outFile, skeleton);
		console.error(
			`wrote ${options.outFile} — ${cases.length} test declarations (${manualCount} manual review)`,
		);
	} else {
		process.stdout.write(skeleton);
		console.error(`\n# ${cases.length} test declarations (${manualCount} manual review)`);
	}
	return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
