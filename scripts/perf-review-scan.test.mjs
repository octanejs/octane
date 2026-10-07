import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	checkHotClasses,
	codeOnly,
	formatFindings,
	hotClassFields,
	isScannedFile,
	parseDiff,
	run,
	scanFiles,
} from './perf-review-scan.mjs';

const RUNTIME_SOURCE = new URL('../packages/octane/src/runtime.ts', import.meta.url);

/** Build a one-hunk diff for `file`; lines starting with '+' are added, others are context. */
function diff(file, lines, start = 10) {
	const body = lines.map((line) => (line.startsWith('+') ? line : ' ' + line)).join('\n');
	return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${start},1 +${start},${lines.length} @@\n${body}\n`;
}

function scan(lines, file = 'packages/octane/src/runtime.ts', only = []) {
	return scanFiles(parseDiff(diff(file, lines)), { only }).map((f) => ({
		line: f.line,
		rule: f.rule,
		notes: f.notes,
	}));
}

test('the current client runtime keeps every hot class shape fixed in its constructor', () => {
	assert.deepEqual(checkHotClasses(readFileSync(RUNTIME_SOURCE, 'utf8')), []);
});

test('reports declared-but-unassigned, undeclared, and conditional hot-class fields', () => {
	const source = `
class BlockImpl {
	declare body: unknown;
	declare pending: boolean;
	declare vt: unknown;
	constructor(
		body: unknown,
		flag: boolean,
	) {
		this.body = body;
		if (flag) {
			this.pending = true;
		}
		this.extra = null;
	}
	reset(): void {
		this.late = 1;
	}
}`;
	const messages = checkHotClasses(source).map((f) => f.message);
	assert.equal(messages.length, 3);
	assert.match(messages[0], /BlockImpl\.pending is assigned conditionally/);
	assert.match(messages[1], /declares `vt` but its constructor never assigns it/);
	assert.match(messages[2], /assigns `extra` without a `declare` field/);
});

test('reports runtime class fields on a hot class', () => {
	const source = `
class ScopeImpl {
	declare block: unknown;
	hooks: unknown;
	static shared = 0;
	constructor(block: unknown) {
		this.block = block;
		this.hooks = null;
	}
}`;
	const findings = checkHotClasses(source);
	assert.equal(findings.length, 1);
	assert.match(findings[0].message, /ScopeImpl has runtime class fields \(hooks\)/);
});

test('parses added and context line numbers from a unified diff', () => {
	const files = parseDiff(
		diff('packages/octane/src/a.ts', ['const a = 1;', '+const b = 2;', 'const c = 3;'], 40),
	);
	assert.deepEqual(
		files[0].hunks[0].map((entry) => [entry.kind, entry.line]),
		[
			['ctx', 40],
			['add', 41],
			['ctx', 42],
		],
	);
});

test('scopes to shipped runtime source unless paths are given', () => {
	assert.equal(isScannedFile('packages/octane/src/runtime.ts'), true);
	assert.equal(isScannedFile('packages/octane/src/signals/graph.ts'), true);
	assert.equal(isScannedFile('packages/octane/src/compiler/compile.js'), false);
	assert.equal(isScannedFile('packages/react-query/src/index.ts'), false);
	assert.equal(
		isScannedFile('packages/react-query/src/index.ts', ['packages/react-query/src/']),
		true,
	);
	assert.equal(isScannedFile('packages/octane/tests/runtime.test.ts', ['packages/octane/']), false);
	assert.equal(isScannedFile('packages/octane/src/public-types.d.ts'), false);
});

test('only added lines are candidates', () => {
	assert.deepEqual(scan(['delete block.extra;', '+const x = 1;']), []);
});

test('flags each V8 shape and allocation pattern on added code', () => {
	assert.deepEqual(
		scan([
			'+delete node.key;',
			'+const props = { a, ...(flag ? { b } : {}) };',
			'+const rec = { a, ...(flag && { b }) };',
			'+Object.defineProperty(block, KEY, { value });',
			'+const cells = new Array(size);',
			'+function forward(...rest) {}',
			'+if (arguments.length > 2) return;',
		]).map((f) => [f.line, f.rule]),
		[
			[10, 'delete-operator'],
			[11, 'conditional-shape'],
			[12, 'conditional-shape'],
			[13, 'shape-mutation'],
			[14, 'holey-array'],
			[15, 'rest-or-arguments'],
			[16, 'rest-or-arguments'],
		],
	);
});

test('ignores look-alikes: methods, comments, strings, types, and constants', () => {
	assert.deepEqual(
		scan([
			'+map.delete(key);',
			'+// delete the node, then queueMicrotask(flush) and requestAnimationFrame(x)',
			"+warn('setTimeout(fn, 0) and getBoundingClientRect() are not used here');",
			'+const fallback = { ...(options ?? {}) };',
			'+const step = node?.next ? node.next : null;',
			'+type Handler = (...args: any[]) => any;',
			'+const call = fn as (...args: unknown[]) => void;',
			'+export const EMPTY = /* @__PURE__ */ Object.freeze({});',
			'+const memo = new Array(size).fill(null);',
			'+el.scrollTop = 0;',
			'+const timer = setTimeout(abort, 250);',
			' * delete in a doc comment',
		]),
		[],
	);
});

test('flags layout reads and notes a preceding DOM write in the hunk', () => {
	assert.deepEqual(
		scan([
			'+el.style.width = next + "px";',
			'+const width = el.offsetWidth;',
			'+const rect = other.getBoundingClientRect();',
		]),
		[
			{ line: 11, rule: 'layout-read', notes: ['after the DOM write at line 10'] },
			{ line: 12, rule: 'layout-read', notes: ['after the DOM write at line 10'] },
		],
	);
	assert.deepEqual(scan(['+const h = el.clientHeight;']), [
		{ line: 10, rule: 'layout-read', notes: [] },
	]);
});

test('flags microtask hops, settled awaits, and render requests, noting an enclosing loop', () => {
	assert.deepEqual(
		scan([
			'for (const item of items) {',
			'+	queueMicrotask(() => publish(item));',
			'+	scheduleRender(item.block);',
			'}',
			'+Promise.resolve().then(next);',
			'+await Promise.resolve();',
		]),
		[
			{ line: 11, rule: 'microtask-hop', notes: ['inside the loop at line 10'] },
			{ line: 12, rule: 'schedule-render', notes: ['inside the loop at line 10'] },
			{ line: 14, rule: 'microtask-hop', notes: [] },
			{ line: 15, rule: 'await-as-yield', notes: [] },
		],
	);
	assert.deepEqual(scan(['+function scheduleRender(block: Block): void {']), []);
});

test('flags animation frames and zero-delay task posters, including multi-line calls', () => {
	assert.deepEqual(
		scan([
			'+requestAnimationFrame(() => drain());',
			'+const channel = new MessageChannel();',
			'+setTimeout(retry, 0);',
			'+setTimeout(retry);',
			'+setTimeout(() => {',
			'+	retry();',
			'+}, 0);',
			'+setTimeout(() => {',
			'+	expire();',
			'+}, deadline);',
		]).map((f) => [f.line, f.rule]),
		[
			[10, 'animation-frame'],
			[11, 'task-poster'],
			[12, 'task-poster'],
			[13, 'task-poster'],
			[14, 'task-poster'],
		],
	);
});

test('blanks block comments that span lines', () => {
	const state = { inBlock: false };
	assert.equal(codeOnly('a(); /* delete x', state), 'a(); ');
	assert.equal(codeOnly('still a comment */ b();', state), ' b();');
});

test('text output groups nearby hits of one rule and keeps every line number', () => {
	const findings = scanFiles(
		parseDiff(
			diff('packages/octane/src/universal-core.ts', [
				'+	const a = Object.freeze({ op: 1 });',
				'+	const b = Object.freeze({ op: 2 });',
			]),
		),
	);
	const text = formatFindings(findings);
	assert.match(text, /universal-core\.ts:10 {2}\[shape-mutation\] \(\+1 more: 11\)/);
	assert.match(text, /2 candidate line\(s\): shape-mutation 2/);
	assert.equal(formatFindings([]), 'perf-review-scan: no candidates in the scanned diff.\n');
});

test('flags writes of undeclared fields through Block and Scope receivers', () => {
	const hotFields = new Set(['pending', 'hooks']);
	const findings = scanFiles(
		parseDiff(
			diff('packages/octane/src/runtime.ts', [
				'+block.pending = true;',
				'+scope!.hooks ??= new Map();',
				'+block.lateFlag = 1;',
				'+parentScope.extra = null;',
				'+(b as any).__activitySlot = state;',
				'+(block as Block).pending = false;',
				'+if (block.pending === true) return;',
				'+node.b.extra = 1;',
			]),
		),
		{ hotFields },
	);
	assert.deepEqual(
		findings.map((f) => [f.line, f.rule, f.message.split('`')[1]]),
		[
			[12, 'hot-field-write', 'block.lateFlag'],
			[13, 'hot-field-write', 'parentScope.extra'],
			[14, 'hot-field-write', 'b.__activitySlot'],
		],
	);
	// Signals and the universal renderer own different scope types.
	for (const file of [
		'packages/octane/src/signals/facade.ts',
		'packages/octane/src/universal-core.ts',
	]) {
		assert.deepEqual(
			scanFiles(parseDiff(diff(file, ['+scope.readBarrier = null;'])), { hotFields }),
			[],
		);
	}
});

