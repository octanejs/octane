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
			(statement) =>
				ts.isFunctionDeclaration(statement) &&
				statement.body !== undefined &&
				statement.name?.text === name,
		);
		if (declaration !== undefined) return declaration;
		for (const statement of source.statements) {
			if (!ts.isVariableStatement(statement)) continue;
			const value = statement.declarationList.declarations.find(
				(declaration) => declaration.name.getText() === name,
			)?.initializer;
			if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) return value;
		}
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
test('the composed-slot probe names the helper the installed resolver composes paths with', () => {
	const resolver = declaredFunction('resolveCustomSlot');
	assert.ok(resolver, 'client runtime no longer declares resolveCustomSlot');
	assert.ok(
		calledNames(resolver.body).has(COMPOSED_SLOT_HELPER),
		`resolveCustomSlot no longer calls ${COMPOSED_SLOT_HELPER}; update the work probe`,
	);
	const withSlot = declaredFunction('withSlot');
	assert.ok(withSlot, 'client runtime no longer declares withSlot');
	assert.ok(
		withSlot.body.statements.some(
			(statement) =>
				ts.isExpressionStatement(statement) &&
				ts.isBinaryExpression(statement.expression) &&
				statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				statement.expression.left.getText() === 'resolveSlot' &&
				statement.expression.right.getText() === 'resolveCustomSlot',
		),
		'withSlot no longer installs the composed-slot resolver; update the work probe',
	);
});

test('every work metric names a client runtime function', () => {
	for (const metric of WORK_METRICS) {
		assert.ok(declaredFunction(metric), `${metric} is not a client runtime function`);
	}
});
