import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * Verifies every vendored @solana/react upstream byte against the upstream git
 * blob shas in audit/upstream.lock.json and confirms the required React test
 * artifacts are present.
 */
export function verifySolanaReactUpstream(root = packageRoot) {
	const upstream = join(root, 'upstream');
	execFileSync(
		process.execPath,
		[join(repoRoot, 'scripts/react-port/materialize.mjs'), 'run', '--check', '--package-dir', root],
		{ cwd: repoRoot, stdio: 'pipe' },
	);

	const actualFiles = walk(upstream)
		.map(function toRelative(path) {
			return relative(upstream, path);
		})
		.sort();

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
