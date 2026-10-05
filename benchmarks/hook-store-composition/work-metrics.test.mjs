import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMPOSED_SLOT_HELPER, WORK_METRICS } from './work-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(ROOT, 'packages/octane/package.json'))('typescript');
const RUNTIME_SOURCES = ['runtime.ts', 'hook-slot-cache.ts'].map((file) => {
	const filename = path.join(ROOT, 'packages/octane/src', file);
	return ts.createSourceFile(
		filename,
		fs.readFileSync(filename, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
});

function declaredFunction(name) {
	for (const source of RUNTIME_SOURCES) {
		const declaration = source.statements.find(
			(statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
		);
		if (declaration !== undefined) return declaration;
	}
	return undefined;
}

function calledNames(node, names = new Set()) {
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		names.add(node.expression.text);
	}
	ts.forEachChild(node, (child) => {
		calledNames(child, names);
	});
	return names;
}

// The callback-nested work gate requires nonzero composed-slot calls. If the
// runtime moves path composition to another helper, the old name still counts
// zero in the browser and the weekly bench fails with no composed-slot coverage.
test('the composed-slot probe names the helper resolveSlot composes paths with', () => {
	const resolveSlot = declaredFunction('resolveSlot');
	assert.ok(resolveSlot, 'client runtime no longer declares resolveSlot');
	assert.ok(
		calledNames(resolveSlot.body).has(COMPOSED_SLOT_HELPER),
		`resolveSlot no longer calls ${COMPOSED_SLOT_HELPER}; point the work probe at its composed-path helper`,
	);
});

test('every work metric names a client runtime function', () => {
	for (const metric of WORK_METRICS) {
		assert.ok(declaredFunction(metric), `${metric} is not a client runtime function`);
	}
});
