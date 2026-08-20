import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = join(packageRoot, 'audit/upstream-inventory.json');
const sha256 = function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
};

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

function staticCases(source, topLevel = false) {
	const pattern = topLevel
		? /^(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/gm
		: /^\s*(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/gm;
	return [...source.matchAll(pattern)].map(function toCase(match) {
		return {
			index: match.index,
			line: source.slice(0, match.index).split(/\r?\n/).length,
			name: match[2].replace(/\\(["'`\\])/g, '$1'),
		};
	});
}

function testTitles(source) {
	return new Set(
		staticCases(source).map(function nameOf(entry) {
			return entry.name;
		}),
	);
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
	const entry = staticCases(source).find(function hasTitle(candidate) {
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
	return sha256(normalizeCaseStructure(body));
}

export async function buildInventory(root = packageRoot) {
	// The tag tree lives at upstream/ (lock-verified against upstream git blob
	// shas) and the unpacked npm artifact at upstream-artifact/; the inventory
	// keeps the historical tag/ and npm/ identity prefixes.
	const upstreamRoot = join(root, 'upstream');
	const artifactRoot = join(root, 'upstream-artifact');
	const artifactAbsolute = (path) =>
		path.startsWith('npm/')
			? join(artifactRoot, path.slice('npm/'.length))
			: join(upstreamRoot, path.slice('tag/'.length));
	const artifactPaths = [
		...(await filesUnder(upstreamRoot)).map((path) => `tag/${path}`),
		...(await filesUnder(artifactRoot)).map((path) => `npm/${path}`),
	].sort();
	const artifacts = await Promise.all(
		artifactPaths.map(async function artifactOf(path) {
			const bytes = await readFile(artifactAbsolute(path));
			return { path, bytes: bytes.length, sha256: sha256(bytes) };
		}),
	);
	const upstreamTestFiles = artifactPaths.filter(function keepTest(path) {
		return /tag\/tests\/.*\.(?:js|ts)$/.test(path) && !path.includes('/__mocks__/');
	});
	const cases = [];
	for (const file of upstreamTestFiles) {
		const source = await readFile(artifactAbsolute(file), 'utf8');
		for (const entry of staticCases(source, true)) {
			cases.push({ id: `${file}::${entry.name}`, file, line: entry.line, name: entry.name });
		}
	}
	const explicitCaseMap = JSON.parse(await readFile(join(root, 'audit/case-map.json'), 'utf8'));
	const caseMap = Object.fromEntries(
		cases.map(function mapped(entry) {
			if (explicitCaseMap[entry.id]) return [entry.id, explicitCaseMap[entry.id]];
			throw new Error(`missing executable mapping for ${entry.id}`);
		}),
	);
	const upstreamIds = cases.map(function idOf(entry) {
		return entry.id;
	});
	assert(
		new Set(upstreamIds).size === upstreamIds.length,
		'upstream case identities must be unique',
	);
	assert(
		Object.keys(explicitCaseMap).length === cases.length,
		`case map count ${Object.keys(explicitCaseMap).length} does not match ${cases.length}`,
	);
	for (const id of upstreamIds) assert(caseMap[id], `missing executable mapping for ${id}`);
	for (const id of Object.keys(explicitCaseMap)) {
		assert(upstreamIds.includes(id), `stale or renamed upstream mapping ${id}`);
	}

	const evidenceCache = new Map();
	const crosswalk = [];
	for (const entry of cases) {
		const evidence = caseMap[entry.id];
		const split = evidence.lastIndexOf('::');
		const path = evidence.slice(0, split);
		const title = evidence.slice(split + 2);
		if (!evidenceCache.has(path)) {
			evidenceCache.set(path, await readFile(join(root, path), 'utf8'));
		}
		const adaptedSource = evidenceCache.get(path);
		assert(testTitles(adaptedSource).has(title), `mapped executable test is missing: ${evidence}`);
		const adaptedDigest = caseStructuralDigest(adaptedSource, title);
		crosswalk.push({
			upstream: entry.id,
			disposition: 'adapted-and-executable',
			evidence,
			adaptedDigest,
		});
	}

	const runtimeExports = [
		'HexAlphaColorPicker',
		'HexColorInput',
		'HexColorPicker',
		'HslColorPicker',
		'HslStringColorPicker',
		'HslaColorPicker',
		'HslaStringColorPicker',
		'HsvColorPicker',
		'HsvStringColorPicker',
		'HsvaColorPicker',
		'HsvaStringColorPicker',
		'RgbColorPicker',
		'RgbStringColorPicker',
		'RgbaColorPicker',
		'RgbaStringColorPicker',
		'setNonce',
	];
	const typeExports = ['HslColor', 'HslaColor', 'HsvColor', 'HsvaColor', 'RgbColor', 'RgbaColor'];
	const indexSource = await readFile(join(root, 'src/index.ts'), 'utf8');
	for (const name of [...runtimeExports, ...typeExports]) {
		assert(new RegExp(`\\b${name}\\b`).test(indexSource), `missing public export ${name}`);
	}

	return {
		schemaVersion: 1,
		release: {
			package: 'react-colorful',
			version: '5.8.0',
			tag: 'v5.8.0',
			npmIntegrity:
				'sha512-Wy9OzPfjSN9bF12OB8N7UQvlsZ0I+7wHxpN+bV5BjNQGxOj6IiwkRjevJK9yOBjJWGQvAaf1OXtn8rUeEatAng==',
			npmShasum: '9bc89aac3e8c847b503489614e2d28227b36641f',
			commit: 'd914e7647c40a8bbdb286985176e769d76061732',
			license: 'MIT',
		},
		publicSurface: { runtimeExports, typeExports, subpaths: ['.'] },
		artifacts,
		upstreamCases: cases,
		crosswalk,
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
		await validate();
		console.log(
			`verified the lock-pinned upstream tree, ${inventory.artifacts.length} artifacts, and ${inventory.upstreamCases.length} upstream cases`,
		);
	}
}
