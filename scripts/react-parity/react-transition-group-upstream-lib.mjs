import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { extractTestCases } from './inventory-lib.mjs';

const PACKAGE_ROOT = 'packages/transition-group';
const UPSTREAM_ROOT = `${PACKAGE_ROOT}/upstream`;
const UPSTREAM_TEST_ROOT = `${UPSTREAM_ROOT}/test`;
const INVENTORY_PATH = `${PACKAGE_ROOT}/audit/SHA256SUMS`;
const ADAPTED_EVIDENCE_INVENTORY_PATH = `${PACKAGE_ROOT}/audit/adapted-evidence.SHA256SUMS`;
const CASE_CONTRACTS_PATH = `${PACKAGE_ROOT}/audit/adapted-case-contracts.json`;
const DISPOSITION_PATH = `${PACKAGE_ROOT}/audit/upstream-test-dispositions.json`;
const CROSSWALK_PATH = `${PACKAGE_ROOT}/audit/case-crosswalk.json`;
const FIXTURE_PATH = `${PACKAGE_ROOT}/tests/_fixtures/upstream-probes.tsrx`;
const ADAPTED_INVENTORIES = [
	`${PACKAGE_ROOT}/audit/adapted-runtime.json`,
	`${PACKAGE_ROOT}/audit/adapted-runtime-server.json`,
];
const ADAPTED_EVIDENCE_ROOTS = [
	`${PACKAGE_ROOT}/tests/upstream`,
	`${PACKAGE_ROOT}/tests/ssr/upstream-import.test.ts`,
	`${PACKAGE_ROOT}/tests/_fixtures/upstream-probes.tsrx`,
];

const SUPPORT_ARTIFACTS = new Set(['.eslintrc.yml', 'setup.js', 'setupAfterEnv.js', 'utils.js']);
const CITATION_RE = /\/\/\s*Per path:\s*(.+)$/;
const CITATION_PATH_RE = /^(.*?):(\d+)(?:-(\d+))?$/;

function sha256Text(value) {
	return createHash('sha256').update(value).digest('hex');
}

function findMatchingParen(source, openIndex) {
	let depth = 0;
	let inStr = null;
	let inLineComment = false;
	let inBlockComment = false;
	for (let i = openIndex; i < source.length; i++) {
		const c = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (c === '\n') inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (c === '*' && next === '/') {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (inStr) {
			if (c === '\\') {
				i++;
				continue;
			}
			if (c === inStr) inStr = null;
			continue;
		}
		if (c === '/' && next === '/') {
			inLineComment = true;
			i++;
			continue;
		}
		if (c === '/' && next === '*') {
			inBlockComment = true;
			i++;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			inStr = c;
			continue;
		}
		if (c === '(') depth++;
		else if (c === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function caseBodyAtLine(source, line) {
	const lines = source.split('\n');
	let offset = 0;
	for (let i = 0; i < line - 1; i++) {
		offset += lines[i].length + 1;
	}
	const open = source.indexOf('(', offset);
	if (open < 0) {
		throw new Error(`missing case call at line ${line}`);
	}
	const close = findMatchingParen(source, open);
	if (close < 0) {
		throw new Error(`unbalanced case call at line ${line}`);
	}
	return source.slice(offset, close + 1);
}

function extractExpectAssertions(body) {
	const assertions = [];
	let index = 0;
	while (index < body.length) {
		const start = body.indexOf('expect(', index);
		if (start < 0) break;
		if (start > 0 && /[\w$]/.test(body[start - 1])) {
			index = start + 6;
			continue;
		}
		const open = start + 'expect'.length;
		const close = findMatchingParen(body, open);
		if (close < 0) break;
		let end = close + 1;
		while (body[end] === '.') {
			const rest = body.slice(end);
			const notMatch = rest.match(/^\.not\b/);
			if (notMatch) {
				end += notMatch[0].length;
				continue;
			}
			const match = rest.match(/^\.[\w$]+\s*\(/);
			if (!match) break;
			const chainOpen = end + match[0].length - 1;
			const chainClose = findMatchingParen(body, chainOpen);
			if (chainClose < 0) break;
			end = chainClose + 1;
		}
		assertions.push(body.slice(start, end).replace(/\s+/g, ' ').trim());
		index = end;
	}
	return assertions;
}

function extractFixtureExports(source) {
	const exports = new Set();
	for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
		exports.add(match[1]);
	}
	for (const match of source.matchAll(/export\s+(?:type|interface)\s+(\w+)/g)) {
		exports.add(match[1]);
	}
	for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+(\w+)/g)) {
		exports.add(match[1]);
	}
	return [...exports].sort();
}

function fixtureExportsUsed(body, exports) {
	return exports.filter(function used(name) {
		return new RegExp(`\\b${name}\\b`).test(body);
	});
}

const STATUS_CONSTANTS = {
	ENTERED: 'entered',
	ENTERING: 'entering',
	ENTER: 'enter',
	EXITED: 'exited',
	EXITING: 'exiting',
	EXIT: 'exit',
	UNMOUNTED: 'unmounted',
	UNMOUNTING: 'unmounting',
};

export const PERMITTED_ASSERTION_TRANSFORMATIONS = [
	{
		kind: 'matcher',
		rule: 'Jest .toEqual(x) normalizes to Vitest .toBe(x); trailing commas and whitespace inside literals are ignored.',
	},
	{
		kind: 'dom-access',
		rule: 'nodeRef.current / firstNodeRef.current / querySelector("#id") / node() normalize to a generic NODE subject; childNodes.length and querySelectorAll(...).toHaveLength(n) both mean childCount n.',
	},
	{
		kind: 'status-constants',
		rule: 'Upstream ENTERED/ENTERING/EXITED/EXITING/UNMOUNTED template literals fold to their lowercase status strings.',
	},
	{
		kind: 'class-alias',
		rule: 'CSSTransition "-entering" class tokens alias to "-enter-active" when comparing classContains observations.',
	},
	{
		kind: 'optional-console-spy',
		rule: 'console/warning spy call assertions are optional on the adapted side when the scenario still covers the behavioral observations.',
	},
	{
		kind: 'callback-spy',
		rule: 'Transition callback / listener / ref spy assertions are required. An adapted callOrder/log array observation may cover upstream callback spy assertions for the same lifecycle.',
	},
	{
		kind: 'text-containment',
		rule: 'Adapted textContent observations may contain the upstream text (or vice versa) after status folding.',
	},
	{
		kind: 'presence',
		rule: 'Upstream presence/null checks and empty textContent map to adapted emptyText, presence (absence), or status unmounted observations.',
	},
];

function collapseStrictModeBranch(body) {
	// Strip line comments so the StrictMode ternary matcher can see the branches.
	const withoutLineComments = body.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
	return withoutLineComments.replace(
		/React\.useTransition\s*!==\s*undefined\s*\?\s*(\[[^\]]+\])\s*:\s*(\[[^\]]+\])/gs,
		'$2',
	);
}

