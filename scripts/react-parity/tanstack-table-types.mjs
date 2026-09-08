#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	TYPE_PARITY_CONFIG,
	renderTypeInventories,
	verifyTanstackTableTypes,
} from './tanstack-table-types-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');
const { config, inventory } = renderTypeInventories(REPO, TYPE_PARITY_CONFIG);

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
		`Wrote tanstack-table type inventories (${inventory.upstream.length} files, ${inventory.upstream.reduce(
			function sum(a, file) {
				return a + file.assertionGroups.length;
			},
			0,
		)} assertion groups).`,
	);
} else {
	const result = verifyTanstackTableTypes(REPO);
	console.log(
		`tanstack-table type parity verified (${result.files} files, ${result.assertions} assertion groups).`,
	);
}
