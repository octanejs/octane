import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return walk(path);
		return entry.isFile() && entry.name !== 'SHA256SUMS' ? [path] : [];
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
	files.length !== 30 ||
	checksums.size !== files.length ||
	files.some((path) => !checksums.has(path))
)
	throw new Error('vendored cmdk file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored cmdk bytes drifted: ${path}`);
}

const source = readFileSync(resolve(upstreamRoot, 'cmdk/src/index.tsx'), 'utf8');
for (const exported of [
	'Command',
	'CommandRoot',
	'CommandList',
	'CommandItem',
	'CommandInput',
	'CommandGroup',
	'CommandSeparator',
	'CommandDialog',
	'CommandEmpty',
	'CommandLoading',
	'useCommandState',
	'defaultFilter',
]) {
	if (!new RegExp(`\\b${exported}\\b`).test(source))
		throw new Error(`upstream export missing: ${exported}`);
}
const upstreamSpecs = files.filter((path) => /^test\/[^/]+\.test\.ts$/.test(path));
if (upstreamSpecs.length !== 7) throw new Error('upstream Playwright spec inventory drifted');
const ledger = readFileSync(resolve(packageRoot, 'UPSTREAM.md'), 'utf8');
for (const spec of upstreamSpecs) {
	if (!ledger.includes(`\`${spec}\``)) throw new Error(`upstream spec has no disposition: ${spec}`);
}

console.log(
	`cmdk upstream ledger is current (${files.length} files, ${upstreamSpecs.length} specs).`,
);
