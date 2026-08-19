import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const expected = new Map([
	[
		'upstream/npm/package/index.d.ts',
		'440a231ba7dc84fa1f4abb23291a4839ea0d3c54cb68fb5ceae3382993aff46f',
	],
	[
		'upstream/npm/package/index.d.ts.map',
		'5178645fff3acdf2ed9d31e6da02597191b251a095e9fe4e085805ebeb807d0f',
	],
	[
		'upstream/npm/package/index.js',
		'1420b7245c57274cbaa448e57282bba0f9a60a93ba43bdfe30ac83deba53c1e2',
	],
	[
		'upstream/npm/package/lib/index.d.ts',
		'7c64bc9454c7f6b18f95654fe9c03842ead86eb6e14642a4083f2e7e819efeb1',
	],
	[
		'upstream/npm/package/lib/index.d.ts.map',
		'567cbb00cf3d64145872f2f7f8bebf64f6a96f7b3e9c52d24d8ae9775288c82e',
	],
	[
		'upstream/npm/package/lib/index.js',
		'1c8d95723a74051c354dd4470fb669ae5269baf0ac62aa9b52c4516960ace5ee',
	],
	[
		'upstream/npm/package/license',
		'f6196c64e144f9a6fa9154c3a80bc8b89615a9567934b83a8951879f06ba2aef',
	],
	[
		'upstream/npm/package/package.json',
		'c6b7d280b5e5a6b620ad252abfd318560f2223562e67414fcc3dcd1f784e89c5',
	],
	[
		'upstream/npm/package/readme.md',
		'b57882cd2b30ef3df905644e947c799709d82b10d4cb178346ce8b85d140c3b7',
	],
	['upstream/source/index.js', '1420b7245c57274cbaa448e57282bba0f9a60a93ba43bdfe30ac83deba53c1e2'],
	[
		'upstream/source/lib/index.js',
		'1c8d95723a74051c354dd4470fb669ae5269baf0ac62aa9b52c4516960ace5ee',
	],
	['upstream/source/license', 'f6196c64e144f9a6fa9154c3a80bc8b89615a9567934b83a8951879f06ba2aef'],
	[
		'upstream/source/package.json',
		'c6b7d280b5e5a6b620ad252abfd318560f2223562e67414fcc3dcd1f784e89c5',
	],
	[
		'upstream/source/script/load-jsx.js',
		'0a5ad1f96095e21e399e25c7452e23359084cef9784c1844c462760b04015d08',
	],
	['upstream/source/test.jsx', '05533bc0d41c5ec8f922affccf88d8ca72b3acfaead2462f291e41477c6fb2be'],
	[
		'upstream/source/tsconfig.json',
		'3761ac1db6936e8dfc763fe42f94236c0b35f242e960d48e5dc31f2630ce1de5',
	],
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function extractTests(source) {
	const cases = [];
	const pattern = /\bt\.test\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
	let match;
	while ((match = pattern.exec(source))) {
		const title = match[2].replace(/\\([\\'"])/g, '$1');
		const line = source.slice(0, match.index).split('\n').length;
		cases.push({
			id: `test.jsx:${line}:${title}`,
			title,
			line,
			disposition: 'executed-pristine-adapted',
		});
	}
	return {
		schemaVersion: 1,
		upstreamArtifact: 'source/test.jsx',
		expectedCount: 87,
		cases,
	};
}

async function verify(root = packageRoot) {
	for (const [relative, digest] of expected) {
		const actual = sha256(await readFile(join(root, relative)));
		if (actual !== digest) throw new Error(`Provenance drift: ${relative}`);
	}

	const metadata = JSON.parse(
		await readFile(join(root, 'upstream/npm/package/package.json'), 'utf8'),
	);
	if (
		metadata.name !== 'react-markdown' ||
		metadata.version !== '10.1.0' ||
		metadata.license !== 'MIT'
	) {
		throw new Error('Pinned npm identity or license drifted');
	}

	const api = JSON.parse(await readFile(join(root, 'audit/public-api.json'), 'utf8'));
	const declaration = await readFile(join(root, 'upstream/npm/package/index.d.ts'), 'utf8');
	const runtime = [...declaration.matchAll(/export \{([^}]+)\}/g)]
		.flatMap((match) => match[1].split(','))
		.map((value) => value.trim().replace(/Markdown as default/, 'default'))
		.sort();
	const types = [...declaration.matchAll(/export type (\w+)/g)].map((match) => match[1]).sort();
	if (JSON.stringify(runtime) !== JSON.stringify([...api.runtimeExports].sort())) {
		throw new Error(`Runtime export inventory drifted: ${runtime.join(', ')}`);
	}
	if (JSON.stringify(types) !== JSON.stringify([...api.typeExports].sort())) {
		throw new Error(`Type export inventory drifted: ${types.join(', ')}`);
	}

	const source = await readFile(join(root, 'upstream/source/test.jsx'), 'utf8');
	const actualInventory = extractTests(source);
	if (actualInventory.cases.length !== 87) {
		throw new Error(`Expected 87 upstream cases, found ${actualInventory.cases.length}`);
	}
	const ids = actualInventory.cases.map((entry) => entry.id);
	if (new Set(ids).size !== ids.length) throw new Error('Duplicate upstream test identity');
	const recorded = JSON.parse(await readFile(join(root, 'audit/test-inventory.json'), 'utf8'));
	if (JSON.stringify(recorded) !== JSON.stringify(actualInventory)) {
		throw new Error('Upstream test inventory is stale, renamed, removed, or unclassified');
	}
	return actualInventory;
}

if (process.argv.includes('--write-inventory')) {
	const source = await readFile(join(packageRoot, 'upstream/source/test.jsx'), 'utf8');
	await writeFile(
		join(packageRoot, 'audit/test-inventory.json'),
		`${JSON.stringify(extractTests(source), null, 2)}\n`,
	);
}

await verify();

if (process.argv.includes('--self-test')) {
	const scratch = await mkdtemp(join(tmpdir(), 'react-markdown-provenance-'));
	try {
		for (const relative of [
			...expected.keys(),
			'audit/public-api.json',
			'audit/test-inventory.json',
		]) {
			const target = join(scratch, relative);
			await import('node:fs/promises').then(({ mkdir }) =>
				mkdir(dirname(target), { recursive: true }),
			);
			await writeFile(target, await readFile(join(packageRoot, relative)));
		}

		const mutations = [
			['modified vendored source', 'upstream/source/lib/index.js', '\n// mutation'],
			['altered license', 'upstream/source/license', '\nmutation'],
			['renamed upstream case', 'upstream/source/test.jsx', null],
			['removed recorded case', 'audit/test-inventory.json', null],
			['missing runtime export', 'audit/public-api.json', null],
		];
		for (const [name, relative, suffix] of mutations) {
			const target = join(scratch, relative);
			const original = await readFile(target, 'utf8');
			let mutated = `${original}${suffix ?? ''}`;
			if (name === 'renamed upstream case')
				mutated = original.replace('should work', 'should work renamed');
			if (name === 'removed recorded case') {
				const inventory = JSON.parse(original);
				inventory.cases.pop();
				mutated = JSON.stringify(inventory);
			}
			if (name === 'missing runtime export') {
				const api = JSON.parse(original);
				api.runtimeExports.pop();
				mutated = JSON.stringify(api);
			}
			await writeFile(target, mutated);
			let rejected = false;
			try {
				await verify(scratch);
			} catch {
				rejected = true;
			}
			if (!rejected) throw new Error(`Negative control did not reject ${name}`);
			await writeFile(target, original);
		}
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

console.log('react-markdown provenance: 16 files, 4 runtime exports, 6 types, 87 tests');