test('every Block and Scope field write in the current runtime targets a declared field', () => {
	const source = readFileSync(RUNTIME_SOURCE, 'utf8');
	const hotFields = hotClassFields(source);
	assert.ok(hotFields.has('pending') && hotFields.has('slots') && hotFields.has('vt'));
	const lines = source.split('\n').map((line) => '+' + line);
	const findings = scanFiles(parseDiff(diff('packages/octane/src/runtime.ts', lines, 1)), {
		hotFields,
	});
	assert.deepEqual(
		findings.filter((f) => f.rule === 'hot-field-write'),
		[],
	);
});

test('a pasted PR diff may declare hot fields the local checkout does not have yet', () => {
	const file = path.join(mkdtempSync(path.join(tmpdir(), 'perf-review-scan-')), 'pr.diff');
	writeFileSync(
		file,
		diff('packages/octane/src/runtime.ts', [
			'+	declare brandNewField: number;',
			'+	block.brandNewField = 1;',
			'+	block.otherUndeclared = 2;',
		]),
	);
	assert.deepEqual(
		run(['--diff', file]).map((f) => [f.line, f.rule, f.message.split('`')[1]]),
		[[12, 'hot-field-write', 'block.otherUndeclared']],
	);
});

test('--head diffs a branch from where it forked, whatever the checkout is', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'perf-review-head-'));
	const git = (...args) =>
		execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
			cwd: repo,
			encoding: 'utf8',
		});
	const commit = (file, text, message) => {
		mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
		writeFileSync(path.join(repo, file), text);
		git('add', '-A');
		git('commit', '-q', '-m', message);
	};
	git('init', '-q', '-b', 'main');
	commit('packages/octane/src/runtime.ts', 'export {};\n', 'base');
	git('branch', 'old');
	// Main moves on after `old` forked; this commit is not part of `feature`'s change.
	commit('packages/octane/src/main-only.ts', 'delete record.key;\n', 'main');
	git('checkout', '-q', '-b', 'feature');
	commit('packages/octane/src/feature.ts', 'queueMicrotask(next);\n', 'feature');
	git('checkout', '-q', 'old');

	const output = execFileSync(
		process.execPath,
		[
			fileURLToPath(new URL('./perf-review-scan.mjs', import.meta.url)),
			'--head',
			'feature',
			'--json',
		],
		{ cwd: path.join(repo, 'packages'), encoding: 'utf8' },
	);
	assert.deepEqual(
		JSON.parse(output).map((f) => [f.file, f.rule]),
		[['packages/octane/src/feature.ts', 'microtask-hop']],
	);
});
