import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const UPSTREAM_TEST_ROOT = 'packages/resizable-panels/upstream/lib';
const PORTED_TEST_ROOT = 'packages/resizable-panels/tests/upstream';
const TEST_INVENTORY_PATH = 'packages/resizable-panels/audit/test-inventory.json';
const RUNTIME_PARITY_CONFIG = 'packages/resizable-panels/audit/runtime-parity.json';
const PRISTINE_RUNTIME_PATH = 'packages/resizable-panels/audit/pristine-runtime.json';
const ADAPTED_RUNTIME_PATH = 'packages/resizable-panels/audit/adapted-runtime.json';
const REACT_PARITY_MANIFEST = 'packages/resizable-panels/audit/react-parity.json';

function filesBelow(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			return entry.isFile();
		})
		.map(function toAbsolute(entry) {
			return resolve(entry.parentPath ?? entry.path, entry.name);
		})
		.sort();
}

function portableRelative(root, file) {
	return relative(root, file).split(sep).join('/');
}

export function adaptedRelativePath(upstreamRelative) {
	return upstreamRelative;
}

export function mapPristineFileToAdapted(pristineFile) {
	const prefix = `${UPSTREAM_TEST_ROOT}/`;
	if (!pristineFile.startsWith(prefix)) {
		throw new Error(`pristine runtime file is outside upstream root: ${pristineFile}`);
	}
	return `${PORTED_TEST_ROOT}/${adaptedRelativePath(pristineFile.slice(prefix.length))}`;
}

function scriptKindFor(fileName) {
	return fileName.endsWith('.tsrx') || fileName.endsWith('.tsx')
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
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

function literalTitle(node) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	return null;
}

function registrarTitle(call) {
	if (call.arguments.length === 0) return null;
	return literalTitle(call.arguments[0]);
}

function isDescribeCall(expression) {
	return ts.isIdentifier(expression) && expression.text === 'describe';
}

function isTestCall(expression) {
	return ts.isIdentifier(expression) && (expression.text === 'it' || expression.text === 'test');
}

function isTestEachCall(expression) {
	return (
		ts.isCallExpression(expression) &&
		ts.isPropertyAccessExpression(expression.expression) &&
		ts.isIdentifier(expression.expression.expression) &&
		(expression.expression.expression.text === 'it' ||
			expression.expression.expression.text === 'test') &&
		expression.expression.name.text === 'each'
	);
}

function eachTableText(eachCall, printer, sourceFile) {
	if (eachCall.arguments.length === 0) return null;
	return normalizeAssertionText(
		printer.printNode(ts.EmitHint.Unspecified, eachCall.arguments[0], sourceFile),
	);
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
	// Preserve enclosing control-flow and table data (forEach/for/... blocks).
	// Collapse only outermost expect(...) chains; assertion text is compared
	// separately via extractAssertionsFrom.
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
		// Pure assertion statements stay the historical sentinel so divergence
		// transforms that key on '__ASSERTION__' keep matching.
		if (text === '__ASSERTION__;') text = '__ASSERTION__';
		steps.push(text);
	}
	return steps;
}

/**
 * Source-level case ledger keyed by Vitest-style full names (describe hierarchy + title).
 * Assertions and surrounding scenario steps are recorded per case so hierarchy drift,
 * moved assertions, and interaction-to-state-mutation edits fail closed.
 */
export function extractCaseLedger(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const printer = ts.createPrinter({ removeComments: true });
	const cases = [];
	const occurrenceCounts = new Map();

	function recordCase(stack, title, body, parameterization) {
		const fullName = [...stack, title].join(' ');
		const occurrenceKey = fullName;
		const occurrence = occurrenceCounts.get(occurrenceKey) ?? 0;
		occurrenceCounts.set(occurrenceKey, occurrence + 1);
		cases.push({
			fullName,
			title,
			occurrence,
			parameterization: parameterization ?? null,
			assertions: extractAssertionsFrom(body, printer, sourceFile),
			scenarioSteps: extractScenarioSteps(body, printer, sourceFile),
		});
	}

	function visit(node, stack) {
		if (ts.isCallExpression(node)) {
			const title = registrarTitle(node);
			const body = callbackBody(node);
			if (title !== null && body) {
				if (isDescribeCall(node.expression)) {
					ts.forEachChild(body, function visitDescribeChild(child) {
						visit(child, [...stack, title]);
					});
					return;
				}
				if (isTestCall(node.expression)) {
					recordCase(stack, title, body, null);
					return;
				}
				if (isTestEachCall(node.expression)) {
					const table = eachTableText(node.expression, printer, sourceFile);
					if (table === null) {
						throw new Error(`${fileName}: test.each/it.each registration is missing a data table`);
					}
					recordCase(stack, title, body, { kind: 'test.each', table: table });
					return;
				}
			}
		}
		ts.forEachChild(node, function visitChild(child) {
			visit(child, stack);
		});
	}

	visit(sourceFile, []);
	return cases;
}

