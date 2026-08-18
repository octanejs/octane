import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = join(packageRoot, 'upstream');
const sumsFile = join(upstreamRoot, 'SHA256SUMS');
const TRANSFORM_LEDGER = 'audit/adapted-transformations.json';

const ADAPTED_PAIRS = [
	['tests/machine.test.ts', 'tests/upstream/machine.test.ts'],
	['tests/nested-states.test.ts', 'tests/upstream/nested-states.test.ts'],
	['tests/render.ts', 'tests/upstream/render.ts'],
];

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * Inverse of the allowed adapted-suite transforms in
 * audit/adapted-transformations.json. The resulting text is hashed against the
 * pristine original so assertion/fixture drift cannot hide behind titles alone.
 */
export function normalizeZagParitySource(source) {
	let text = source.replace(/\r\n/g, '\n');
	text = text
		.split('\n')
		.filter(function keepLine(line) {
			const trimmed = line.trim();
			if (/^\/\/\s*Adapted from\b/u.test(trimmed)) return false;
			if (/^\/\/\s*Per\s+tests\//u.test(trimmed)) return false;
			return true;
		})
		.join('\n');
	text = text.replace(/^import\s*\{[^}]*\}\s*from\s*['"]vitest['"];?\s*\n/gmu, '');
	text = text.split("from '@octanejs/testing-library'").join('from "@testing-library/react"');
	text = text.split('from "@octanejs/testing-library"').join('from "@testing-library/react"');
	text = text.split("from '@octanejs/zag'").join('from "../src"');
	text = text.split('from "@octanejs/zag"').join('from "../src"');
	text = text.replace(/\t/gu, '  ');
	text = text
		.split('\n')
		.map(function normalizeLine(line) {
			let out = line.replace(/\s+$/u, '');
			if (out.endsWith(';')) out = out.slice(0, -1);
			if (!out.trim().startsWith('//')) out = out.replace(/'/gu, '"');
			return out;
		})
		.filter(function dropBlank(line) {
			return line.trim().length > 0;
		})
		.join('\n');
	return `${text}\n`;
}

export function zagParitySourceDigest(source) {
	return createHash('sha256').update(normalizeZagParitySource(source)).digest('hex');
}

/**
 * Structurally hash-checks adapted suite files (and render.ts) against the
 * pristine originals under the allowed-transformation ledger.
 */
export function assertZagAdaptedSourceCrosswalk(root = packageRoot) {
	const ledgerPath = join(root, TRANSFORM_LEDGER);
	if (!existsSync(ledgerPath)) {
		throw new Error(`Missing adapted transformation ledger: ${TRANSFORM_LEDGER}`);
	}
	const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
	if (
		ledger.schemaVersion !== 1 ||
		!Array.isArray(ledger.transforms) ||
		ledger.transforms.length === 0
	) {
		throw new Error(
			`${TRANSFORM_LEDGER}: schemaVersion 1 with a non-empty transforms list is required`,
		);
	}

	const pairs = [];
	for (const [upstreamFile, adaptedFile] of ADAPTED_PAIRS) {
		const upstreamPath = join(root, 'upstream', upstreamFile);
		const adaptedPath = join(root, adaptedFile);
		if (!existsSync(adaptedPath)) {
			throw new Error(`Missing adapted counterpart for ${upstreamFile}: ${adaptedFile}`);
		}
		const upstreamDigest = zagParitySourceDigest(readFileSync(upstreamPath, 'utf8'));
		const adaptedDigest = zagParitySourceDigest(readFileSync(adaptedPath, 'utf8'));
		if (upstreamDigest !== adaptedDigest) {
			throw new Error(
				`Adapted source drifted from ${upstreamFile} after allowed transforms (assertion/fixture hash mismatch)`,
			);
		}
		pairs.push({ upstreamFile, adaptedFile, digest: adaptedDigest });
	}
	return { pairs: pairs.length, transforms: ledger.transforms.length };
}

/**
 * Verifies every vendored Zag React adapter byte against upstream/SHA256SUMS
 * and confirms the required runtime test artifacts are present.
 */
export function verifyZagUpstream(root = packageRoot) {
	const upstream = join(root, 'upstream');
	const sums = join(upstream, 'SHA256SUMS');
	const expected = new Map(
		readFileSync(sums, 'utf8')
			.trim()
			.split('\n')
			.map(function parseLine(line) {
				const [hash, path] = line.split(/\s{2}/u);
				return [path, hash];
			}),
	);

	const actualFiles = walk(upstream)
		.map(function toRelative(path) {
			return relative(upstream, path);
		})
		.filter(function keepSource(path) {
			return path !== 'SHA256SUMS';
		})
		.sort();
	const expectedFiles = [...expected.keys()].sort();

	if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error('Vendored Zag file inventory differs from upstream/SHA256SUMS');
	}

	for (const path of actualFiles) {
		const bytes = readFileSync(join(upstream, path));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (hash !== expected.get(path)) throw new Error(`Vendored byte drift: ${path}`);
	}

	for (const required of [
		'tests/machine.test.ts',
		'tests/nested-states.test.ts',
		'tests/strict-mode.test.tsx',
		'tests/render.ts',
		'src/machine.ts',
		'src/index.ts',
		'vite.config.ts',
		'vitest.setup.ts',
	]) {
		if (!existsSync(join(upstream, required)))
			throw new Error(`Missing upstream test artifact: ${required}`);
	}

	// Title-level one-for-one check stays as a fast inventory guard; the
	// structural hash below is the assertion/fixture integrity gate.
	const adaptedPairs = [
		['tests/machine.test.ts', 'tests/upstream/machine.test.ts'],
		['tests/nested-states.test.ts', 'tests/upstream/nested-states.test.ts'],
	];
	for (const [upstreamFile, adaptedFile] of adaptedPairs) {
		const upstreamTitles = testTitles(readFileSync(join(upstream, upstreamFile), 'utf8'));
		const adaptedPath = join(root, adaptedFile);
		if (!existsSync(adaptedPath))
			throw new Error(`Missing adapted counterpart for ${upstreamFile}: ${adaptedFile}`);
		const adaptedTitles = testTitles(readFileSync(adaptedPath, 'utf8'));
		if (JSON.stringify(upstreamTitles) !== JSON.stringify(adaptedTitles)) {
			throw new Error(
				`Adapted titles drifted from ${upstreamFile}; expected ${upstreamTitles.length} cases, found ${adaptedTitles.length}`,
			);
		}
	}
	if (!existsSync(join(root, 'tests/upstream-original.test.ts'))) {
		throw new Error('Missing pristine wrapper packages/zag/tests/upstream-original.test.ts');
	}

	const crosswalk = assertZagAdaptedSourceCrosswalk(root);

	return { files: actualFiles.length, adaptedSourcePairs: crosswalk.pairs };
}

function testTitles(source) {
	const titles = [];
	for (const match of source.matchAll(/^\s*test\(\s*(['"`])([\s\S]*?)\1/gmu)) {
		titles.push(match[2]);
	}
	return titles;
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifyZagUpstream();
	console.log(
		`Zag upstream evidence is current (${result.files} byte-exact files, ${result.adaptedSourcePairs} adapted source pairs).`,
	);
}
