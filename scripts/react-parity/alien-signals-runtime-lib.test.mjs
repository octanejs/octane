import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
	assertAdaptedSourceExecutable,
	assertRuntimeCrosswalk,
	assertRuntimeStructureCrosswalk,
	fixtureFileFingerprint,
} from './alien-signals-runtime-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function inventory(titles) {
	return {
		tests: titles.map(function toTest(fullName) {
			return { file: 'example.test.ts', fullName };
		}),
	};
}

test('accepts matching pristine and adapted titles', function acceptsMatchingTitles() {
	const titles = [
		'Alien React Library should create a writable signal',
		'Alien React Library should create a signal scope',
	];
	assert.deepEqual(assertRuntimeCrosswalk(inventory(titles), inventory(titles)), {
		titles: 2,
		structure: null,
	});
});

test('rejects an omitted adapted title', function rejectsOmittedTitle() {
	assert.throws(function run() {
		assertRuntimeCrosswalk(
			inventory(['suite case a', 'suite case b']),
			inventory(['suite case a']),
		);
	}, /missing adapted titles: suite case b/);
});

test('rejects a renamed adapted title', function rejectsRenamedTitle() {
	assert.throws(function run() {
		assertRuntimeCrosswalk(
			inventory(['suite case a', 'suite case b']),
			inventory(['suite case a', 'suite case b renamed']),
		);
	}, /not one-for-one by title/);
});

test('rejects skipped adapted registrations', function rejectsSkippedRegistration() {
	assert.throws(function run() {
		assertAdaptedSourceExecutable("it.skip('suite case a', function () {});\n");
	}, /skip, or todo markers/);
});

test('rejects Vitest it.fails adapted registrations', function rejectsFailsRegistration() {
	assert.throws(function run() {
		assertAdaptedSourceExecutable("it.fails('suite case a', function () {});\n");
	}, /failing\/fails, skip, or todo markers/);
});

test('accepts the committed adapted assertion and fixture structure', function acceptsCommittedStructure() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const result = assertRuntimeStructureCrosswalk({
		pristineSource,
		adaptedSource,
		fixtureSource,
		repoRoot: root,
	});
	assert.equal(result.cases > 0, true);
	assert.equal(result.fixtures > 0, true);
});

test('rejects deleting an adapted expect assertion', function rejectsDeletedAssertion() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const weakened = adaptedSource.replace(
		'expect(mySignal()).toBe(0);\n\t\tmySignal(10);\n\t\texpect(mySignal()).toBe(10);',
		'mySignal(10);\n\t\texpect(mySignal()).toBe(10);',
	);
	assert.notEqual(weakened, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: weakened,
			fixtureSource,
			repoRoot: root,
		});
	}, /runtime assertion drift/);
});

test('rejects a weakened expect receiver', function rejectsWeakenedReceiver() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const weakened = adaptedSource.replace(
		'expect(mySignal()).toBe(0);\n\t\tmySignal(10);\n\t\texpect(mySignal()).toBe(10);',
		'expect(0).toBe(0);\n\t\tmySignal(10);\n\t\texpect(mySignal()).toBe(10);',
	);
	assert.notEqual(weakened, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: weakened,
			fixtureSource,
			repoRoot: root,
		});
	}, /runtime assertion drift/);
});

test('rejects a missing Per citation', function rejectsMissingCitation() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const stripped = adaptedSource.replace(
		"\t// Per src/index.test.ts:31\n\tit('should create a writable signal'",
		"\tit('should create a writable signal'",
	);
	assert.notEqual(stripped, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: stripped,
			fixtureSource,
			repoRoot: root,
		});
	}, /missing a \/\/ Per src\/index\.test\.ts:<line> citation/);
});

test('rejects fixture file drift against the transformation ledger', function rejectsFixtureDrift() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const drifted = `${fixtureSource}\n`;
	assert.notEqual(fixtureFileFingerprint(drifted), fixtureFileFingerprint(fixtureSource));
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: drifted,
			repoRoot: root,
		});
	}, /fixture drift/);
});

test('rejects semantic fixture drift even when the ledger sha256 is updated', function rejectsSemanticFixtureDrift() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replaceAll('id="value"', 'id="renamed-value"');
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /semantic fixture drift/);
});

