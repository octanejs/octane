import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const PRISTINE_RUNTIME = 'packages/tiptap/audit/pristine-runtime.json';
export const ADAPTED_RUNTIME = 'packages/tiptap/audit/adapted-runtime.json';
export const MANIFEST = 'packages/tiptap/audit/react-parity.json';
export const UPSTREAM_MD = 'packages/tiptap/UPSTREAM.md';
export const RUNTIME_PARITY_CONFIG = 'packages/tiptap/audit/runtime-parity.json';

function readJson(root, relativePath) {
	const absolute = resolve(root, relativePath);
	if (!existsSync(absolute)) throw new Error(`missing ${relativePath}`);
	return JSON.parse(readFileSync(absolute, 'utf8'));
}

function listedAdaptedEvidence(markdown) {
	const start = markdown.indexOf('## Upstream runtime suite');
	if (start === -1) throw new Error(`${UPSTREAM_MD}: missing Upstream runtime suite section`);
	const rest = markdown.slice(start);
	const end = rest.indexOf('\n## ');
	const body = end === -1 ? rest : rest.slice(0, end);
	return [...body.matchAll(/`tests\/upstream\/[^`]+\.test\.ts`/g)].map(function path(match) {
		return match[0].slice(1, -1);
	});
}

function listedUpstreamSpecs(markdown) {
	const start = markdown.indexOf('## Upstream runtime suite');
	if (start === -1) throw new Error(`${UPSTREAM_MD}: missing Upstream runtime suite section`);
	const rest = markdown.slice(start);
	const end = rest.indexOf('\n## ');
	const body = end === -1 ? rest : rest.slice(0, end);
	return [...body.matchAll(/`src\/[^`]+`/g)].map(function path(match) {
		return match[0].slice(1, -1);
	});
}

function printNode(node, sourceFile) {
	return ts
		.createPrinter({ removeComments: true })
		.printNode(ts.EmitHint.Unspecified, node, sourceFile)
		.replace(/\s+/g, ' ')
		.trim();
}

function expectRoot(node) {
	let root = node;
	while (
		root.parent &&
		(ts.isPropertyAccessExpression(root.parent) ||
			(ts.isCallExpression(root.parent) && root.parent.expression === root))
	) {
		root = root.parent;
	}
	return root;
}

function isDispatchInteraction(node, sourceFile) {
	if (!ts.isCallExpression(node)) return false;
	const text = printNode(node, sourceFile);
	return /\.dispatchEvent\(/.test(text);
}

function arrayLiteralStrings(node) {
	if (!ts.isArrayLiteralExpression(node)) return [];
	return node.elements
		.map(function element(entry) {
			return ts.isStringLiteral(entry) || ts.isNoSubstitutionTemplateLiteral(entry)
				? entry.text
				: null;
		})
		.filter(function keep(value) {
			return value !== null;
		});
}

function resolveEachEntries(sourceFile, identifier) {
	let entries = [];
	function visit(node) {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === identifier &&
			node.initializer
		) {
			entries = arrayLiteralStrings(node.initializer);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return entries;
}

function collectScenarioBody(body, sourceFile) {
	const expects = [];
	const interactions = [];
	function walk(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'expect'
		) {
			expects.push(printNode(expectRoot(node), sourceFile));
		} else if (isDispatchInteraction(node, sourceFile)) {
			interactions.push(printNode(node, sourceFile));
		}
		ts.forEachChild(node, walk);
	}
	if (body) walk(body);
	return { expects, interactions };
}

function precedingPerCitations(source, sourceFile, node) {
	const trivia = source.slice(node.getFullStart(), node.getStart(sourceFile));
	return [...trivia.matchAll(/\/\/\s*Per\s+([^\n]+)/g)].map(function citation(match) {
		return match[1].trim();
	});
}

function parseCitation(citation) {
	const match = citation.match(/^(upstream\/src\/[^:\s]+):(\d+)\b/);
	if (!match) return null;
	return { path: match[1], line: Number(match[2]) };
}

/**
 * Parse Vitest `it` / expanded `it.each` scenarios from a runtime test source.
 */
export function extractRuntimeScenarios(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const scenarios = [];

	function pushScenario(title, node, body, extra) {
		const collected = collectScenarioBody(body, sourceFile);
		const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
		const end = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
		scenarios.push({
			title,
			startLine: start,
			endLine: end,
			expects: collected.expects,
			interactions: collected.interactions,
			citations: precedingPerCitations(source, sourceFile, node),
			...(extra ?? {}),
		});
	}

	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isCallExpression(node.expression) &&
			ts.isPropertyAccessExpression(node.expression.expression) &&
			ts.isIdentifier(node.expression.expression.expression) &&
			node.expression.expression.expression.text === 'it' &&
			node.expression.expression.name.text === 'each'
		) {
			const eachArg = node.expression.arguments[0];
			const titleNode = node.arguments[0];
			const body = node.arguments[1];
			const template =
				titleNode &&
				(ts.isStringLiteral(titleNode) || ts.isNoSubstitutionTemplateLiteral(titleNode))
					? titleNode.text
					: '%s';
			let entries = [];
			if (ts.isIdentifier(eachArg)) {
				entries = resolveEachEntries(sourceFile, eachArg.text);
			} else if (eachArg) {
				entries = arrayLiteralStrings(eachArg);
			}
			for (const entry of entries) {
				pushScenario(template.replace('%s', entry), node, body, { eachEntry: entry });
			}
			return;
		}

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'it'
		) {
			const titleNode = node.arguments[0];
			if (
				titleNode &&
				(ts.isStringLiteral(titleNode) || ts.isNoSubstitutionTemplateLiteral(titleNode))
			) {
				pushScenario(titleNode.text, node, node.arguments[1]);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return scenarios;
}

function normalizeExpect(text) {
	return text
		.replace(
			/unregisterCalls\.some\(\(\[key\]\)\s*=>\s*key\s*===\s*(\w+)\)/g,
			'unregisterCalls.some(function (call) { return call[0] === $1; })',
		)
		.replace(/expect\(firstLine\)/g, 'expect(__firstStatement__)')
		.replace(/expect\(firstStatement\([^)]*\)\)/g, 'expect(__firstStatement__)');
}

