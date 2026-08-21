import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
};

const EXECUTABLE_DISPOSITIONS = new Set(['adapted-and-executable']);
const PENDING_DISPOSITIONS = new Set(['pending-adaptation']);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function filesUnder(root) {
	const files = [];
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else files.push(relative(root, path).replaceAll('\\', '/'));
		}
	}
	await visit(root);
	return files.sort();
}

function directCases(source) {
	const pattern = /^\s*(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/gm;
	return [...source.matchAll(pattern)].map((match) => ({
		index: match.index,
		line: source.slice(0, match.index).split(/\r?\n/).length,
		name: match[2].replace(/\\(["'`\\])/g, '$1'),
	}));
}

function eachCases(source) {
	const pattern =
		/^\s*(?:it|test)\.each(?:<[^;]*?>)?\s*`[\s\S]*?`\s*\(\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/gm;
	return [...source.matchAll(pattern)].map((match) => ({
		index: match.index,
		line: source.slice(0, match.index).split(/\r?\n/).length,
		name: match[2].replace(/\\(["'\\])/g, '$1'),
	}));
}

function staticCases(source) {
	return [...directCases(source), ...eachCases(source)]
		.sort((left, right) => left.index - right.index)
		.map(({ index: _index, ...entry }) => entry);
}

function testTitles(source) {
	return new Set(staticCases(source).map(({ name }) => name));
}

function matchingDelimiter(source, start, open, close) {
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let index = start; index < source.length; index++) {
		const character = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = null;
			continue;
		}
		if (character === "'" || character === '"' || character === '`') {
			quote = character;
			continue;
		}
		if (character === open) depth++;
		else if (character === close && --depth === 0) return index;
	}
	return -1;
}

function caseBody(source, title) {
	const entry = [...directCases(source), ...eachCases(source)].find(function hasTitle(candidate) {
		return candidate.name === title;
	});
	if (!entry) return null;
	const open = source.indexOf('(', entry.index);
	const close = matchingDelimiter(source, open, '(', ')');
	return close === -1 ? null : source.slice(entry.index, close + 1);
}

function stripStatementSemicolons(source) {
	let result = '';
	let quote = null;
	let escaped = false;
	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (quote) {
			result += character;
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = null;
			continue;
		}
		if (character === "'" || character === '"' || character === '`') {
			quote = character;
			result += character;
			continue;
		}
		if (character === ';') continue;
		result += character;
	}
	return result;
}

function normalizeCaseStructure(body) {
	let normalized = stripStatementSemicolons(
		body
			.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
			.replace(/\bfunction\s*\(([^)]*)\)\s*\{/g, '($1)=>{')
			.replace(/\s+/g, ''),
	);
	// Collapse single-statement arrow blocks so `() => expr` and
	// `function () { expr; }` normalize identically. String-fixture semicolons
	// survive stripStatementSemicolons and remain part of the digest.
	for (let pass = 0; pass < 4; pass++) {
		const next = normalized.replace(/(\([^)]*\)=>)\{([^{}]+)\}/g, '$1$2');
		if (next === normalized) break;
		normalized = next;
	}
	return normalized;
}

export function caseStructuralDigest(source, title) {
	const body = caseBody(source, title);
	if (!body) throw new Error(`test case is missing: ${title}`);
	if (!/\bexpect\s*\(/.test(body)) throw new Error(`test case has no expectations: ${title}`);
	if (!/\.to(?:Be|Throw)\s*\(/.test(body))
		throw new Error(`test case has no assertion target: ${title}`);
	// Hash the full normalized callback (and it.each table when present), not a
	// selective projection of expects/strings. Call subjects, numeric inputs,
	// constructors, and other body structure must participate in the digest.
	return sha256(normalizeCaseStructure(body));
}

export function compareAdaptedEvidence({
	upstreamSource,
	upstreamTitle,
	adaptedSource,
	adaptedTitle,
}) {
	const upstreamDigest = caseStructuralDigest(upstreamSource, upstreamTitle);
	const adaptedDigest = caseStructuralDigest(adaptedSource, adaptedTitle);
	if (adaptedDigest !== upstreamDigest) {
		throw new Error(`adapted evidence diverges from upstream: ${adaptedTitle}`);
	}
	return { adaptedDigest, upstreamDigest };
}

async function authoredTests(root) {
	const discovered = [];
	const testsRoot = join(root, 'tests');
	for (const path of await filesUnder(testsRoot)) {
		if (/\.test\.(?:ts|tsx|tsrx|mjs)$/.test(path)) discovered.push(`tests/${path}`);
	}
	const typetestsRoot = join(root, 'typetests');
	try {
		for (const path of await filesUnder(typetestsRoot)) {
			if (/\.test\.(?:ts|tsx|tsrx)$/.test(path)) discovered.push(`typetests/${path}`);
		}
	} catch (error) {
		if (error && error.code !== 'ENOENT') throw error;
	}
	return discovered.sort();
}

async function validateTestClassifications(root, tests) {
	const classifications = JSON.parse(
		await readFile(join(root, 'audit/test-classifications.json'), 'utf8'),
	);
	assert(Array.isArray(classifications.tests), 'test classifications must declare tests');
	const declared = classifications.tests
		.map(function pathOf(entry) {
			assert(typeof entry.path === 'string', 'test classification path is required');
			return entry.path.replace(/^packages\/pdf\//, '');
		})
		.sort();
	assert(
		JSON.stringify(tests) === JSON.stringify(declared),
		'every authored pdf test must have exactly one classification',
	);
	return classifications.tests;
}

function normalizeMapping(value) {
	if (typeof value === 'string') {
		if (value.startsWith('disposition:')) {
			return {
				disposition: value.slice('disposition:'.length),
				rationale:
					'No one-for-one Octane counterpart yet; ordinary package coverage is not adapted-octane parity evidence.',
			};
		}
		return {
			disposition: 'adapted-and-executable',
			evidence: value,
		};
	}
	assert(value && typeof value === 'object', 'case-map entries must be strings or objects');
	assert(typeof value.disposition === 'string', 'case-map disposition is required');
	return value;
}

// Inventory identities keep the historical tag/, npm/, and support/ prefixes;
// the trees live at upstream/packages/react-pdf, upstream-artifact/, and the
// upstream/ root (repo-root fixtures) respectively.
function aliasedAbsolute(root, path) {
	if (path.startsWith('npm/')) return join(root, 'upstream-artifact', path.slice('npm/'.length));
	if (path.startsWith('tag/')) {
		return join(root, 'upstream/packages/react-pdf', path.slice('tag/'.length));
	}
	return join(root, 'upstream', path.slice('support/'.length));
}

async function aliasedUpstreamFiles(root) {
	const tag = (await filesUnder(join(root, 'upstream/packages/react-pdf'))).map(
		(path) => `tag/${path}`,
	);
	const npm = (await filesUnder(join(root, 'upstream-artifact'))).map((path) => `npm/${path}`);
	const support = (await filesUnder(join(root, 'upstream')))
		.filter((path) => !path.startsWith('packages/'))
		.map((path) => `support/${path}`);
	return [...tag, ...npm, ...support].sort();
}

async function upstreamCases(root, artifactPaths) {
	const cases = [];
	for (const file of artifactPaths.filter((path) =>
		/^tag\/src\/.*\.(?:spec|test)\.tsx?$/.test(path),
	)) {
		const source = await readFile(aliasedAbsolute(root, file), 'utf8');
		for (const entry of staticCases(source)) {
			cases.push({
				id: `${file}:${entry.line}::${entry.name}`,
				file,
				...entry,
				kind: 'runtime',
			});
		}
	}
	return cases;
}

function defaultMapping(entry) {
	// Only exact one-for-one private helpers are claimed as adapted evidence.
	// Everything else is an explicit pending disposition until a dedicated counterpart exists.
	if (entry.file.endsWith('shared/utils.spec.ts')) {
		const utilsEvidence = {
			'returns $expectedResult given $input':
				'tests/runtime/private-evidence.test.ts::returns $expectedResult given $input',
			'throws given invalid data URI':
				'tests/runtime/private-evidence.test.ts::throws given invalid data URI',
			'returns a byte string given plain text data URI':
				'tests/runtime/private-evidence.test.ts::returns a byte string given plain text data URI',
			'returns a byte string given base64 data URI':
				'tests/runtime/private-evidence.test.ts::returns a byte string given base64 data URI',
			'returns a byte string given base64 PDF data URI':
				'tests/runtime/private-evidence.test.ts::returns a byte string given base64 PDF data URI',
			'returns a byte string given base64 PDF data URI with filename':
				'tests/runtime/private-evidence.test.ts::returns a byte string given base64 PDF data URI with filename',
		};
		const evidence = utilsEvidence[entry.name];
		if (evidence) {
			return {
				disposition: 'adapted-and-executable',
				evidence,
			};
		}
	}
	if (entry.file.endsWith('Ref.spec.ts')) {
		const refEvidence = {
			'returns proper reference for given num and gen':
				'tests/runtime/private-evidence.test.ts::returns proper reference for given num and gen',
			'returns proper reference for given num and gen when gen = 0':
				'tests/runtime/private-evidence.test.ts::returns proper reference for given num and gen when gen = 0',
		};
		const evidence = refEvidence[entry.name];
		if (evidence) {
			return {
				disposition: 'adapted-and-executable',
				evidence,
			};
		}
	}
	return {
		disposition: 'pending-adaptation',
		rationale:
			'No one-for-one Octane counterpart yet. Browser, shell, SSR, feasibility, and packed coverage remain ordinary package tests outside adapted-octane parity accounting.',
	};
}

export async function buildDefaultCaseMap(root = packageRoot) {
	const paths = await aliasedUpstreamFiles(root);
	const cases = await upstreamCases(root, paths);
	return Object.fromEntries(cases.map((entry) => [entry.id, defaultMapping(entry)]));
}

export async function buildInventory(root = packageRoot) {
	const artifactPaths = await aliasedUpstreamFiles(root);
	const artifacts = await Promise.all(
		artifactPaths.map(async (path) => {
			const bytes = await readFile(aliasedAbsolute(root, path));
			return { path, bytes: bytes.length, sha256: sha256(bytes) };
		}),
	);
	const cases = await upstreamCases(root, artifactPaths);
	const caseMap = JSON.parse(await readFile(join(root, 'audit/case-map.json'), 'utf8'));
	const upstreamIds = cases.map(({ id }) => id);

	assert(
		new Set(upstreamIds).size === upstreamIds.length,
		'upstream case identities must be unique',
	);
	assert(Object.keys(caseMap).length === cases.length, 'case map count does not match upstream');
	for (const id of upstreamIds) assert(caseMap[id], `missing executable mapping for ${id}`);
	for (const id of Object.keys(caseMap)) {
		assert(upstreamIds.includes(id), `stale or renamed upstream mapping ${id}`);
	}

	const evidenceCache = new Map();
	const crosswalk = [];
	for (const entry of cases) {
		const mapping = normalizeMapping(caseMap[entry.id]);
		assert(
			EXECUTABLE_DISPOSITIONS.has(mapping.disposition) ||
				PENDING_DISPOSITIONS.has(mapping.disposition),
			`unknown disposition for ${entry.id}: ${mapping.disposition}`,
		);
		if (EXECUTABLE_DISPOSITIONS.has(mapping.disposition)) {
			assert(typeof mapping.evidence === 'string', `missing evidence for ${entry.id}`);
			const split = mapping.evidence.lastIndexOf('::');
			const path = mapping.evidence.slice(0, split);
			const title = mapping.evidence.slice(split + 2);
			await access(join(root, path));
			if (!evidenceCache.has(path))
				evidenceCache.set(path, await readFile(join(root, path), 'utf8'));
			assert(
				testTitles(evidenceCache.get(path)).has(title),
				`mapped executable test is missing: ${mapping.evidence}`,
			);
			const upstreamSource = await readFile(aliasedAbsolute(root, entry.file), 'utf8');
			const digests = compareAdaptedEvidence({
				upstreamSource,
				upstreamTitle: entry.name,
				adaptedSource: evidenceCache.get(path),
				adaptedTitle: title,
			});
			crosswalk.push({
				upstream: entry.id,
				disposition: mapping.disposition,
				evidence: mapping.evidence,
				...digests,
			});
		} else {
			assert(
				typeof mapping.rationale === 'string' && mapping.rationale.length > 0,
				`pending disposition for ${entry.id} requires rationale`,
			);
			crosswalk.push({
				upstream: entry.id,
				disposition: mapping.disposition,
				rationale: mapping.rationale,
			});
		}
	}

	const publicSurface = JSON.parse(
		await readFile(join(root, 'upstream-public-surface.json'), 'utf8'),
	);
	const indexSource = await readFile(join(root, 'src/index.ts'), 'utf8');
	for (const name of [...publicSurface.rootRuntimeExports, ...publicSurface.rootTypeExports]) {
		assert(new RegExp(`\\b${name}\\b`).test(indexSource), `missing public export ${name}`);
	}
	const authored = await authoredTests(root);
	await validateTestClassifications(root, authored);

	return {
		schemaVersion: 1,
		release: {
			package: 'react-pdf',
			version: '10.4.1',
			tag: 'v10.4.1',
			commit: '5338e7a24c7ad17d1028146cf8a025a75e0abe79',
			tagArchiveSha256: 'afc69e121c7f845dbc6bf88e584c5a7a74154c3e2b89c35ce42b3b3bb93d86ce',
			npmIntegrity:
				'sha512-kS/35staVCBqS29verTQJQZXw7RfsRCPO3fdJoW1KXylcv7A9dw6DZ3vJXC2w+bIBgLw5FN4pOFvKSQtkQhPfA==',
			npmShasum: '7419d45a96ffbce09e2d9919ee330a0d5147d2ed',
			npmTarballSha256: '41cd9570bca79572aa2b78b1dcec90f308291a5a85e680f4b751950e16c4d525',
			license: 'MIT',
		},
		publicSurface: {
			runtimeExports: publicSurface.rootRuntimeExports,
			typeExports: publicSurface.rootTypeExports,
			subpaths: ['.', './dist/Page/AnnotationLayer.css', './dist/Page/TextLayer.css'],
		},
		artifacts,
		upstreamCases: cases,
		crosswalk,
		authoredTests: authored,
	};
}

export function compareInventories(actual, expected) {
	assert(
		JSON.stringify(actual.release) === JSON.stringify(expected.release),
		'immutable release coordinates changed',
	);
	assert(
		JSON.stringify(actual.publicSurface) === JSON.stringify(expected.publicSurface),
		'public surface changed',
	);
	assert(
		JSON.stringify(actual.artifacts) === JSON.stringify(expected.artifacts),
		'upstream artifact inventory or checksum changed',
	);
	assert(
		JSON.stringify(actual.upstreamCases) === JSON.stringify(expected.upstreamCases),
		'upstream case inventory changed',
	);
	assert(
		JSON.stringify(actual.crosswalk) === JSON.stringify(expected.crosswalk),
		'upstream executable crosswalk changed',
	);
	assert(
		JSON.stringify(actual.authoredTests) === JSON.stringify(expected.authoredTests),
		'authored test inventory changed',
	);
}

export async function validate(root = packageRoot) {
	const actual = await buildInventory(root);
	const expected = JSON.parse(await readFile(join(root, 'audit/upstream-inventory.json'), 'utf8'));
	compareInventories(actual, expected);
	return actual;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (process.argv.includes('--print-case-map')) {
		console.log(JSON.stringify(await buildDefaultCaseMap(), null, 2));
	} else if (process.argv.includes('--write-case-map')) {
		const caseMap = await buildDefaultCaseMap();
		const destination = join(packageRoot, 'audit/case-map.json');
		await writeFile(destination, `${JSON.stringify(caseMap, null, 2)}\n`);
		console.log(`${destination}: ${Object.keys(caseMap).length} entries`);
	} else if (process.argv.includes('--print-inventory')) {
		console.log(JSON.stringify(await buildInventory(), null, 2));
	} else if (process.argv.includes('--write-inventory')) {
		const inventory = await buildInventory();
		const destination = join(packageRoot, 'audit/upstream-inventory.json');
		await writeFile(destination, `${JSON.stringify(inventory, null, 2)}\n`);
		console.log(
			`${destination}: ${inventory.artifacts.length} artifacts, ${inventory.upstreamCases.length} cases`,
		);
	} else {
		// The committed upstream/ tree also verifies against the lock's
		// upstream git blob shas.
		const { execFileSync } = await import('node:child_process');
		execFileSync(
			process.execPath,
			[
				join(packageRoot, '../../scripts/react-port/materialize.mjs'),
				'run',
				'--check',
				'--package-dir',
				packageRoot,
			],
			{ cwd: join(packageRoot, '../..'), stdio: 'pipe' },
		);
		const inventory = await validate();
		console.log(
			`verified the lock-pinned upstream tree, ${inventory.artifacts.length} artifacts, and ${inventory.upstreamCases.length} upstream cases`,
		);
	}
}
