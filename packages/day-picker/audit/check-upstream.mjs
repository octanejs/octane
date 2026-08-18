import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function toPortablePath(path) {
	return path.replaceAll('\\', '/');
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');
const expected = JSON.parse(
	await readFile(resolve(packageRoot, 'audit/upstream-integrity.json'), 'utf8'),
);
const files = (await readdir(upstreamRoot, { recursive: true, withFileTypes: true }))
	.filter((entry) => entry.isFile())
	.map((entry) =>
		toPortablePath(`upstream/${relative(upstreamRoot, resolve(entry.parentPath, entry.name))}`),
	)
	.sort();
if (files.length !== expected.files)
	throw new Error(`Upstream inventory drift: expected ${expected.files}, found ${files.length}`);
const lines = await Promise.all(
	files.map(async (relativePath) => {
		const digest = createHash('sha256')
			.update(await readFile(resolve(packageRoot, relativePath)))
			.digest('hex');
		return `${digest}  ${relativePath}\n`;
	}),
);
const digest = createHash('sha256').update(lines.join('')).digest('hex');
if (digest !== expected.digest) throw new Error(`Upstream integrity drift: ${digest}`);
const rootLicense = await readFile(resolve(packageRoot, 'LICENSE'), 'utf8');
const upstreamLicense = await readFile(resolve(packageRoot, 'upstream/LICENSE'), 'utf8');
if (rootLicense !== upstreamLicense) throw new Error('Published license does not match upstream');
console.log('react-day-picker v10.0.1 upstream evidence verified');
