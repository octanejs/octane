#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

const CROSSWALK_URL = new URL('../audit/upstream-crosswalk.json', import.meta.url);
const REPOSITORY_URL = new URL('../../../', import.meta.url);

const EXPECTED_UPSTREAM = Object.freeze({
	repository: 'https://github.com/pmndrs/react-three-fiber',
	version: '9.6.1',
	commit: '2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7',
	threeOracleVersion: '0.172.0',
	publicEntry: 'packages/fiber/src/index.tsx',
	fiberTestRoot: 'packages/fiber/tests',
	testRendererTestRoot: 'packages/test-renderer/src/__tests__',
	countingPolicy:
		'One entry per executable it/test declaration; todo declarations are excluded, and a parameterized declaration retains its source template as one plan-counted case.',
});

const ALLOWED_CLASSIFICATIONS = Object.freeze([
	'behavioral',
	'differential',
	'browser-only',
	'type-package',
	'not-applicable',
]);

const EXPECTED_TESTS_BY_SOURCE = Object.freeze({
	'packages/fiber/tests/canvas.native.test.tsx': 4,
	'packages/fiber/tests/canvas.test.tsx': 5,
	'packages/fiber/tests/events.test.tsx': 15,
	'packages/fiber/tests/hooks.test.tsx': 9,
	'packages/fiber/tests/index.test.tsx': 18,
	'packages/fiber/tests/polyfills.test.ts': 5,
	'packages/fiber/tests/reconciler.test.ts': 1,
	'packages/fiber/tests/renderer.test.tsx': 26,
	'packages/fiber/tests/utils.test.ts': 46,
	'packages/test-renderer/src/__tests__/RTTR.core.test.tsx': 18,
	'packages/test-renderer/src/__tests__/RTTR.events.test.tsx': 2,
	'packages/test-renderer/src/__tests__/RTTR.hooks.test.tsx': 3,
	'packages/test-renderer/src/__tests__/RTTR.methods.test.tsx': 5,
});

const EXPECTED_TOTALS = Object.freeze({
	exports: 90,
	tests: 157,
	fiberTests: 129,
	testRendererTests: 28,
	entries: 247,
	unclassified: 0,
});

const EXPECTED_EXPORT_INVENTORY_SHA256 =
	'326b36e50d1a73a7acd6d6171ed949ee06f1037c79b0580ea57a635ba83653f5';
const EXPECTED_TEST_INVENTORY_SHA256 =
	'd8f2ea116c493cb3fda4cd3449a9604a744e37b75525de2facf266c3e4ea0c15';

function fail(message) {
	throw new Error(`Upstream crosswalk: ${message}`);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value, label) {
	if (!isRecord(value)) fail(`${label} must be an object.`);
}

function assertExactKeys(value, expected, label) {
	assertRecord(value, label);
	const actualKeys = Object.keys(value).sort();
	const expectedKeys = [...expected].sort();
	if (actualKeys.length !== expectedKeys.length) {
		fail(`${label} has unexpected keys: ${actualKeys.join(', ')}.`);
	}
	for (let index = 0; index < expectedKeys.length; index++) {
		if (actualKeys[index] !== expectedKeys[index]) {
			fail(`${label} has unexpected keys: ${actualKeys.join(', ')}.`);
		}
	}
}

function assertNonEmptyString(value, label, minimumLength = 1) {
	if (typeof value !== 'string' || value.trim().length < minimumLength) {
		fail(`${label} must be a non-empty string of at least ${minimumLength} characters.`);
	}
}

function assertPositiveLine(value, label) {
	if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
}

function assertPinnedObject(actual, expected, label) {
	assertExactKeys(actual, Object.keys(expected), label);
	for (const [key, value] of Object.entries(expected)) {
		if (actual[key] !== value) {
			fail(
				`${label}.${key} must be ${JSON.stringify(value)}, received ${JSON.stringify(actual[key])}.`,
			);
		}
	}
}

