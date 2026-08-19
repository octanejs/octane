import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

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
		return ts.ScriptKind.TSX;
	}
	return ts.ScriptKind.TS;
}

function isExpectRoot(node) {
	return (
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'expect'
	);
}

function outermostExpect(node) {
	let current = node;
	while (
		current.parent &&
		(ts.isPropertyAccessExpression(current.parent) ||
			ts.isCallExpression(current.parent) ||
			ts.isElementAccessExpression(current.parent))
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
		ts.forEachChild(child, visit);
	}
	visit(node);
	return found;
}

function callbackBody(call) {
	for (const argument of call.arguments) {
		if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
			if (ts.isBlock(argument.body)) return argument.body;
			return null;
		}
	}
	return null;
}

function extractAssertionsFrom(node, printer, sourceFile) {
	const groups = [];
	const seen = new Set();
	function visit(child) {
		if (isExpectRoot(child)) {
			const outer = outermostExpect(child);
			if (!seen.has(outer)) {
				seen.add(outer);
				groups.push(
					normalizeAssertionText(printer.printNode(ts.EmitHint.Unspecified, outer, sourceFile)),
				);
			}
			return;
		}
		ts.forEachChild(child, visit);
	}
	visit(node);
	return groups;
}

function isOutermostExpectExpression(node) {
	if (!(
		ts.isCallExpression(node) ||
		ts.isPropertyAccessExpression(node) ||
		ts.isElementAccessExpression(node)
	)) {
		return false;
	}
	let cursor = node;
	while (
		ts.isPropertyAccessExpression(cursor) ||
		ts.isCallExpression(cursor) ||
		ts.isElementAccessExpression(cursor)
	) {
		if (ts.isCallExpression(cursor) && isExpectRoot(cursor)) {
			return outermostExpect(cursor) === node;
		}
		cursor = cursor.expression;
	}
	return false;
}

function unwrapParenthesizedExpressions(node) {
	function visit(current) {
		if (ts.isParenthesizedExpression(current)) {
			return visit(current.expression);
		}
		return ts.visitEachChild(current, visit, undefined);
	}
	return visit(node);
}

function collapseExpectExpressions(node) {
	function visit(current) {
		if (isOutermostExpectExpression(current)) {
			return ts.factory.createIdentifier('__ASSERTION__');
		}
		return ts.visitEachChild(current, visit, undefined);
	}
	return visit(node);
}

function extractScenarioSteps(body, printer, sourceFile) {
	const steps = [];
	for (const statement of body.statements) {
		const node = containsExpect(statement)
			? unwrapParenthesizedExpressions(collapseExpectExpressions(statement))
			: unwrapParenthesizedExpressions(statement);
		let text = normalizeAssertionText(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile));
		if (text === '__ASSERTION__;') text = '__ASSERTION__';
		steps.push(text);
	}
	return steps;
}

function literalTitle(node) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	return null;
}

function isAdaptedCaseCall(expression) {
	return ts.isIdentifier(expression) && expression.text === 'adaptedCase';
}

function isTestCall(expression) {
	return ts.isIdentifier(expression) && (expression.text === 'it' || expression.text === 'test');
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
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const printer = ts.createPrinter({ removeComments: true });
	const cases = [];
	function visit(node) {
		if (ts.isCallExpression(node) && isAdaptedCaseCall(node.expression)) {
			const identity = node.arguments.length > 0 ? literalTitle(node.arguments[0]) : null;
			const body = callbackBody(node);
			if (identity && body) {
				const assertions = extractAssertionsFrom(body, printer, sourceFile);
				const scenarioSteps = extractScenarioSteps(body, printer, sourceFile);
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
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return cases;
}

/**
 * Extract upstream it/test callback ledgers keyed by `file::title`.
 */
export function extractUpstreamCaseLedger(source, relativeFile) {
	const sourceFile = ts.createSourceFile(
		relativeFile,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(relativeFile),
	);
	const printer = ts.createPrinter({ removeComments: true });
	const cases = [];
	function visit(node) {
		if (ts.isCallExpression(node) && isTestCall(node.expression)) {
			const title = node.arguments.length > 0 ? literalTitle(node.arguments[0]) : null;
			const body = callbackBody(node);
			if (title && body) {
				const assertions = extractAssertionsFrom(body, printer, sourceFile);
				const scenarioSteps = extractScenarioSteps(body, printer, sourceFile);
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
		ts.forEachChild(node, visit);
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
	const browserCases = extractAdaptedCaseLedger(browserSource, browserPath).map(
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
		const source = readFileSync(resolve(packageRoot, 'upstream', file), 'utf8');
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