/** @deprecated Prefer extractCaseLedger; retained for narrow assertion-only probes. */
export function extractAssertionGroups(source, fileName) {
	return extractCaseLedger(source, fileName).flatMap(function assertionsOf(entry) {
		return entry.assertions;
	});
}

function applyJestDomAttributeTransform(text) {
	const withValue = text.replace(
		/expect\((.+?)\)\.toHaveAttribute\('([^']+)',\s*'([^']*)'\)/g,
		"expect($1.getAttribute('$2')).toBe('$3')",
	);
	const bare = withValue.replace(
		/expect\((.+?)\)\.toHaveAttribute\('([^']+)'\)/g,
		"expect($1.hasAttribute('$2')).toBe(true)",
	);
	return normalizeAssertionText(bare);
}

function applyCssomZeroTransform(text) {
	return normalizeAssertionText(
		text.replace(/\.style\.(minHeight|minWidth)\)\.toBe\('0'\)/g, ".style.$1).toBe('0px')"),
	);
}

function replaceExact(groups, from, to) {
	const fromNormalized = from.map(normalizeAssertionText);
	const toNormalized = to.map(normalizeAssertionText);
	const next = [...groups];
	for (let index = 0; index <= next.length - fromNormalized.length; index++) {
		if (
			fromNormalized.every(function matches(group, offset) {
				return next[index + offset] === group;
			})
		) {
			next.splice(index, fromNormalized.length, ...toNormalized);
			return next;
		}
	}
	throw new Error(
		`failed to locate permitted assertion transform sequence:\n${fromNormalized.join('\n')}`,
	);
}

function transformCaseAssertions(upstreamRelative, fullName, assertions) {
	let next = assertions.map(applyJestDomAttributeTransform);
	if (upstreamRelative === 'components/group/Group.test.tsx') {
		if (fullName.includes('duplicate panel ids')) {
			next = replaceExact(
				next,
				[
					"expect(() => render(<Group> <Panel id='foo'/> <Panel id='foo'/> </Group>)).toThrow('Panel ids must be unique; id 'foo' was used more than once')",
				],
				[
					"expect(captureLayoutEffectError(() => render(<Group> <Panel id='foo'/> <Panel id='foo'/> </Group>), 'Panel ids must be unique; id 'foo' was used more than once')).toBe(true)",
				],
			);
		}
		if (fullName.includes('duplicate separator ids')) {
			next = replaceExact(
				next,
				[
					"expect(() => render(<Group> <Panel id='left'/> <Separator id='foo'/> <Panel id='center'/> <Separator id='foo'/> <Panel id='right'/> </Group>)).toThrow('Separator ids must be unique; id 'foo' was used more than once')",
				],
				[
					"expect(captureLayoutEffectError(() => render(<Group> <Panel id='left'/> <Separator id='foo'/> <Panel id='center'/> <Separator id='foo'/> <Panel id='right'/> </Group>), 'Separator ids must be unique; id 'foo' was used more than once')).toBe(true)",
				],
			);
		}
	}
	if (upstreamRelative === 'components/panel/Panel.test.tsx') {
		if (
			next.some(function hasProfiler(group) {
				return group.includes('onGroupRender') || group.includes('onPanelRender');
			})
		) {
			next = replaceExact(
				next,
				[
					'expect(onGroupRender).toBeCalled()',
					'expect(onPanelRender).toBeCalled()',
					'expect(onPanelChildrenRender).toBeCalled()',
					'expect(onGroupRender).toBeCalledTimes(1)',
					'expect(onPanelRender).toBeCalled()',
					'expect(onPanelChildrenRender).not.toBeCalled()',
				],
				[
					'expect(onPanelChildrenRender).toBeCalled()',
					'expect(onPanelChildrenRender).not.toBeCalled()',
				],
			);
		}
		next = next.map(applyCssomZeroTransform);
	}
	return next;
}