function isConsoleSpyAssertion(folded, assertion) {
	return (
		folded.includes('consoleError') ||
		folded.includes('console.error') ||
		/\bexpect\(\s*warn\s*\)/.test(folded) ||
		/\bconsoleErrorSpy\b/.test(assertion) ||
		/spyOn\(\s*console\b/.test(assertion)
	);
}

function isLifecycleArrayObservation(observation) {
	return observation[0] === 'array' && (observation[1] === 'callOrder' || observation[1] === 'log');
}

function isAbsenceObservation(observation) {
	return (
		observation[0] === 'emptyText' ||
		(observation[0] === 'status' && observation[1] === 'unmounted')
	);
}

function pushRequiredObservation(required, observation) {
	if (observation[0] === 'consoleSpy') return;
	if (isAbsenceObservation(observation)) {
		const existing = required.findIndex(isAbsenceObservation);
		if (existing >= 0) {
			// Prefer emptyText as the canonical absence observation.
			if (observation[0] === 'emptyText') {
				required[existing] = observation;
			}
			return;
		}
	}
	required.push(observation);
}

function foldAssertionSource(source) {
	let value = source.replace(/\.toEqual\(/g, '.toBe(').replace(/"/g, "'");
	value = value.replace(/\/\/[^\n]*/g, '');
	value = value.replace(/\/\*[\s\S]*?\*\//g, '');
	value = value.replace(/ChildMapping\./g, '');
	value = value.replace(/view\.container/g, 'container');
	value = value.replace(/nodeRef\.current/g, 'NODE');
	value = value.replace(/container\.querySelector\('#[^']+'\)\??/g, 'NODE');
	value = value.replace(/(first|second)NodeRef\.current/g, 'NODE');
	value = value.replace(/node\(\)\??/g, 'NODE');
	value = value.replace(/`([^`]*)`/g, function foldTemplate(_match, inner) {
		let text = inner;
		for (const [name, folded] of Object.entries(STATUS_CONSTANTS)) {
			text = text.replaceAll(`\${${name}}`, folded);
		}
		return `'${text}'`;
	});
	for (const [name, folded] of Object.entries(STATUS_CONSTANTS)) {
		value = value.replace(new RegExp(`\\b${name}\\b`, 'g'), `'${folded}'`);
	}
	value = value.replace(/\s+/g, ' ');
	value = value.replace(/,\s*([}\]])/g, '$1');
	value = value.replace(/\.toContain\(/g, '.toBe(');
	return value.trim();
}

function observationFromAssertion(assertion) {
	const folded = foldAssertionSource(assertion);
	let match = folded.match(/classList\.contains\(\s*'([^']+)'\s*\)\)\.toBe\(\s*(true|false)\s*\)/);
	if (match) {
		return [['classContains', match[1].replace(/-entering\b/g, '-enter-active'), match[2]]];
	}
	match = folded.match(/hasClass\([^,]+,\s*(?:'([^']+)'|(\w+))\)\)\.toBe\(\s*(true|false)\s*\)/);
	if (match) {
		return [['classContains', match[1] ?? 'PROP', match[3]]];
	}
	match = folded.match(/className\)\.toBe\(\s*'([^']*)'\s*,?\s*\)/);
	if (match) {
		return [['className', match[1].replace(/\s+/g, ' ').trim()]];
	}
	match = folded.match(/toHaveLength\(\s*(\d+)\s*\)/);
	if (match) {
		return [['childCount', match[1]]];
	}
	match = folded.match(/childNodes\.length\)\.toBe\(\s*(\d+)\s*\)/);
	if (match) {
		return [['childCount', match[1]]];
	}
	match = folded.match(/\.id\)\.toBe\(\s*'([^']+)'\s*\)/);
	if (match) {
		return [['id', match[1]]];
	}
	if (
		/\.not\.toBeNull\b/.test(folded) ||
		(folded.includes('toExist') && !folded.includes('not.toExist'))
	) {
		match = assertion.match(/querySelector\(\s*'#([^']+)'\s*\)/);
		if (match) {
			return [['id', match[1]]];
		}
		return [['presence']];
	}
	if (
		/\.not\.toExist\b/.test(folded) ||
		/\.toBeNull\b/.test(folded) ||
		folded.includes('toBe(null)')
	) {
		return [['emptyText']];
	}
	match = assertion.match(/querySelector\(\s*'#([^']+)'\s*\)/);
	if (
		match &&
		!folded.includes('className') &&
		!folded.includes('classList') &&
		!folded.includes('textContent')
	) {
		return [['id', match[1]]];
	}
	if (
		folded.includes('toHaveBeenCalled') ||
		folded.includes('consoleError') ||
		/\bexpect\(\s*warn\s*\)/.test(folded)
	) {
		if (isConsoleSpyAssertion(folded, assertion)) {
			return [['consoleSpy']];
		}
		return [['callbackSpy']];
	}
	match = folded.match(/expect\((\w+)\)\.toBe\(\s*(\[[^\]]*\])\s*\)/);
	if (match) {
		return [['array', match[1], match[2].replace(/\s+/g, '')]];
	}
	match = folded.match(/textContent\)\.toBe\(\s*'([^']*)'\s*,?\s*\)/);
	if (match) {
		const text = match[1].replace(/\s+/g, ' ').trim();
		if (text === '') return [['emptyText']];
		return [['text', text]];
	}
	if (/\.not\.toContain\(/.test(assertion) || /not\.toContain\(/.test(folded)) {
		return [['presence']];
	}
	match = folded.match(/expect\((\w+)\)\.toBe\(\s*(true|false|\d+)\s*\)/);
	if (match) {
		return [['value', match[1], match[2]]];
	}
	match = folded.match(/toBeTypeOf\(\s*'([^']+)'\s*\)/);
	if (match) {
		return [['typeof', match[1]]];
	}
	if (folded.includes('mergeChildMappings')) {
		match = folded.match(/toBe\(\s*(\{[^}]*\})\s*\)/);
		if (match) {
			return [['mergeMap', match[1].replace(/\s+/g, '')]];
		}
	}
	if (/expect\(\s*function/.test(folded) || assertion.includes('expect(()')) {
		return [['throwsOrCallable']];
	}
	match = folded.match(/getStatus\(\)\)\.toBe\(\s*'([^']+)'\s*\)/);
	if (match) {
		return [['status', match[1]]];
	}
	return [['raw', folded]];
}

function semanticObservations(body) {
	const observations = [];
	for (const assertion of extractExpectAssertions(collapseStrictModeBranch(body))) {
		for (const observation of observationFromAssertion(assertion)) {
			observations.push(observation);
		}
	}
	return observations;
}

function observationKey(observation) {
	return JSON.stringify(observation);
}

function missingRequiredObservations(upstreamObservations, adaptedObservations) {
	const required = [];
	for (const observation of upstreamObservations) {
		// Console/warning spies stay optional; transition callback spies do not.
		pushRequiredObservation(required, observation);
	}
	const available = adaptedObservations.map(observationKey);
	const hasLifecycleArray = adaptedObservations.some(isLifecycleArrayObservation);
	const missing = [];
	for (const observation of required) {
		if (observation[0] === 'text') {
			const index = available.findIndex(function matchesText(key) {
				const candidate = JSON.parse(key);
				return (
					candidate[0] === 'text' &&
					(candidate[1].includes(observation[1]) || observation[1].includes(candidate[1]))
				);
			});
			if (index >= 0) {
				available.splice(index, 1);
				continue;
			}
			missing.push(observation);
			continue;
		}
		if (observation[0] === 'classContains' && observation[1] === 'PROP') {
			const index = available.findIndex(function matchesProp(key) {
				const candidate = JSON.parse(key);
				return candidate[0] === 'classContains' && candidate[2] === observation[2];
			});
			if (index >= 0) {
				available.splice(index, 1);
				continue;
			}
			missing.push(observation);
			continue;
		}
		if (observation[0] === 'emptyText') {
			const index = available.findIndex(function matchesAbsence(key) {
				const candidate = JSON.parse(key);
				return (
					candidate[0] === 'emptyText' ||
					candidate[0] === 'presence' ||
					(candidate[0] === 'status' && candidate[1] === 'unmounted')
				);
			});
			if (index >= 0) {
				available.splice(index, 1);
				continue;
			}
			missing.push(observation);
			continue;
		}
		if (observation[0] === 'callbackSpy') {
			const index = available.findIndex(function matchesCallbackSpy(key) {
				const candidate = JSON.parse(key);
				return candidate[0] === 'callbackSpy';
			});
			if (index >= 0) {
				available.splice(index, 1);
				continue;
			}
			// callOrder/log arrays already encode the lifecycle callback sequence.
			if (hasLifecycleArray) {
				continue;
			}
			missing.push(observation);
			continue;
		}
		if (observation[0] === 'presence' || observation[0] === 'status') {
			const index = available.findIndex(function matchesPresence(key) {
				const candidate = JSON.parse(key);
				if (observation[0] === 'status') {
					if (candidate[0] === 'status' && candidate[1] === observation[1]) return true;
					if (candidate[0] === 'text' && candidate[1].includes(observation[1])) return true;
					if (observation[1] === 'unmounted' && candidate[0] === 'emptyText') return true;
					return false;
				}
				return (
					candidate[0] === 'presence' || candidate[0] === 'id' || candidate[0] === 'childCount'
				);
			});
			if (index >= 0) {
				available.splice(index, 1);
				continue;
			}
			missing.push(observation);
			continue;
		}
		const exact = observationKey(observation);
		const index = available.indexOf(exact);
		if (index >= 0) {
			available.splice(index, 1);
			continue;
		}
		missing.push(observation);
	}
	return missing;
}

function assertSemanticCoverage(entry, upstreamObservations, adaptedObservations) {
	// Divergence markers document known Octane/React differences; they do not
	// disable semantic comparison for the rest of the case. StrictMode appear/
	// enter ternaries are collapsed to the non-strict branch before observation
	// extraction, so the shared exit (and collapsed appear/enter) sequences stay
	// required.
	const missing = missingRequiredObservations(upstreamObservations, adaptedObservations);
	if (missing.length > 0) {
		throw new Error(
			`${entry.adaptedFile}::${entry.adaptedTitle}: adapted observations do not cover normalized upstream assertions (${missing.map(observationKey).join(', ')})`,
		);
	}
}

function assertDivergenceMarker(adaptedSource, entry, citedLine) {
	if (!entry.divergenceId) return;
	const lines = adaptedSource.split('\n');
	const windowStart = Math.max(0, citedLine - 8);
	const window = lines.slice(windowStart, citedLine + 2).join('\n');
	const markerPrefix = `// OCTANE DIVERGENCE[${entry.divergenceId}]`;
	if (!window.includes(markerPrefix)) {
		throw new Error(
			`${entry.adaptedFile}::${entry.adaptedTitle}: missing ${markerPrefix}[caseId] near the adapted assertion`,
		);
	}
}

export function buildAdaptedCaseContracts(repoRoot) {
	const crosswalkPath = resolve(repoRoot, CROSSWALK_PATH);
	if (!existsSync(crosswalkPath)) {
		throw new Error(`missing case crosswalk: ${CROSSWALK_PATH}`);
	}
	const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
	const fixtureAbsolute = resolve(repoRoot, FIXTURE_PATH);
	if (!existsSync(fixtureAbsolute)) {
		throw new Error(`missing adapted fixture: ${FIXTURE_PATH}`);
	}
	const fixtureSource = readFileSync(fixtureAbsolute, 'utf8');
	const fixtureExports = extractFixtureExports(fixtureSource);
	const fixtures = [
		{
			path: FIXTURE_PATH,
			sha256: sha256Text(fixtureSource),
			exports: fixtureExports,
		},
	];
	const cases = [];
	for (const entry of crosswalk.cases ?? []) {
		if (entry.disposition !== 'adapted') continue;
		const adaptedSource = readFileSync(resolve(repoRoot, entry.adaptedFile), 'utf8');
		const adaptedMatches = extractTestCases(adaptedSource, { file: entry.adaptedFile }).filter(
			function sameTitle(item) {
				return item.title === entry.adaptedTitle;
			},
		);
		const citedMatch = adaptedMatches.find(function hasCitation(item) {
			return citationForCase(adaptedSource, item.line) === entry.citation;
		});
		if (!citedMatch) {
			throw new Error(
				`${entry.adaptedFile}: missing cited adapted case ${JSON.stringify(entry.adaptedTitle)}`,
			);
		}
		assertDivergenceMarker(adaptedSource, entry, citedMatch.line);
		const adaptedBody = caseBodyAtLine(adaptedSource, citedMatch.line);
		const adaptedAssertions = extractExpectAssertions(adaptedBody);
		const parsed = parseCitation(entry.citation);
		if (!parsed) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: citation must be path:start[-end]`,
			);
		}
		const upstreamSource = readFileSync(resolve(repoRoot, parsed.path), 'utf8');
		const upstreamBody = caseBodyAtLine(upstreamSource, entry.upstreamLine);
		const upstreamAssertions = extractExpectAssertions(collapseStrictModeBranch(upstreamBody));
		const upstreamObservations = semanticObservations(upstreamBody);
		const adaptedObservations = semanticObservations(adaptedBody);
		cases.push({
			upstreamFile: entry.upstreamFile,
			upstreamTitle: entry.upstreamTitle,
			upstreamLine: entry.upstreamLine,
			citation: entry.citation,
			adaptedFile: entry.adaptedFile,
			adaptedTitle: entry.adaptedTitle,
			divergenceId: entry.divergenceId ?? null,
			upstreamBodySha256: sha256Text(
				collapseStrictModeBranch(upstreamBody).replace(/\s+/g, ' ').trim(),
			),
			upstreamAssertions: upstreamAssertions.map(sha256Text),
			upstreamObservations,
			adaptedBodySha256: sha256Text(adaptedBody.replace(/\s+/g, ' ').trim()),
			adaptedAssertions: adaptedAssertions.map(sha256Text),
			adaptedObservations,
			fixtureExports: fixtureExportsUsed(adaptedBody, fixtureExports),
		});
	}
	cases.sort(function compareCases(left, right) {
		return (
			left.upstreamFile.localeCompare(right.upstreamFile) ||
			left.upstreamLine - right.upstreamLine ||
			left.upstreamTitle.localeCompare(right.upstreamTitle)
		);
	});
	return {
		schemaVersion: 2,
		permittedAssertionTransformations: PERMITTED_ASSERTION_TRANSFORMATIONS,
		fixtures,
		cases,
	};
}

export function verifyAdaptedCaseContracts(repoRoot) {
	const contractsPath = resolve(repoRoot, CASE_CONTRACTS_PATH);
	if (!existsSync(contractsPath)) {
		throw new Error(`missing adapted case contracts: ${CASE_CONTRACTS_PATH}`);
	}
	const expected = JSON.parse(readFileSync(contractsPath, 'utf8'));
	const actual = buildAdaptedCaseContracts(repoRoot);
	const crosswalk = JSON.parse(readFileSync(resolve(repoRoot, CROSSWALK_PATH), 'utf8'));
	const byKey = new Map(
		(crosswalk.cases ?? [])
			.filter(function adaptedOnly(entry) {
				return entry.disposition === 'adapted';
			})
			.map(function entryOf(entry) {
				return [`${entry.upstreamFile}\0${entry.upstreamTitle}\0${entry.upstreamLine}`, entry];
			}),
	);
	for (const contract of actual.cases) {
		const entry = byKey.get(
			`${contract.upstreamFile}\0${contract.upstreamTitle}\0${contract.upstreamLine}`,
		);
		if (!entry) {
			throw new Error(
				`${contract.upstreamFile}::${contract.upstreamTitle}: missing crosswalk entry for semantic verification`,
			);
		}
		assertSemanticCoverage(entry, contract.upstreamObservations, contract.adaptedObservations);
	}
	// Live semantic coverage is checked above against upstream sources. Refreshing
	// generated metadata cannot satisfy a weakened adapted assertion.
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			'adapted assertion/fixture contracts drifted against cited upstream scenarios; review and record the change',
		);
	}
	return {
		cases: actual.cases.length,
		fixtures: actual.fixtures.length,
		assertions: actual.cases.reduce(function sum(total, entry) {
			return total + entry.adaptedAssertions.length;
		}, 0),
	};
}

export function renderAdaptedCaseContracts(repoRoot) {
	return `${JSON.stringify(buildAdaptedCaseContracts(repoRoot), null, '\t')}\n`;
}

function filesBelow(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			return entry.isFile();
		})
		.map(function absolutePath(entry) {
			return resolve(entry.parentPath ?? entry.path, entry.name);
		})
		.sort();
}

function portableRelative(root, file) {
	return relative(root, file).split(sep).join('/');
}

function parseCitation(citation) {
	const match = citation.match(CITATION_PATH_RE);
	if (!match) return null;
	return {
		path: match[1],
		start: Number(match[2]),
		end: Number(match[3] ?? match[2]),
	};
}

function citationForCase(source, caseLine) {
	const lines = source.split('\n');
	const start = Math.max(0, (caseLine ?? 1) - 1);
	for (let index = start; index >= Math.max(0, start - 8); index--) {
		const match = lines[index].match(CITATION_RE);
		if (match) return match[1].trim();
	}
	return null;
}

export function renderReactTransitionGroupUpstreamInventory(repoRoot) {
	const upstreamRoot = resolve(repoRoot, UPSTREAM_ROOT);
	return `${filesBelow(upstreamRoot)
		.map(function lineFor(file) {
			const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
			return `${digest}  upstream/${portableRelative(upstreamRoot, file)}`;
		})
		.join('\n')}\n`;
}

function listAdaptedEvidenceFiles(repoRoot) {
	const files = [];
	for (const root of ADAPTED_EVIDENCE_ROOTS) {
		const absolute = resolve(repoRoot, root);
		if (!existsSync(absolute)) {
			throw new Error(`missing adapted evidence root: ${root}`);
		}
		if (statSync(absolute).isFile()) {
			files.push(absolute);
			continue;
		}
		for (const file of filesBelow(absolute)) {
			if (file.endsWith('.test.ts') || file.endsWith('.tsrx')) {
				files.push(file);
			}
		}
	}
	return files.sort();
}

export function renderReactTransitionGroupAdaptedEvidenceInventory(repoRoot) {
	return `${listAdaptedEvidenceFiles(repoRoot)
		.map(function lineFor(file) {
			const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
			return `${digest}  ${portableRelative(repoRoot, file)}`;
		})
		.join('\n')}\n`;
}

export function listUpstreamTestArtifacts(repoRoot) {
	const testRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	return filesBelow(testRoot).map(function relativePath(file) {
		return portableRelative(testRoot, file);
	});
}

export function listUpstreamTestFiles(repoRoot) {
	return listUpstreamTestArtifacts(repoRoot).filter(function isSuite(file) {
		return file.endsWith('-test.js');
	});
}

export function collectUpstreamCaseInventory(repoRoot) {
	const testRoot = resolve(repoRoot, UPSTREAM_TEST_ROOT);
	const cases = [];
	for (const file of listUpstreamTestFiles(repoRoot)) {
		const source = readFileSync(resolve(testRoot, file), 'utf8');
		for (const entry of extractTestCases(source, { file })) {
			cases.push({
				file: `test/${file}`,
				title: entry.title,
				line: entry.line,
			});
		}
	}
	return cases.sort(function compareCases(left, right) {
		return (
			left.file.localeCompare(right.file) ||
			left.line - right.line ||
			left.title.localeCompare(right.title)
		);
	});
}

function collectAdaptedCases(repoRoot) {
	const cases = [];
	const roots = [
		`${PACKAGE_ROOT}/tests/upstream`,
		`${PACKAGE_ROOT}/tests/ssr/upstream-import.test.ts`,
	];
	for (const root of roots) {
		const absolute = resolve(repoRoot, root);
		if (!existsSync(absolute)) {
			throw new Error(`missing adapted evidence root: ${root}`);
		}
		const files = statSync(absolute).isFile()
			? [absolute]
			: filesBelow(absolute).filter(function keepTests(file) {
					return file.endsWith('.test.ts');
				});
		for (const file of files) {
			const relativeFile = portableRelative(repoRoot, file);
			const source = readFileSync(file, 'utf8');
			for (const entry of extractTestCases(source, { file: relativeFile })) {
				cases.push({
					file: relativeFile,
					title: entry.title,
					line: entry.line,
					citation: citationForCase(source, entry.line),
				});
			}
		}
	}
	return cases;
}

function loadAdaptedInventoryFullNames(repoRoot) {
	const fullNamesByFile = new Map();
	for (const inventoryPath of ADAPTED_INVENTORIES) {
		const inventory = JSON.parse(readFileSync(resolve(repoRoot, inventoryPath), 'utf8'));
		for (const test of inventory.tests ?? []) {
			const list = fullNamesByFile.get(test.file) ?? [];
			list.push(test.fullName);
			fullNamesByFile.set(test.file, list);
		}
	}
	return fullNamesByFile;
}

function consumeInventoryTitle(fullNamesByFile, file, title) {
	const fullNames = fullNamesByFile.get(file) ?? [];
	const index = fullNames.findIndex(function matchesTitle(fullName) {
		return fullName === title || fullName.endsWith(` ${title}`);
	});
	if (index === -1) return false;
	fullNames.splice(index, 1);
	return true;
}

function verifyCaseCrosswalk(repoRoot, upstreamCases) {
	const crosswalkPath = resolve(repoRoot, CROSSWALK_PATH);
	if (!existsSync(crosswalkPath)) {
		throw new Error(`missing case crosswalk: ${CROSSWALK_PATH}`);
	}
	const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
	if (crosswalk.schemaVersion !== 1 || !Array.isArray(crosswalk.cases)) {
		throw new Error('case-crosswalk.json must declare schemaVersion 1 cases');
	}
	if (crosswalk.cases.length !== upstreamCases.length) {
		throw new Error(
			`case crosswalk must cover every upstream case: found ${crosswalk.cases.length}, expected ${upstreamCases.length}`,
		);
	}

	const adaptedCases = collectAdaptedCases(repoRoot);
	const adaptedKeys = new Set(
		adaptedCases.map(function keyOf(entry) {
			return `${entry.file}\0${entry.title}\0${entry.line}`;
		}),
	);
	const usedAdapted = new Set();
	const fullNamesByFile = loadAdaptedInventoryFullNames(repoRoot);
	const upstreamKeys = upstreamCases.map(function keyOf(entry) {
		return `${entry.file}\0${entry.title}\0${entry.line}`;
	});
	const crosswalkKeys = [];

	for (const entry of crosswalk.cases) {
		if (typeof entry.upstreamFile !== 'string' || typeof entry.upstreamTitle !== 'string') {
			throw new Error('case crosswalk entries require upstreamFile and upstreamTitle');
		}
		if (!Number.isInteger(entry.upstreamLine) || entry.upstreamLine < 1) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: crosswalk requires upstreamLine`,
			);
		}
		const upstreamKey = `${entry.upstreamFile}\0${entry.upstreamTitle}\0${entry.upstreamLine}`;
		crosswalkKeys.push(upstreamKey);
		if (!upstreamKeys.includes(upstreamKey)) {
			throw new Error(
				`${entry.upstreamFile}:${entry.upstreamLine}: crosswalk case is not in the upstream inventory`,
			);
		}

		if (entry.disposition === 'not-applicable') {
			if (typeof entry.rationale !== 'string' || entry.rationale.length < 20) {
				throw new Error(
					`${entry.upstreamFile}::${entry.upstreamTitle}: not-applicable cases require a concrete rationale`,
				);
			}
			continue;
		}
		if (entry.disposition !== 'adapted') {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: disposition must be adapted or not-applicable`,
			);
		}
		if (
			typeof entry.adaptedFile !== 'string' ||
			typeof entry.adaptedTitle !== 'string' ||
			typeof entry.citation !== 'string'
		) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: adapted cases require adaptedFile, adaptedTitle, and citation`,
			);
		}
		if (!existsSync(resolve(repoRoot, entry.adaptedFile))) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: missing adaptedEvidence ${entry.adaptedFile}`,
			);
		}
		const parsed = parseCitation(entry.citation);
		if (!parsed) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: citation must be path:start[-end]`,
			);
		}
		const upstreamLeaf = entry.upstreamFile.replace(/^test\//, '');
		if (!parsed.path.endsWith(upstreamLeaf) && !parsed.path.endsWith(entry.upstreamFile)) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: citation path does not target the upstream suite`,
			);
		}
		if (entry.upstreamLine < parsed.start || entry.upstreamLine > parsed.end) {
			throw new Error(
				`${entry.upstreamFile}::${entry.upstreamTitle}: citation range ${parsed.start}-${parsed.end} does not cover upstreamLine ${entry.upstreamLine}`,
			);
		}

		const adaptedSource = readFileSync(resolve(repoRoot, entry.adaptedFile), 'utf8');
		const adaptedMatches = extractTestCases(adaptedSource, { file: entry.adaptedFile }).filter(
			function sameTitle(item) {
				return item.title === entry.adaptedTitle;
			},
		);
		if (adaptedMatches.length === 0) {
			throw new Error(
				`${entry.adaptedFile}: adapted case missing title ${JSON.stringify(entry.adaptedTitle)}`,
			);
		}
		const citedMatch = adaptedMatches.find(function hasCitation(item) {
			return citationForCase(adaptedSource, item.line) === entry.citation;
		});
		if (!citedMatch) {
			throw new Error(
				`${entry.adaptedFile}: missing // Per path: ${entry.citation} for ${entry.adaptedTitle}`,
			);
		}
		const adaptedKey = `${entry.adaptedFile}\0${entry.adaptedTitle}\0${citedMatch.line}`;
		if (!adaptedKeys.has(adaptedKey)) {
			throw new Error(
				`${entry.adaptedFile}: adapted case identity drifted for ${entry.adaptedTitle}`,
			);
		}
		if (usedAdapted.has(adaptedKey)) {
			throw new Error(`${entry.adaptedFile}: adapted case ${entry.adaptedTitle} mapped twice`);
		}
		usedAdapted.add(adaptedKey);

		if (!consumeInventoryTitle(fullNamesByFile, entry.adaptedFile, entry.adaptedTitle)) {
			throw new Error(
				`${entry.adaptedFile}: adapted inventory is missing identity for ${entry.adaptedTitle}`,
			);
		}
	}

	if (
		JSON.stringify(crosswalkKeys.slice().sort()) !== JSON.stringify(upstreamKeys.slice().sort())
	) {
		throw new Error('case crosswalk keys must match the upstream case inventory exactly once');
	}
	if (usedAdapted.size !== adaptedCases.length) {
		throw new Error(
			`adapted case/fixture drift: crosswalk maps ${usedAdapted.size} adapted cases, found ${adaptedCases.length}`,
		);
	}

	return {
		adapted: usedAdapted.size,
		notApplicable: crosswalk.cases.filter(function na(entry) {
			return entry.disposition === 'not-applicable';
		}).length,
	};
}

