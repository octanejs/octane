import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractTestCases } from './inventory-lib.mjs';

export const CROSSWALK_PATH = 'packages/vaul/audit/adapted-runtime-crosswalk.json';
export const INVENTORIES = {
	vaul: 'packages/vaul/audit/adapted-runtime.json',
	'vaul-browser': 'packages/vaul/audit/adapted-runtime-browser.json',
};
const HELPERS_PATH = 'packages/vaul/upstream/test/tests/helpers.ts';

function readJson(root, relativePath) {
	return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBalancedBody(source, openBraceIndex) {
	let depth = 0;
	let quote = null;
	let inLineComment = false;
	let inBlockComment = false;
	let escaped = false;
	for (let index = openBraceIndex; index < source.length; index++) {
		const ch = source[index];
		const next = source[index + 1];
		if (inLineComment) {
			if (ch === '\n') inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (ch === '*' && next === '/') {
				inBlockComment = false;
				index += 1;
			}
			continue;
		}
		if (quote !== null) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === '\\') {
				escaped = true;
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '/' && next === '/') {
			inLineComment = true;
			index += 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlockComment = true;
			index += 1;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			continue;
		}
		if (ch === '{') {
			depth += 1;
			continue;
		}
		if (ch === '}') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(openBraceIndex + 1, index);
			}
		}
	}
	return null;
}

function skipWhitespace(source, index) {
	while (index < source.length && /\s/.test(source[index])) index += 1;
	return index;
}