const PANEL_MEMOIZATION_FULL_NAME =
	'Panel memoization Panels contents should not re-render on Group layout change';

const PANEL_MEMOIZATION_ADAPTED_STEPS = [
	'const onPanelChildrenRender = vi.fn();',
	'const groupRef = createRef<GroupImperativeHandle>();',
	'function Child() {onPanelChildrenRender(); return <div />;}',
	'setDefaultElementBounds(new DOMRect(0, 0, 100, 50));',
	"render(<Group groupRef={groupRef}> <Panel id='left'/> <Panel id='right'> <Child /> </Panel> </Group>);",
	'__ASSERTION__',
	'onPanelChildrenRender.mockReset();',
	'const api = groupRef.current;',
	'assert(api);',
	'act(() => {api.setLayout({left: 25, right: 75});});',
	'__ASSERTION__',
];

function transformCaseScenarioSteps(upstreamRelative, fullName, steps) {
	if (
		upstreamRelative === 'components/panel/Panel.test.tsx' &&
		fullName === PANEL_MEMOIZATION_FULL_NAME
	) {
		return [...PANEL_MEMOIZATION_ADAPTED_STEPS];
	}
	return steps.map(function transformStep(step) {
		if (step === '__ASSERTION__') return step;
		let next = applyJestDomAttributeTransform(step);
		if (upstreamRelative === 'components/panel/Panel.test.tsx') {
			next = applyCssomZeroTransform(next);
		}
		if (upstreamRelative === 'hooks/useMergedRefs.test.tsx') {
			next = next.replace(
				'const refObject = createRef<HTMLDivElement | null>();',
				'const refObject: {current: HTMLDivElement | null;} = {current: null};',
			);
		}
		return next;
	});
}

export function expectedAdaptedCaseLedger(upstreamRelative, upstreamSource) {
	return extractCaseLedger(upstreamSource, upstreamRelative).map(function transformCase(entry) {
		return {
			fullName: entry.fullName,
			title: entry.title,
			occurrence: entry.occurrence,
			parameterization: entry.parameterization,
			assertions: transformCaseAssertions(upstreamRelative, entry.fullName, entry.assertions),
			scenarioSteps: transformCaseScenarioSteps(
				upstreamRelative,
				entry.fullName,
				entry.scenarioSteps,
			),
		};
	});
}

const USE_ID_FALLBACK_FULL_NAME = 'useId should fallback ot React useId';
const USE_ID_FALLBACK_UPSTREAM_ASSERTION = "expect(result.current).toBe(':r123:')";
const USE_ID_FALLBACK_ADAPTED_ASSERTIONS = [
	'expect(result.current).toEqual(expect.any(String))',
	'expect(result.current.length).toBeGreaterThan(0)',
];

/**
 * Apply only the known useId mock/exact-id divergence transform. Unrelated
 * assertions and scenario steps continue to be compared against the adapted case.
 */
export function applyUseIdFallbackDivergence(entry) {
	if (entry.fullName !== USE_ID_FALLBACK_FULL_NAME) {
		throw new Error(`no divergence-specific transform for case "${entry.fullName}"`);
	}
	const assertions = [];
	let expandedExactId = false;
	for (const assertion of entry.assertions) {
		if (assertion === USE_ID_FALLBACK_UPSTREAM_ASSERTION) {
			assertions.push(...USE_ID_FALLBACK_ADAPTED_ASSERTIONS);
			expandedExactId = true;
			continue;
		}
		assertions.push(assertion);
	}
	if (!expandedExactId) {
		throw new Error(
			`useId fallback divergence expected upstream assertion ${USE_ID_FALLBACK_UPSTREAM_ASSERTION}`,
		);
	}
	const scenarioSteps = [];
	let insertedExtraAssertion = false;
	for (const step of entry.scenarioSteps) {
		if (step.includes('vi.mock')) continue;
		scenarioSteps.push(step);
		if (step === '__ASSERTION__' && !insertedExtraAssertion) {
			scenarioSteps.push('__ASSERTION__');
			insertedExtraAssertion = true;
		}
	}
	return {
		fullName: entry.fullName,
		title: entry.title,
		occurrence: entry.occurrence,
		parameterization: entry.parameterization,
		assertions: assertions,
		scenarioSteps: scenarioSteps,
	};
}