function applyAssertionReplacements(expects, replacements) {
	return expects.map(function replaceOne(text) {
		let next = text;
		for (const replacement of replacements) {
			if (next === replacement.from) {
				next = replacement.to;
				break;
			}
		}
		return next;
	});
}

function replacementsFor(config, pristineRelative, title) {
	return (config.assertionReplacements ?? [])
		.filter(function match(entry) {
			return entry.pristine === pristineRelative && entry.title === title;
		})
		.flatMap(function list(entry) {
			return entry.replacements ?? [];
		});
}

/**
 * Source-level assertion/interaction crosswalk for one pristine/adapted pair.
 */
export function crosswalkRuntimePair(root, pair, config) {
	const pristineAbsolute = resolve(root, pair.pristine);
	const adaptedAbsolute = resolve(root, pair.adapted);
	if (!existsSync(pristineAbsolute)) throw new Error(`missing ${pair.pristine}`);
	if (!existsSync(adaptedAbsolute)) throw new Error(`missing ${pair.adapted}`);

	const pristineSource = readFileSync(pristineAbsolute, 'utf8');
	const adaptedSource = readFileSync(adaptedAbsolute, 'utf8');
	const pristineScenarios = extractRuntimeScenarios(pristineSource, pair.pristine);
	const adaptedScenarios = extractRuntimeScenarios(adaptedSource, pair.adapted);

	if (pristineScenarios.length === 0) {
		throw new Error(`${pair.pristine}: no runtime scenarios extracted`);
	}
	if (pristineScenarios.length !== adaptedScenarios.length) {
		throw new Error(
			`${pair.adapted}: scenario count differs from pristine (${adaptedScenarios.length} vs ${pristineScenarios.length})`,
		);
	}

	const adaptedByTitle = new Map(
		adaptedScenarios.map(function entry(scenario) {
			return [scenario.title, scenario];
		}),
	);
	if (adaptedByTitle.size !== adaptedScenarios.length) {
		throw new Error(`${pair.adapted}: duplicate scenario titles`);
	}

	const pristineSrcPath = pair.pristine.replace(/^packages\/tiptap\//, '');
	let assertions = 0;
	let interactions = 0;

	for (const pristine of pristineScenarios) {
		const adapted = adaptedByTitle.get(pristine.title);
		if (!adapted) {
			throw new Error(`${pair.adapted}: missing scenario ${JSON.stringify(pristine.title)}`);
		}

		const citation = adapted.citations[0];
		if (!citation) {
			throw new Error(
				`${pair.adapted}: scenario ${JSON.stringify(pristine.title)} missing // Per citation`,
			);
		}
		const parsed = parseCitation(citation);
		if (!parsed) {
			throw new Error(
				`${pair.adapted}: scenario ${JSON.stringify(pristine.title)} has unparseable Per citation ${JSON.stringify(citation)}`,
			);
		}
		if (parsed.path !== pristineSrcPath) {
			throw new Error(
				`${pair.adapted}: citation path ${parsed.path} does not match pristine ${pristineSrcPath}`,
			);
		}
		if (parsed.line < pristine.startLine || parsed.line > pristine.endLine) {
			throw new Error(
				`${pair.adapted}: citation ${parsed.path}:${parsed.line} drifted from scenario ${JSON.stringify(pristine.title)} (${pristine.startLine}-${pristine.endLine})`,
			);
		}

		const replacements = replacementsFor(config, pair.pristine, pristine.title);
		const expectedExpects = applyAssertionReplacements(pristine.expects, replacements).map(
			normalizeExpect,
		);
		const actualExpects = adapted.expects.map(normalizeExpect);
		if (JSON.stringify(expectedExpects) !== JSON.stringify(actualExpects)) {
			throw new Error(
				`${pair.adapted}: assertion groups differ for ${JSON.stringify(pristine.title)} (deleted/changed expect outside permitted transformations)`,
			);
		}
		if (JSON.stringify(pristine.interactions) !== JSON.stringify(adapted.interactions)) {
			throw new Error(`${pair.adapted}: interactions differ for ${JSON.stringify(pristine.title)}`);
		}
		assertions += pristine.expects.length;
		interactions += pristine.interactions.length;
	}

	return {
		scenarios: pristineScenarios.length,
		assertions,
		interactions,
	};
}

function assertScenarioPairCoverage(pristine, adapted, config, configPath) {
	const pairedPristine = new Set(
		(config.pairs ?? []).map(function pathOf(pair) {
			return pair.pristine;
		}),
	);
	const pairedAdapted = new Set(
		(config.pairs ?? []).map(function pathOf(pair) {
			return pair.adapted;
		}),
	);
	for (const file of pristine.files ?? []) {
		if (!pairedPristine.has(file)) {
			throw new Error(`${configPath}: pairs omit pristine inventory file ${file}`);
		}
	}
	for (const file of adapted.files ?? []) {
		if (!pairedAdapted.has(file)) {
			throw new Error(`${configPath}: pairs omit adapted inventory file ${file}`);
		}
	}
}

export function verifyTiptapRuntimeScenarios(
	root,
	{ configPath = RUNTIME_PARITY_CONFIG, pristine = null, adapted = null } = {},
) {
	const config = readJson(root, configPath);
	if (!Array.isArray(config.pairs) || config.pairs.length === 0) {
		throw new Error(`${configPath}: pairs must be a non-empty array`);
	}
	if (pristine && adapted) {
		assertScenarioPairCoverage(pristine, adapted, config, configPath);
	}
	let scenarios = 0;
	let assertions = 0;
	let interactions = 0;
	for (const pair of config.pairs) {
		const result = crosswalkRuntimePair(root, pair, config);
		scenarios += result.scenarios;
		assertions += result.assertions;
		interactions += result.interactions;
	}
	return { pairs: config.pairs.length, scenarios, assertions, interactions };
}

/**
 * Executable pristine/adapted runtime crosswalk: inventory identities, UPSTREAM
 * citations, fixture presence, and source-level assertion/interaction parity
 * under the permitted-transformation ledger.
 */
export function verifyTiptapRuntimeCrosswalk(root) {
	const pristine = readJson(root, PRISTINE_RUNTIME);
	const adapted = readJson(root, ADAPTED_RUNTIME);
	const manifest = readJson(root, MANIFEST);
	const upstreamMd = readFileSync(resolve(root, UPSTREAM_MD), 'utf8');

	if (!Array.isArray(pristine.tests) || !Array.isArray(adapted.tests)) {
		throw new Error('tiptap runtime inventories must list tests arrays');
	}
	if (pristine.tests.length === 0) {
		throw new Error('tiptap pristine runtime inventory is empty');
	}
	if (pristine.tests.length !== adapted.tests.length) {
		throw new Error(
			`tiptap pristine/adapted runtime inventories differ in length (${pristine.tests.length} vs ${adapted.tests.length})`,
		);
	}

	const pristineNames = pristine.tests.map(function name(testCase) {
		return testCase.fullName;
	});
	const adaptedNames = adapted.tests.map(function name(testCase) {
		return testCase.fullName;
	});
	const pristineSet = new Set(pristineNames);
	const adaptedSet = new Set(adaptedNames);
	if (pristineSet.size !== pristineNames.length) {
		throw new Error('tiptap pristine runtime inventory has duplicate fullName identities');
	}
	if (adaptedSet.size !== adaptedNames.length) {
		throw new Error('tiptap adapted runtime inventory has duplicate fullName identities');
	}

	const missingFromAdapted = pristineNames.filter(function absent(fullName) {
		return !adaptedSet.has(fullName);
	});
	if (missingFromAdapted.length > 0) {
		throw new Error(
			`adapted runtime inventory omitted pristine identities:\n${missingFromAdapted.join('\n')}`,
		);
	}
	const extraInAdapted = adaptedNames.filter(function absent(fullName) {
		return !pristineSet.has(fullName);
	});
	if (extraInAdapted.length > 0) {
		throw new Error(
			`adapted runtime inventory has identities absent from pristine:\n${extraInAdapted.join('\n')}`,
		);
	}

	const adaptedIds = new Set(
		adapted.tests.map(function idOf(testCase) {
			return testCase.id;
		}),
	);
	for (const divergence of manifest.divergences ?? []) {
		for (const caseId of divergence.caseIds ?? []) {
			if (!caseId.startsWith('runtime:')) continue;
			if (!adaptedIds.has(caseId)) {
				throw new Error(`divergence ${divergence.id} cites unknown adapted runtime case ${caseId}`);
			}
		}
	}

	for (const relativePath of adapted.files ?? []) {
		if (!existsSync(resolve(root, relativePath))) {
			throw new Error(`adapted runtime inventory cites missing fixture ${relativePath}`);
		}
	}
	for (const relativePath of pristine.files ?? []) {
		if (!existsSync(resolve(root, relativePath))) {
			throw new Error(`pristine runtime inventory cites missing fixture ${relativePath}`);
		}
	}

	const citedAdapted = new Set(listedAdaptedEvidence(upstreamMd));
	const citedUpstream = new Set(listedUpstreamSpecs(upstreamMd));
	const pristineSpecs = [
		...new Set(
			pristine.tests.map(function toSrc(testCase) {
				return testCase.file.replace(/^packages\/tiptap\/upstream\//, '');
			}),
		),
	].sort();
	for (const spec of pristineSpecs) {
		if (!citedUpstream.has(spec)) {
			throw new Error(`${UPSTREAM_MD}: missing runtime disposition citation for ${spec}`);
		}
	}
	const adaptedFiles = [...new Set(adapted.files ?? [])]
		.map(function toTestsPath(path) {
			return path.replace(/^packages\/tiptap\//, '');
		})
		.sort();
	for (const file of adaptedFiles) {
		if (!citedAdapted.has(file)) {
			throw new Error(`${UPSTREAM_MD}: missing adapted evidence citation for ${file}`);
		}
	}
	for (const cited of [...citedAdapted].sort()) {
		if (!adaptedFiles.includes(cited)) {
			throw new Error(
				`adapted runtime inventory drifted from UPSTREAM adapted evidence citation ${cited}`,
			);
		}
	}

	const scenarios = verifyTiptapRuntimeScenarios(root, { pristine, adapted });

	return {
		identities: pristine.tests.length,
		pristineFiles: pristineSpecs.length,
		adaptedFiles: adaptedFiles.length,
		scenarios: scenarios.scenarios,
		assertions: scenarios.assertions,
		interactions: scenarios.interactions,
	};
}

/** Mutators used by negative-control tests. */
export function omitAdaptedIdentity(adapted, index = 0) {
	return {
		...adapted,
		tests: adapted.tests.filter(function keep(_testCase, current) {
			return current !== index;
		}),
	};
}

export function renameAdaptedIdentity(adapted, index = 0) {
	return {
		...adapted,
		tests: adapted.tests.map(function rename(testCase, current) {
			if (current !== index) return testCase;
			return { ...testCase, fullName: `${testCase.fullName} (renamed)` };
		}),
	};
}

export function dropAdaptedFixture(adapted, index = 0) {
	const files = [...(adapted.files ?? [])];
	files.splice(index, 1);
	return { ...adapted, files };
}
