import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyReactSpringUpstream } from './react-spring-upstream-lib.mjs';

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'react-spring-upstream-'));
	cpSync(new URL('../../packages/spring', import.meta.url), join(root, 'packages/spring'), {
		recursive: true,
	});
	return { root, target: join(root, 'packages/spring/upstream') };
}

test('accepts the pinned byte-exact upstream tree with case-level evidence', () => {
	const { root } = fixture();
	try {
		const result = verifyReactSpringUpstream(root);
		assert.equal(result.files, 167);
		assert.ok(result.pristineCases > 0);
		assert.ok(result.adaptedCases > 0);
		assert.equal(result.caseDispositions, result.pristineCases);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects modified upstream bytes', () => {
	const { root, target } = fixture();
	try {
		writeFileSync(join(target, 'packages/core/src/index.ts'), 'export {}\n');
		assert.throws(() => verifyReactSpringUpstream(root), /vendored byte drift/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects missing upstream evidence', () => {
	const { root, target } = fixture();
	try {
		rmSync(join(target, 'targets/web/src/animated.test.tsx'));
		assert.throws(() => verifyReactSpringUpstream(root), /inventory drifted/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects a pristine identity without a case disposition', () => {
	const { root } = fixture();
	try {
		const path = join(root, 'packages/spring/audit/upstream-case-dispositions.json');
		const dispositions = JSON.parse(readFileSync(path, 'utf8'));
		dispositions.cases = dispositions.cases.slice(1);
		writeFileSync(path, `${JSON.stringify(dispositions, null, 2)}\n`);
		assert.throws(() => verifyReactSpringUpstream(root), /lacks a case disposition/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects adapted disposition pointing at a missing adapted identity', () => {
	const { root } = fixture();
	try {
		const path = join(root, 'packages/spring/audit/upstream-case-dispositions.json');
		const dispositions = JSON.parse(readFileSync(path, 'utf8'));
		const adapted = dispositions.cases.find(function findAdapted(entry) {
			return entry.disposition === 'adapted';
		});
		assert.ok(adapted);
		adapted.adaptedFullName = 'this adapted title does not exist';
		writeFileSync(path, `${JSON.stringify(dispositions, null, 2)}\n`);
		assert.throws(() => verifyReactSpringUpstream(root), /missing adapted inventory identity/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects adapted evidence without Per provenance', () => {
	const { root } = fixture();
	try {
		const path = join(root, 'packages/spring/tests/upstream/helpers.test.ts');
		const sourceText = readFileSync(path, 'utf8').replaceAll(/^\s*\/\/ Per .+\n/gm, '');
		writeFileSync(path, sourceText);
		assert.throws(() => verifyReactSpringUpstream(root), /lacks \/\/ Per provenance/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects skipped adapted cases', () => {
	const { root } = fixture();
	try {
		const path = join(root, 'packages/spring/tests/upstream/helpers.test.ts');
		const sourceText = readFileSync(path, 'utf8').replace('it(', 'it.skip(');
		writeFileSync(path, sourceText);
		assert.throws(() => verifyReactSpringUpstream(root), /contains skipped cases/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('rejects React imports in published source', () => {
	const { root } = fixture();
	try {
		writeFileSync(
			join(root, 'packages/spring/src/leak.ts'),
			"import React from 'react'\nexport const x = React\n",
		);
		assert.throws(() => verifyReactSpringUpstream(root), /React import leaked/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
