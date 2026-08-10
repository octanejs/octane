import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function toPortable(path) {
	return path.split(sep).join('/');
}

/**
 * Verifies every vendored Vaul upstream byte against upstream/SHA256SUMS
 * and confirms the required Playwright test-boundary artifacts are present.
 */
export function verifyVaulUpstream(root = packageRoot) {
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
			return toPortable(relative(upstream, path));
		})
		.filter(function keepSource(path) {
			return path !== 'SHA256SUMS';
		})
		.sort();
	const expectedFiles = [...expected.keys()].sort();

	if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error('Vendored Vaul file inventory differs from upstream/SHA256SUMS');
	}

	for (const path of actualFiles) {
		const bytes = readFileSync(join(upstream, path));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (hash !== expected.get(path)) throw new Error(`Vendored byte drift: ${path}`);
	}

	for (const required of [
		'playwright.config.ts',
		'test/package.json',
		'test/next.config.js',
		'test/tests/base.spec.ts',
		'test/src/app/page.tsx',
		'src/index.tsx',
		'LICENSE.md',
	]) {
		if (!existsSync(join(upstream, required)))
			throw new Error(`Missing upstream test artifact: ${required}`);
	}

	const license = readFileSync(join(upstream, 'LICENSE.md'), 'utf8');
	if (!license.includes('MIT License') || !license.includes('Copyright (c) 2023 Emil Kowalski')) {
		throw new Error('Vaul license evidence does not contain the pinned MIT notice');
	}

	return {
		files: actualFiles.length,
		integrity: `sha256:${createHash('sha256').update(readFileSync(sums)).digest('hex')}`,
	};
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifyVaulUpstream();
	console.log(`Vaul upstream evidence is current (${result.files} byte-exact files).`);
}
