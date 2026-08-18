import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = join(packageRoot, 'upstream');
const sumsFile = join(upstreamRoot, 'SHA256SUMS');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * Verifies every vendored @solana/react upstream byte against upstream/SHA256SUMS
 * and confirms the required React test artifacts are present.
 */
export function verifySolanaReactUpstream(root = packageRoot) {
	const upstream = join(root, 'upstream');
	const sums = join(upstream, 'SHA256SUMS');
	if (!existsSync(sums)) throw new Error('Missing packages/solana-react/upstream/SHA256SUMS');
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
		throw new Error('Vendored @solana/react file inventory differs from upstream/SHA256SUMS');
	}

	for (const path of actualFiles) {
		const bytes = readFileSync(join(upstream, path));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (hash !== expected.get(path)) throw new Error(`Vendored byte drift: ${path}`);
	}

	for (const required of [
		'src/__tests__/ClientProvider-test.browser.tsx',
		'src/__tests__/useClientCapability-test.browser.tsx',
		'src/query/__tests__/useRequestQuery-test.browser.tsx',
		'LICENSE',
	]) {
		if (!existsSync(join(upstream, required)))
			throw new Error(`Missing upstream test artifact: ${required}`);
	}

	return { files: actualFiles.length };
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifySolanaReactUpstream();
	console.log(`@solana/react upstream evidence is current (${result.files} byte-exact files).`);
}