export function verifyReactTransitionGroupUpstream(repoRoot) {
	const expectedInventory = readFileSync(resolve(repoRoot, INVENTORY_PATH), 'utf8');
	const actualInventory = renderReactTransitionGroupUpstreamInventory(repoRoot);
	if (actualInventory !== expectedInventory) {
		throw new Error('react-transition-group upstream inventory drifted; re-vendor the pinned tag');
	}

	const dispositions = JSON.parse(readFileSync(resolve(repoRoot, DISPOSITION_PATH), 'utf8'));
	if (dispositions.schemaVersion !== 1 || !Array.isArray(dispositions.artifacts)) {
		throw new Error('upstream-test-dispositions.json must declare schemaVersion 1 artifacts');
	}

	const artifacts = listUpstreamTestArtifacts(repoRoot);
	const dispositionPaths = dispositions.artifacts.map(function pathOf(entry) {
		return entry.path;
	});
	if (
		JSON.stringify(dispositionPaths.slice().sort()) !== JSON.stringify(artifacts.slice().sort())
	) {
		throw new Error(
			'react-transition-group upstream test dispositions must account for every upstream/test artifact',
		);
	}

	const suiteFiles = listUpstreamTestFiles(repoRoot);
	for (const entry of dispositions.artifacts) {
		if (typeof entry.path !== 'string' || typeof entry.disposition !== 'string') {
			throw new Error(
				`${entry.path ?? '<missing>'}: disposition entries require path and disposition`,
			);
		}
		if (SUPPORT_ARTIFACTS.has(entry.path)) {
			if (entry.disposition !== 'support') {
				throw new Error(`${entry.path}: support artifacts must use disposition "support"`);
			}
			continue;
		}
		if (!suiteFiles.includes(entry.path)) {
			throw new Error(`${entry.path}: unknown upstream test artifact disposition`);
		}
		const allowed = new Set([
			'pristine-oracle',
			'pristine-oracle-partially-adapted',
			'pristine-oracle-adapted',
			'not-applicable',
		]);
		if (!allowed.has(entry.disposition)) {
			throw new Error(
				`${entry.path}: suite disposition must be a pristine oracle classification or not-applicable`,
			);
		}
		if (typeof entry.rationale !== 'string' || entry.rationale.length === 0) {
			throw new Error(`${entry.path}: disposition requires a rationale`);
		}
		if (!Number.isInteger(entry.caseCount) || entry.caseCount < 0) {
			throw new Error(`${entry.path}: disposition requires a non-negative caseCount`);
		}
		if (
			entry.disposition === 'pristine-oracle-adapted' ||
			entry.disposition === 'pristine-oracle-partially-adapted'
		) {
			if (!Array.isArray(entry.adaptedEvidence) || entry.adaptedEvidence.length === 0) {
				throw new Error(`${entry.path}: adapted dispositions require adaptedEvidence`);
			}
			for (const evidence of entry.adaptedEvidence) {
				if (!existsSync(resolve(repoRoot, evidence))) {
					throw new Error(`${entry.path}: missing adaptedEvidence ${evidence}`);
				}
			}
		}
	}

	const inventoriedCases = collectUpstreamCaseInventory(repoRoot);
	const expectedCaseCount = dispositions.artifacts
		.filter(function suitesOnly(entry) {
			return !SUPPORT_ARTIFACTS.has(entry.path);
		})
		.reduce(function sum(total, entry) {
			return total + entry.caseCount;
		}, 0);
	if (inventoriedCases.length !== expectedCaseCount) {
		throw new Error(
			`upstream case inventory drifted: found ${inventoriedCases.length} cases, dispositions declare ${expectedCaseCount}`,
		);
	}

	for (const entry of dispositions.artifacts.filter(function suitesOnly(item) {
		return !SUPPORT_ARTIFACTS.has(item.path);
	})) {
		const actual = inventoriedCases.filter(function forFile(item) {
			return item.file === `test/${entry.path}`;
		}).length;
		if (actual !== entry.caseCount) {
			throw new Error(
				`${entry.path}: disposition caseCount ${entry.caseCount} does not match ${actual} extracted cases`,
			);
		}
	}

	const crosswalk = verifyCaseCrosswalk(repoRoot, inventoriedCases);

	const expectedAdaptedEvidence = readFileSync(
		resolve(repoRoot, ADAPTED_EVIDENCE_INVENTORY_PATH),
		'utf8',
	);
	const actualAdaptedEvidence = renderReactTransitionGroupAdaptedEvidenceInventory(repoRoot);
	if (actualAdaptedEvidence !== expectedAdaptedEvidence) {
		throw new Error(
			'react-transition-group adapted assertion/fixture inventory drifted; review and record the change',
		);
	}

	const contracts = verifyAdaptedCaseContracts(repoRoot);

	return {
		artifacts: artifacts.length,
		cases: inventoriedCases.length,
		adaptedCases: crosswalk.adapted,
		notApplicableCases: crosswalk.notApplicable,
		contractCases: contracts.cases,
		contractAssertions: contracts.assertions,
	};
}
