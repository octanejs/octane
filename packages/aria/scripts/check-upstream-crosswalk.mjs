import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyExport, exportedNames } from './crosswalk-lib.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crosswalk = JSON.parse(
	readFileSync(resolve(PACKAGE_ROOT, 'audit/upstream-crosswalk.json'), 'utf8'),
);

const exports = crosswalk.entryPoints.flatMap((entry) =>
	entry.exports.map(([name, kind]) => `${entry.package}:${kind}:${name}`),
);
const artifacts = crosswalk.upstreamArtifacts.map(([path]) => path);

if (crosswalk.provenance.commit !== '1c84a49a1faf50b571c84e00bcf9c60b22ddd03e') {
	throw new Error('crosswalk does not target the pinned React Spectrum commit');
}
if (exports.length !== 1294 || new Set(exports).size !== exports.length) {
	throw new Error('crosswalk must classify 1,294 unique entry-point exports');
}
if (artifacts.length !== 185 || new Set(artifacts).size !== artifacts.length) {
	throw new Error('crosswalk must classify 185 unique upstream test artifacts');
}
if (crosswalk.entryPoints.some((entry) => entry.exports.some((item) => item.length !== 4))) {
	throw new Error('every upstream export requires disposition-specific evidence');
}
if (
	crosswalk.entryPoints.some((entry) =>
		entry.exports.some((item) => !['surface-present-unverified', 'gap'].includes(item[2])),
	)
) {
	throw new Error('every upstream export requires a supported disposition');
}
for (const entry of crosswalk.entryPoints) {
	const octane = exportedNames(resolve(PACKAGE_ROOT, '..', '..', entry.octanePath));
	for (const item of entry.exports) {
		const expected = classifyExport(item[0], item[1], octane, entry.octanePath);
		if (JSON.stringify(item) !== JSON.stringify(expected))
			throw new Error(`${entry.package}:${item[0]} no longer matches the live Octane surface`);
	}
}
if (
	crosswalk.upstreamArtifacts.some(
		(entry) => !['not-adapted', 'not-vendored-support'].includes(entry[2]),
	)
) {
	throw new Error('every upstream test artifact requires a supported disposition');
}

console.log(
	`Aria upstream crosswalk is current (${exports.length} exports, ${artifacts.length} test artifacts).`,
);
