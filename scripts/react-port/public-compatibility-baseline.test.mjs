import assert from 'node:assert/strict';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	realpathSync,
	symlinkSync,
	unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readCompatibilityBaseline } from './pinned-public-types.mjs';

function fixture(t) {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'public-baseline-')));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const node = {
		binding: '@octanejs/widget',
		bindingDirectory: 'packages/widget',
		action: 'extend-binding',
	};
	const files = {
		'package.json': JSON.stringify({
			name: node.binding,
			exports: { '.': { types: './src/index.ts' } },
		}),
		'src/index.ts': 'export type ExistingValue = { value: string };',
	};
	const baseline = {};
	const records = [];
	const put = (file, content) => {
		const target = path.join(root, file);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content);
	};
	for (const [file, content] of Object.entries(files)) {
		const sha256 = createHash('sha256').update(content).digest('hex');
		baseline[node.bindingDirectory + '/' + file] = sha256;
		records.push({ path: file, sha256 });
		put('upstream-artifact/previous-binding/' + file, content);
	}
	put(
		'audit/compatibility-baseline.json',
		JSON.stringify({
			schemaVersion: 1,
			repository: 'https://github.com/octanejs/octane.git',
			commit: 'a'.repeat(40),
			binding: node.binding,
			sourceRoot: 'upstream-artifact/previous-binding',
			files: records,
		}),
	);
	return { root, node, baseline, put, records };
}
test('retained exports use the exact preflight source, including additional entrypoints', (t) => {
	const f = fixture(t);
	assert.equal(
		readCompatibilityBaseline(f.root, f.node, f.baseline).get('@octanejs/widget'),
		path.join(f.root, 'upstream-artifact/previous-binding/src/index.ts'),
	);
});
test('a local widening cannot replace the recorded compatibility source', (t) => {
	const f = fixture(t);
	f.put('upstream-artifact/previous-binding/src/index.ts', 'export type ExistingValue = any;');
	assert.throws(() => readCompatibilityBaseline(f.root, f.node, f.baseline), /baseline.*differ/i);
});
test('a fabricated compatibility hash cannot replace the preflight receipt', (t) => {
	const f = fixture(t);
	f.baseline['packages/widget/src/index.ts'] = '0'.repeat(64);
	assert.throws(() => readCompatibilityBaseline(f.root, f.node, f.baseline), /preflight/i);
});
test('missing original source cannot narrow the compatibility witness', (t) => {
	const f = fixture(t);
	f.baseline['packages/widget/src/other.ts'] = 'f'.repeat(64);
	assert.throws(() => readCompatibilityBaseline(f.root, f.node, f.baseline), /complete/i);
});
test('compatibility evidence cannot be used without the recorded baseline', (t) => {
	const f = fixture(t);
	assert.throws(() => readCompatibilityBaseline(f.root, f.node), /preflight/i);
});

test('a symlink cannot substitute identical bytes outside the witnessed tree', (t) => {
	const f = fixture(t);
	const source = f.root + '/upstream-artifact/previous-binding/src/index.ts';
	f.put('outside.ts', 'export type ExistingValue = { value: string };');
	unlinkSync(source);
	symlinkSync(f.root + '/outside.ts', source);
	assert.throws(() => readCompatibilityBaseline(f.root, f.node, f.baseline), /baseline.*differ/i);
});
