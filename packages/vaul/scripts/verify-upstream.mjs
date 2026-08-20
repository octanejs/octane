import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

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
 * Verifies every vendored Vaul upstream byte against the upstream git blob
 * shas in audit/upstream.lock.json and confirms the required Playwright
 * test-boundary artifacts are present.
 */
export function verifyVaulUpstream(root = packageRoot) {
	const upstream = join(root, 'upstream');
	execFileSync(
		process.execPath,
		[join(repoRoot, 'scripts/react-port/materialize.mjs'), 'run', '--check', '--package-dir', root],
		{ cwd: repoRoot, stdio: 'pipe' },
	);

	const actualFiles = walk(upstream)
		.map(function toRelative(path) {
			return toPortable(relative(upstream, path));
		})
		.sort();

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

	return { files: actualFiles.length };
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifyVaulUpstream();
	console.log(`Vaul upstream evidence is current (${result.files} byte-exact files).`);
}
