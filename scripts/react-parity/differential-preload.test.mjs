import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { is, parseSourceFile } from '../octane-tsc/native-syntax.mjs';

import { isVitestLane, requiredExecutableLanes, validateManifest } from './harness-lib.mjs';
import { discoverReactParityManifestPaths } from './vitest-batch-lib.mjs';

const root = resolve(import.meta.dirname, '../..');
const differentialMounts = new Set(['mountDifferential', 'mountStyledDifferential']);
const differentialPreloads = new Set([
	'preloadDifferentialFixture',
	'preloadStyledDifferentialFixture',
]);

function mountIdentity(call, sourceFile) {
	const fixture = call.arguments[0]?.getText(sourceFile);
	const cache = call.arguments[3]?.getText(sourceFile) ?? '';
	return `${fixture}\0${cache}`;
}

function preloadIdentity(call, sourceFile) {
	const fixture = call.arguments[0]?.getText(sourceFile);
	const cache = call.arguments[1]?.getText(sourceFile) ?? '';
	return `${fixture}\0${cache}`;
}

function collectBindingNames(name, bindings) {
	if (is.isIdentifier(name)) {
		bindings.add(name.text);
		return;
	}
	for (const element of name.elements) {
		// TypeScript 7 spells an array-pattern hole as a nameless binding element.
		if (!is.isOmittedExpression(element) && element.name) {
			collectBindingNames(element.name, bindings);
		}
	}
}

function topLevelBindingsBefore(sourceFile, position) {
	const bindings = new Set(['__dirname', '__filename']);
	for (const statement of sourceFile.statements) {
		if (statement.getStart(sourceFile) >= position) break;
		if (is.isImportDeclaration(statement) && statement.importClause) {
			if (statement.importClause.name) bindings.add(statement.importClause.name.text);
			const named = statement.importClause.namedBindings;
			if (named && is.isNamespaceImport(named)) bindings.add(named.name.text);
			if (named && is.isNamedImports(named)) {
				for (const element of named.elements) bindings.add(element.name.text);
			}
		}
		if (is.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				collectBindingNames(declaration.name, bindings);
			}
		}
		if (
			(is.isFunctionDeclaration(statement) || is.isClassDeclaration(statement)) &&
			statement.name
		) {
			bindings.add(statement.name.text);
		}
	}
	return bindings;
}

function usesOnlyTopLevelBindings(expression, sourceFile, position) {
	const bindings = topLevelBindingsBefore(sourceFile, position);
	let valid = true;
	function visit(node) {
		if (
			is.isIdentifier(node) &&
			!(is.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
			!bindings.has(node.text)
		) {
			valid = false;
		}
		node.forEachChild(visit);
	}
	visit(expression);
	return valid;
}

function differentialImportCoverage(source, file = 'differential.test.ts') {
	const sourceFile = parseSourceFile(file, source);
	const mounted = new Set();
	const preloaded = new Set();
	let firstSuitePosition = Infinity;

	function collectMounts(node) {
		if (
			is.isCallExpression(node) &&
			is.isIdentifier(node.expression) &&
			differentialMounts.has(node.expression.text)
		) {
			mounted.add(mountIdentity(node, sourceFile));
		}
		node.forEachChild(collectMounts);
	}

	function collectPreloads(node, statementPosition) {
		if (
			is.isCallExpression(node) &&
			is.isIdentifier(node.expression) &&
			differentialPreloads.has(node.expression.text) &&
			node.arguments.every((argument) =>
				usesOnlyTopLevelBindings(argument, sourceFile, statementPosition),
			)
		) {
			preloaded.add(preloadIdentity(node, sourceFile));
		}
		node.forEachChild(collectPreloads);
	}

	for (const statement of sourceFile.statements) {
		if (
			is.isExpressionStatement(statement) &&
			is.isCallExpression(statement.expression) &&
			((is.isIdentifier(statement.expression.expression) &&
				statement.expression.expression.text === 'describe') ||
				(is.isPropertyAccessExpression(statement.expression.expression) &&
					is.isIdentifier(statement.expression.expression.expression) &&
					statement.expression.expression.expression.text === 'describe'))
		) {
			firstSuitePosition = Math.min(firstSuitePosition, statement.getStart(sourceFile));
		}
		if (
			is.isExpressionStatement(statement) &&
			is.isAwaitExpression(statement.expression) &&
			statement.getStart(sourceFile) < firstSuitePosition
		) {
			collectPreloads(statement, statement.getStart(sourceFile));
		}
	}
	collectMounts(sourceFile);

	return [...mounted].filter((identity) => !preloaded.has(identity));
}

function discoverTestPaths(directory) {
	return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory()) return discoverTestPaths(path);
		return entry.isFile() && path.endsWith('.test.ts') ? [path] : [];
	});
}

test('detects missing and late differential fixture preloads', () => {
	const source = `
const A = 'a';
const B = 'b';
const C = 'c';
const CACHE = 'cache';
await preloadDifferentialFixture(A, CACHE);
await preloadDifferentialFixture(fixture, CACHE);
describe('suite', () => {
  mountDifferential(A, 'A', undefined, CACHE);
  mountDifferential(B, 'B', undefined, CACHE);
  mountDifferential(C, 'C', undefined, CACHE);
  const fixture = 'case-local';
  mountDifferential(fixture, 'local', undefined, CACHE);
});
await preloadDifferentialFixture(C, CACHE);
`;

	assert.deepEqual(differentialImportCoverage(source), [`B\0CACHE`, `C\0CACHE`, `fixture\0CACHE`]);
});

test('required differential fixtures preload every oracle module before timed cases', () => {
	const failures = [];
	let differentialFiles = 0;
	for (const manifestPath of discoverReactParityManifestPaths(root)) {
		const manifest = validateManifest(
			JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')),
		);
		for (const lane of requiredExecutableLanes(manifest).filter(isVitestLane)) {
			for (const file of lane.files.filter((entry) => entry.role === 'test')) {
				const source = readFileSync(resolve(root, file.path), 'utf8');
				if (![...differentialMounts].some((name) => source.includes(name))) continue;
				differentialFiles++;
				const missing = differentialImportCoverage(source, file.path);
				if (missing.length > 0) failures.push(`${file.path}: ${missing.length} fixture(s)`);
			}
		}
	}

	assert.ok(differentialFiles > 0, 'expected required differential evidence files');
	assert.deepEqual(failures, []);
});

test('core and optional differential fixtures preload every oracle module before timed cases', () => {
	const failures = [];
	const differentialFiles = [];
	for (const file of [
		...discoverTestPaths('packages/octane/tests'),
		...discoverTestPaths('packages/tanstack-query/tests'),
	]) {
		const source = readFileSync(resolve(root, file), 'utf8');
		if (![...differentialMounts].some((name) => source.includes(name))) continue;
		differentialFiles.push(file);
		const missing = differentialImportCoverage(source, file);
		if (missing.length > 0) failures.push(`${file}: ${missing.length} fixture(s)`);
	}

	assert.ok(
		differentialFiles.includes('packages/octane/tests/imperative-dom.test.ts'),
		'expected the non-differential core test directory to be covered',
	);
	assert.ok(
		differentialFiles.includes('packages/tanstack-query/tests/differential/parity.test.ts'),
		'expected the optional TanStack Query suite to be covered',
	);
	assert.deepEqual(failures, []);
});
