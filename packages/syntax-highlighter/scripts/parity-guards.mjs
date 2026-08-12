import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

async function walk(root, path = root) {
	const entries = await readdir(path, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(root, child)));
		else files.push(relative(root, child));
	}
	return files;
}

export async function verifyGeneratedTree(expectedRoot, actualRoot, label) {
	const expected = (await walk(expectedRoot)).sort();
	const actual = (await walk(actualRoot)).sort();
	if (JSON.stringify(expected) !== JSON.stringify(actual)) {
		throw new Error(`${label} paths are stale`);
	}
	for (const path of expected) {
		const [expectedBytes, actualBytes] = await Promise.all([
			readFile(join(expectedRoot, path)),
			readFile(join(actualRoot, path)),
		]);
		if (!expectedBytes.equals(actualBytes)) throw new Error(`${label} file is stale: ${path}`);
	}
}

export function verifyEntrypointSurfaces(esm, cjs, expectedCount = 658) {
	if (esm.length !== expectedCount || JSON.stringify(esm) !== JSON.stringify(cjs)) {
		throw new Error(
			`Expected identical ${expectedCount}-file ESM/CJS surfaces, got ${esm.length}/${cjs.length}`,
		);
	}
	if (new Set(esm).size !== esm.length) throw new Error('Published path collision detected');
}

export function verifyRequiredLaneIds(actual, expected) {
	const actualIds = [...actual].sort();
	const expectedIds = [...expected].sort();
	if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
		throw new Error(`required parity lanes changed: ${actualIds.join(', ')}`);
	}
}

function typeCases(source) {
	const markers = [...source.matchAll(/^\/\/ @type-case ([\w:-]+)(?: (adapted-only))?$/gm)];
	const cases = markers.map((marker, index) => {
		const start = marker.index + marker[0].length;
		const end = markers[index + 1]?.index ?? source.length;
		return {
			id: marker[1],
			adaptedOnly: marker[2] === 'adapted-only',
			sha256: createHash('sha256').update(source.slice(start, end).trim()).digest('hex'),
		};
	});
	if (new Set(cases.map(({ id }) => id)).size !== cases.length) {
		throw new Error('duplicate type parity case');
	}
	return cases;
}

export function verifyTypeCaseInventory(pristineSource, adaptedSource, commonIds, adaptedOnlyIds) {
	const pristine = typeCases(pristineSource);
	const adapted = typeCases(adaptedSource);
	verifyRequiredLaneIds(
		pristine.map(({ id }) => id),
		commonIds,
	);
	verifyRequiredLaneIds(
		adapted.filter(({ adaptedOnly }) => !adaptedOnly).map(({ id }) => id),
		commonIds,
	);
	verifyRequiredLaneIds(
		adapted.filter(({ adaptedOnly }) => adaptedOnly).map(({ id }) => id),
		adaptedOnlyIds,
	);
	return {
		schemaVersion: 1,
		allowedTransformations: [
			'React.createElement to Octane createElement',
			'React component identity to Octane ComponentBody',
			'adapted-only runtime statics that exist beyond the pinned declaration package',
		],
		pristine,
		adapted,
	};
}
