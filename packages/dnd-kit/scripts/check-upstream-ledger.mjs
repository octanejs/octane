import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');
function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? walk(path)
			: entry.isFile() && entry.name !== 'SHA256SUMS'
				? [path]
				: [];
	});
}
const checksums = new Map(
	readFileSync(resolve(upstreamRoot, 'SHA256SUMS'), 'utf8')
		.trim()
		.split('\n')
		.map((line) => {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) throw new Error(`invalid checksum line: ${line}`);
			return [match[2], match[1]];
		}),
);
const files = walk(upstreamRoot).map((path) => relative(upstreamRoot, path).split(sep).join('/'));
if (
	files.length !== 31 ||
	checksums.size !== files.length ||
	files.some((path) => !checksums.has(path))
)
	throw new Error('vendored dnd-kit file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored dnd-kit bytes drifted: ${path}`);
}
const metadata = JSON.parse(readFileSync(resolve(upstreamRoot, 'package.json'), 'utf8'));
if (
	metadata.version !== '0.5.0' ||
	JSON.stringify(Object.keys(metadata.exports).sort()) !==
		JSON.stringify(['.', './hooks', './sortable', './utilities'].sort())
)
	throw new Error('upstream public entrypoint inventory drifted');
if (
	files.some(
		(path) =>
			/(?:^|\/)(?:__tests__|test|tests)\//.test(path) ||
			/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path),
	)
)
	throw new Error('upstream runtime suite state changed');
console.log(`dnd-kit upstream ledger is current (${files.length} files, no upstream test suite).`);