export function expectedAdaptedAssertionGroups(upstreamRelative, upstreamSource) {
	return expectedAdaptedCaseLedger(upstreamRelative, upstreamSource).flatMap(
		function assertionsOf(entry) {
			return entry.assertions;
		},
	);
}

function identityKey(file, fullName, occurrence) {
	return `${file}\0${fullName}\0${occurrence}`;
}

export function runtimeIdentityMultiset(inventory, mapFile) {
	const counts = new Map();
	const occurrences = new Map();
	for (const testCase of inventory.tests) {
		const file = mapFile(testCase.file);
		const occurrenceKey = `${file}\0${testCase.fullName}`;
		const occurrence = occurrences.get(occurrenceKey) ?? 0;
		occurrences.set(occurrenceKey, occurrence + 1);
		const key = identityKey(file, testCase.fullName, occurrence);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

export function compareRuntimeIdentityMultisets(expected, actual) {
	const missing = [];
	const unexpected = [];
	for (const [key, count] of expected) {
		const actualCount = actual.get(key) ?? 0;
		if (actualCount < count) missing.push(key);
	}
	for (const [key, count] of actual) {
		const expectedCount = expected.get(key) ?? 0;
		if (count > expectedCount) unexpected.push(key);
	}
	return { missing: missing.sort(), unexpected: unexpected.sort() };
}

function divergedCaseIds(repoRoot) {
	const manifest = JSON.parse(readFileSync(resolve(repoRoot, REACT_PARITY_MANIFEST), 'utf8'));
	const ids = new Set();
	for (const divergence of manifest.divergences ?? []) {
		for (const caseId of divergence.caseIds ?? []) ids.add(caseId);
	}
	return ids;
}

function adaptedRuntimeCaseIdByFullName(repoRoot, adaptedFile, fullName, occurrence) {
	const inventory = JSON.parse(readFileSync(resolve(repoRoot, ADAPTED_RUNTIME_PATH), 'utf8'));
	let seen = 0;
	for (const testCase of inventory.tests) {
		if (testCase.file !== adaptedFile || testCase.fullName !== fullName) continue;
		if (seen === occurrence) return testCase.id;
		seen += 1;
	}
	return null;
}

function ledgerByKey(ledger) {
	const map = new Map();
	for (const entry of ledger) {
		map.set(identityKey('', entry.fullName, entry.occurrence), entry);
	}
	return map;
}

export function renderReactResizablePanelsAdaptedInventory(repoRoot) {
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	return `${filesBelow(portedRoot)
		.map(function lineFor(file) {
			const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
			return `${digest}  ${portableRelative(portedRoot, file)}`;
		})
		.join('\n')}\n`;
}

/**
 * Support fixtures under tests/upstream that are not case-ledger artifacts.
 * Mapped files are compared to upstream after declared import rewrites; the
 * authored user-event helper is checked for its pointer/type export contract
 * plus reachable act-wrapped construction→dispatchEvent dataflow.
 */
const SUPPORT_FILE_CONTRACTS = [
	{
		kind: 'mapped',
		upstreamRelative: 'global/test/mockPointerEvent.ts',
		adaptedRelative: 'global/test/mockPointerEvent.ts',
	},
	{
		kind: 'mapped',
		upstreamRelative: 'utils/test/mockGetComputedStyle.ts',
		adaptedRelative: 'utils/test/mockGetComputedStyle.ts',
	},
	{
		kind: 'mapped',
		upstreamRelative: 'utils/test/mockResizeObserver.ts',
		adaptedRelative: 'utils/test/mockResizeObserver.ts',
	},
	{
		kind: 'mapped',
		upstreamRelative: 'utils/test/mockBoundingClientRect.ts',
		adaptedRelative: 'utils/test/mockBoundingClientRect.ts',
	},
	{
		kind: 'mapped',
		upstreamRelative: 'global/test/mockGroup.ts',
		adaptedRelative: 'global/test/mockGroup.ts',
		importRewrites: new Map([
			['../../components/group/types', '#rrp-group-types'],
			['../../components/panel/types', '#rrp-panel-types'],
			['../../components/separator/types', '#rrp-separator-types'],
			['../../../../src/components/group/types', '#rrp-group-types'],
			['../../../../src/components/panel/types', '#rrp-panel-types'],
			['../../../../src/components/separator/types', '#rrp-separator-types'],
		]),
	},
	{
		kind: 'mapped',
		upstreamRelative: 'global/test/moveSeparator.ts',
		adaptedRelative: 'global/test/moveSeparator.ts',
		importRewrites: new Map([
			['@testing-library/user-event', '#rrp-user-event'],
			['../../../support/userEvent', '#rrp-user-event'],
			['node:assert', '#rrp-assert'],
			['../../../../src/utils/assert', '#rrp-assert'],
		]),
		normalizeAssertImport: true,
	},
	{
		kind: 'authored-user-event',
		adaptedRelative: '../support/userEvent.ts',
	},
];

function normalizeSupportImportClause(statement, normalizeAssertImport) {
	if (!normalizeAssertImport || !ts.isStringLiteral(statement.moduleSpecifier)) {
		return statement;
	}
	if (statement.moduleSpecifier.text !== '#rrp-assert') return statement;
	// Upstream uses default import; adapted uses a named binding from the package assert.
	return ts.factory.updateImportDeclaration(
		statement,
		statement.modifiers,
		ts.factory.createImportClause(false, ts.factory.createIdentifier('assert'), undefined),
		ts.factory.createStringLiteral('#rrp-assert'),
		statement.attributes,
	);
}

export function structuralSupportSource(source, fileName, options = {}) {
	const importRewrites = options.importRewrites ?? new Map();
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const parts = [];
	for (const statement of sourceFile.statements) {
		let next = unwrapParenthesizedExpressions(statement);
		if (ts.isImportDeclaration(next) && ts.isStringLiteral(next.moduleSpecifier)) {
			const specifier = next.moduleSpecifier.text;
			const rewritten = importRewrites.get(specifier) ?? specifier;
			if (rewritten !== specifier) {
				next = ts.factory.updateImportDeclaration(
					next,
					next.modifiers,
					next.importClause,
					ts.factory.createStringLiteral(rewritten),
					next.attributes,
				);
			}
			next = normalizeSupportImportClause(next, options.normalizeAssertImport === true);
		}
		parts.push(
			normalizeAssertionText(printer.printNode(ts.EmitHint.Unspecified, next, sourceFile)),
		);
	}
	return parts.join('\n');
}

function authoredUserEventExports(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const names = new Set();
	for (const statement of sourceFile.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name) {
			names.add(statement.name.text);
		}
		if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
		const expr = statement.expression;
		if (!ts.isObjectLiteralExpression(expr)) {
			throw new Error(`${fileName}: authored user-event default export must be an object literal`);
		}
		for (const prop of expr.properties) {
			if (ts.isShorthandPropertyAssignment(prop)) {
				names.add(prop.name.text);
				continue;
			}
			if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
				names.add(prop.name.text);
			}
		}
	}
	return [...names].sort();
}

