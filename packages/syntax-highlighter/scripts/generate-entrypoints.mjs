import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEntrypointSurfaces } from './parity-guards.mjs';

const write = process.argv.includes('--write');
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tarball = join(packageRoot, 'upstream', 'npm', 'react-syntax-highlighter-16.1.1.tgz');
const packageJsonPath = join(packageRoot, 'package.json');
const inventoryPath = join(packageRoot, 'audit', 'public-entrypoints.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

const tarEntries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
const byFormat = new Map([
	['esm', []],
	['cjs', []],
]);
for (const entry of tarEntries) {
	const match = /^package\/dist\/(esm|cjs)\/(.+\.js)$/.exec(entry);
	if (match) byFormat.get(match[1]).push(match[2]);
}
for (const paths of byFormat.values()) paths.sort();

const esm = byFormat.get('esm');
const cjs = byFormat.get('cjs');
verifyEntrypointSurfaces(esm, cjs);

for (const path of esm) await access(join(packageRoot, 'src', path));

const exportsMap = { '.': './src/index.js' };
for (const format of ['esm', 'cjs']) {
	for (const path of esm) {
		const target = `./src/${path}`;
		exportsMap[`./dist/${format}/${path}`] = target;
		exportsMap[`./dist/${format}/${path.slice(0, -3)}`] = target;
	}
}
exportsMap['./package.json'] = './package.json';

const inventory = {
	package: 'react-syntax-highlighter',
	version: '16.1.1',
	formats: { esm: esm.length, cjs: cjs.length },
	paths: esm,
	sha256: createHash('sha256')
		.update(esm.join('\n') + '\n')
		.digest('hex'),
	exportSpecifiers: Object.keys(exportsMap).length,
};

const nextPackageJson = {
	...packageJson,
	main: './src/index.js',
	module: './src/index.js',
	exports: exportsMap,
};
const packageJsonOutput = `${JSON.stringify(nextPackageJson, null, 2)}\n`;
const inventoryOutput = `${JSON.stringify(inventory, null, 2)}\n`;

if (write) {
	await writeFile(packageJsonPath, packageJsonOutput);
	await writeFile(inventoryPath, inventoryOutput);
} else {
	if ((await readFile(packageJsonPath, 'utf8')) !== packageJsonOutput) {
		throw new Error('package.json entrypoints are stale; run generate:entrypoints');
	}
	if ((await readFile(inventoryPath, 'utf8')) !== inventoryOutput) {
		throw new Error('public entrypoint inventory is stale; run generate:entrypoints');
	}
}

console.log(`verified ${esm.length} paths per format and ${inventory.exportSpecifiers} exports`);
