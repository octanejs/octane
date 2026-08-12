import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = await readFile(resolve(packageRoot, 'audit/SHA256SUMS'), 'utf8');
const entries = manifest
	.trim()
	.split('\n')
	.map((line) => {
		const [expected, relativePath] = line.split(/\s{2}/);
		return { expected, relativePath };
	});
const upstreamRoot = resolve(packageRoot, 'upstream');
const expectedPaths = entries.map(({ relativePath }) => relativePath).sort();
const actualPaths = (await readdir(upstreamRoot, { recursive: true, withFileTypes: true }))
	.filter((entry) => entry.isFile())
	.map((entry) =>
		`upstream/${entry.parentPath.slice(upstreamRoot.length + 1)}/${entry.name}`.replace(
			'upstream//',
			'upstream/',
		),
	)
	.sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
	throw new Error('Upstream file inventory drift');
}

const mismatches = await Promise.all(
	entries.map(async ({ expected, relativePath }) => {
		const contents = await readFile(resolve(packageRoot, relativePath));
		const actual = createHash('sha256').update(contents).digest('hex');
		return actual === expected ? null : relativePath;
	}),
);
const mismatch = mismatches.find((relativePath) => relativePath !== null);
if (mismatch) throw new Error(`Upstream drift: ${mismatch}`);

console.log('react-transition-group v4.4.5 upstream evidence verified');