export function verifyReactResizablePanelsSupportFiles(repoRoot) {
	const upstreamRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	const declaredAdapted = new Set();
	for (const contract of SUPPORT_FILE_CONTRACTS) {
		declaredAdapted.add(contract.adaptedRelative);
		const adaptedPath = resolve(portedRoot, contract.adaptedRelative);
		const adaptedSource = readFileSync(adaptedPath, 'utf8');
		if (contract.kind === 'authored-user-event') {
			const exports = authoredUserEventExports(adaptedSource, contract.adaptedRelative);
			if (!exports.includes('pointer') || !exports.includes('type')) {
				throw new Error(
					`${contract.adaptedRelative}: authored user-event helper must export pointer and type`,
				);
			}
			const structural = structuralSupportSource(adaptedSource, contract.adaptedRelative, {});
			const digest = createHash('sha256').update(structural).digest('hex');
			const runtimeParity = JSON.parse(
				readFileSync(resolve(repoRoot, RUNTIME_PARITY_CONFIG), 'utf8'),
			);
			const lock = (runtimeParity.authoredSupportLocks ?? []).find(function findLock(entry) {
				return entry.path === contract.adaptedRelative;
			});
			if (!lock || typeof lock.structuralSha256 !== 'string') {
				throw new Error(
					`${contract.adaptedRelative}: runtime-parity.json must lock authoredSupportLocks.structuralSha256`,
				);
			}
			if (lock.structuralSha256 !== digest) {
				throw new Error(
					`${contract.adaptedRelative}: authored support helper behavior drifted from structural lock`,
				);
			}
			continue;
		}
		const upstreamSource = readFileSync(resolve(upstreamRoot, contract.upstreamRelative), 'utf8');
		const expected = structuralSupportSource(upstreamSource, contract.upstreamRelative, {
			importRewrites: contract.importRewrites,
			normalizeAssertImport: contract.normalizeAssertImport,
		});
		const actual = structuralSupportSource(adaptedSource, contract.adaptedRelative, {
			importRewrites: contract.importRewrites,
			normalizeAssertImport: contract.normalizeAssertImport,
		});
		if (expected !== actual) {
			throw new Error(
				`${contract.adaptedRelative}: support fixture drifted from upstream after declared helper transformations`,
			);
		}
	}

	// Every non-test adapted file must be covered by a support contract or the
	// case-ledger inventory (test files). Fail closed on undeclared helpers.
	for (const file of filesBelow(portedRoot)) {
		const relative = portableRelative(portedRoot, file);
		if (/\.test\.(ts|tsrx|tsx)$/.test(relative)) continue;
		if (!declaredAdapted.has(relative)) {
			throw new Error(`${relative}: adapted support fixture has no declared support-file mapping`);
		}
	}
	return { supportFiles: SUPPORT_FILE_CONTRACTS.length };
}

