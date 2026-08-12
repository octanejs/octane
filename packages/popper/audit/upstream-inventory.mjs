import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = join(packageRoot, 'audit/upstream-inventory.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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

function staticCases(source) {
	const pattern = /^\s*(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/gm;
	return [...source.matchAll(pattern)].map((match) => ({
		line: source.slice(0, match.index).split(/\r?\n/).length,
		name: match[2].replace(/\\(["'`\\])/g, '$1'),
		index: match.index,
	}));
}

function normalizeAssertionToken(value) {
	return value.replace(/\s+/g, ' ').trim();
}

/**
 * Capture the assertion and scenario shape of an adapted test body so a rename-
 * preserving deletion of expects / spies fails closed.
 */
export function adaptedCaseStructure(source, title) {
	const cases = staticCases(source);
	const entry = cases.find(function findTitle(candidate) {
		return candidate.name === title;
	});
	assert(entry, `mapped executable test is missing: ${title}`);
	const from = entry.index;
	const next = cases.find(function findNext(candidate) {
		return candidate.index > from;
	});
	const body = source.slice(from, next ? next.index : source.length);
	const tokens = [];
	for (const match of body.matchAll(
		/\b(?:expect|assert)\s*\(([^;]{0,240}?)\)\s*(?:\.\s*([A-Za-z0-9_]+))?/g,
	)) {
		tokens.push(`assert:${normalizeAssertionToken(match[1])}${match[2] ? `.${match[2]}` : ''}`);
	}
	for (const match of body.matchAll(/\b(?:vi|jest)\.(?:spyOn|fn)\s*\(([^;]{0,240}?)\)/g)) {
		tokens.push(`spy:${normalizeAssertionToken(match[1])}`);
	}
	for (const match of body.matchAll(/\btoHaveBeenCalled(?:With)?\s*\(([^)]*)\)/g)) {
		tokens.push(`matcher:toHaveBeenCalled:${normalizeAssertionToken(match[1] ?? '')}`);
	}
	for (const match of body.matchAll(/\b(async function|await Promise\.resolve)\b/g)) {
		tokens.push(`scenario:${match[1]}`);
	}
	assert(tokens.length > 0, `adapted test body has no inventoried assertions: ${title}`);
	return {
		title,
		tokens,
		sha256: sha256(JSON.stringify(tokens)),
	};
}

function testEvidence(source) {
	const titles = new Set(
		staticCases(source).map(function nameOf(entry) {
			return entry.name;
		}),
	);
	const structures = new Map();
	for (const title of titles) {
		structures.set(title, adaptedCaseStructure(source, title));
	}
	return { titles, structures };
}

export async function buildInventory(root = packageRoot) {
	const upstreamRoot = join(root, 'upstream');
	const artifactPaths = await filesUnder(upstreamRoot);
	const artifacts = await Promise.all(
		artifactPaths.map(async (path) => {
			const bytes = await readFile(join(upstreamRoot, path));
			return { path, bytes: bytes.length, sha256: sha256(bytes) };
		}),
	);
	const cases = [];
	for (const file of artifactPaths.filter((path) => /tag\/src\/.*\.test\.js$/.test(path))) {
		const source = await readFile(join(upstreamRoot, file), 'utf8');
		for (const entry of staticCases(source)) {
			cases.push({
				id: `${file}::${entry.name}`,
				file,
				line: entry.line,
				name: entry.name,
				kind: 'runtime',
			});
		}
	}
	for (const file of ['tag/typings/tests/main-test.tsx', 'tag/typings/tests/svg-test.tsx']) {
		cases.push({ id: `${file}::type program`, file, line: 1, name: 'type program', kind: 'types' });
	}
	const caseMap = JSON.parse(await readFile(join(root, 'audit/case-map.json'), 'utf8'));
	const upstreamIds = cases.map(({ id }) => id);
	assert(
		new Set(upstreamIds).size === upstreamIds.length,
		'upstream case identities must be unique',
	);
	assert(
		Object.keys(caseMap).length === 20,
		`case map count ${Object.keys(caseMap).length} does not match 20`,
	);
	for (const id of upstreamIds) assert(caseMap[id], `missing executable mapping for ${id}`);
	for (const id of Object.keys(caseMap))
		assert(upstreamIds.includes(id), `stale or renamed upstream mapping ${id}`);

	const evidenceCache = new Map();
	const adaptedStructures = {};
	for (const evidence of Object.values(caseMap)) {
		if (evidence.startsWith('typescript::')) {
			await access(join(root, evidence.slice('typescript::'.length)));
			continue;
		}
		const split = evidence.lastIndexOf('::');
		const path = evidence.slice(0, split);
		const title = evidence.slice(split + 2);
		if (!evidenceCache.has(path)) {
			evidenceCache.set(path, testEvidence(await readFile(join(root, path), 'utf8')));
		}
		const cached = evidenceCache.get(path);
		assert(cached.titles.has(title), `mapped executable test is missing: ${evidence}`);
		const structure = cached.structures.get(title);
		assert(structure, `mapped adapted assertion structure is missing: ${evidence}`);
		adaptedStructures[evidence] = structure;
	}

	const runtimeExports = ['Manager', 'Popper', 'Reference', 'usePopper'];
	const typeExports = [
		'ManagerProps',
		'Modifier',
		'PopperArrowProps',
		'PopperChildrenProps',
		'PopperProps',
		'RefHandler',
		'ReferenceChildrenProps',
		'ReferenceProps',
		'StrictModifier',
	];
	const indexSource = await readFile(join(root, 'src/index.ts'), 'utf8');
	for (const name of [...runtimeExports, ...typeExports]) {
		assert(new RegExp(`\\b${name}\\b`).test(indexSource), `missing public export ${name}`);
	}

	return {
		schemaVersion: 1,
		release: {
			package: 'react-popper',
			version: '2.3.0',
			tag: 'v2.3.0',
			commit: 'b636fa3ceee14245d670a0c438fe4343c31258e5',
			npmIntegrity:
				'sha512-e1hj8lL3uM+sgSR4Lxzn5h1GxBlpa4CQz0XLF8kx4MDrDRWY0Ena4c97PUeSX9i5W3UAfDP0z0FXCTQkoXUl3Q==',
			npmShasum: '17891c620e1320dce318bad9fede46a5f71c70ba',
			license: 'MIT',
		},
		publicSurface: { runtimeExports, typeExports, subpaths: ['.'] },
		artifacts,
		upstreamCases: cases,
		crosswalk: cases.map((entry) => ({
			upstream: entry.id,
			disposition: 'adapted-and-executable',
			evidence: caseMap[entry.id],
			adaptedStructure: adaptedStructures[caseMap[entry.id]] ?? null,
		})),
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
}

export async function validate(root = packageRoot) {
	const actual = await buildInventory(root);
	const expected = JSON.parse(await readFile(join(root, 'audit/upstream-inventory.json'), 'utf8'));
	compareInventories(actual, expected);
	return actual;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const inventory = await buildInventory();
	if (process.argv.includes('--write')) {
		await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
		console.log(`wrote ${relative(packageRoot, inventoryPath)}`);
	} else {
		await validate();
		console.log(
			`verified ${inventory.artifacts.length} artifacts and ${inventory.upstreamCases.length} upstream cases`,
		);
	}
}
