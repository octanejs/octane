#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDreiTypeInventories, TYPE_PARITY_CONFIG } from './drei-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { config, inventory } = renderDreiTypeInventories(root, TYPE_PARITY_CONFIG);
for (const side of ['pristine', 'adapted']) {
	const destination = resolve(root, config.inventories[side]);
	writeFileSync(
		destination,
		`${JSON.stringify(
			{
				path: inventory[side].path,
				sha256: inventory[side].sha256,
				assertionGroups: inventory[side].assertionGroups,
			},
			null,
			2,
		)}\n`,
	);
	console.log(
		`${config.inventories[side]}: wrote ${inventory[side].assertionGroups.length} groups`,
	);
}