export function verifyReactResizablePanelsUpstream(repoRoot) {
	const inventory = JSON.parse(readFileSync(resolve(repoRoot, TEST_INVENTORY_PATH), 'utf8'));
	const runtimeParity = JSON.parse(readFileSync(resolve(repoRoot, RUNTIME_PARITY_CONFIG), 'utf8'));
	if (!Array.isArray(runtimeParity.permittedTransformations)) {
		throw new Error('runtime-parity.json must declare permittedTransformations');
	}
	if (
		runtimeParity.permittedTransformations.some(function isUseIdFallback(entry) {
			return entry.kind === 'useId-fallback';
		})
	) {
		throw new Error(
			'useId fallback weakening is a recorded divergence, not a permittedTransformations entry',
		);
	}

	const pristineRuntime = JSON.parse(
		readFileSync(resolve(repoRoot, PRISTINE_RUNTIME_PATH), 'utf8'),
	);
	const adaptedRuntime = JSON.parse(readFileSync(resolve(repoRoot, ADAPTED_RUNTIME_PATH), 'utf8'));
	const expectedIdentities = runtimeIdentityMultiset(pristineRuntime, mapPristineFileToAdapted);
	const actualIdentities = runtimeIdentityMultiset(adaptedRuntime, function identity(file) {
		return file;
	});
	const identityDiff = compareRuntimeIdentityMultisets(expectedIdentities, actualIdentities);
	if (identityDiff.missing.length > 0 || identityDiff.unexpected.length > 0) {
		throw new Error(
			`pristine-runtime.json and adapted-runtime.json full-name crosswalk drifted after path mapping\nmissing: ${identityDiff.missing.join('\n')}\nunexpected: ${identityDiff.unexpected.join('\n')}`,
		);
	}

	const upstreamRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const portedRoot = resolve(repoRoot, PORTED_TEST_ROOT);
	const diverged = divergedCaseIds(repoRoot);
	let upstreamCases = 0;
	let portedCases = 0;
	let assertionGroups = 0;

	for (const artifact of inventory.artifacts) {
		if (artifact.disposition !== 'adapted') {
			throw new Error(`${artifact.path}: upstream artifact must be adapted`);
		}
		const adaptedRelative = adaptedRelativePath(artifact.path);
		const expectedAdaptedPath = `tests/upstream/${adaptedRelative}`;
		if (artifact.adaptedPath !== expectedAdaptedPath) {
			throw new Error(
				`${artifact.path}: adaptedPath must be ${expectedAdaptedPath}, got ${artifact.adaptedPath}`,
			);
		}
		const adaptedFile = `${PORTED_TEST_ROOT}/${adaptedRelative}`;
		const upstreamSource = readFileSync(resolve(upstreamRoot, artifact.path), 'utf8');
		const portedSource = readFileSync(resolve(portedRoot, adaptedRelative), 'utf8');
		if (/\b(?:it|test|describe)\.(?:skip|todo|only|failing)\b/.test(portedSource)) {
			throw new Error(
				`${adaptedRelative}: adapted upstream tests must execute without focused, failing, skip, or todo markers`,
			);
		}

		const expectedLedger = expectedAdaptedCaseLedger(artifact.path, upstreamSource);
		const actualLedger = extractCaseLedger(portedSource, adaptedRelative);
		if (expectedLedger.length !== actualLedger.length) {
			throw new Error(
				`${adaptedRelative}: case count drifted from pristine (${expectedLedger.length} vs ${actualLedger.length})`,
			);
		}

		const expectedMap = ledgerByKey(expectedLedger);
		const actualMap = ledgerByKey(actualLedger);
		for (const [key, expectedCase] of expectedMap) {
			const actualCase = actualMap.get(key);
			if (!actualCase) {
				throw new Error(
					`${adaptedRelative}: missing adapted case identity "${expectedCase.fullName}" (hierarchy drift)`,
				);
			}
			const caseId = adaptedRuntimeCaseIdByFullName(
				repoRoot,
				adaptedFile,
				expectedCase.fullName,
				expectedCase.occurrence,
			);
			const caseIsDiverged = caseId !== null && diverged.has(caseId);
			let expectedForCompare = expectedCase;
			if (caseIsDiverged) {
				if (
					artifact.path === 'hooks/useId.test.ts' &&
					expectedCase.fullName === USE_ID_FALLBACK_FULL_NAME
				) {
					expectedForCompare = applyUseIdFallbackDivergence(expectedCase);
				} else {
					throw new Error(
						`${adaptedRelative}: diverged case "${expectedCase.fullName}" (${caseId}) has no divergence-specific transform`,
					);
				}
			}
			if (
				JSON.stringify(expectedForCompare.parameterization) !==
				JSON.stringify(actualCase.parameterization)
			) {
				throw new Error(
					`${adaptedRelative}: parameterization for "${expectedCase.fullName}" differs from pristine`,
				);
			}
			if (JSON.stringify(expectedForCompare.assertions) !== JSON.stringify(actualCase.assertions)) {
				throw new Error(
					`${adaptedRelative}: assertion groups for "${expectedCase.fullName}" differ from pristine after permitted transformations`,
				);
			}
			if (
				JSON.stringify(expectedForCompare.scenarioSteps) !==
				JSON.stringify(actualCase.scenarioSteps)
			) {
				throw new Error(
					`${adaptedRelative}: scenario structure for "${expectedCase.fullName}" differs from pristine after permitted transformations`,
				);
			}
			assertionGroups += actualCase.assertions.length;
		}
		for (const [key, actualCase] of actualMap) {
			if (!expectedMap.has(key)) {
				throw new Error(
					`${adaptedRelative}: unexpected adapted case identity "${actualCase.fullName}"`,
				);
			}
		}

		// Direct test()/it() titles are recorded in test-inventory.json. Parameterized
		// test.each/it.each registrations are verified via the case ledger table/body.
		const leafTitles = expectedLedger
			.filter(function keepDirect(entry) {
				return entry.parameterization === null;
			})
			.map(function titleOf(entry) {
				return entry.title;
			});
		if (JSON.stringify([...artifact.identities]) !== JSON.stringify(leafTitles)) {
			throw new Error(`${artifact.path}: inventory identities drifted from upstream source cases`);
		}

		upstreamCases += expectedLedger.length;
		portedCases += actualLedger.length;
	}

	const support = verifyReactResizablePanelsSupportFiles(repoRoot);

	return {
		artifacts: inventory.artifacts.length,
		portedCases,
		upstreamCases,
		assertionGroups,
		permittedTransformations: runtimeParity.permittedTransformations.length,
		runtimeIdentities: expectedIdentities.size,
		supportFiles: support.supportFiles,
	};
}