function skipBalanced(source, openIndex, openCh, closeCh) {
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let index = openIndex; index < source.length; index++) {
		const ch = source[index];
		if (quote !== null) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === '\\') {
				escaped = true;
				continue;
			}
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			continue;
		}
		if (ch === openCh) {
			depth += 1;
			continue;
		}
		if (ch === closeCh) {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

export function extractCaseBody(source, title) {
	const pattern = new RegExp(
		`(?:(?:it|test)(?:\\.(?:skip|todo|only|failing))*)\\(\\s*(['"])${escapeRegExp(title)}\\1`,
	);
	const match = pattern.exec(source);
	if (!match) return null;
	let index = skipWhitespace(source, match.index + match[0].length);
	if (source[index] === ',') index = skipWhitespace(source, index + 1);
	if (source.slice(index, index + 5) === 'async') {
		index = skipWhitespace(source, index + 5);
	}
	if (source.slice(index, index + 8) === 'function') {
		index = skipWhitespace(source, index + 8);
		// Optional name.
		while (index < source.length && /[\w$]/.test(source[index])) index += 1;
		index = skipWhitespace(source, index);
	}
	if (source[index] === '(') {
		const closeParen = skipBalanced(source, index, '(', ')');
		if (closeParen === -1) return null;
		index = skipWhitespace(source, closeParen + 1);
	}
	if (source.slice(index, index + 2) === '=>') {
		index = skipWhitespace(source, index + 2);
	}
	if (source[index] !== '{') return null;
	return extractBalancedBody(source, index);
}

function extractNamedFunctionBody(source, name) {
	const pattern = new RegExp(
		`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\([^)]*\\)\\s*\\{`,
	);
	const match = pattern.exec(source);
	if (!match) return null;
	const openBrace = match.index + match[0].length - 1;
	return extractBalancedBody(source, openBrace);
}

function expandHelpers(body, helpersSource) {
	const openDrawerBody = helpersSource
		? extractNamedFunctionBody(helpersSource, 'openDrawer')
		: null;
	if (!openDrawerBody) return body;
	return body.replace(/\bopenDrawer\s*\(\s*page\s*\)\s*;?/g, openDrawerBody);
}

function extractFileRoutes(source) {
	const routes = [];
	const pattern = /goto\(\s*(['"`])\/([^'"`]+)\1/g;
	let match;
	while ((match = pattern.exec(source)) !== null) {
		routes.push(match[2]);
	}
	return routes;
}

function pushUnique(list, value) {
	if (!list.includes(value)) list.push(value);
}

export function extractUpstreamObservations(body) {
	const observations = [];
	const clickPattern = /getByTestId\(\s*(['"`])([^'"`]+)\1\s*\)\s*\.\s*click\s*\(/g;
	let match;
	while ((match = clickPattern.exec(body)) !== null) {
		observations.push({ kind: 'click', testId: match[2] });
	}

	const visiblePattern =
		/expect\([\s\S]*?getByTestId\(\s*(['"`])([^'"`]+)\1\s*\)[\s\S]*?\)\s*\.\s*(not\s*\.\s*)?toBeVisible\s*\(/g;
	while ((match = visiblePattern.exec(body)) !== null) {
		observations.push({
			kind: match[3] ? 'gone' : 'visible',
			testId: match[2],
		});
	}

	const textPattern =
		/expect\([\s\S]*?getByTestId\(\s*(['"`])([^'"`]+)\1\s*\)[\s\S]*?\)\s*\.\s*toHaveText\(\s*(['"`])([^'"`]+)\3\s*\)/g;
	while ((match = textPattern.exec(body)) !== null) {
		observations.push({ kind: 'text', testId: match[2], value: match[4] });
	}

	// Only the exit-animation pattern is load-bearing: wait, then assert content gone.
	// Settle-before-assert waits (initial snap / handle) are not required one-for-one.
	if (
		/waitForTimeout\s*\(\s*ANIMATION_DURATION\s*\)[\s\S]*?not\s*\.\s*toBeVisible\s*\(/.test(body)
	) {
		observations.push({ kind: 'wait', name: 'animation' });
	}

	return observations;
}

function requireAnyFragment(label, source, fragments) {
	const hit = fragments.find(function hasFragment(fragment) {
		return source.includes(fragment);
	});
	if (!hit) {
		throw new Error(
			`${label}: missing semantic evidence; expected one of ${JSON.stringify(fragments)}`,
		);
	}
}

function requireAllFragments(label, source, fragments) {
	for (const fragment of fragments) {
		if (!source.includes(fragment)) {
			throw new Error(`${label}: missing required fixture fragment ${JSON.stringify(fragment)}`);
		}
	}
}

function transformsFor(crosswalk, testId) {
	const maps = crosswalk.observationTransforms?.testIds ?? {};
	const mapped = maps[testId];
	if (!mapped) {
		throw new Error(`no observationTransform for upstream testId ${JSON.stringify(testId)}`);
	}
	return mapped;
}

function assertObservationInAdapted(label, adaptedBody, observation, crosswalk) {
	if (observation.kind === 'wait') {
		const waitFragments = crosswalk.observationTransforms?.waits?.animation ?? [
			'setTimeout(resolve, 550)',
			'waitForTimeout(550)',
		];
		requireAnyFragment(`${label} :: wait:animation`, adaptedBody, waitFragments);
		return;
	}

	const mapped = transformsFor(crosswalk, observation.testId);
	if (observation.kind === 'click') {
		requireAnyFragment(`${label} :: click:${observation.testId}`, adaptedBody, mapped.click);
		return;
	}
	if (observation.kind === 'visible') {
		requireAnyFragment(`${label} :: visible:${observation.testId}`, adaptedBody, mapped.visible);
		return;
	}
	if (observation.kind === 'gone') {
		requireAnyFragment(`${label} :: gone:${observation.testId}`, adaptedBody, mapped.gone);
		return;
	}
	if (observation.kind === 'text') {
		const templates = mapped.text ?? [];
		const textFragments = [];
		for (const template of templates) {
			textFragments.push(template.replaceAll('${value}', observation.value));
		}
		// Also accept the literal value near the testid selector evidence.
		textFragments.push(observation.value);
		requireAnyFragment(
			`${label} :: text:${observation.testId}=${observation.value}`,
			adaptedBody,
			textFragments,
		);
	}
}

function fixtureFragmentsForObservation(observation, crosswalk) {
	if (observation.kind === 'wait') return [];
	const mapped = transformsFor(crosswalk, observation.testId);
	return mapped.fixture ?? [];
}

function assertCaseExecutable(source, title, file) {
	const cases = extractTestCases(source, { file });
	const match = cases.find(function findTitle(entry) {
		return entry.title === title;
	});
	if (!match) {
		throw new Error(`adapted case title not registered: ${title}`);
	}
	const blocked = new Set(['skip', 'todo', 'only', 'failing']);
	const hit = (match.modifiers ?? []).find(function isBlocked(modifier) {
		return blocked.has(modifier);
	});
	if (hit) {
		throw new Error(`adapted case must execute without skip/todo/only/failing: ${title}`);
	}
}

export function loadVaulAdaptedCrosswalk(root) {
	return readJson(root, CROSSWALK_PATH);
}

/**
 * Rewrite the committed crosswalk from its identity fields + declared transforms.
 * Drops any refreshable fragment lists so negative controls cannot paper over
 * deleted adapted assertions by editing those lists.
 */
export function refreshVaulAdaptedCrosswalk(root) {
	const current = loadVaulAdaptedCrosswalk(root);
	if (
		!current.observationTransforms ||
		typeof current.observationTransforms !== 'object' ||
		!current.observationTransforms.testIds
	) {
		throw new Error('adapted runtime crosswalk must declare observationTransforms.testIds');
	}
	const refreshed = {
		schemaVersion: 2,
		permittedTransformations: current.permittedTransformations,
		observationTransforms: current.observationTransforms,
		cases: current.cases.map(function identityOnly(entry) {
			return {
				id: entry.id,
				lane: entry.lane,
				project: entry.project,
				adaptedFile: entry.adaptedFile,
				adaptedTitle: entry.adaptedTitle,
				upstream: entry.upstream,
				fixtureFiles: entry.fixtureFiles,
			};
		}),
	};
	writeFileSync(resolve(root, CROSSWALK_PATH), `${JSON.stringify(refreshed, null, 2)}\n`);
	return refreshed;
}

export function verifyVaulAdaptedRuntimeStructure(
	root,
	{ crosswalk = loadVaulAdaptedCrosswalk(root) } = {},
) {
	if (
		!Array.isArray(crosswalk.permittedTransformations) ||
		crosswalk.permittedTransformations.length === 0
	) {
		throw new Error('adapted runtime crosswalk must declare permittedTransformations');
	}
	if (
		!crosswalk.observationTransforms ||
		typeof crosswalk.observationTransforms !== 'object' ||
		!crosswalk.observationTransforms.testIds
	) {
		throw new Error('adapted runtime crosswalk must declare observationTransforms.testIds');
	}
	if (!Array.isArray(crosswalk.cases) || crosswalk.cases.length === 0) {
		throw new Error('adapted runtime crosswalk must declare cases');
	}

	const inventoriesByProject = new Map();
	for (const [project, path] of Object.entries(INVENTORIES)) {
		inventoriesByProject.set(project, readJson(root, path));
	}

	const helpersSource = readFileSync(resolve(root, HELPERS_PATH), 'utf8');
	const casesById = new Map();
	let observationCount = 0;

	for (const entry of crosswalk.cases) {
		if (casesById.has(entry.id)) throw new Error(`duplicate crosswalk case id ${entry.id}`);
		casesById.set(entry.id, entry);
		const inventory = inventoriesByProject.get(entry.project);
		if (!inventory) throw new Error(`${entry.id}: unknown project ${entry.project}`);
		const identity = inventory.tests.find(function findIdentity(test) {
			return test.id === entry.id;
		});
		if (!identity) {
			throw new Error(`${entry.id}: missing from ${INVENTORIES[entry.project]}`);
		}
		if (identity.file !== entry.adaptedFile) {
			throw new Error(`${entry.id}: inventory file drifted from crosswalk`);
		}
		if (!identity.fullName.endsWith(entry.adaptedTitle)) {
			throw new Error(`${entry.id}: inventory fullName drifted from crosswalk title`);
		}

		const adaptedSource = readFileSync(resolve(root, entry.adaptedFile), 'utf8');
		assertCaseExecutable(adaptedSource, entry.adaptedTitle, entry.adaptedFile);
		const adaptedBody = extractCaseBody(adaptedSource, entry.adaptedTitle);
		if (adaptedBody === null) {
			throw new Error(`${entry.id}: could not extract adapted case body for ${entry.adaptedTitle}`);
		}

		const upstreamSource = readFileSync(resolve(root, entry.upstream.file), 'utf8');
		const observations = [];
		for (const title of entry.upstream.titles) {
			if (!upstreamSource.includes(title)) {
				throw new Error(`${entry.id}: upstream citation missing title ${JSON.stringify(title)}`);
			}
			const upstreamBody = extractCaseBody(upstreamSource, title);
			if (upstreamBody === null) {
				throw new Error(`${entry.id}: could not extract upstream case body for ${title}`);
			}
			const expanded = expandHelpers(upstreamBody, helpersSource);
			for (const observation of extractUpstreamObservations(expanded)) {
				observations.push(observation);
			}
		}

		const routeTransforms = crosswalk.observationTransforms.routes ?? {};
		const fixtureNeeds = [];
		for (const route of extractFileRoutes(upstreamSource)) {
			const mapped = routeTransforms[route];
			if (!mapped) continue;
			requireAnyFragment(`${entry.id} :: route:/${route}`, adaptedBody, mapped.adapted);
			for (const fragment of mapped.fixture ?? []) {
				pushUnique(fixtureNeeds, fragment);
			}
		}

		for (const observation of observations) {
			assertObservationInAdapted(entry.id, adaptedBody, observation, crosswalk);
			observationCount += 1;
			for (const fragment of fixtureFragmentsForObservation(observation, crosswalk)) {
				pushUnique(fixtureNeeds, fragment);
			}
		}

		if (!Array.isArray(entry.fixtureFiles) || entry.fixtureFiles.length === 0) {
			throw new Error(`${entry.id}: crosswalk case must declare fixtureFiles`);
		}
		const fixtureSource = entry.fixtureFiles
			.map(function readFixture(fixtureFile) {
				return readFileSync(resolve(root, fixtureFile), 'utf8');
			})
			.join('\n');
		requireAllFragments(`${entry.id} :: fixtures`, fixtureSource, fixtureNeeds);
	}

	for (const [project, inventory] of inventoriesByProject) {
		const covered = new Set(
			crosswalk.cases
				.filter(function keepProject(entry) {
					return entry.project === project;
				})
				.map(function idOf(entry) {
					return entry.id;
				}),
		);
		for (const test of inventory.tests) {
			if (!covered.has(test.id)) {
				throw new Error(
					`${INVENTORIES[project]}: inventory identity ${test.id} lacks a structural crosswalk case`,
				);
			}
		}
	}

	return {
		cases: crosswalk.cases.length,
		projects: Object.keys(INVENTORIES),
		permittedTransformations: crosswalk.permittedTransformations.length,
		observations: observationCount,
	};
}
