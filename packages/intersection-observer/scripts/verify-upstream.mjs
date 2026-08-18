import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * Verifies every vendored react-intersection-observer upstream byte against
 * upstream/SHA256SUMS and confirms the required React test artifacts are present.
 */
export function verifyIntersectionObserverUpstream(root = packageRoot) {
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
		throw new Error(
			'Vendored intersection-observer file inventory differs from upstream/SHA256SUMS',
		);
	}

	for (const path of actualFiles) {
		const bytes = readFileSync(join(upstream, path));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (hash !== expected.get(path)) throw new Error(`Vendored byte drift: ${path}`);
	}

	for (const required of [
		'src/__tests__/InView.test.tsx',
		'src/__tests__/observe.test.ts',
		'src/__tests__/setup.test.ts',
		'src/__tests__/useInView.test.tsx',
		'src/__tests__/useOnInView.test.tsx',
		'src/__tests__/browser.test.tsx',
	]) {
		if (!existsSync(join(upstream, required))) {
			throw new Error(`Missing upstream test artifact: ${required}`);
		}
	}

	return { files: actualFiles.length };
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifyIntersectionObserverUpstream();
	console.log(
		`Intersection-observer upstream evidence is current (${result.files} byte-exact files).`,
	);
}
