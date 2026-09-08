import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const typeProgramPath = resolve(packageRoot, 'typetests/parity.test-d.ts');
const typeContractPath = resolve(packageRoot, 'audit/type-contract.json');

function inventoryTypeGroups(source) {
	const markers = [...source.matchAll(/^\/\/ @type-parity-group ([a-z0-9-]+)$/gm)];
	return markers.map((marker, index) => ({
		id: marker[1],
		sha256: createHash('sha256')
			.update(
				source
					.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? source.length)
					.trim(),
			)
			.digest('hex'),
	}));
}

function auditTypeContract(source, contract) {
	assert.deepEqual(inventoryTypeGroups(source), contract.assertionGroups);
	assert.deepEqual(contract.transformationPolicy.allowedSourceTransformations, []);
	assert.equal(contract.sharedProgram, 'packages/window/typetests/parity.test-d.ts');
}

function reject(compiler, project) {
	const result = spawnSync(
		resolve(repoRoot, `node_modules/.bin/${compiler}`),
		['--noEmit', '-p', project],
		{
			cwd: repoRoot,
			encoding: 'utf8',
		},
	);
	assert.notEqual(result.status, 0, `${compiler} unexpectedly accepted the negative type fixture`);
	assert.match(
		`${result.stdout}\n${result.stderr}`,
		/Property 'columnIndex' is missing|columnIndex.*missing/,
	);
}

test('the pristine declaration oracle rejects a missing Grid coordinate', () => {
	reject('tsc', 'packages/window/typetests/tsconfig.negative-pristine.json');
});

test('the adapted declaration surface rejects the same missing Grid coordinate', () => {
	reject('tsrx-tsc', 'packages/window/typetests/tsconfig.negative-adapted.json');
});

test('every shared type assertion group is byte-accounted for both compilers', async () => {
	const source = await readFile(typeProgramPath, 'utf8');
	const contract = JSON.parse(await readFile(typeContractPath, 'utf8'));

	auditTypeContract(source, contract);
	assert.equal(contract.transformationPolicy.pristine.compiler, 'tsc');
	assert.equal(contract.transformationPolicy.adapted.compiler, 'tsrx-tsc');
});

test('the type audit rejects a skipped assertion group', async () => {
	const source = await readFile(typeProgramPath, 'utf8');
	const contract = JSON.parse(await readFile(typeContractPath, 'utf8'));
	const mutated = source.replace('// @type-parity-group utilities', '// skipped utilities');

	assert.throws(() => auditTypeContract(mutated, contract));
});

test('the type audit rejects a deleted positive assertion', async () => {
	const source = await readFile(typeProgramPath, 'utf8');
	const contract = JSON.parse(await readFile(typeContractPath, 'utf8'));
	const mutated = source.replace('expectType<number>(getScrollbarSize());\n', '');

	assert.throws(() => auditTypeContract(mutated, contract));
});

test('the type audit rejects a removed expected-error control', async () => {
	const source = await readFile(typeProgramPath, 'utf8');
	const contract = JSON.parse(await readFile(typeContractPath, 'utf8'));
	const mutated = source.replace(
		'// @ts-expect-error scrollToCell requires both coordinates\n',
		'',
	);

	assert.throws(() => auditTypeContract(mutated, contract));
});

test('the type audit rejects an unauthorized adapted-source change', async () => {
	const source = await readFile(typeProgramPath, 'utf8');
	const contract = JSON.parse(await readFile(typeContractPath, 'utf8'));
	const mutated = source.replace("const align: Align = 'smart';", "const align: Align = 'center';");

	assert.throws(() => auditTypeContract(mutated, contract));
});