function assertAllowedClassification(entry, label) {
	if (!ALLOWED_CLASSIFICATIONS.includes(entry.classification)) {
		fail(`${label}.classification is not allowed: ${JSON.stringify(entry.classification)}.`);
	}
	assertNonEmptyString(entry.reason, `${label}.reason`, 32);
	assertNonEmptyString(entry.evidenceTarget, `${label}.evidenceTarget`);
	if (entry.classification === 'not-applicable') {
		if (entry.evidenceTarget !== 'docs/three-port-plan.md#intentional-exclusions-or-adaptations') {
			fail(`${label} is not-applicable without the durable exclusions evidence target.`);
		}
	} else if (!entry.evidenceTarget.startsWith('packages/three/')) {
		fail(`${label}.evidenceTarget must point into packages/three/.`);
	}
}

function assertSource(source, label, expectedPrefix) {
	assertExactKeys(source, ['path', 'line'], label);
	assertNonEmptyString(source.path, `${label}.path`);
	assertPositiveLine(source.line, `${label}.line`);
	if (!source.path.startsWith(expectedPrefix)) {
		fail(`${label}.path must start with ${JSON.stringify(expectedPrefix)}.`);
	}
}

function digest(lines) {
	return createHash('sha256')
		.update([...lines].sort().join('\n'))
		.digest('hex');
}

function testFileKey(path) {
	return basename(path)
		.replace(/\.test\.(ts|tsx)$/, '')
		.replace(/\./g, '-')
		.toLowerCase();
}

function assertUnique(value, set, label) {
	if (set.has(value)) fail(`duplicate ${label}: ${JSON.stringify(value)}.`);
	set.add(value);
}

