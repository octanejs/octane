#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderTypeInventories, verifySolanaReactTypes } from './solana-kit-types-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');
const { config, inventory } = renderTypeInventories(REPO);

if (write) {
	writeFileSync(
		resolve(REPO, config.inventories.upstream),
		`${JSON.stringify(inventory.upstream, null, '\t')}\n`,
	);
	writeFileSync(
		resolve(REPO, config.inventories.adapted),
		`${JSON.stringify(inventory.adapted, null, '\t')}\n`,
	);
	console.log(
		`Wrote solana-kit type inventories (${inventory.upstream.length} files, ${inventory.upstream.reduce(
			function sum(a, f) {
				return a + f.assertionGroups.length;
			},
			0,
		)} assertion groups).`,
	);
} else {
	verifySolanaReactTypes(REPO);
}

const pristine = spawnSync(
	'pnpm',
	['exec', 'tsc', '--noEmit', '-p', config.lanes.pristine.project],
	{ cwd: REPO, encoding: 'utf8' },
);
if (pristine.status !== 0) {
	process.stderr.write(pristine.stdout || '');
	process.stderr.write(pristine.stderr || '');
	throw new Error('solana-kit pristine type lane failed');
}

const adapted = spawnSync(
	'pnpm',
	['exec', 'tsrx-tsc', '--noEmit', '-p', config.lanes.adapted.project],
	{ cwd: REPO, encoding: 'utf8' },
);
if (adapted.status !== 0) {
	process.stderr.write(adapted.stdout || '');
	process.stderr.write(adapted.stderr || '');
	throw new Error('solana-kit adapted type lane failed');
}

console.log('solana-kit type parity lanes passed.');
