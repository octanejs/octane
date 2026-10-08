import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { is, parseSourceFile, ScriptKind } from '../octane-tsc/native-syntax.mjs';
import { factory, printNodeWithoutComments, visitEachChild } from './native-typescript-lib.mjs';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

export function normalizeAssertionText(source) {
	return source
		.replace(/"/g, "'")
		.replace(/,(\s*[)}\]])/g, '$1')
		.replace(/\{\s+/g, '{')
		.replace(/\s+\}/g, '}')
		.replace(/\[\s+/g, '[')
		.replace(/\s+\]/g, ']')
		.replace(/\s+\./g, '.')
		.replace(/\s+/g, ' ')
		.trim();
}

function scriptKindFor(fileName) {
	if (fileName.endsWith('.tsrx') || fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
		return ScriptKind.TSX;
	}
	return ScriptKind.TS;
}

function isExpectRoot(node) {
	return (
		is.isCallExpression(node) &&
		is.isIdentifier(node.expression) &&
		node.expression.text === 'expect'
	);
}

function outermostExpect(node) {
	let current = node;
	while (
		current.parent &&
		(is.isPropertyAccessExpression(current.parent) ||
			is.isCallExpression(current.parent) ||
			is.isElementAccessExpression(current.parent))
	) {
		current = current.parent;
	}
	return current;
}

function containsExpect(node) {
	let found = false;
	function visit(child) {
		if (found) return;
		if (isExpectRoot(child)) {
			found = true;
			return;
		}
		child.forEachChild(visit);
	}
	visit(node);
	return found;
}

function callbackBody(call) {
	for (const argument of call.arguments) {
		if (is.isArrowFunction(argument) || is.isFunctionExpression(argument)) {
			if (is.isBlock(argument.body)) return argument.body;
			return null;
		}
	}
	return null;
}

function extractAssertionsFrom(node) {
	const groups = [];
	const seen = new Set();
	function visit(child) {
		if (isExpectRoot(child)) {
			const outer = outermostExpect(child);
			if (!seen.has(outer)) {
				seen.add(outer);
				groups.push(normalizeAssertionText(printNodeWithoutComments(outer)));
			}
			return;
		}
		child.forEachChild(visit);
	}
	visit(node);
	return groups;
}

function isOutermostExpectExpression(node) {
	if (!(
		is.isCallExpression(node) ||
		is.isPropertyAccessExpression(node) ||
		is.isElementAccessExpression(node)
	)) {
		return false;
	}
	let cursor = node;
	while (
		is.isPropertyAccessExpression(cursor) ||
		is.isCallExpression(cursor) ||
		is.isElementAccessExpression(cursor)
	) {
		if (is.isCallExpression(cursor) && isExpectRoot(cursor)) {
			return outermostExpect(cursor) === node;
		}
		cursor = cursor.expression;
	}
	return false;
}

function unwrapParenthesizedExpressions(node) {
	function visit(current) {
		if (is.isParenthesizedExpression(current)) {
			return visit(current.expression);
		}
		return visitEachChild(current, visit);
	}
	return visit(node);
}

function collapseExpectExpressions(node) {
	function visit(current) {
		if (isOutermostExpectExpression(current)) {
			return factory.createIdentifier('__ASSERTION__');
		}
		return visitEachChild(current, visit);
	}
	return visit(node);
}

function extractScenarioSteps(body) {
	const steps = [];
	for (const statement of body.statements) {
		const node = containsExpect(statement)
			? unwrapParenthesizedExpressions(collapseExpectExpressions(statement))
			: unwrapParenthesizedExpressions(statement);
		let text = normalizeAssertionText(printNodeWithoutComments(node));
		if (text === '__ASSERTION__;') text = '__ASSERTION__';
		steps.push(text);
	}
	return steps;
}

function literalTitle(node) {
	if (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) return node.text;
	return null;
}

function isAdaptedCaseCall(expression) {
	return is.isIdentifier(expression) && expression.text === 'adaptedCase';
}

function isTestCall(expression) {
	return is.isIdentifier(expression) && (expression.text === 'it' || expression.text === 'test');
}

function fixtureRefs(steps) {
	const names = [
		'mountDraggable',
		'mountCore',
		'mountBare',
		'mountSvg',
		'mount',
		'withPage',
		'drag',
		'dragBy',
		'mouse',
		'touchEvent',
	];
	const found = new Set();
	for (const step of steps) {
		for (const name of names) {
			if (new RegExp(`\\b${name}\\b`).test(step)) found.add(name);
		}
	}
	return [...found].sort();
}

/**
 * Extract adaptedCase(identity, callback) ledgers. Identity is the upstream citation.
 */
export function extractAdaptedCaseLedger(source, fileName) {
	const sourceFile = parseSourceFile(fileName, source, scriptKindFor(fileName));
	const cases = [];
	function visit(node) {
		if (is.isCallExpression(node) && isAdaptedCaseCall(node.expression)) {
			const identity = node.arguments.length > 0 ? literalTitle(node.arguments[0]) : null;
			const body = callbackBody(node);
			if (identity && body) {
				const assertions = extractAssertionsFrom(body);
				const scenarioSteps = extractScenarioSteps(body);
				cases.push({
					identity,
					citation: identity,
					assertions,
					scenarioSteps,
					fixtures: fixtureRefs(scenarioSteps),
					structureSha256: sha256(
						JSON.stringify({ assertions, scenarioSteps, fixtures: fixtureRefs(scenarioSteps) }),
					),
				});
			}
		}
		node.forEachChild(visit);
	}
	visit(sourceFile);
	return cases;
}

/**
 * Extract it/test callback ledgers whose identity comes from a leading
 * `@parity-case adapted-browser:<identity>` marker comment. The browser lane
 * registers plain `it` cases under those markers rather than adaptedCase calls.
 */
