#!/usr/bin/env node
// Writes the hashed assertion-group inventories that
// packages/xstate{,-store}/audit/type-parity.json reference. Run this after any
// change to either type suite; `verifyXstateTypeParity` fails while a committed
// inventory disagrees with the suite it claims to describe.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import {
	XSTATE_STORE_TYPE_PARITY_CONFIG,
	XSTATE_TYPE_PARITY_CONFIG,
	buildTypeInventory,
	readTypeParityConfig,
} from './xstate-types-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

for (const configPath of [XSTATE_TYPE_PARITY_CONFIG, XSTATE_STORE_TYPE_PARITY_CONFIG]) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	for (const side of ['upstream', 'adapted']) {
		const output = resolve(root, config.inventories[side]);
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(
			output,
			await format(JSON.stringify(inventory[side], null, 2), {
				...(await resolveConfig(output)),
				filepath: output,
			}),
		);
		console.log(
			`${config.inventories[side]}: ${inventory[side][0].assertionGroups.length} assertion groups`,
		);
	}
}