test('rejects dead-code padded setter counts paired with direct source writes', function rejectsDeadCodePaddedDirectSource() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = fixtureSource.replace(
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t}}',
		'onClick={() => {\n\t\t\t\tif (false) setValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tprops.source((previous) => previous + 1);\n\t\t\t}}',
	);
	assert.notEqual(padded, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: padded,
			expectedFixtureSha256: fixtureFileFingerprint(padded),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects short-circuit setter padding with nested direct source writes', function rejectsShortCircuitNestedSource() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = fixtureSource.replace(
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t}}',
		'onClick={() => {\n\t\t\t\tfalse && setValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tif (true) props.source((previous) => previous + 1);\n\t\t\t}}',
	);
	assert.notEqual(padded, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: padded,
			expectedFixtureSha256: fixtureFileFingerprint(padded),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects collapsing queued functional updates into one authenticated click write', function rejectsCollapsedFunctionalUpdates() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const collapsed = fixtureSource.replace(
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t}}',
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 2);\n\t\t\t}}',
	);
	assert.notEqual(collapsed, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: collapsed,
			expectedFixtureSha256: fixtureFileFingerprint(collapsed),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects replacing hook-driven clicks with direct source mutation', function rejectsHookBypass() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const bypassed = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(bypassed, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: bypassed,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects incidental calls that try to mask a hook-path bypass', function rejectsIncidentalCallMask() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const masked = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tcountSignal(10);\n\t\tJSON.stringify(countSignal());\n\t\tPromise.all([]);\n\t\tconst setters = [];\n\t\tsetters.at(0);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(masked, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: masked,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects fake setter aliases from stub arrays without push', function rejectsFakeSetterAliases() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const faked = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tconst setters = [];\n\t\tconst setValue = setters.at(-1);\n\t\tsetValue?.(10);\n\t\tsetValue?.(15);\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(faked, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: faked,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects discard-and-substitute record pushes of the source signal', function rejectsSubstitutedRecordPush() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const substituted = adaptedSource.replace(
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(setter);\n\t\t};',
		'const record = function recordSetter(\n\t\t\t_setter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(signal);\n\t\t};',
	);
	assert.notEqual(substituted, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: substituted,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects fixture clicks whose handlers bypass the hook-returned setter', function rejectsDirectSourceClickHandler() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replace(
		'<button id="set" onClick={() => setValue(10)}>set</button>\n\t\t<button id="inc" onClick={() => setValue((previous) => previous + 5)}>inc</button>',
		'<button id="set" onClick={() => props.source(10)}>set</button>\n\t\t<button id="inc" onClick={() => props.source((previous) => previous + 5)}>inc</button>',
	);
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects commented decoy props.record of the useSignal setter', function rejectsCommentedRecordDecoy() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replace(
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(setValue);',
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(props.source);\n\t// props.record(setValue);',
	);
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects record pushes of a no-op in place of the hook setter', function rejectsNoopRecordPush() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const substituted = adaptedSource.replace(
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(setter);\n\t\t};',
		'const record = function recordSetter(\n\t\t\t_setter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(function noop() {});\n\t\t};',
	);
	assert.notEqual(substituted, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: substituted,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects dead props.record of the setter paired with a live source record', function rejectsDeadFixtureRecord() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replace(
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(setValue);',
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(props.source);\n\tif (false) props.record(setValue);',
	);
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects dead record-callback param pushes paired with a live source push', function rejectsDeadRecordParamPush() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const substituted = adaptedSource.replace(
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(setter);\n\t\t};',
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(signal);\n\t\t\tif (false) setters.push(setter);\n\t\t};',
	);
	assert.notEqual(substituted, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: substituted,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects dead case clicks paired with live direct source writes', function rejectsDeadCaseClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tif (false) result.click('#set');\n\t\tif (false) result.click('#inc');\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects uninvoked callback clicks paired with live direct source writes', function rejectsUninvokedCallbackClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tconst sink = function sink(_cb) {};\n\t\tsink(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tsink(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects no-op .then lookalike clicks paired with live direct source writes', function rejectsThenLookalikeClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tconst sink = { then: function then(_callback) {} };\n\t\tsink.then(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tsink.then(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects local no-op act clicks paired with live direct source writes', function rejectsLocalActClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tconst act = function noopAct(_callback) {};\n\t\tact(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tact(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects renamed cleanup-as-act clicks paired with live direct source writes', function rejectsRenamedActImportClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const withImport = adaptedSource.replace(
		"import { describe, expect, it, vi } from 'vitest';",
		"import { describe, expect, it, vi } from 'vitest';\nimport { cleanup as act } from '@testing-library/react';",
	);
	assert.notEqual(withImport, adaptedSource);
	const padded = withImport.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tact(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tact(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, withImport);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects shadowed Promise.resolve clicks paired with live direct source writes', function rejectsShadowedPromiseResolveClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tconst Promise = { resolve() { return { then(_callback) {} }; } };\n\t\tPromise.resolve().then(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tPromise.resolve().then(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects nested-block var Promise.resolve clicks paired with live direct source writes', function rejectsNestedVarPromiseResolveClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tif (true) {\n\t\t\tvar Promise = { resolve() { return { then(_callback) {} }; } };\n\t\t}\n\t\tPromise.resolve().then(function padSet() {\n\t\t\tresult.click('#set');\n\t\t});\n\t\tPromise.resolve().then(function padInc() {\n\t\t\tresult.click('#inc');\n\t\t});\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects enclosing-function var Promise.resolve clicks paired with live direct source writes', function rejectsEnclosingVarPromiseResolveClickPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = adaptedSource.replace(
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tresult.click('#set');\n\t\texpect(countSignal()).toBe(10);\n\t\tresult.click('#inc');\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
		"\tit('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {\n\t\tconst countSignal = createSignal(0);\n\t\tconst result = mount(SetterOnly, { source: countSignal });\n\t\tvar Promise = { resolve() { return { then(_callback) {} }; } };\n\t\tfunction padClicks() {\n\t\t\tPromise.resolve().then(function padSet() {\n\t\t\t\tresult.click('#set');\n\t\t\t});\n\t\t\tPromise.resolve().then(function padInc() {\n\t\t\t\tresult.click('#inc');\n\t\t\t});\n\t\t}\n\t\tpadClicks();\n\t\tcountSignal(10);\n\t\texpect(countSignal()).toBe(10);\n\t\tcountSignal(15);\n\t\texpect(countSignal()).toBe(15);\n\t\tresult.unmount();\n\t});",
	);
	assert.notEqual(padded, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: padded,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects dead while-loop fixture record of the setter', function rejectsDeadWhileLoopFixtureRecord() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replace(
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(setValue);',
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(props.source);\n\twhile (false) props.record(setValue);',
	);
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects dead for-loop incrementor fixture record of the setter', function rejectsDeadForIncrementorFixtureRecord() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const mutated = fixtureSource.replace(
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(setValue);',
		'const [value, setValue] = useSignal(props.source);\n\tprops.record(props.source);\n\tfor (; false; props.record(setValue)) {\n\t\t/* dead */\n\t}',
	);
	assert.notEqual(mutated, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: mutated,
			expectedFixtureSha256: fixtureFileFingerprint(mutated),
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects catch-only record-callback param pushes', function rejectsCatchOnlyRecordParamPush() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const substituted = adaptedSource.replace(
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(setter);\n\t\t};',
		'const record = function recordSetter(\n\t\t\tsetter: (value: number | ((previous: number) => number)) => void,\n\t\t) {\n\t\t\tsetters.push(signal);\n\t\t\ttry {\n\t\t\t\t/* live path */\n\t\t\t} catch {\n\t\t\t\tsetters.push(setter);\n\t\t\t}\n\t\t};',
	);
	assert.notEqual(substituted, adaptedSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource: substituted,
			fixtureSource,
			repoRoot: root,
		});
	}, /bypasses .* hook-surface transition/);
});

test('rejects post-return setter padding in authenticated handlers', function rejectsPostReturnSetterPadding() {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	const padded = fixtureSource.replace(
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t}}',
		'onClick={() => {\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t\treturn;\n\t\t\t\tsetValue((previous) => previous + 1);\n\t\t\t}}',
	);
	assert.notEqual(padded, fixtureSource);
	assert.throws(function run() {
		assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource: padded,
			expectedFixtureSha256: fixtureFileFingerprint(padded),
		});
	}, /bypasses .* hook-surface transition/);
});