function markdownHeadingAnchor(heading) {
	return heading
		.trim()
		.toLowerCase()
		.replace(/[`*_~]/g, '')
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-');
}

const crosswalk = JSON.parse(await readFile(CROSSWALK_URL, 'utf8'));

assertExactKeys(
	crosswalk,
	['schemaVersion', 'upstream', 'allowedClassifications', 'expectedTotals', 'exports', 'tests'],
	'root',
);
if (crosswalk.schemaVersion !== 1) fail('schemaVersion must be 1.');
assertPinnedObject(crosswalk.upstream, EXPECTED_UPSTREAM, 'upstream');

if (!Array.isArray(crosswalk.allowedClassifications)) {
	fail('allowedClassifications must be an array.');
}
if (
	crosswalk.allowedClassifications.length !== ALLOWED_CLASSIFICATIONS.length ||
	crosswalk.allowedClassifications.some(
		(classification, index) => classification !== ALLOWED_CLASSIFICATIONS[index],
	)
) {
	fail(`allowedClassifications must be ${JSON.stringify(ALLOWED_CLASSIFICATIONS)}.`);
}

assertExactKeys(
	crosswalk.expectedTotals,
	[...Object.keys(EXPECTED_TOTALS), 'testsBySource'],
	'expectedTotals',
);
for (const [name, expected] of Object.entries(EXPECTED_TOTALS)) {
	if (crosswalk.expectedTotals[name] !== expected) {
		fail(`expectedTotals.${name} must be ${expected}.`);
	}
}
assertPinnedObject(
	crosswalk.expectedTotals.testsBySource,
	EXPECTED_TESTS_BY_SOURCE,
	'expectedTotals.testsBySource',
);

if (!Array.isArray(crosswalk.exports)) fail('exports must be an array.');
if (!Array.isArray(crosswalk.tests)) fail('tests must be an array.');

const allIds = new Set();
const exportNames = new Set();
const exportIdentities = [];
for (const [index, entry] of crosswalk.exports.entries()) {
	const label = `exports[${index}]`;
	assertExactKeys(
		entry,
		['id', 'name', 'kind', 'source', 'classification', 'reason', 'evidenceTarget'],
		label,
	);
	assertNonEmptyString(entry.name, `${label}.name`);
	if (entry.id !== `export:${entry.name}`) fail(`${label}.id does not match its export name.`);
	if (entry.kind !== 'type' && entry.kind !== 'value') {
		fail(`${label}.kind must be "type" or "value".`);
	}
	assertSource(entry.source, `${label}.source`, 'packages/fiber/src/');
	assertAllowedClassification(entry, label);
	assertUnique(entry.id, allIds, 'entry ID');
	assertUnique(entry.name, exportNames, 'export name');
	exportIdentities.push(
		[entry.id, entry.name, entry.kind, entry.source.path, entry.source.line].join('\t'),
	);
}

const testIdentities = [];
const testSources = {};
let fiberTests = 0;
let testRendererTests = 0;
for (const [index, entry] of crosswalk.tests.entries()) {
	const label = `tests[${index}]`;
	assertExactKeys(
		entry,
		['id', 'suite', 'title', 'source', 'classification', 'reason', 'evidenceTarget'],
		label,
	);
	if (entry.suite !== 'fiber' && entry.suite !== 'test-renderer') {
		fail(`${label}.suite must be "fiber" or "test-renderer".`);
	}
	assertNonEmptyString(entry.title, `${label}.title`);
	const prefix =
		entry.suite === 'fiber' ? 'packages/fiber/tests/' : 'packages/test-renderer/src/__tests__/';
	assertSource(entry.source, `${label}.source`, prefix);
	const expectedId = `test:${entry.suite}:${testFileKey(entry.source.path)}:${entry.source.line}`;
	if (entry.id !== expectedId) fail(`${label}.id must be ${JSON.stringify(expectedId)}.`);
	assertAllowedClassification(entry, label);
	assertUnique(entry.id, allIds, 'entry ID');
	const identity = [entry.id, entry.suite, entry.title, entry.source.path, entry.source.line].join(
		'\t',
	);
	testIdentities.push(identity);
	testSources[entry.source.path] = (testSources[entry.source.path] ?? 0) + 1;
	if (entry.suite === 'fiber') fiberTests++;
	else testRendererTests++;
}

assertPinnedObject(testSources, EXPECTED_TESTS_BY_SOURCE, 'calculated testsBySource');

const unclassified = [...crosswalk.exports, ...crosswalk.tests].filter(
	(entry) => !ALLOWED_CLASSIFICATIONS.includes(entry.classification),
).length;
const totals = {
	exports: crosswalk.exports.length,
	tests: crosswalk.tests.length,
	fiberTests,
	testRendererTests,
	entries: crosswalk.exports.length + crosswalk.tests.length,
	unclassified,
};
for (const [name, expected] of Object.entries(EXPECTED_TOTALS)) {
	if (totals[name] !== expected)
		fail(`calculated ${name} must be ${expected}, received ${totals[name]}.`);
}

const exportDigest = digest(exportIdentities);
if (exportDigest !== EXPECTED_EXPORT_INVENTORY_SHA256) {
	fail(`public export inventory digest changed: ${exportDigest}.`);
}
const testDigest = digest(testIdentities);
if (testDigest !== EXPECTED_TEST_INVENTORY_SHA256) {
	fail(`upstream test inventory digest changed: ${testDigest}.`);
}

const classifications = {};
const evidenceEntries = new Map();
for (const entry of [...crosswalk.exports, ...crosswalk.tests]) {
	classifications[entry.classification] = (classifications[entry.classification] ?? 0) + 1;
	const entries = evidenceEntries.get(entry.evidenceTarget) ?? [];
	entries.push(entry.id);
	evidenceEntries.set(entry.evidenceTarget, entries);
}

for (const [target, entries] of evidenceEntries) {
	const [file, anchor] = target.split('#', 2);
	const evidenceUrl = new URL(file, REPOSITORY_URL);
	try {
		const evidence = await stat(evidenceUrl);
		if (!evidence.isFile()) throw new Error('not a file');
	} catch {
		fail(
			`evidence target ${JSON.stringify(target)} does not exist ` +
				`(referenced by ${entries.join(', ')}).`,
		);
	}
	if (anchor !== undefined) {
		const markdown = await readFile(evidenceUrl, 'utf8');
		const anchors = new Set(
			[...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => markdownHeadingAnchor(match[1])),
		);
		if (!anchors.has(anchor)) {
			fail(
				`evidence target ${JSON.stringify(target)} has no matching Markdown heading ` +
					`(referenced by ${entries.join(', ')}).`,
			);
		}
	}
}

console.log(
	`Validated pinned R3F ${EXPECTED_UPSTREAM.version} crosswalk: ` +
		`${totals.exports} exports, ${totals.fiberTests} fiber tests, ` +
		`${totals.testRendererTests} test-renderer tests, ${totals.unclassified} unclassified.`,
);
console.log(`Classifications: ${JSON.stringify(classifications)}.`);