export function extractMarkedCaseLedger(source, fileName) {
	const sourceFile = parseSourceFile(fileName, source, scriptKindFor(fileName));
	const cases = [];
	function visit(node) {
		if (is.isCallExpression(node) && isTestCall(node.expression)) {
			const leading = source.slice(node.getFullStart(), node.getStart(sourceFile));
			const marker = /@parity-case\s+adapted-browser:([^\n]+?)\s*$/m.exec(leading);
			const body = callbackBody(node);
			if (marker && body) {
				const identity = marker[1];
				const assertions = extractAssertionsFrom(body);
				const scenarioSteps = extractScenarioSteps(body);
				cases.push({
					identity,
					citation: identity,
					assertions,
					scenarioSteps,
					fixtures: fixtureRefs(scenarioSteps),
					structureSha256: sha256(
						JSON.stringify({ assertions, scenarioSteps, fixtures: fixtureRefs(scenarioSteps) }),
					),
				});
			}
		}
		node.forEachChild(visit);
	}
	visit(sourceFile);
	return cases;
}

/**
 * Extract upstream it/test callback ledgers keyed by `file::title`.
 */
export function extractUpstreamCaseLedger(source, relativeFile) {
	const sourceFile = parseSourceFile(relativeFile, source, scriptKindFor(relativeFile));
	const cases = [];
	function visit(node) {
		if (is.isCallExpression(node) && isTestCall(node.expression)) {
			const title = node.arguments.length > 0 ? literalTitle(node.arguments[0]) : null;
			const body = callbackBody(node);
			if (title && body) {
				const assertions = extractAssertionsFrom(body);
				const scenarioSteps = extractScenarioSteps(body);
				cases.push({
					identity: `${relativeFile}::${title}`,
					citation: `${relativeFile}::${title}`,
					assertions,
					scenarioSteps,
					fixtures: fixtureRefs(scenarioSteps),
					structureSha256: sha256(
						JSON.stringify({ assertions, scenarioSteps, fixtures: fixtureRefs(scenarioSteps) }),
					),
				});
			}
		}
		node.forEachChild(visit);
	}
	visit(sourceFile);
	return cases;
}

export function buildAdaptedStructureInventory(packageRoot) {
	const publicPath = 'tests/upstream/public-root.test.ts';
	const browserPath = 'tests/browser/parity.browser.test.ts';
	const publicSource = readFileSync(resolve(packageRoot, publicPath), 'utf8');
	const browserSource = readFileSync(resolve(packageRoot, browserPath), 'utf8');
	const publicCases = extractAdaptedCaseLedger(publicSource, publicPath).map(
		function withPath(entry) {
			return { ...entry, path: publicPath };
		},
	);
	const browserCases = extractMarkedCaseLedger(browserSource, browserPath).map(
		function withPath(entry) {
			return { ...entry, path: browserPath };
		},
	);
	return [...publicCases, ...browserCases].sort(function byIdentity(a, b) {
		return a.identity.localeCompare(b.identity);
	});
}

export function buildUpstreamStructureInventory(packageRoot, unitCases, browserCases) {
	const byFile = new Map();
	for (const entry of [...unitCases, ...browserCases]) {
		if (!byFile.has(entry.file)) byFile.set(entry.file, []);
		byFile.get(entry.file).push(entry);
	}
	const ledgers = [];
	for (const [file, cases] of byFile) {
		// Inventory identities keep the historical tag/ prefix; the tag tree
		// itself now lives directly at upstream/.
		const treePath = file.startsWith('tag/') ? file.slice('tag/'.length) : file;
		const source = readFileSync(resolve(packageRoot, 'upstream', treePath), 'utf8');
		const extracted = extractUpstreamCaseLedger(source, file);
		const byTitle = new Map(
			extracted.map(function pair(entry) {
				return [entry.identity.slice(entry.identity.indexOf('::') + 2), entry];
			}),
		);
		for (const upstreamCase of cases) {
			const matched = byTitle.get(upstreamCase.name);
			if (!matched) {
				throw new Error(`upstream case structure missing for ${upstreamCase.id}`);
			}
			ledgers.push({
				...matched,
				upstreamId: upstreamCase.id,
			});
		}
	}
	return ledgers.sort(function byIdentity(a, b) {
		return a.identity.localeCompare(b.identity);
	});
}

export function sameStructureLedgers(actual, expected, label) {
	const actualById = new Map(
		actual.map(function pair(entry) {
			return [entry.identity, entry];
		}),
	);
	const expectedById = new Map(
		expected.map(function pair(entry) {
			return [entry.identity, entry];
		}),
	);
	if (actualById.size !== actual.length) {
		throw new Error(`${label}: duplicate adapted structure identity`);
	}
	for (const identity of expectedById.keys()) {
		if (!actualById.has(identity)) {
			throw new Error(`${label}: missing structure identity ${identity}`);
		}
	}
	for (const identity of actualById.keys()) {
		if (!expectedById.has(identity)) {
			throw new Error(`${label}: unapproved structure identity ${identity}`);
		}
	}
	for (const [identity, expectedEntry] of expectedById) {
		const actualEntry = actualById.get(identity);
		if (actualEntry.structureSha256 !== expectedEntry.structureSha256) {
			throw new Error(`${label}: structure drifted for ${identity}`);
		}
		if (JSON.stringify(actualEntry.assertions) !== JSON.stringify(expectedEntry.assertions)) {
			throw new Error(`${label}: assertions drifted for ${identity}`);
		}
		if (JSON.stringify(actualEntry.scenarioSteps) !== JSON.stringify(expectedEntry.scenarioSteps)) {
			throw new Error(`${label}: scenario steps drifted for ${identity}`);
		}
	}
}
