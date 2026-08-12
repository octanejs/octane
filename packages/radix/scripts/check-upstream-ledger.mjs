import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');
const repositoryRoot = resolve(upstreamRoot, 'repository');
const crosswalkPath = resolve(packageRoot, 'audit/export-crosswalk.json');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function (entry) {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
	});
}

function exportedNames(source) {
	const names = new Set();
	for (const match of source.matchAll(/export\s+\*\s+as\s+(\w+)/g)) names.add(match[1]);
	for (const match of source.matchAll(/export\s+\{([^}]+)\}/g)) {
		for (const part of match[1].split(',')) {
			const trimmed = part.trim();
			if (!trimmed) continue;
			const renamed = trimmed.split(/\s+as\s+/);
			names.add(renamed[renamed.length - 1].trim());
		}
	}
	return names;
}

const checksums = new Map(
	readFileSync(resolve(upstreamRoot, 'SHA256SUMS'), 'utf8')
		.trim()
		.split('\n')
		.map(function (line) {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) throw new Error(`invalid checksum line: ${line}`);
			return [match[2], match[1]];
		}),
);
const files = walk(repositoryRoot)
	.map(function (path) {
		return relative(upstreamRoot, path).split(sep).join('/');
	})
	.sort();
if (
	files.length !== 452 ||
	checksums.size !== files.length ||
	files.some(function (path) {
		return !checksums.has(path);
	})
)
	throw new Error('vendored Radix file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored Radix bytes drifted: ${path}`);
}

const packageFiles = files.filter(function (path) {
	return path.endsWith('/package.json');
});
const packages = packageFiles.map(function (path) {
	return JSON.parse(readFileSync(resolve(upstreamRoot, path), 'utf8'));
});
const unified = packages.find(function (metadata) {
	return metadata.name === 'radix-ui';
});
if (
	packages.length !== 61 ||
	unified?.version !== '1.6.4' ||
	Object.keys(unified.dependencies ?? {}).length !== 55
)
	throw new Error('vendored Radix transitive package graph drifted');

const sourceFiles = files.filter(function (path) {
	return /\/src\//.test(path);
});
const testFiles = files.filter(function (path) {
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
});
if (sourceFiles.length !== 207 || testFiles.length !== 38)
	throw new Error('vendored Radix source or canonical test inventory drifted');

const upstreamIndex = readFileSync(
	resolve(upstreamRoot, 'repository/packages/react/radix-ui/src/index.ts'),
	'utf8',
);
const octaneIndex = readFileSync(resolve(packageRoot, 'src/index.ts'), 'utf8');
const upstreamExports = exportedNames(upstreamIndex);
const octaneExports = exportedNames(octaneIndex);
const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
if (!Array.isArray(crosswalk.exports) || crosswalk.exports.length === 0)
	throw new Error('export crosswalk must list every upstream root export');

const crosswalkUpstream = new Set();
for (const row of crosswalk.exports) {
	if (typeof row.upstream !== 'string' || !row.upstream)
		throw new Error('export crosswalk row missing upstream name');
	if (crosswalkUpstream.has(row.upstream))
		throw new Error(`duplicate export crosswalk row for ${row.upstream}`);
	crosswalkUpstream.add(row.upstream);
	if (!upstreamExports.has(row.upstream))
		throw new Error(`export crosswalk references missing upstream export ${row.upstream}`);
	if (!row.disposition || !row.evidence)
		throw new Error(`export crosswalk row ${row.upstream} needs disposition and evidence`);
	const mapped = Array.isArray(row.octane) ? row.octane : [row.octane];
	for (const name of mapped) {
		if (typeof name !== 'string' || !name)
			throw new Error(`export crosswalk row ${row.upstream} has an empty octane mapping`);
		if (!octaneExports.has(name))
			throw new Error(
				`export crosswalk maps ${row.upstream} → ${name}, but @octanejs/radix does not export ${name}`,
			);
	}
}
for (const name of upstreamExports) {
	if (!crosswalkUpstream.has(name))
		throw new Error(`upstream root export ${name} is missing from the export crosswalk`);
}

const additional = Array.isArray(crosswalk.octaneAdditional) ? crosswalk.octaneAdditional : [];
const additionalNames = new Set(
	additional.map(function (row) {
		return row.octane;
	}),
);
for (const name of octaneExports) {
	const coveredByUpstream = [...crosswalk.exports].some(function (row) {
		const mapped = Array.isArray(row.octane) ? row.octane : [row.octane];
		return mapped.includes(name);
	});
	if (!coveredByUpstream && !additionalNames.has(name))
		throw new Error(
			`@octanejs/radix export ${name} is neither an upstream mapping nor listed in octaneAdditional`,
		);
}

console.log(
	`Radix upstream ledger is current (${packages.length} packages, ${sourceFiles.length} source files, ${testFiles.length} canonical tests, ${files.length} total files, ${crosswalk.exports.length} root export mappings).`,
);
